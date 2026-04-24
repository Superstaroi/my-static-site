import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../utils/http';

const sendError = (
  res: Response,
  status: number,
  code: string,
  message: string,
  detail?: unknown,
) =>
  res.status(status).json({
    success: false,
    code,
    message,
    detail: detail ?? null,
  });

export const errorHandler = (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (res.headersSent || res.writableEnded || res.destroyed) {
    return;
  }

  const databaseCode = error && typeof error === 'object' ? String((error as { code?: unknown }).code || '') : '';
  const errorType = error && typeof error === 'object' ? String((error as { type?: unknown }).type || '') : '';

  if (error instanceof HttpError) {
    return sendError(res, error.status, error.code, error.message, error.details);
  }

  if (errorType === 'entity.parse.failed') {
    return sendError(res, 400, 'INVALID_JSON_BODY', '请求体不是合法的 JSON 数据，请检查后重试。');
  }

  if (errorType === 'entity.too.large') {
    return sendError(res, 413, 'REQUEST_BODY_TOO_LARGE', '请求体过大，请压缩图片或减少上传内容后重试。');
  }

  if (
    databaseCode === 'ECONNREFUSED'
    || databaseCode === 'PROTOCOL_CONNECTION_LOST'
    || databaseCode === 'ER_ACCESS_DENIED_ERROR'
    || databaseCode === 'ENOTFOUND'
  ) {
    console.error('[database-error]', error);
    return sendError(
      res,
      503,
      'DATABASE_UNAVAILABLE',
      '数据库服务当前不可用，请检查 MySQL 和后端数据库配置。',
    );
  }

  const message = error instanceof Error && error.message
    ? error.message
    : '服务器内部异常，请稍后重试。';
  console.error('[server-error]', error);
  return sendError(res, 500, 'INTERNAL_SERVER_ERROR', message);
};
