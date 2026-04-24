import bcrypt from 'bcryptjs';
import type { AuthUser } from '../types/domain';
import { HttpError } from '../utils/http';
import { findUserByUsername, updateLastLoginAt } from './userService';

export const loginWithUsernamePassword = async (username: string, password: string): Promise<AuthUser> => {
  const user = await findUserByUsername(username);
  if (!user || !user.isActive) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', '账号或密码错误。');
  }

  const matched = await bcrypt.compare(password, user.passwordHash);
  if (!matched) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', '账号或密码错误。');
  }

  await updateLastLoginAt(user.id);

  return {
    id: user.id,
    username: user.username,
    role: user.role,
    isActive: user.isActive,
  };
};
