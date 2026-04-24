import path from 'path';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { HttpError } from './http';
import { getResolvedProxyUrl } from './networkProxy';
import { createMergedAbortController } from './requestAbort';

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_BYTES = 15 * 1024 * 1024;
const DEFAULT_MAX_ATTEMPTS = 2;
const MAX_REDIRECTS = 5;

const REMOTE_IMAGE_REQUEST_HEADERS = {
  Accept: 'image/*,application/octet-stream;q=0.9,*/*;q=0.1',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};

type RequestInitWithDispatcher = RequestInit & { dispatcher?: unknown };

let directFetchDispatcher: unknown = null;

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '0.0.0.0',
  '::',
  '::1',
  'metadata.google.internal',
  'metadata.azure.internal',
]);

const BLOCKED_IP_ADDRESSES = new Set([
  '0.0.0.0',
  '127.0.0.1',
  '169.254.169.254',
  '169.254.170.2',
  '100.100.100.200',
  '::1',
  '::',
]);

const isSupportedRemoteImageUrl = (value: string) => /^https?:\/\//i.test(value);

const isLikelyRemoteImageUnreachable = (message: string) => {
  const upper = message.toUpperCase();
  return (
    upper.includes('FETCH FAILED') ||
    upper.includes('ECONNREFUSED') ||
    upper.includes('ECONNRESET') ||
    upper.includes('ENOTFOUND') ||
    upper.includes('ETIMEDOUT') ||
    upper.includes('EHOSTUNREACH') ||
    upper.includes('UND_ERR_CONNECT_TIMEOUT') ||
    upper.includes('UND_ERR_SOCKET')
  );
};

const extensionMimeMap: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

const normalizeMimeType = (value: string | null | undefined) =>
  String(value || '')
    .split(';')[0]
    .trim()
    .toLowerCase();

const inferMimeTypeFromUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    const ext = path.extname(parsed.pathname || '').toLowerCase();
    return extensionMimeMap[ext] || '';
  } catch {
    return '';
  }
};

const inferMimeTypeFromMagicBytes = (buffer: Buffer) => {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }

  if (buffer.length >= 6) {
    const header = buffer.subarray(0, 6).toString('ascii');
    if (header === 'GIF87a' || header === 'GIF89a') {
      return 'image/gif';
    }
  }

  return '';
};

const normalizeRemoteImageUrl = (value: string) => {
  let normalized = String(value || '').trim();

  if (
    (normalized.startsWith('"') && normalized.endsWith('"'))
    || (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1).trim();
  }

  return normalized.replace(/&amp;/gi, '&');
};

const getDirectFetchDispatcher = () => {
  if (directFetchDispatcher) {
    return directFetchDispatcher;
  }

  try {
    const { Agent } = require('undici') as typeof import('undici');
    directFetchDispatcher = new Agent();
    return directFetchDispatcher;
  } catch {
    return null;
  }
};

const isPrivateIpv4Address = (value: string) => {
  const parts = value.split('.').map(part => Number(part));
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
};

const isPrivateIpv6Address = (value: string) => {
  const normalized = value.toLowerCase();
  return (
    normalized === '::1' ||
    normalized === '::' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb')
  );
};

const isBlockedAddress = (value: string) => {
  const normalized = value.trim().toLowerCase();
  if (BLOCKED_IP_ADDRESSES.has(normalized)) {
    return true;
  }

  const ipVersion = isIP(normalized);
  if (ipVersion === 4) {
    return isPrivateIpv4Address(normalized);
  }

  if (ipVersion === 6) {
    return isPrivateIpv6Address(normalized);
  }

  return false;
};

const isBlockedHostname = (hostname: string) => {
  const normalized = hostname.trim().toLowerCase();
  return (
    BLOCKED_HOSTNAMES.has(normalized) ||
    normalized.endsWith('.localhost')
  );
};

const assertSafeRemoteImageUrl = async (value: string) => {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new HttpError(400, 'INVALID_REFERENCE_URL', '参考图地址格式无效。');
  }

  if (!/^https?:$/i.test(parsed.protocol)) {
    throw new HttpError(400, 'INVALID_REFERENCE_URL', '参考图地址必须以 http:// 或 https:// 开头。');
  }

  const hostname = parsed.hostname.trim().toLowerCase();
  if (!hostname) {
    throw new HttpError(400, 'INVALID_REFERENCE_URL', '参考图地址缺少主机名。');
  }

  if (isBlockedHostname(hostname) || isBlockedAddress(hostname)) {
    throw new HttpError(400, 'REFERENCE_IMAGE_PRIVATE_HOST', '参考图地址指向了不允许访问的主机。');
  }

  try {
    const resolvedAddresses = await lookup(hostname, { all: true, verbatim: true });
    if (resolvedAddresses.some(item => isBlockedAddress(item.address))) {
      throw new HttpError(400, 'REFERENCE_IMAGE_PRIVATE_HOST', '参考图地址指向了不允许访问的主机。');
    }
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
  }
};

const resolveRedirectUrl = (currentUrl: string, location: string | null) => {
  if (!location?.trim()) {
    throw new HttpError(502, 'REFERENCE_IMAGE_REDIRECT_INVALID', '参考图地址返回了无效跳转。');
  }

  return new URL(location, currentUrl).toString();
};

