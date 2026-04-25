import bcrypt from 'bcryptjs';
import type { RowDataPacket } from 'mysql2/promise';
import { pool } from '../db/pool';
import { HttpError } from '../utils/http';
import { getNextResetAtIso, getTodayDateKey } from '../utils/time';
import { ensureGenerationHistorySchema } from './generationHistoryService';

const clampRemaining = (value: number) => Math.max(0, value);

const assertSafeInteger = (value: number, field: string) => {
  if (!Number.isSafeInteger(value)) {
    throw new HttpError(400, 'INVALID_INPUT', `${field}必须是有效整数。`);
  }
};

const assertNonNegativeInteger = (value: number, field: string) => {
  assertSafeInteger(value, field);
  if (value < 0) {
    throw new HttpError(400, 'INVALID_INPUT', `${field}不能小于 0。`);
  }
};

const assertPositiveInteger = (value: number, field: string) => {
  assertSafeInteger(value, field);
  if (value <= 0) {
    throw new HttpError(400, 'INVALID_INPUT', `${field}必须大于 0。`);
  }
};

let ensureUserSchemaPromise: Promise<void> | null = null;

const ensureUserColumn = async (columnName: string, addSql: string) => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT COUNT(*) AS total
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'users'
        AND COLUMN_NAME = ?
    `,
    [columnName],
  );

  if (Number(rows[0]?.total ?? 0) === 0) {
    await pool.query(`ALTER TABLE \`users\` ADD COLUMN ${addSql}`);
  }
};

const ensureUserSchema = async () => {
  if (!ensureUserSchemaPromise) {
    ensureUserSchemaPromise = ensureUserColumn(
      'display_name',
      '`display_name` VARCHAR(64) NOT NULL DEFAULT \'\' AFTER `username`',
    ).catch(error => {
      ensureUserSchemaPromise = null;
      throw error;
    });
  }

  await ensureUserSchemaPromise;
};

const getAdminCounts = async () => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT
        SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) AS total_admins,
        SUM(CASE WHEN role = 'admin' AND is_active = 1 THEN 1 ELSE 0 END) AS active_admins
      FROM users
    `,
  );

  return {
    totalAdmins: Number(rows[0]?.total_admins ?? 0),
    activeAdmins: Number(rows[0]?.active_admins ?? 0),
  };
};

export const listUsersWithQuota = async () => {
  await ensureUserSchema();
  const usageDate = getTodayDateKey();
  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT
        u.id,
        u.username,
        u.display_name,
        u.role,
        u.is_active,
        u.daily_limit,
        u.created_at,
        u.updated_at,
        COALESCE(du.used_count, 0) AS today_used,
        COALESCE(qa.bonus_quota, 0) AS bonus_quota
      FROM users u
      LEFT JOIN daily_usage du
        ON du.user_id = u.id AND du.usage_date = ?
      LEFT JOIN (
        SELECT user_id, usage_date, COALESCE(SUM(amount), 0) AS bonus_quota
        FROM quota_adjustments
        WHERE usage_date = ?
        GROUP BY user_id, usage_date
      ) qa
        ON qa.user_id = u.id AND qa.usage_date = ?
      ORDER BY u.created_at DESC
    `,
    [usageDate, usageDate, usageDate],
  );

  return rows.map(row => ({
    id: Number(row.id),
    username: String(row.username),
    display_name: String(row.display_name || ''),
    role: row.role,
    is_active: Boolean(row.is_active),
    daily_limit: Number(row.daily_limit),
    today_used: Number(row.today_used),
    bonus_quota: Number(row.bonus_quota),
    remaining: clampRemaining(Number(row.daily_limit) + Number(row.bonus_quota) - Number(row.today_used)),
    created_at: row.created_at,
    updated_at: row.updated_at,
    resetAt: getNextResetAtIso(),
  }));
};

