import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env';
import { HttpError } from '../utils/http';
import { assertImagePayload, assertOptionalImageArray } from '../utils/imagePayload';
import { createMergedAbortController, throwIfRequestAborted } from '../utils/requestAbort';
import { fetchRemoteImageAsBase64 } from '../utils/remoteImage';

export interface ImageRequestBehavior {
  timeoutMs?: number;
  maxRetries?: number;
}

export type Language = 'auto' | 'en' | 'zh' | 'multi';
export type TextMode = 'none' | 'render_text';

const GEMINI_FLASH_MODEL = env.geminiFastModel;
const GEMINI_STRUCTURED_JSON_MODEL = env.geminiStructuredModel;
const GEMINI_IMAGE_GENERATION_MODEL = env.geminiImageModel;
const SUPPORTED_IMAGE_SIZES = new Set(['1K', '2K', '4K']);
const MODEL_ASPECT_RATIO_OPTIONS = [
  { value: 21 / 9, label: '21:9' },
  { value: 16 / 9, label: '16:9' },
  { value: 9 / 16, label: '9:16' },
  { value: 4 / 3, label: '4:3' },
  { value: 3 / 4, label: '3:4' },
  { value: 1, label: '1:1' },
] as const;
const SUPPORTED_ASPECT_RATIOS = new Set<string>(MODEL_ASPECT_RATIO_OPTIONS.map(option => option.label));
const IMAGE_RESPONSE_MODALITIES = ['TEXT', 'IMAGE'] as const;

const normalizeRequestedImageSize = (imageSize: string) => {
  const normalized = String(imageSize || '1K').trim().toUpperCase();
  if (!SUPPORTED_IMAGE_SIZES.has(normalized)) {
    throw new HttpError(400, 'INVALID_IMAGE_SIZE', '图片尺寸仅支持 1K、2K 或 4K。');
  }

  return normalized;
};

const resolveNumericPairToAspectRatio = (width: number, height: number): string | null => {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  const targetRatio = width / height;
  return MODEL_ASPECT_RATIO_OPTIONS.reduce((closest, option) => {
    const closestDiff = Math.abs(Math.log(targetRatio / closest.value));
    const optionDiff = Math.abs(Math.log(targetRatio / option.value));
    return optionDiff < closestDiff ? option : closest;
  }, MODEL_ASPECT_RATIO_OPTIONS[0]).label;
};

const normalizeRequestedAspectRatio = (aspectRatio: string) => {
  const normalized = String(aspectRatio || '1:1')
    .trim()
    .replace(/\s+/g, '')
    .replace(/x/gi, ':')
    .toLowerCase();

  const formatted = normalized
    .split(':')
    .map(part => part.trim())
    .filter(Boolean)
    .join(':');

  if (!SUPPORTED_ASPECT_RATIOS.has(formatted)) {
    const numericMatch = normalized.match(/^(\d+):(\d+)$/);
    if (numericMatch) {
      const width = Number(numericMatch[1]);
      const height = Number(numericMatch[2]);
      const resolved = resolveNumericPairToAspectRatio(width, height);
      if (resolved) {
        return resolved;
      }
    }

    throw new HttpError(400, 'INVALID_ASPECT_RATIO', `暂不支持该图片比例：${aspectRatio}`);
  }

  return formatted;
};

const assertGeminiConfigured = () => {
  if (!env.geminiApiKey) {
    throw new HttpError(503, 'GEMINI_NOT_CONFIGURED', 'Gemini 服务尚未在服务器端配置。');
  }
};

const withGeminiClient = async <T>(executor: (ai: GoogleGenAI) => Promise<T>) => {
  assertGeminiConfigured();
  const ai = new GoogleGenAI({ apiKey: env.geminiApiKey });
  return executor(ai);
};

const toErrorString = (value: unknown) => (typeof value === 'string' ? value : '');

const pickFirstNumber = (...values: unknown[]): number | null => {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && /^\d{3}$/.test(value.trim())) {
      return Number(value.trim());
    }
  }
  return null;
};

const pickFirstString = (...values: unknown[]): string | null => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
};

