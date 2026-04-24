import type { Request, Response } from 'express';
import { HttpError } from './http';

export const createRequestAbortController = (req: Request, res: Response) => {
  const controller = new AbortController();
  let cleanedUp = false;

  const cleanup = () => {
    if (cleanedUp) {
      return;
    }

    cleanedUp = true;
    req.off('aborted', handleRequestAborted);
    res.off('finish', handleResponseFinish);
    res.off('close', handleResponseClose);
  };

  const abort = () => {
    if (!controller.signal.aborted) {
      controller.abort();
    }
  };

  const handleRequestAborted = () => {
    abort();
    cleanup();
  };

  const handleResponseFinish = () => {
    cleanup();
  };

  const handleResponseClose = () => {
    if (!res.writableEnded) {
      abort();
    }
    cleanup();
  };

  req.once('aborted', handleRequestAborted);
  res.once('finish', handleResponseFinish);
  res.once('close', handleResponseClose);

  return {
    signal: controller.signal,
    cleanup,
  };
};

export const throwIfRequestAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) {
    throw new HttpError(499, 'REQUEST_ABORTED', '请求已取消，请重试。');
  }
};

export const createMergedAbortController = (options: {
  timeoutMs?: number;
  signal?: AbortSignal;
}) => {
  const controller = new AbortController();
  let abortedByTimeout = false;
  let abortedByExternalSignal = false;

  const handleExternalAbort = () => {
    abortedByExternalSignal = true;
    if (!controller.signal.aborted) {
      controller.abort();
    }
  };

  if (options.signal) {
    if (options.signal.aborted) {
      handleExternalAbort();
    } else {
      options.signal.addEventListener('abort', handleExternalAbort, { once: true });
    }
  }

  const timeoutId = typeof options.timeoutMs === 'number' && options.timeoutMs > 0
    ? setTimeout(() => {
        abortedByTimeout = true;
        if (!controller.signal.aborted) {
          controller.abort();
        }
      }, options.timeoutMs)
    : null;

  const cleanup = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    options.signal?.removeEventListener('abort', handleExternalAbort);
  };

  return {
    signal: controller.signal,
    cleanup,
    wasAbortedByTimeout: () => abortedByTimeout,
    wasAbortedByExternalSignal: () => abortedByExternalSignal,
  };
};