const resolveRemoteImageMimeType = (url: string, responseMimeType: string, buffer: Buffer) => {
  if (responseMimeType.startsWith('image/')) {
    return responseMimeType;
  }

  if (!responseMimeType || responseMimeType === 'application/octet-stream') {
    const magicMimeType = inferMimeTypeFromMagicBytes(buffer);
    if (magicMimeType) {
      return magicMimeType;
    }

    const urlMimeType = inferMimeTypeFromUrl(url);
    if (urlMimeType) {
      return urlMimeType;
    }
  }

  return '';
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const isRetriableRemoteImageError = (error: HttpError) =>
  error.code === 'REFERENCE_IMAGE_TIMEOUT' ||
  error.code === 'REFERENCE_IMAGE_UNREACHABLE' ||
  error.code === 'REFERENCE_IMAGE_FETCH_FAILED';

export const fetchRemoteImageAsBase64 = async (
  url: string,
  options: { timeoutMs?: number; maxBytes?: number; signal?: AbortSignal } = {},
): Promise<{ data: string; mimeType: string }> => {
  const trimmedUrl = normalizeRemoteImageUrl(url);
  if (!trimmedUrl || !isSupportedRemoteImageUrl(trimmedUrl)) {
    throw new HttpError(400, 'INVALID_REFERENCE_URL', '参考图地址必须以 http:// 或 https:// 开头。');
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const resolvedProxyUrl = getResolvedProxyUrl();
  let lastError: HttpError | null = null;

  for (let attempt = 1; attempt <= DEFAULT_MAX_ATTEMPTS; attempt += 1) {
    const abortContext = createMergedAbortController({
      timeoutMs,
      signal: options.signal,
    });

    try {
      const requestInit: RequestInitWithDispatcher = {
        headers: REMOTE_IMAGE_REQUEST_HEADERS,
        redirect: 'manual',
        signal: abortContext.signal,
      };

      if (resolvedProxyUrl && attempt === DEFAULT_MAX_ATTEMPTS) {
        const directDispatcher = getDirectFetchDispatcher();
        if (directDispatcher) {
          requestInit.dispatcher = directDispatcher;
        }
      }

      let currentUrl = trimmedUrl;
      let response: Response | null = null;

      for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
        await assertSafeRemoteImageUrl(currentUrl);
        response = await fetch(currentUrl, requestInit);

        if (response.status >= 300 && response.status < 400) {
          if (redirectCount >= MAX_REDIRECTS) {
            throw new HttpError(502, 'REFERENCE_IMAGE_REDIRECT_LIMIT', '参考图地址跳转次数过多。');
          }

          currentUrl = resolveRedirectUrl(currentUrl, response.headers.get('location'));
          continue;
        }

        break;
      }

      if (!response) {
        throw new HttpError(502, 'REFERENCE_IMAGE_FETCH_FAILED', '获取参考图失败，请稍后重试。');
      }

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new HttpError(502, 'REFERENCE_IMAGE_FORBIDDEN', `参考图地址拒绝访问（${response.status}）。`);
        }

        if (response.status === 404) {
          throw new HttpError(404, 'REFERENCE_IMAGE_NOT_FOUND', '参考图地址不存在或已失效。');
        }

        throw new HttpError(502, 'REFERENCE_IMAGE_FETCH_FAILED', `加载参考图失败（${response.status}）。`);
      }

      const contentLength = Number(response.headers.get('content-length') || 0);
      if (contentLength > maxBytes) {
        throw new HttpError(413, 'REFERENCE_IMAGE_TOO_LARGE', '参考图文件过大，请更换后重试。');
      }

      const arrayBuffer = await response.arrayBuffer();
      if (!arrayBuffer.byteLength) {
        throw new HttpError(502, 'REFERENCE_IMAGE_EMPTY', '参考图返回内容为空。');
      }

      if (arrayBuffer.byteLength > maxBytes) {
        throw new HttpError(413, 'REFERENCE_IMAGE_TOO_LARGE', '参考图文件过大，请更换后重试。');
      }

      const buffer = Buffer.from(arrayBuffer);
      const headerMimeType = normalizeMimeType(response.headers.get('content-type'));
      const resolvedMimeType = resolveRemoteImageMimeType(response.url || currentUrl, headerMimeType, buffer);

      if (!resolvedMimeType) {
        throw new HttpError(415, 'REFERENCE_IMAGE_INVALID_TYPE', '参考图地址返回的不是可识别图片文件。');
      }

      return {
        data: buffer.toString('base64'),
        mimeType: resolvedMimeType,
      };
    } catch (error) {
      if (abortContext.signal.aborted) {
        if (abortContext.wasAbortedByExternalSignal() && !abortContext.wasAbortedByTimeout()) {
          throw new HttpError(499, 'REQUEST_ABORTED', '请求已取消，请重试。');
        }

        lastError = new HttpError(504, 'REFERENCE_IMAGE_TIMEOUT', '加载参考图超时，请稍后重试。');
      } else if (error instanceof HttpError) {
        lastError = error;
      } else {
        const rawMessage = error instanceof Error ? error.message : String(error || '');
        if (isLikelyRemoteImageUnreachable(rawMessage)) {
          lastError = new HttpError(
            502,
            'REFERENCE_IMAGE_UNREACHABLE',
            '参考图来源当前无法连接，请更换图片地址或稍后重试。',
            { rawMessage },
          );
        } else {
          lastError = new HttpError(502, 'REFERENCE_IMAGE_FETCH_FAILED', '获取参考图失败，请稍后重试。', error);
        }
      }
    } finally {
      abortContext.cleanup();
    }

    if (!lastError || !isRetriableRemoteImageError(lastError) || attempt >= DEFAULT_MAX_ATTEMPTS) {
      break;
    }

    await sleep(300 * attempt);
  }

  throw lastError || new HttpError(502, 'REFERENCE_IMAGE_FETCH_FAILED', '获取参考图失败，请稍后重试。');
};
