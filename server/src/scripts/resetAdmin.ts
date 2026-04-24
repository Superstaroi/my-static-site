import bcrypt from 'bcryptjs';
import { pool } from '../db/pool';
import { env } from '../config/env';

const run = async () => {
  const username = env.adminSeedUsername;
  const password = env.adminSeedPassword;

  if (!password) {
    throw new Error('[resetAdmin] Missing ADMIN_SEED_PASSWORD. Please configure it in server/.env before running the script.');
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const [rows] = await pool.query<any[]>(
    'SELECT id FROM users WHERE username = ? LIMIT 1',
    [username]
  );

  if (rows[0]?.id) {
    await pool.query(
      'UPDATE users SET password_hash = ?, role = ?, is_active = 1, daily_limit = 9999 WHERE id = ?',
      [passwordHash, 'admin', rows[0].id]
    );
    console.info(`[resetAdmin] admin account reset complete (username=${username}).`);
    return;
  }

  await pool.query(
    'INSERT INTO users (username, password_hash, role, is_active, daily_limit) VALUES (?, ?, ?, 1, 9999)',
    [username, passwordHash, 'admin']
  );
  console.info(`[resetAdmin] admin account created (username=${username}).`);
};

run()
  .catch(error => {
    console.error('[resetAdmin] failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
