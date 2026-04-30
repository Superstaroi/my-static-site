import type { Request, Response } from 'express';
import {
  createUser,
  deleteUserById,
  listUsageLogs,
  listUsageSummary,
  listUsersWithQuota,
  resetUserPassword,
  setUserQuotaTarget,
  updateUser,
} from '../services/adminService';
import { getAdminSettings, updateAdminSettings } from '../services/systemSettingsService';
import { HttpError } from '../utils/http';

export const getUsers = async (_req: Request, res: Response) => {
  res.json({ items: await listUsersWithQuota() });
};

export const postUser = async (req: Request, res: Response) => {
  const username = String(req.body?.username || '').trim();
  const displayName = String(req.body?.display_name || '').trim();
  const password = String(req.body?.password || '');
  const dailyLimit = Number(req.body?.daily_limit ?? 50);
  const role = req.body?.role === 'admin' ? 'admin' : 'user';
  const isActive = req.body?.is_active !== false;

  if (!username || !password) {
    throw new HttpError(400, 'INVALID_INPUT', '用户名和密码不能为空。');
  }

  const id = await createUser({
    username,
    display_name: displayName,
    password,
    daily_limit: dailyLimit,
    role,
    is_active: isActive,
  });

  res.status(201).json({ id });
};

export const patchUser = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!id) {
    throw new HttpError(400, 'INVALID_INPUT', '用户编号无效。');
  }

  const nextDailyLimit = req.body?.daily_limit === undefined ? undefined : Number(req.body.daily_limit);
  const nextRole = req.body?.role === undefined
    ? undefined
    : req.body.role === 'admin'
      ? 'admin'
      : req.body.role === 'user'
        ? 'user'
        : undefined;

  await updateUser(
    id,
    {
      username: req.body?.username === undefined ? undefined : String(req.body.username).trim(),
      display_name: req.body?.display_name === undefined ? undefined : String(req.body.display_name).trim(),
      is_active: req.body?.is_active,
      daily_limit: nextDailyLimit,
      role: nextRole,
    },
    req.authUser!.id,
  );

  res.json({ ok: true });
};

export const deleteUser = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!id) {
    throw new HttpError(400, 'INVALID_INPUT', '用户编号无效。');
  }

  await deleteUserById(id, req.authUser!.id);
  res.json({ ok: true });
};

export const postResetPassword = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const password = String(req.body?.password || '');

  if (!id || !password) {
    throw new HttpError(400, 'INVALID_INPUT', '用户编号和新密码不能为空。');
  }

  await resetUserPassword(id, password);
  res.json({ ok: true });
};

export const postAddQuota = async (req: Request, res: Response) => {
  const userId = Number(req.params.id);
  const rawTarget = req.body?.target ?? req.body?.amount;
  const hasTarget = rawTarget !== undefined && rawTarget !== null && String(rawTarget).trim() !== '';
  const target = Number(rawTarget);

  if (!Number.isInteger(userId) || userId <= 0 || !hasTarget || !Number.isInteger(target) || target < 0) {
    throw new HttpError(400, 'INVALID_INPUT', '用户编号和今日额外次数目标值不能为空。');
  }

  await setUserQuotaTarget({
    userId,
    target,
    createdBy: req.authUser!.id,
  });

  res.json({ ok: true });
};

export const getUsageLogs = async (req: Request, res: Response) => {
  const pageCandidate = Number(req.query.page || 1);
  const pageSizeCandidate = Number(req.query.pageSize || 20);
  const page = Number.isFinite(pageCandidate) && pageCandidate > 0 ? Math.floor(pageCandidate) : 1;
  const pageSize = Number.isFinite(pageSizeCandidate) && pageSizeCandidate > 0
    ? Math.min(200, Math.floor(pageSizeCandidate))
    : 20;
  const userIdCandidate = req.query.userId ? Number(req.query.userId) : undefined;
  const userId = userIdCandidate !== undefined && Number.isFinite(userIdCandidate) && userIdCandidate > 0
    ? Math.floor(userIdCandidate)
    : undefined;
  const actionType = req.query.actionType ? String(req.query.actionType) : undefined;
  const success = req.query.success === undefined ? undefined : String(req.query.success) === 'true';
  const normalizeDateFilter = (value: unknown, suffix: string) => {
    const raw = typeof value === 'string' ? value.trim() : '';
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw} ${suffix}` : undefined;
  };
  const startDate = normalizeDateFilter(req.query.startDate, '00:00:00');
  const endDate = normalizeDateFilter(req.query.endDate, '23:59:59');

  res.json(await listUsageLogs({ page, pageSize, userId, actionType, success, startDate, endDate }));
};

export const getUsageSummary = async (req: Request, res: Response) => {
  const daysCandidate = Number(req.query.days || 7);
  const days = [7, 30, 90].includes(daysCandidate) ? daysCandidate : 7;

  res.json({
    days,
    items: await listUsageSummary(days),
  });
};

export const getSettings = async (_req: Request, res: Response) => {
  res.json(await getAdminSettings());
};

export const patchSettings = async (req: Request, res: Response) => {
  res.json(await updateAdminSettings({
    imageGenerationModel: String(req.body?.imageGenerationModel || ''),
    modelUsageConsoleLogEnabled: Boolean(req.body?.modelUsageConsoleLogEnabled),
  }));
};
