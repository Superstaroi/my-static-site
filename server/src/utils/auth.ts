import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import type { AuthUser } from '../types/domain';

interface AuthTokenPayload {
  sub: number;
  username: string;
  role: AuthUser['role'];
}

export const signAuthToken = (user: AuthUser) =>
  jwt.sign(
    {
      sub: user.id,
      username: user.username,
      role: user.role,
    } satisfies AuthTokenPayload,
    env.jwtSecret,
    { expiresIn: '7d' }
  );

export const verifyAuthToken = (token: string) =>
  jwt.verify(token, env.jwtSecret) as jwt.JwtPayload & AuthTokenPayload;
