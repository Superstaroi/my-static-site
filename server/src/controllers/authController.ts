import type { Request, Response } from 'express';
import { env } from '../config/env';
import { loginWithUsernamePassword } from '../services/authService';
import { getQuotaSnapshot } from '../services/quotaService';
import { signAuthToken } from '../utils/auth';
import { HttpError } from '../utils/http';

const buildUserAuthResponse = async (req: Request) => {
  if (!req.authUser) {
    throw new HttpError(401, 'AUTH_REQUIRED', '请先登录。');
  }

  const quota = await getQuotaSnapshot(req.authUser.id);
  return {
    user: {
      id: req.authUser.id,
      username: req.authUser.username,
      role: req.authUser.role,
      is_active: req.authUser.isActive,
    },
    quota,
  };
};

const buildAdminAuthResponse = (req: Request) => {
  if (!req.authUser) {
    throw new HttpError(401, 'AUTH_REQUIRED', '请先登录。');
  }

  return {
    user: {
      id: req.authUser.id,
      username: req.authUser.username,
      role: req.authUser.role,
      is_active: req.authUser.isActive,
    },
  };
};

const applyAuthCookie = (
  res: Response,
  cookieName: string,
  token: string,
  remember: boolean
) => {
  res.cookie(cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.cookieSecure,
    path: '/',
    ...(remember ? { maxAge: 7 * 24 * 60 * 60 * 1000 } : {}),
  });
};

const clearAuthCookie = (res: Response, cookieName: string) => {
  res.clearCookie(cookieName, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.cookieSecure,
    path: '/',
  });
};

export const login = async (req: Request, res: Response) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  const remember = Boolean(req.body?.remember);

  if (!username || !password) {
    throw new HttpError(400, 'INVALID_INPUT', '请输入账号和密码。');
  }

  const user = await loginWithUsernamePassword(username, password);
  const token = signAuthToken(user);

  clearAuthCookie(res, env.userAuthCookieName);
  applyAuthCookie(res, env.userAuthCookieName, token, remember);
  req.authUser = user;
  res.json(await buildUserAuthResponse(req));
};

export const logout = async (_req: Request, res: Response) => {
  clearAuthCookie(res, env.userAuthCookieName);
  res.json({ ok: true });
};

export const me = async (req: Request, res: Response) => {
  res.json(await buildUserAuthResponse(req));
};

export const adminLogin = async (req: Request, res: Response) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  const remember = Boolean(req.body?.remember);

  if (!username || !password) {
    throw new HttpError(400, 'INVALID_INPUT', '请输入账号和密码。');
  }

  const user = await loginWithUsernamePassword(username, password);
  if (user.role !== 'admin') {
    throw new HttpError(403, 'ADMIN_REQUIRED', '当前账号没有后台权限。');
  }

  const token = signAuthToken(user);
  clearAuthCookie(res, env.adminAuthCookieName);
  applyAuthCookie(res, env.adminAuthCookieName, token, remember);
  req.authUser = user;
  res.json(buildAdminAuthResponse(req));
};

export const adminLogout = async (_req: Request, res: Response) => {
  clearAuthCookie(res, env.adminAuthCookieName);
  res.json({ ok: true });
};

export const adminMe = async (req: Request, res: Response) => {
  res.json(buildAdminAuthResponse(req));
};
