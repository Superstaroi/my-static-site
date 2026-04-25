import { pool } from '../db/pool';

const ensureTable = async (sql: string) => {
  await pool.query(sql);
};

const ensureColumn = async (tableName: string, columnName: string, addSql: string) => {
  const [rows] = await pool.query<any[]>(
    `
      SELECT COUNT(*) AS total
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
    `,
    [tableName, columnName],
  );

  if (Number(rows[0]?.total ?? 0) === 0) {
    await pool.query(`ALTER TABLE \`${tableName}\` ADD COLUMN ${addSql}`);
  }
};

const ensureIndex = async (tableName: string, indexName: string, addSql: string) => {
  const [rows] = await pool.query<any[]>(
    `
      SELECT COUNT(*) AS total
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND INDEX_NAME = ?
    `,
    [tableName, indexName],
  );

  if (Number(rows[0]?.total ?? 0) === 0) {
    await pool.query(`ALTER TABLE \`${tableName}\` ADD ${addSql}`);
  }
};

const migrate = async () => {
  await ensureTable(`
    CREATE TABLE IF NOT EXISTS \`users\` (
      \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      \`username\` VARCHAR(64) NOT NULL,
      \`display_name\` VARCHAR(64) NOT NULL DEFAULT '',
      \`password_hash\` VARCHAR(255) NOT NULL,
      \`role\` ENUM('admin', 'user') NOT NULL DEFAULT 'user',
      \`is_active\` TINYINT(1) NOT NULL DEFAULT 1,
      \`daily_limit\` INT NOT NULL DEFAULT 50,
      \`last_login_at\` DATETIME NULL,
      \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_users_username\` (\`username\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await ensureTable(`
    CREATE TABLE IF NOT EXISTS \`daily_usage\` (
      \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      \`user_id\` BIGINT UNSIGNED NOT NULL,
      \`usage_date\` DATE NOT NULL,
      \`used_count\` INT NOT NULL DEFAULT 0,
      \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_daily_usage_user_date\` (\`user_id\`, \`usage_date\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await ensureTable(`
    CREATE TABLE IF NOT EXISTS \`quota_adjustments\` (
      \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      \`user_id\` BIGINT UNSIGNED NOT NULL,
      \`usage_date\` DATE NOT NULL,
      \`amount\` INT NOT NULL,
      \`reason\` VARCHAR(255) NULL,
      \`created_by\` BIGINT UNSIGNED NULL,
      \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await ensureTable(`
    CREATE TABLE IF NOT EXISTS \`usage_logs\` (
      \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      \`user_id\` BIGINT UNSIGNED NOT NULL,
      \`action_type\` VARCHAR(64) NOT NULL,
      \`success\` TINYINT(1) NOT NULL DEFAULT 0,
      \`quota_cost\` INT NOT NULL DEFAULT 0,
      \`error_message\` TEXT NULL,
      \`request_payload_json\` JSON NULL,
      \`response_summary_json\` JSON NULL,
      \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await ensureTable(`
    CREATE TABLE IF NOT EXISTS \`generation_history\` (
      \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      \`user_id\` BIGINT UNSIGNED NOT NULL,
      \`preview_data_url\` LONGTEXT NOT NULL,
      \`original_data_url\` LONGTEXT NULL,
      \`source_type\` VARCHAR(32) NULL,
      \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await ensureColumn('users', 'daily_limit', '`daily_limit` INT NOT NULL DEFAULT 50');
  await ensureColumn('users', 'display_name', '`display_name` VARCHAR(64) NOT NULL DEFAULT \'\' AFTER `username`');
  await ensureColumn('users', 'last_login_at', '`last_login_at` DATETIME NULL');
  await ensureColumn('daily_usage', 'used_count', '`used_count` INT NOT NULL DEFAULT 0');
  await ensureColumn('quota_adjustments', 'reason', '`reason` VARCHAR(255) NULL');
  await ensureColumn('quota_adjustments', 'created_by', '`created_by` BIGINT UNSIGNED NULL');
  await ensureColumn('usage_logs', 'quota_cost', '`quota_cost` INT NOT NULL DEFAULT 0');
  await ensureColumn('usage_logs', 'request_payload_json', '`request_payload_json` JSON NULL');
  await ensureColumn('usage_logs', 'response_summary_json', '`response_summary_json` JSON NULL');
  await ensureColumn('usage_logs', 'updated_at', '`updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
  await ensureColumn('generation_history', 'preview_data_url', '`preview_data_url` LONGTEXT NOT NULL');
  await ensureColumn('generation_history', 'original_data_url', '`original_data_url` LONGTEXT NULL AFTER `preview_data_url`');
  await ensureColumn('generation_history', 'source_type', '`source_type` VARCHAR(32) NULL');
  await ensureColumn('generation_history', 'created_at', '`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP');

  await pool.query('ALTER TABLE `users` MODIFY COLUMN `daily_limit` INT NOT NULL DEFAULT 50');
  await pool.query('ALTER TABLE `quota_adjustments` MODIFY COLUMN `reason` VARCHAR(255) NULL');

  await ensureIndex('users', 'uq_users_username', 'UNIQUE KEY `uq_users_username` (`username`)');
  await ensureIndex('daily_usage', 'uq_daily_usage_user_date', 'UNIQUE KEY `uq_daily_usage_user_date` (`user_id`, `usage_date`)');
  await ensureIndex('quota_adjustments', 'idx_quota_adjustments_user_date', 'KEY `idx_quota_adjustments_user_date` (`user_id`, `usage_date`)');
  await ensureIndex('quota_adjustments', 'idx_quota_adjustments_created_by', 'KEY `idx_quota_adjustments_created_by` (`created_by`)');
  await ensureIndex('usage_logs', 'idx_usage_logs_user_created_at', 'KEY `idx_usage_logs_user_created_at` (`user_id`, `created_at`)');
  await ensureIndex('usage_logs', 'idx_usage_logs_action_type', 'KEY `idx_usage_logs_action_type` (`action_type`)');
  await ensureIndex('usage_logs', 'idx_usage_logs_success', 'KEY `idx_usage_logs_success` (`success`)');
  await ensureIndex('generation_history', 'idx_generation_history_user_created_at', 'KEY `idx_generation_history_user_created_at` (`user_id`, `created_at`, `id`)');

  console.info('[migrate] 数据库迁移完成。');
};

migrate()
  .catch(error => {
    console.error('[migrate] 数据库迁移失败：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
