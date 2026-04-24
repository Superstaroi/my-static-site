import bcrypt from 'bcryptjs';
import { pool } from '../db/pool';
import { env } from '../config/env';

const run = async () => {
  const username = env.adminSeedUsername;
  const password = env.adminSeedPassword;

  if (!password) {
    throw new Error('[seedAdmin] Missing ADMIN_SEED_PASSWORD. Please configure it in server/.env before running the script.');
  }

  const [rows] = await pool.query<any[]>(
    'SELECT id, role, is_active, daily_limit FROM users WHERE username = ? LIMIT 1',
    [username]
  );

  if (rows[0]?.id) {
    const role = String(rows[0].role || '');
    if (role !== 'admin') {
      console.warn(`[seedAdmin] found existing username="${username}" but role is not admin. Seed skipped. Run \`npm run reset:admin\` if you want to repair it.`);
    } else {
      console.info('[seedAdmin] admin account already exists. Seed skipped.');
    }
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await pool.query(
    'INSERT INTO users (username, password_hash, role, is_active, daily_limit) VALUES (?, ?, ?, 1, 9999)',
    [username, passwordHash, 'admin']
  );

  console.info(`[seedAdmin] admin account created (username=${username}).`);
};

run()
  .catch(error => {
    console.error('[seedAdmin] failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
