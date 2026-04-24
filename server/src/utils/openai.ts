import { env } from '../config/env';
import { HttpError } from './http';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const OPENAI_MIN_OUTPUT_TOKENS = 16;

const normalizeErrorText = (value: string) =>
  value
    .replace(/\s+/g, ' ')
    .trim();

const isLikelyProviderUnreachable = (message: string) => {
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

export const extractOpenAiResponseText = (responseJson: any): string => {
  if (typeof responseJson?.output_text === 'string' && responseJson.output_text.trim()) {
    return responseJson.output_text.trim();
  }

  const textParts: string[] = [];
  const outputs = Array.isArray(responseJson?.output) ? responseJson.output : [];

  outputs.forEach((item: any) => {
    const contents = Array.isArray(item?.content) ? item.content : [];
    contents.forEach((contentItem: any) => {
      const candidateText =
        typeof contentItem?.text === 'string'
          ? contentItem.text
          : typeof contentItem?.value === 'string'
            ? contentItem.value
            : '';

      if (candidateText.trim()) {
        textParts.push(candidateText.trim());
      }
    });
  });

  return textParts.join('\n').trim();
};

export const extractOpenAiJsonObject = (rawText: string): any => {
  const fencedMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const textToParse = fencedMatch?.[1]?.trim() || rawText.trim();
  const objectMatch = textToParse.match(/\{[\s\S]*\}/);
  const jsonText = objectMatch?.[0] || textToParse;
  return JSON.parse(jsonText);
};

export const postOpenAiResponses = async (params: {
  model: string;
  input: unknown;
  maxOutputTokens: number;
  actionLabel: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}) => {
  if (!env.openAiApiKey) {
    throw new HttpError(503, 'OPENAI_NOT_CONFIGURED', 'OpenAI 服务尚未在服务器端配置。');
  }

  const safeMaxOutputTokens = Math.max(
    OPENAI_MIN_OUTPUT_TOKENS,
    Number.isFinite(params.maxOutputTokens) ? Math.floor(params.maxOutputTokens) : OPENAI_MIN_OUTPUT_TOKENS,
  );

  const controller = new AbortController();
  let abortedByTimeout = false;
  let abortedByExternalSignal = false;
  const handleExternalAbort = () => {
    abortedByExternalSignal = true;
    controller.abort();
  };

  if (params.signal) {
    if (params.signal.aborted) {
      handleExternalAbort();
    } else {
      params.signal.addEventListener('abort', handleExternalAbort, { once: true });
    }
  }

  const timeoutId = setTimeout(() => {
    abortedByTimeout = true;
    controller.abort();
  }, params.timeoutMs ?? 45000);

  try {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.openAiApiKey}`,
      },
      body: JSON.stringify({
        model: params.model,
        input: params.input,
        max_output_tokens: safeMaxOutputTokens,
      }),
      signal: controller.signal,
    });

    const rawText = await response.text().catch(() => '');
    if (!response.ok) {
      const bodyPreview = normalizeErrorText(rawText).slice(0, 240);

      if (response.status === 400) {
        throw new HttpError(
          400,
          'OPENAI_INVALID_ARGUMENT',
          `${params.actionLabel}失败，请求参数不合法。`,
          { status: response.status, body: bodyPreview },
        );
      }

      if (response.status === 401 || response.status === 403) {
        throw new HttpError(
          502,
          'OPENAI_AUTH_OR_PERMISSION',
          `${params.actionLabel}失败，OpenAI 鉴权或模型权限异常。`,
          { status: response.status, body: bodyPreview },
        );
      }

      if (response.status === 429) {
        throw new HttpError(429, 'OPENAI_RATE_LIMITED', `${params.actionLabel}失败，OpenAI 当前较忙，请稍后重试。`);
      }

      if (response.status >= 500) {
        throw new HttpError(
          502,
          'OPENAI_UPSTREAM_ERROR',
          `${params.actionLabel}失败，OpenAI 当前暂时不可用。`,
          { status: response.status, body: bodyPreview },
        );
      }

      throw new HttpError(
        502,
        'OPENAI_REQUEST_FAILED',
        `${params.actionLabel}失败，OpenAI 返回异常状态。`,
        { status: response.status, body: bodyPreview },
      );
    }

    if (!rawText.trim()) {
      throw new HttpError(502, 'OPENAI_EMPTY_RESPONSE', `${params.actionLabel}返回为空，请稍后重试。`);
    }

    try {
      return JSON.parse(rawText);
    } catch (error) {
      throw new HttpError(502, 'OPENAI_RESPONSE_PARSE_FAILED', `${params.actionLabel}返回格式异常。`, error);
    }
  } catch (error) {
    if (controller.signal.aborted) {
      if (abortedByExternalSignal && !abortedByTimeout) {
        throw new HttpError(499, 'REQUEST_ABORTED', '请求已取消，请重试。');
      }

      throw new HttpError(504, 'OPENAI_TIMEOUT', `${params.actionLabel}超时，请稍后重试。`);
    }

    if (error instanceof HttpError) {
      throw error;
    }

    const rawMessage = normalizeErrorText(error instanceof Error ? error.message : String(error || ''));

    if (isLikelyProviderUnreachable(rawMessage)) {
      throw new HttpError(
        503,
        'OPENAI_PROVIDER_UNREACHABLE',
        `${params.actionLabel}失败，OpenAI 服务当前无法连接。`,
        { rawMessage },
      );
    }

    if (rawMessage.toUpperCase().includes('INTERRUPTED')) {
      throw new HttpError(
        502,
        'OPENAI_REQUEST_INTERRUPTED',
        `${params.actionLabel}失败，请求在返回结果前被中断。`,
        { rawMessage },
      );
    }

    throw new HttpError(
      502,
      'OPENAI_NETWORK_ERROR',
      `${params.actionLabel}失败，请稍后重试。`,
      { rawMessage },
    );
  } finally {
    clearTimeout(timeoutId);
    params.signal?.removeEventListener('abort', handleExternalAbort);
  }
};