const extractGeminiErrorMeta = (error: unknown) => {
  const raw = error as any;
  const message = toErrorString(raw?.message) || 'Gemini 请求失败。';
  const upperMessage = message.toUpperCase();
  const statusFromMessage = message.match(/\b(400|401|403|404|408|409|429|500|502|503|504)\b/)?.[1];
  const status = pickFirstNumber(
    raw?.status,
    raw?.statusCode,
    raw?.response?.status,
    raw?.error?.status,
    raw?.error?.code,
    statusFromMessage,
  );
  const code = pickFirstString(
    raw?.code,
    raw?.error?.status,
    raw?.error?.code,
    raw?.response?.data?.error?.status,
    raw?.response?.data?.error?.code,
  );
  const bodyPreview = pickFirstString(
    raw?.body,
    raw?.error?.message,
    raw?.response?.data?.error?.message,
    raw?.response?.data,
  );

  return {
    message,
    upperMessage,
    status,
    code,
    bodyPreview: bodyPreview ? String(bodyPreview).slice(0, 800) : null,
  };
};

const isLikelyGeminiProviderUnreachable = (message: string) => {
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

const classifyGeminiError = (actionLabel: string, error: unknown): HttpError => {
  if (error instanceof HttpError) {
    return error;
  }

  const meta = extractGeminiErrorMeta(error);
  const details = {
    action: actionLabel,
    upstreamStatus: meta.status,
    upstreamCode: meta.code,
    upstreamMessage: meta.message.slice(0, 800),
    upstreamBody: meta.bodyPreview,
  };
  const codeUpper = (meta.code || '').toUpperCase();
  const logError = (code: string, message: string, status: number) => {
    console.error('[gemini-service-error]', {
      action: actionLabel,
      code,
      status,
      upstreamStatus: meta.status,
      upstreamCode: meta.code,
      upstreamMessage: meta.message.slice(0, 500),
    });
    return new HttpError(status, code, message, details);
  };

  if (meta.status === 400 || codeUpper === 'INVALID_ARGUMENT' || meta.upperMessage.includes('INVALID_ARGUMENT')) {
    return logError(
      'GEMINI_INVALID_ARGUMENT',
      `${actionLabel}被 Gemini 拒绝，请检查图片输入、提示词或尺寸设置后重试。`,
      400,
    );
  }

  if (
    meta.status === 401 ||
    meta.status === 403 ||
    codeUpper === 'UNAUTHENTICATED' ||
    codeUpper === 'PERMISSION_DENIED' ||
    meta.upperMessage.includes('UNAUTHENTICATED') ||
    meta.upperMessage.includes('PERMISSION_DENIED')
  ) {
    return logError(
      'GEMINI_AUTH_OR_PERMISSION',
      `${actionLabel}失败，Gemini 鉴权或模型权限异常，请检查服务器配置。`,
      502,
    );
  }

  if (meta.status === 429 || meta.upperMessage.includes('RATE LIMIT')) {
    return logError('GEMINI_RATE_LIMITED', `${actionLabel}失败，Gemini 当前较忙，请稍后重试。`, 429);
  }

  if (
    meta.status === 408 ||
    meta.status === 504 ||
    codeUpper === 'DEADLINE_EXCEEDED' ||
    meta.upperMessage.includes('TIMEOUT') ||
    meta.upperMessage.includes('DEADLINE_EXCEEDED')
  ) {
    return logError('GEMINI_UPSTREAM_TIMEOUT', `${actionLabel}超时，请简化要求后重试。`, 504);
  }

  if (meta.status && meta.status >= 500) {
    return logError('GEMINI_UPSTREAM_UNAVAILABLE', `${actionLabel}失败，Gemini 当前暂时不可用，请稍后重试。`, 502);
  }

  if (isLikelyGeminiProviderUnreachable(meta.message)) {
    return logError('GEMINI_PROVIDER_UNREACHABLE', `${actionLabel}失败，Gemini 服务当前无法连接。`, 503);
  }

  if (meta.upperMessage.includes('INTERRUPTED')) {
    return logError('GEMINI_REQUEST_INTERRUPTED', `${actionLabel}失败，请求在返回结果前被中断。`, 502);
  }

  return logError('GEMINI_NETWORK_ERROR', `${actionLabel}失败，请稍后重试。`, 502);
};

const buildImageGenerationConfig = (params: {
  aspectRatio: string;
  imageSize: string;
  systemInstruction: string;
  signal: AbortSignal;
}) => ({
  systemInstruction: params.systemInstruction,
  responseModalities: [...IMAGE_RESPONSE_MODALITIES],
  imageConfig: {
    aspectRatio: normalizeRequestedAspectRatio(params.aspectRatio) as any,
    imageSize: normalizeRequestedImageSize(params.imageSize) as any,
  },
  httpOptions: { signal: params.signal } as any,
});

const withRequestTimeout = async <T>(
  timeoutMs: number,
  timeoutMessage: string,
  executor: (signal: AbortSignal) => Promise<T>,
  externalSignal?: AbortSignal,
) => {
  const abortContext = createMergedAbortController({
    timeoutMs,
    signal: externalSignal,
  });

  try {
    throwIfRequestAborted(abortContext.signal);
    return await executor(abortContext.signal);
  } catch (error) {
    if (abortContext.signal.aborted) {
      if (abortContext.wasAbortedByExternalSignal() && !abortContext.wasAbortedByTimeout()) {
        throw new HttpError(499, 'REQUEST_ABORTED', '请求已取消，请重试。');
      }

      throw new HttpError(504, 'MODEL_TIMEOUT', timeoutMessage);
    }
    throw error;
  } finally {
    abortContext.cleanup();
  }
};

export const generateStructuredJsonWithGemini = async (
  prompt: string,
  imagesBase64: { data: string; mimeType: string }[],
  schema: unknown,
  useFlash = false,
  modelOverride?: string,
  signal?: AbortSignal,
) => {
  const safeImages = assertOptionalImageArray(imagesBase64, '分析图片');
  const parts: Array<Record<string, unknown>> = [];
  safeImages.forEach((img, index) => {
    parts.push({ text: `Image ${index + 1}:` });
    parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
  });
  parts.push({ text: prompt });

  const model = modelOverride?.trim() || (useFlash ? GEMINI_FLASH_MODEL : GEMINI_STRUCTURED_JSON_MODEL);
  const timeoutMs = useFlash && !modelOverride ? 30000 : 60000;

  const response = await withGeminiClient(ai =>
    withRequestTimeout(
      timeoutMs,
      `结构化分析超时（${timeoutMs / 1000} 秒），请稍后重试。`,
      async requestSignal => {
        try {
          return await ai.models.generateContent({
            model,
            contents: [{ role: 'user', parts }],
            config: {
              responseMimeType: 'application/json',
              responseSchema: schema as any,
              httpOptions: { signal: requestSignal } as any,
            },
          });
        } catch (error) {
          if (requestSignal.aborted) {
            throw error;
          }
          throw classifyGeminiError('结构化分析', error);
        }
      },
      signal,
    ),
  );

  const jsonStr = response.text?.trim() || '{}';
  try {
    return JSON.parse(jsonStr);
  } catch (error) {
    throw new HttpError(502, 'MODEL_JSON_PARSE_FAILED', '解析 Gemini 返回结果失败，请稍后重试。', error);
  }
};

const extractInlineImageFromResponse = (response: any, prompt: string) => {
  const candidates = Array.isArray(response?.candidates) ? response.candidates : [];
  const textParts: string[] = [];

  for (const candidate of candidates) {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    for (const part of parts) {
      const inlineData = part?.inlineData;
      if (inlineData) {
        const mimeType = String(inlineData.mimeType || '').trim();
        const data = String(inlineData.data || '').trim();

        if (!mimeType || !data) {
          throw new HttpError(502, 'GEMINI_IMAGE_PARSE_FAILED', 'Gemini 返回的图片数据格式异常。');
        }

        if (!mimeType.toLowerCase().startsWith('image/')) {
          continue;
        }

        return {
          url: `data:${mimeType};base64,${data}`,
          prompt,
        };
      }

      const text = toErrorString(part?.text).trim();
      if (text) {
        textParts.push(text);
      }
    }
  }

  if (response.promptFeedback?.blockReason) {
    throw new HttpError(400, 'MODEL_BLOCKED', `模型请求被拦截：${response.promptFeedback.blockReason}`);
  }

  const textResponse = textParts.join('\n').trim();
  if (textResponse) {
    throw new HttpError(
      502,
      'MODEL_TEXT_ONLY_RESPONSE',
      'Gemini 只返回了文本，没有返回图片。',
      { textPreview: textResponse.slice(0, 800) },
    );
  }

  throw new HttpError(502, 'NO_IMAGE_RETURNED', 'Gemini 没有返回图片，请稍后重试。');
};

export const generateProductImageWithGemini = async (params: {
  productBase64: { data: string; mimeType: string };
  refBase64: { data: string; mimeType: string } | null;
  refUrl?: string | null;
  supplementalProductBase64?: { data: string; mimeType: string }[];
  prompt: string;
  aspectRatio?: string;
  imageSize?: string;
  imageIndex?: number;
  totalImages?: number;
  textMode?: TextMode;
  requestBehavior?: ImageRequestBehavior;
  signal?: AbortSignal;
}) => {
  const {
    productBase64,
    refBase64,
    supplementalProductBase64 = [],
    prompt,
    aspectRatio = '1:1',
    imageSize = '1K',
    imageIndex,
    totalImages,
    requestBehavior,
    signal,
  } = params;
  const safeProductBase64 = assertImagePayload(productBase64, '产品图');
  const safeSupplementalProductBase64 = assertOptionalImageArray(supplementalProductBase64, '补充产品图');
  throwIfRequestAborted(signal);
  const effectiveRefBase64 = refBase64
    ? assertImagePayload(refBase64, '参考图')
    : params.refUrl
      ? assertImagePayload(await fetchRemoteImageAsBase64(params.refUrl, { signal }), '参考图')
      : null;
  const normalizedImageSize = normalizeRequestedImageSize(imageSize);
  const normalizedAspectRatio = normalizeRequestedAspectRatio(aspectRatio);

  const parts: Array<Record<string, unknown>> = [];
  const systemInstruction = [
    'ROLE: You are a high-precision commercial product image generation system, specializing in faithful product reproduction and realistic environment placement.',
    "Your primary goal is to preserve the uploaded subject product's identity perfectly while placing it in a clean, believable context.",
    'This is a STRICT PRODUCT-FAITHFULNESS task, not a creative redesign task.',
    'The uploaded subject product images are the ONLY true product identity for the final image.',
    'When the prompt contains explicit visible user instructions about the scene, framing, props, support container, or relative size of secondary elements, satisfy those user instructions before using any optional reference-image scene guidance.',
    'If a reference image is provided, its product/object is a placeholder. Use only non-product cues that are allowed by the prompt, such as scene, lighting, composition, interaction, color mood, atmosphere, or visual styling.',
    'You must replace the placeholder reference-image product with the uploaded subject product.',
    'Never borrow physical structure, silhouette, brand cues, attachments, unique product color blocking, or product-identity design details from the reference-image product.',
    'If there is any conflict between the uploaded subject product and the reference image, the uploaded subject product must win.',
    'Preserve recognizable product identity, but do not ignore an explicit requested change to a secondary support element, basket, planter, stand, base, packaging element, prop, or nearby accessory.',
  ].join(' ');

  let indexInstruction = '';
  if (imageIndex !== undefined && totalImages !== undefined && totalImages > 1) {
    indexInstruction = `\n\nCRITICAL VARIATION INSTRUCTION: The user requested ${totalImages} images. You are generating image ${imageIndex}. Follow image-specific instructions for image ${imageIndex}.`;
  }

  if (effectiveRefBase64) {
    parts.push({ text: '\n--- REFERENCE IMAGE (SCENE / LIGHTING / COMPOSITION ONLY - NOT PRODUCT IDENTITY) ---\n' });
    parts.push({ inlineData: { mimeType: effectiveRefBase64.mimeType, data: effectiveRefBase64.data } });
  }

  parts.push({ text: '--- SUBJECT PRODUCT (MAIN VIEW - TRUE PRODUCT IDENTITY / HIGHEST PRIORITY) ---\n' });
  parts.push({ inlineData: { mimeType: safeProductBase64.mimeType, data: safeProductBase64.data } });

  if (safeSupplementalProductBase64.length > 0) {
    parts.push({ text: '\n--- SUBJECT PRODUCT (ADDITIONAL VIEWS - SAME EXACT PRODUCT) ---\n' });
    safeSupplementalProductBase64.forEach((img, index) => {
      parts.push({ text: `View ${index + 1}:` });
      parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
    });
  }

  parts.push({ text: '\n--- PRODUCT IDENTITY LOCK ---\nUse the uploaded subject product images above as the only valid product identity in the final image.\n' });
  parts.push({ text: `\n--- INSTRUCTIONS ---\n${prompt}${indexInstruction}` });

  const timeoutMs =
    requestBehavior?.timeoutMs ?? (normalizedImageSize === '4K' ? 120000 : normalizedImageSize === '2K' ? 90000 : 60000);

  const response = await withGeminiClient(ai =>
    withRequestTimeout(
      timeoutMs,
      `图片生成超时（${timeoutMs / 1000} 秒），请稍后重试。`,
      async requestSignal => {
        try {
          return await ai.models.generateContent({
            model: GEMINI_IMAGE_GENERATION_MODEL,
            contents: [{ role: 'user', parts }],
            config: buildImageGenerationConfig({
              aspectRatio: normalizedAspectRatio,
              imageSize: normalizedImageSize,
              systemInstruction,
              signal: requestSignal,
            }),
          });
        } catch (error) {
          if (requestSignal.aborted) {
            throw error;
          }
          throw classifyGeminiError('图片生成', error);
        }
      },
      signal,
    ),
  );

  return extractInlineImageFromResponse(response, prompt + indexInstruction);
};

export const editGeneratedImageLocallyWithGemini = async (params: {
  baseImageBase64: { data: string; mimeType: string };
  productBase64: { data: string; mimeType: string };
  refBase64?: { data: string; mimeType: string } | null;
  refUrl?: string | null;
  supplementalProductBase64?: { data: string; mimeType: string }[];
  prompt: string;
  aspectRatio?: string;
  imageSize?: string;
  requestBehavior?: ImageRequestBehavior;
  maxSupplementalProductImages?: number;
  signal?: AbortSignal;
}) => {
  const {
    baseImageBase64,
    productBase64,
    refBase64,
    refUrl,
    supplementalProductBase64 = [],
    prompt,
    aspectRatio = '1:1',
    imageSize = '1K',
    requestBehavior,
    maxSupplementalProductImages = 1,
    signal,
  } = params;

  const safeBaseImageBase64 = assertImagePayload(baseImageBase64, '当前生成图');
  const safeProductBase64 = assertImagePayload(productBase64, '产品图');
  const effectiveRefBase64 = refBase64
    ? assertImagePayload(refBase64, '参考图')
    : refUrl
      ? assertImagePayload(await fetchRemoteImageAsBase64(refUrl, { signal }), '参考图')
      : null;
  const safeSupplementalProductBase64 = assertOptionalImageArray(supplementalProductBase64, '补充产品图');
  const limitedSupplemental = safeSupplementalProductBase64.slice(0, Math.max(0, maxSupplementalProductImages));
  const normalizedImageSize = normalizeRequestedImageSize(imageSize);
  const normalizedAspectRatio = normalizeRequestedAspectRatio(aspectRatio);
  const parts: Array<Record<string, unknown>> = [
    { text: '--- BASE IMAGE TO EDIT (CURRENT RESULT / STARTING POINT ONLY - DO NOT PRESERVE INCORRECT SCENE OR COMPOSITION) ---\n' },
    { inlineData: { mimeType: safeBaseImageBase64.mimeType, data: safeBaseImageBase64.data } },
    { text: '\n--- ORIGINAL PRODUCT REFERENCE (MUST STILL MATCH) ---\n' },
    { inlineData: { mimeType: safeProductBase64.mimeType, data: safeProductBase64.data } },
  ];

  if (effectiveRefBase64) {
    parts.push({ text: '\n--- OPTIONAL REFERENCE IMAGE (SECONDARY SCENE / COMPOSITION GUIDANCE ONLY - MUST NOT OVERRIDE THE CURRENT LOCAL EDIT REQUEST) ---\n' });
    parts.push({ inlineData: { mimeType: effectiveRefBase64.mimeType, data: effectiveRefBase64.data } });
  }

  if (limitedSupplemental.length > 0) {
    parts.push({ text: '\n--- OPTIONAL SUPPLEMENTAL PRODUCT REFERENCE VIEW ---\n' });
    limitedSupplemental.forEach((img, index) => {
      parts.push({ text: `Reference View ${index + 1}:` });
      parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
    });
  }

  parts.push({ text: `\n--- LOCAL EDIT INSTRUCTIONS ---\n${prompt}` });

  const systemInstruction = [
    'ROLE: You are a commercial product image editor.',
    'The first image is only the current starting image to edit, not a locked truth source.',
    "The user's local edit request is the highest-priority instruction for this task.",
    'The final image must visibly reflect the requested edit. Returning an unchanged or nearly unchanged image is a failed edit.',
    'Keep the same uploaded product identity. Do not replace it, merge it with another product, or borrow physical structure from a placeholder product.',
    'Interpret product-identity preservation as keeping the main uploaded subject recognizable, not as freezing every secondary support element at pixel-identical size or prominence.',
    "Treat the current image as a starting point only. If the current pose, angle, spatial relationship, or composition conflicts with the user's request, correct it instead of preserving the mistake.",
    'If an optional reference image is provided, treat it only as secondary scene or composition guidance after the current local edit request is satisfied.',
    "Never let the optional reference image override the user's current local edit request.",
    "If the user asks to change the background, environment, props, framing, camera angle, or overall scene, make that change clearly instead of preserving the old setup from the current image or the optional reference image.",
    "If the user explicitly asks to change the size, scale, placement, visibility, or styling of a support element, planter, basket, stand, base, prop, packaging element, or nearby accessory, make that change while keeping the main uploaded subject recognizable.",
    'Use the smallest necessary edit footprint. Do not rewrite unrelated regions when they are not part of the request.',
    "Only preserve scene, framing, composition, and unrelated product details when they do not conflict with the user's request.",
  ].join(' ');

  const timeoutMs = requestBehavior?.timeoutMs ?? 75000;

  const response = await withGeminiClient(ai =>
    withRequestTimeout(
      timeoutMs,
      `局部修改超时（${timeoutMs / 1000} 秒），请简化补充说明后重试。`,
      async requestSignal => {
        try {
          return await ai.models.generateContent({
            model: GEMINI_IMAGE_GENERATION_MODEL,
            contents: [{ role: 'user', parts }],
            config: buildImageGenerationConfig({
              aspectRatio: normalizedAspectRatio,
              imageSize: normalizedImageSize,
              systemInstruction,
              signal: requestSignal,
            }),
          });
        } catch (error) {
          if (requestSignal.aborted) {
            throw error;
          }
          throw classifyGeminiError('局部修改', error);
        }
      },
      signal,
    ),
  );

  return extractInlineImageFromResponse(response, prompt);
};

export const normalizeCopyTextWithGemini = async (
  text: string,
  targetLanguage?: Language,
  signal?: AbortSignal,
) => {
  if (!text) {
    return text;
  }

  const trimmedText = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n');

  if (!trimmedText) {
    return '';
  }

  const shouldTranslate = !!targetLanguage && targetLanguage !== 'auto' && targetLanguage !== 'multi';
  const prompt = shouldTranslate
    ? `Translate the following marketing copy into the target language, then lightly format it for clean product-image typography. Preserve meaning, keep it concise, return only final text.\nTarget Language: ${targetLanguage}\nOriginal Copy:\n"${trimmedText}"`
    : `Format the following marketing copy for direct rendering inside a product image. Keep the exact same language, preserve meaning, keep it concise, return only final text.\nOriginal Copy:\n"${trimmedText}"`;

  const response = await withGeminiClient(ai =>
    withRequestTimeout(
      20000,
      '文案整理超时，请稍后重试。',
      async requestSignal => {
        try {
          return await ai.models.generateContent({
            model: GEMINI_FLASH_MODEL,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
              httpOptions: { signal: requestSignal } as any,
            },
          });
        } catch (error) {
          if (requestSignal.aborted) {
            throw error;
          }
          throw classifyGeminiError('文案整理', error);
        }
      },
      signal,
    ),
  );

  return response.text?.trim() || trimmedText;
};
