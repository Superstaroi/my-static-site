import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool } from '../db/pool';
import type { GenerationHistoryRecord } from '../types/domain';
import { HttpError } from '../utils/http';

const DEFAULT_HISTORY_LIMIT = 20;
export const MAX_GENERATION_HISTORY_PREVIEW_URL_LENGTH = 700_000;
export const MAX_GENERATION_HISTORY_ORIGINAL_URL_LENGTH = 45_000_000;
const GENERATION_HISTORY_PREVIEW_DATA_URL_PATTERN = /^data:image\/(?:jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/i;

let ensureHistorySchemaPromise: Promise<void> | null = null;

const mapGenerationHistoryRow = (row: Record<string, unknown>): GenerationHistoryRecord => ({
  id: Number(row.id),
  userId: Number(row.user_id),
  previewUrl: String(row.preview_data_url || ''),
  originalUrl: String(row.original_data_url || row.preview_data_url || ''),
  sourceType: row.source_type == null ? null : String(row.source_type),
  createdAt: String(row.created_at),
});

const ensureHistoryColumn = async (columnName: string, addSql: string) => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT COUNT(*) AS total
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'generation_history'
        AND COLUMN_NAME = ?
    `,
    [columnName],
  );

  if (Number(rows[0]?.total ?? 0) === 0) {
    await pool.query(`ALTER TABLE \`generation_history\` ADD COLUMN ${addSql}`);
  }
};

const validateHistoryDataUrl = (value: string, maxLength: number, label: string) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    throw new HttpError(400, 'INVALID_GENERATION_HISTORY_PAYLOAD', `${label}不能为空。`);
  }

  if (trimmed.length > maxLength) {
    throw new HttpError(400, 'INVALID_GENERATION_HISTORY_PAYLOAD', `${label}过大。`);
  }

  if (!GENERATION_HISTORY_PREVIEW_DATA_URL_PATTERN.test(trimmed)) {
    throw new HttpError(400, 'INVALID_GENERATION_HISTORY_PAYLOAD', `${label}格式无效。`);
  }

  return trimmed;
};

export const ensureGenerationHistorySchema = async () => {
  if (!ensureHistorySchemaPromise) {
    ensureHistorySchemaPromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS \`generation_history\` (
          \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          \`user_id\` BIGINT UNSIGNED NOT NULL,
          \`preview_data_url\` LONGTEXT NOT NULL,
          \`original_data_url\` LONGTEXT NULL,
          \`source_type\` VARCHAR(32) NULL,
          \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          KEY \`idx_generation_history_user_created_at\` (\`user_id\`, \`created_at\`, \`id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await ensureHistoryColumn('original_data_url', '`original_data_url` LONGTEXT NULL AFTER `preview_data_url`');
    })().catch(error => {
      ensureHistorySchemaPromise = null;
      throw error;
    });
  }

  await ensureHistorySchemaPromise;
};

export const listUserGenerationHistory = async (
  userId: number,
  limit: number = DEFAULT_HISTORY_LIMIT,
): Promise<GenerationHistoryRecord[]> => {
  await ensureGenerationHistorySchema();

  const safeLimit = Math.max(1, Math.min(DEFAULT_HISTORY_LIMIT, Math.floor(limit || DEFAULT_HISTORY_LIMIT)));
  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT id, user_id, preview_data_url, original_data_url, source_type, created_at
      FROM generation_history
      WHERE user_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `,
    [userId, safeLimit],
  );

  return rows.map(row => mapGenerationHistoryRow(row));
};

export const createUserGenerationHistory = async (
  userId: number,
  previewUrl: string,
  originalUrl?: string | null,
  sourceType?: string | null,
  limit: number = DEFAULT_HISTORY_LIMIT,
): Promise<void> => {
  const trimmedPreviewUrl = String(previewUrl || '').trim();
  if (!trimmedPreviewUrl) {
    throw new HttpError(400, 'INVALID_GENERATION_HISTORY_PAYLOAD', '生成记录预览图不能为空。');
  }

  if (trimmedPreviewUrl.length > MAX_GENERATION_HISTORY_PREVIEW_URL_LENGTH) {
    throw new HttpError(400, 'INVALID_GENERATION_HISTORY_PAYLOAD', '生成记录预览图过大。');
  }

  if (!GENERATION_HISTORY_PREVIEW_DATA_URL_PATTERN.test(trimmedPreviewUrl)) {
    throw new HttpError(400, 'INVALID_GENERATION_HISTORY_PAYLOAD', '生成记录预览图格式无效。');
  }

  const trimmedOriginalUrl = originalUrl
    ? validateHistoryDataUrl(originalUrl, MAX_GENERATION_HISTORY_ORIGINAL_URL_LENGTH, '生成记录原图')
    : null;

  await ensureGenerationHistorySchema();

  const normalizedSourceType = sourceType ? String(sourceType).trim().slice(0, 32) : null;
  const safeLimit = Math.max(1, Math.min(DEFAULT_HISTORY_LIMIT, Math.floor(limit || DEFAULT_HISTORY_LIMIT)));

  await pool.query(
    `
      INSERT INTO generation_history (user_id, preview_data_url, original_data_url, source_type)
      VALUES (?, ?, ?, ?)
    `,
    [userId, trimmedPreviewUrl, trimmedOriginalUrl, normalizedSourceType],
  );

  await pool.query(
    `
      DELETE FROM generation_history
      WHERE user_id = ?
        AND id NOT IN (
          SELECT id
          FROM (
            SELECT id
            FROM generation_history
            WHERE user_id = ?
            ORDER BY created_at DESC, id DESC
            LIMIT ?
          ) AS recent_records
        )
    `,
    [userId, userId, safeLimit],
  );
};

export const deleteUserGenerationHistoryItem = async (
  userId: number,
  historyId: number,
): Promise<number> => {
  await ensureGenerationHistorySchema();

  const [result] = await pool.query<ResultSetHeader>(
    `
      DELETE FROM generation_history
      WHERE user_id = ?
        AND id = ?
      LIMIT 1
    `,
    [userId, historyId],
  );

  return Number(result.affectedRows || 0);
};

export const clearUserGenerationHistory = async (userId: number): Promise<number> => {
  await ensureGenerationHistorySchema();

  const [result] = await pool.query<ResultSetHeader>(
    `
      DELETE FROM generation_history
      WHERE user_id = ?
    `,
    [userId],
  );

  return Number(result.affectedRows || 0);
};
