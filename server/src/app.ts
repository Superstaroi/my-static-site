import cors from 'cors';
import cookieParser from 'cookie-parser';
import express from 'express';
import { env } from './config/env';
import { authRoutes } from './routes/authRoutes';
import { systemRoutes } from './routes/systemRoutes';
import { userRoutes } from './routes/userRoutes';
import { adminRoutes } from './routes/adminRoutes';
import { generateRoutes } from './routes/generateRoutes';
import { analyzeRoutes } from './routes/analyzeRoutes';
import { requireAdminAuth, requireFrontAuth } from './middleware/requireAuth';
import { errorHandler } from './middleware/errorHandler';

const allowedOrigins = new Set(env.clientOrigins);
const loginRateLimitStore = new Map<string, { count: number; resetAt: number }>();

const getLoginRateLimitKey = (req: express.Request) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const username = String(req.body?.username || '').trim().toLowerCase() || 'anonymous';
  return `${ip}:${username}`;
};

const loginRateLimitMiddleware: express.RequestHandler = (req, res, next) => {
  if (req.method !== 'POST' || (req.path !== '/front/login' && req.path !== '/admin/login')) {
    next();
    return;
  }

  const now = Date.now();
  const key = getLoginRateLimitKey(req);
  const current = loginRateLimitStore.get(key);

  if (!current || current.resetAt <= now) {
    loginRateLimitStore.set(key, {
      count: 1,
      resetAt: now + env.loginRateLimitWindowMs,
    });
    next();
    return;
  }

  if (current.count >= env.loginRateLimitMaxAttempts) {
    const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    res.setHeader('Retry-After', retryAfterSeconds.toString());
    res.status(429).json({
      success: false,
      code: 'RATE_LIMITED',
      message: '登录过于频繁，请稍后再试。',
    });
    return;
  }

  current.count += 1;
  loginRateLimitStore.set(key, current);
  next();
};

export const app = express();

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      return callback(null, true);
    }

    return callback(null, false);
  },
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json({ limit: env.requestBodyLimit }));
app.use(express.urlencoded({ extended: true, limit: env.requestBodyLimit }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/auth', loginRateLimitMiddleware, authRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/user', requireFrontAuth, userRoutes);
app.use('/api/admin', requireAdminAuth, adminRoutes);
app.use('/api/generate', requireFrontAuth, generateRoutes);
app.use('/api/analyze', requireFrontAuth, analyzeRoutes);

app.use(errorHandler);
