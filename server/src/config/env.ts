import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const serverRootPath = path.resolve(__dirname, '../..');
const serverEnvPath = path.resolve(serverRootPath, '.env');

if (!fs.existsSync(serverEnvPath)) {
  throw new Error(
    `[env] Missing server environment file: ${serverEnvPath}. Please copy server/.env.example to server/.env and fill required values.`
  );
}

dotenv.config({ path: serverEnvPath, override: true, quiet: true });

const parseNumber = (value: string | undefined, fallback: number) => {
  if (!value?.trim()) {
    return fallback;
  }

  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed)) {
    throw new Error(`[env] Invalid numeric value: "${value}"`);
  }

  return parsed;
};

const parseBoolean = (value: string | undefined, fallback: boolean) => {
  if (!value?.trim()) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  throw new Error(`[env] Invalid boolean value: "${value}"`);
};

const requireString = (name: string, value: string | undefined) => {
  if (!value?.trim()) {
    throw new Error(`[env] Missing required environment variable: ${name}`);
  }

  return value.trim();
};

const requireNumber = (name: string, value: string | undefined) => {
  if (!value?.trim()) {
    throw new Error(`[env] Missing required environment variable: ${name}`);
  }

  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed)) {
    throw new Error(`[env] Invalid numeric environment variable: ${name}`);
  }

  return parsed;
};

export const env = {
  nodeEnv: process.env.NODE_ENV?.trim() || 'development',
  port: parseNumber(process.env.PORT, 9528),
  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:9527,http://127.0.0.1:9527')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean),
  dbHost: requireString('DB_HOST', process.env.DB_HOST),
  dbPort: requireNumber('DB_PORT', process.env.DB_PORT),
  dbName: requireString('DB_NAME', process.env.DB_NAME),
  dbUser: requireString('DB_USER', process.env.DB_USER),
  dbPassword: requireString('DB_PASSWORD', process.env.DB_PASSWORD),
  jwtSecret: requireString('JWT_SECRET', process.env.JWT_SECRET),
  timeZone: process.env.TZ || 'Asia/Shanghai',
  requestBodyLimit: process.env.REQUEST_BODY_LIMIT?.trim() || '50mb',
  geminiApiKey: process.env.GEMINI_API_KEY?.trim() || '',
  openAiApiKey: process.env.OPENAI_API_KEY?.trim() || '',
  geminiFastModel: process.env.GEMINI_FAST_MODEL?.trim() || 'gemini-3-flash-preview',
  geminiStructuredModel: process.env.GEMINI_STRUCTURED_MODEL?.trim() || 'gemini-3.1-pro-preview',
  geminiImageModel: process.env.GEMINI_IMAGE_MODEL?.trim() || 'gemini-3-pro-image-preview',
  geminiVerificationModel: process.env.GEMINI_VERIFY_MODEL?.trim() || process.env.GEMINI_STRUCTURED_MODEL?.trim() || 'gemini-3.1-pro-preview',
  openAiAnalysisModel: process.env.OPENAI_ANALYSIS_MODEL?.trim() || process.env.OPENAI_IDENTITY_MODEL?.trim() || 'gpt-5.4',
  openAiIdentityModel: process.env.OPENAI_IDENTITY_MODEL?.trim() || 'gpt-5.4',
  openAiIdentityFallbackModel: process.env.OPENAI_IDENTITY_FALLBACK_MODEL?.trim() || 'gpt-5.4-mini',
  cookieSecure: parseBoolean(
    process.env.COOKIE_SECURE,
    (process.env.NODE_ENV?.trim() || 'development') === 'production',
  ),
  adminSeedUsername: process.env.ADMIN_SEED_USERNAME?.trim() || 'admin',
  adminSeedPassword: process.env.ADMIN_SEED_PASSWORD?.trim() || '',
  loginRateLimitWindowMs: parseNumber(process.env.LOGIN_RATE_LIMIT_WINDOW_MS, 10 * 60 * 1000),
  loginRateLimitMaxAttempts: parseNumber(process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS, 8),
  userAuthCookieName: 'vxstudio_user_token',
  adminAuthCookieName: 'vxstudio_admin_token',
} as const;
