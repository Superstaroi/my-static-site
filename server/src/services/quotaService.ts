import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool } from '../db/pool';
import type { QuotaSnapshot } from '../types/domain';
import { HttpError } from '../utils/http';
import { throwIfRequestAborted } from '../utils/requestAbort';
import { sanitizePayloadForLog } from '../utils/sanitize';
import { getNextResetAtIso, getTodayDateKey } from '../utils/time';

interface LockedQuotaState {
  userId: number;
  dailyLimit: number;
  todayUsed: number;
  bonusQuota: number;
  usageDate: string;
}

const DEFAULT_REQUEST_FAILURE_MESSAGE = '请求失败，请稍后重试。';

const toUsageLogErrorMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : DEFAULT_REQUEST_FAILURE_MESSAGE;
  const normalized = message.replace(/\s+/g, ' ').trim();

  if (!normalized) {
    return DEFAULT_REQUEST_FAILURE_MESSAGE;
  }

  const upper = normalized.toUpperCase();
  if (upper.includes('FETCH FAILED')) {
    return '服务连接失败，请稍后重试。';
  }

  if (upper.includes('REQUEST_ABORTED') || upper.includes('ABORT')) {
    return '请求已取消，请重试。';
  }

  if (upper.includes('TIMEOUT')) {
    return '请求超时，请稍后重试。';
  }

  if (upper.includes('INTERRUPTED')) {
    return '上游请求被中断，请稍后重试。';
  }

  return normalized.slice(0, 180);
};

const getLockedQuotaState = async (connection: PoolConnection, userId: number): Promise<LockedQuotaState> => {
  const usageDate = getTodayDateKey();

  const [userRows] = await connection.query<RowDataPacket[]>(
    'SELECT id, daily_limit, is_active FROM users WHERE id = ? FOR UPDATE',
    [userId],
  );
  const user = userRows[0];
  if (!user) {
    throw new HttpError(401, 'AUTH_REQUIRED', '登录状态已失效，请重新登录。');
  }

  if (!user.is_active) {
    throw new HttpError(403, 'USER_DISABLED', '当前账号已被禁用，请联系管理员。');
  }

  await connection.query(
    'INSERT INTO daily_usage (user_id, usage_date, used_count) VALUES (?, ?, 0) ON DUPLICATE KEY UPDATE usage_date = VALUES(usage_date)',
    [userId, usageDate],
  );

  const [usageRows] = await connection.query<RowDataPacket[]>(
    'SELECT used_count FROM daily_usage WHERE user_id = ? AND usage_date = ? FOR UPDATE',
    [userId, usageDate],
  );

  const [adjustmentRows] = await connection.query<RowDataPacket[]>(
    'SELECT COALESCE(SUM(amount), 0) AS bonus_quota FROM quota_adjustments WHERE user_id = ? AND usage_date = ?',
    [userId, usageDate],
  );

  return {
    userId,
    usageDate,
    dailyLimit: Number(user.daily_limit ?? 0),
    todayUsed: Number(usageRows[0]?.used_count ?? 0),
    bonusQuota: Number(adjustmentRows[0]?.bonus_quota ?? 0),
  };
};

const insertUsageLog = async (
  connection: PoolConnection,
  userId: number,
  actionType: string,
  success: boolean,
  quotaCost: number,
  errorMessage?: string | null,
  requestPayload?: unknown,
  responseSummary?: unknown,
) => {
  const [result] = await connection.query<ResultSetHeader>(
    'INSERT INTO usage_logs (user_id, action_type, success, quota_cost, error_message, request_payload_json, response_summary_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [
      userId,
      actionType,
      success ? 1 : 0,
      quotaCost,
      errorMessage ?? null,
      JSON.stringify(sanitizePayloadForLog(requestPayload ?? null)),
      responseSummary === undefined ? null : JSON.stringify(sanitizePayloadForLog(responseSummary)),
    ],
  );

  return result.insertId;
};

export const getQuotaSnapshot = async (userId: number, connection?: PoolConnection): Promise<QuotaSnapshot> => {
  const executor = connection ?? pool;
  const usageDate = getTodayDateKey();

  const [userRows] = await executor.query<RowDataPacket[]>(
    'SELECT daily_limit FROM users WHERE id = ? LIMIT 1',
    [userId],
  );
  const user = userRows[0];
  if (!user) {
    throw new HttpError(404, 'USER_NOT_FOUND', '用户不存在。');
  }

  const [usageRows] = await executor.query<RowDataPacket[]>(
    'SELECT used_count FROM daily_usage WHERE user_id = ? AND usage_date = ? LIMIT 1',
    [userId, usageDate],
  );
  const [adjustmentRows] = await executor.query<RowDataPacket[]>(
    'SELECT COALESCE(SUM(amount), 0) AS bonus_quota FROM quota_adjustments WHERE user_id = ? AND usage_date = ?',
    [userId, usageDate],
  );

  const dailyLimit = Number(user.daily_limit ?? 0);
  const todayUsed = Number(usageRows[0]?.used_count ?? 0);
  const bonusQuota = Number(adjustmentRows[0]?.bonus_quota ?? 0);

  return {
    dailyLimit,
    todayUsed,
    bonusQuota,
    remaining: Math.max(0, dailyLimit + bonusQuota - todayUsed),
    resetAt: getNextResetAtIso(),
  };
};

