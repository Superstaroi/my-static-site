import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { pool } from '../db/pool';
import type { UserRecord } from '../types/domain';

const mapUserRow = (row: Record<string, unknown>): UserRecord => ({
  id: Number(row.id),
  username: String(row.username),
  role: (row.role as UserRecord['role']) || 'user',
  isActive: Boolean(row.is_active),
  passwordHash: String(row.password_hash),
  dailyLimit: Number(row.daily_limit ?? 0),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
  lastLoginAt: row.last_login_at ? String(row.last_login_at) : null,
});

export const findUserById = async (id: number, connection?: PoolConnection): Promise<UserRecord | null> => {
  const executor = connection ?? pool;
  const [rows] = await executor.query<RowDataPacket[]>(
    'SELECT * FROM users WHERE id = ? LIMIT 1',
    [id]
  );

  const row = rows[0];
  return row ? mapUserRow(row) : null;
};

export const findUserByUsername = async (username: string, connection?: PoolConnection): Promise<UserRecord | null> => {
  const executor = connection ?? pool;
  const [rows] = await executor.query<RowDataPacket[]>(
    'SELECT * FROM users WHERE username = ? LIMIT 1',
    [username]
  );

  const row = rows[0];
  return row ? mapUserRow(row) : null;
};

export const updateLastLoginAt = async (id: number) => {
  await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [id]);
};