export const createUser = async (payload: {
  username: string;
  display_name?: string;
  password: string;
  daily_limit: number;
  role: 'admin' | 'user';
  is_active: boolean;
}) => {
  await ensureUserSchema();
  assertNonNegativeInteger(payload.daily_limit, 'daily_limit');
  const displayName = String(payload.display_name || '').trim().slice(0, 64);
  const passwordHash = await bcrypt.hash(payload.password, 10);

  try {
    const [result] = await pool.query<any>(
      'INSERT INTO users (username, display_name, password_hash, role, is_active, daily_limit) VALUES (?, ?, ?, ?, ?, ?)',
      [payload.username, displayName, passwordHash, payload.role, payload.is_active ? 1 : 0, payload.daily_limit],
    );
    return result.insertId as number;
  } catch (error: any) {
    if (error?.code === 'ER_DUP_ENTRY' || String(error?.message || '').includes('Duplicate')) {
      throw new HttpError(409, 'USERNAME_EXISTS', '用户名已存在。');
    }
    throw error;
  }
};

export const updateUser = async (
  id: number,
  payload: Partial<{
    username: string;
    display_name: string;
    is_active: boolean;
    daily_limit: number;
    role: 'admin' | 'user';
  }>,
  currentAdminId: number,
) => {
  await ensureUserSchema();
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT id, username, display_name, role, is_active, daily_limit FROM users WHERE id = ? LIMIT 1',
    [id],
  );
  const target = rows[0];
  if (!target) {
    throw new HttpError(404, 'NOT_FOUND', '用户不存在。');
  }

  if (payload.username !== undefined && !String(payload.username).trim()) {
    throw new HttpError(400, 'INVALID_INPUT', '用户名不能为空。');
  }

  if (payload.display_name !== undefined) {
    payload.display_name = String(payload.display_name || '').trim().slice(0, 64);
  }

  if (payload.daily_limit !== undefined) {
    assertNonNegativeInteger(Number(payload.daily_limit), 'daily_limit');
  }

  if (Number(target.id) === currentAdminId && payload.is_active === false) {
    throw new HttpError(400, 'INVALID_OPERATION', '不能禁用当前登录的管理员账号。');
  }

  if (String(target.role) === 'admin' && payload.role === 'user') {
    const { totalAdmins } = await getAdminCounts();
    if (totalAdmins <= 1) {
      throw new HttpError(400, 'INVALID_OPERATION', '不能降级最后一个管理员账号。');
    }
  }

  if (String(target.role) === 'admin' && payload.is_active === false && Boolean(target.is_active)) {
    const { activeAdmins } = await getAdminCounts();
    if (activeAdmins <= 1) {
      throw new HttpError(400, 'INVALID_OPERATION', '不能禁用最后一个启用中的管理员账号。');
    }
  }

  const entries = Object.entries(payload).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    return;
  }

  const fieldMap: Record<string, string> = {
    username: 'username',
    display_name: 'display_name',
    is_active: 'is_active',
    daily_limit: 'daily_limit',
    role: 'role',
  };

  const sets = entries.map(([key]) => `${fieldMap[key]} = ?`);
  const values = entries.map(([key, value]) => (key === 'is_active' ? (value ? 1 : 0) : value));
  values.push(id);

  try {
    await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, values);
  } catch (error: any) {
    if (error?.code === 'ER_DUP_ENTRY') {
      throw new HttpError(409, 'USERNAME_EXISTS', '用户名已存在。');
    }
    throw error;
  }
};

export const deleteUserById = async (id: number, currentAdminId: number) => {
  if (id === currentAdminId) {
    throw new HttpError(400, 'INVALID_OPERATION', '不能删除当前登录的管理员账号。');
  }

  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT id, role FROM users WHERE id = ? LIMIT 1',
    [id],
  );
  const target = rows[0];
  if (!target) {
    throw new HttpError(404, 'NOT_FOUND', '用户不存在。');
  }

  if (String(target.role) === 'admin') {
    const { totalAdmins } = await getAdminCounts();
    if (totalAdmins <= 1) {
      throw new HttpError(400, 'INVALID_OPERATION', '不能删除最后一个管理员账号。');
    }
  }

  await ensureGenerationHistorySchema();

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('DELETE FROM daily_usage WHERE user_id = ?', [id]);
    await connection.query('DELETE FROM generation_history WHERE user_id = ?', [id]);
    await connection.query('DELETE FROM quota_adjustments WHERE user_id = ?', [id]);
    await connection.query('DELETE FROM usage_logs WHERE user_id = ?', [id]);
    await connection.query('DELETE FROM users WHERE id = ?', [id]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const resetUserPassword = async (id: number, password: string) => {
  const [rows] = await pool.query<RowDataPacket[]>('SELECT id FROM users WHERE id = ? LIMIT 1', [id]);
  if (!rows[0]) {
    throw new HttpError(404, 'NOT_FOUND', '用户不存在。');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, id]);
};

