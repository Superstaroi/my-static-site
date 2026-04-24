import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { findUserById } from '../services/userService';
import { verifyAuthToken } from '../utils/auth';
import { HttpError } from '../utils/http';

const buildRequireAuth = (cookieName: string, requireAdminRole = false) =>
  async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const token = req.cookies?.[cookieName];
      if (!token) {
        throw new HttpError(401, 'AUTH_REQUIRED', '请先登录。');
      }

      const payload = verifyAuthToken(token);
      const user = await findUserById(Number(payload.sub));
      if (!user || !user.isActive) {
        throw new HttpError(401, 'AUTH_REQUIRED', '登录状态已失效，请重新登录。');
      }

      if (requireAdminRole && user.role !== 'admin') {
        throw new HttpError(403, 'ADMIN_REQUIRED', '当前账号没有后台权限。');
      }

      req.authUser = {
        id: user.id,
        username: user.username,
        role: user.role,
        isActive: user.isActive,
      };

      next();
    } catch (error) {
      next(error);
    }
  };

export const requireFrontAuth = buildRequireAuth(env.userAuthCookieName);
export const requireAdminAuth = buildRequireAuth(env.adminAuthCookieName, true);