const reserveQuota = async (userId: number, actionType: string, quotaCost: number, requestPayload?: unknown) => {
  const connection = await pool.getConnection();
  let committed = false;

  try {
    await connection.beginTransaction();
    const state = await getLockedQuotaState(connection, userId);
    const remaining = state.dailyLimit + state.bonusQuota - state.todayUsed;

    if (remaining < quotaCost) {
      const quotaExceededMessage = '今日次数已用完，请明天 0 点后再试，或联系管理员增加次数。';
      await insertUsageLog(connection, userId, actionType, false, 0, quotaExceededMessage, requestPayload);
      await connection.commit();
      committed = true;
      throw new HttpError(403, 'QUOTA_EXCEEDED', quotaExceededMessage);
    }

    await connection.query(
      'UPDATE daily_usage SET used_count = used_count + ? WHERE user_id = ? AND usage_date = ?',
      [quotaCost, userId, state.usageDate],
    );

    const logId = await insertUsageLog(connection, userId, actionType, false, quotaCost, 'IN_PROGRESS', requestPayload);
    await connection.commit();
    committed = true;

    return {
      logId,
      userId,
      quotaCost,
      usageDate: state.usageDate,
    };
  } catch (error) {
    if (!committed) {
      await connection.rollback();
    }
    throw error;
  } finally {
    connection.release();
  }
};

const finalizeQuotaSuccess = async (logId: number, responseSummary: unknown) => {
  await pool.query(
    'UPDATE usage_logs SET success = 1, error_message = NULL, response_summary_json = ? WHERE id = ?',
    [JSON.stringify(sanitizePayloadForLog(responseSummary)), logId],
  );
};

const releaseReservedQuota = async (
  reservation: { logId: number; userId: number; quotaCost: number; usageDate: string },
  errorMessage: string,
) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    await connection.query(
      'UPDATE daily_usage SET used_count = GREATEST(used_count - ?, 0) WHERE user_id = ? AND usage_date = ?',
      [reservation.quotaCost, reservation.userId, reservation.usageDate],
    );
    await connection.query(
      'UPDATE usage_logs SET success = 0, error_message = ?, response_summary_json = NULL WHERE id = ?',
      [errorMessage, reservation.logId],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const executeQuotaControlledAction = async <T>(params: {
  userId: number;
  actionType: string;
  quotaCost: number;
  requestPayload?: unknown;
  signal?: AbortSignal;
  task: () => Promise<T>;
  summarizeResponse?: (value: T) => unknown;
}): Promise<T> => {
  const { userId, actionType, quotaCost, requestPayload, signal, task, summarizeResponse } = params;

  if (quotaCost <= 0) {
    try {
      const result = await task();
      throwIfRequestAborted(signal);
      await pool.query(
        'INSERT INTO usage_logs (user_id, action_type, success, quota_cost, error_message, request_payload_json, response_summary_json) VALUES (?, ?, 1, 0, NULL, ?, ?)',
        [
          userId,
          actionType,
          JSON.stringify(sanitizePayloadForLog(requestPayload ?? null)),
          JSON.stringify(sanitizePayloadForLog(summarizeResponse ? summarizeResponse(result) : null)),
        ],
      );
      return result;
    } catch (error) {
      const message = toUsageLogErrorMessage(error);
      await pool.query(
        'INSERT INTO usage_logs (user_id, action_type, success, quota_cost, error_message, request_payload_json, response_summary_json) VALUES (?, ?, 0, 0, ?, ?, NULL)',
        [
          userId,
          actionType,
          message,
          JSON.stringify(sanitizePayloadForLog(requestPayload ?? null)),
        ],
      );
      throw error;
    }
  }

  const reservation = await reserveQuota(userId, actionType, quotaCost, requestPayload);

  try {
    const result = await task();
    throwIfRequestAborted(signal);
    await finalizeQuotaSuccess(reservation.logId, summarizeResponse ? summarizeResponse(result) : null);
    return result;
  } catch (error) {
    await releaseReservedQuota(reservation, toUsageLogErrorMessage(error));
    throw error;
  }
};