export const setUserQuotaTarget = async (params: {
  userId: number;
  target: number;
  createdBy: number;
}) => {
  assertNonNegativeInteger(params.target, 'target');

  const [rows] = await pool.query<RowDataPacket[]>('SELECT id FROM users WHERE id = ? LIMIT 1', [params.userId]);
  if (!rows[0]) {
    throw new HttpError(404, 'NOT_FOUND', '用户不存在。');
  }

  const usageDate = getTodayDateKey();
  const [quotaRows] = await pool.query<RowDataPacket[]>(
    'SELECT COALESCE(SUM(amount), 0) AS bonus_quota FROM quota_adjustments WHERE user_id = ? AND usage_date = ?',
    [params.userId, usageDate],
  );

  const currentQuota = Number(quotaRows[0]?.bonus_quota ?? 0);
  const delta = params.target - currentQuota;

  if (delta === 0) {
    return {
      changed: false,
      previous: currentQuota,
      target: params.target,
    };
  }

  await pool.query(
    'INSERT INTO quota_adjustments (user_id, usage_date, amount, reason, created_by) VALUES (?, ?, ?, ?, ?)',
    [params.userId, usageDate, delta, '', params.createdBy],
  );

  return {
    changed: true,
    previous: currentQuota,
    target: params.target,
  };
};

export const listUsageLogs = async (filters: {
  page: number;
  pageSize: number;
  userId?: number;
  actionType?: string;
  success?: boolean;
}) => {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (filters.userId) {
    conditions.push('ul.user_id = ?');
    values.push(filters.userId);
  }
  if (filters.actionType) {
    conditions.push('ul.action_type = ?');
    values.push(filters.actionType);
  }
  if (filters.success !== undefined) {
    conditions.push('ul.success = ?');
    values.push(filters.success ? 1 : 0);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (filters.page - 1) * filters.pageSize;

  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT
        ul.*,
        u.username
      FROM usage_logs ul
      JOIN users u ON u.id = ul.user_id
      ${whereClause}
      ORDER BY ul.created_at DESC
      LIMIT ? OFFSET ?
    `,
    [...values, filters.pageSize, offset],
  );

  const [countRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM usage_logs ul ${whereClause}`,
    values,
  );

  return {
    items: rows.map(row => ({
      id: Number(row.id),
      user_id: Number(row.user_id),
      username: String(row.username),
      action_type: String(row.action_type),
      success: Boolean(row.success),
      quota_cost: Number(row.quota_cost),
      error_message: row.error_message ? String(row.error_message) : null,
      request_payload_json: row.request_payload_json,
      response_summary_json: row.response_summary_json,
      created_at: row.created_at,
      updated_at: row.updated_at,
    })),
    total: Number(countRows[0]?.total ?? 0),
    page: filters.page,
    pageSize: filters.pageSize,
  };
};

export const listUsageSummary = async (days: number) => {
  assertPositiveInteger(days, 'days');

  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT
        u.id AS user_id,
        u.username,
        COALESCE(SUM(du.used_count), 0) AS total_used
      FROM users u
      LEFT JOIN daily_usage du
        ON du.user_id = u.id
        AND du.usage_date >= DATE_SUB(?, INTERVAL ? DAY)
        AND du.usage_date <= ?
      GROUP BY u.id, u.username
      ORDER BY total_used DESC, u.username ASC
    `,
    [getTodayDateKey(), days - 1, getTodayDateKey()],
  );

  return rows.map(row => ({
    user_id: Number(row.user_id),
    username: String(row.username),
    total_used: Number(row.total_used ?? 0),
  }));
};
