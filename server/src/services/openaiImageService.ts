import { env } from '../config/env';
import { assertImagePayload, assertOptionalImageArray, ImagePayload } from '../utils/imagePayload';
import { HttpError } from '../utils/http';
import { getOpenAiBaseUrl } from '../utils/networkProxy';
import { createMergedAbortController, throwIfRequestAborted } from '../utils/requestAbort';
import { fetchRemoteImageAsBase64 } from '../utils/remoteImage';
import { ImageRequestBehavior } from './geminiService';

const normalizeErrorText = (value: string) =>
  value
    .replace(/\s+/g, ' ')
    .trim();

const toOpenAiImageSize = (aspectRatio = '1:1') => {
  const normalized = String(aspectRatio || '1:1').trim().replace(/\s+/g, '').replace(/x/gi, ':');
  const match = normalized.match(/^(\d+):(\d+)$/);
  if (!match) {
    return '1024x1024';
  }

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return '1024x1024';
  }

  if (width > height) {
    return '1536x1024';
  }

  if (height > width) {
    return '1024x1536';
  }

  return '1024x1024';
};

const toOpenAiQuality = (imageSize = '1K') => {
  const normalized = String(imageSize || '1K').trim().toUpperCase();
  return normalized === '1K' ? 'medium' : 'high';
};

const appendImagePayload = (form: FormData, payload: ImagePayload, filename: string) => {
  const safePayload = assertImagePayload(payload, filename);
  const binary = Buffer.from(safePayload.data, 'base64');
  const blob = new Blob([binary], { type: safePayload.mimeType });
  form.append('image[]', blob, filename);
};

const buildProductGenerationPrompt = (prompt: string, imageIndex?: number, totalImages?: number) => {
  const indexInstruction =
    imageIndex !== undefined && totalImages !== undefined && totalImages > 1
      ? `\n\nCRITICAL VARIATION INSTRUCTION: The user requested ${totalImages} images. You are generating image ${imageIndex}. Follow image-specific instructions for image ${imageIndex}.`
      : '';

  return [
    'You are generating a production-ready e-commerce product image.',
    'The uploaded subject product image is the only true product identity. Preserve its structure, color, materials, and key parts.',
    'If reference images are provided, use them only for non-product scene, style, layout, lighting, typography hierarchy, callout containers, icons, arrows, and effect language. Do not copy their product identity.',
    'Do not add logos or unrelated branding unless explicitly requested.',
    prompt,
    indexInstruction,
  ]
    .filter(Boolean)
    .join('\n');
};

const buildLocalEditPrompt = (prompt: string) =>
  [
    'You are editing a commercial product image.',
    'The first image is the current image to edit. The uploaded product/reference images after it are identity and style references.',
    "The user's local edit request is the highest-priority instruction.",
    'Keep the same uploaded product identity. Do not borrow physical structure or brand cues from a reference product.',
    prompt,
  ]
    .filter(Boolean)
    .join('\n');

const parseOpenAiImageResponse = async (response: Response, actionLabel: string) => {
  const rawText = await response.text().catch(() => '');
  const bodyPreview = normalizeErrorText(rawText).slice(0, 500);

  if (!response.ok) {
    const isUnsupportedModelError =
      /\bmodel\b/i.test(bodyPreview) &&
      /(not found|does not exist|unsupported|invalid|not supported|unknown)/i.test(bodyPreview);

    if (response.status === 400 && isUnsupportedModelError) {
      throw new HttpError(400, 'OPENAI_IMAGE_UNSUPPORTED_MODEL', `${actionLabel}失败，当前 OpenAI 生图模型不被 Images API 支持，请检查 OPENAI_IMAGE_MODEL。`, {
        status: response.status,
        body: bodyPreview,
      });
    }

    if (response.status === 400) {
      throw new HttpError(400, 'OPENAI_IMAGE_INVALID_ARGUMENT', `${actionLabel}失败，请检查图片、提示词或尺寸设置。`, {
        status: response.status,
        body: bodyPreview,
      });
    }

    if (response.status === 401 || response.status === 403) {
      throw new HttpError(502, 'OPENAI_IMAGE_AUTH_OR_PERMISSION', `${actionLabel}失败，OpenAI 鉴权或模型权限异常。`, {
        status: response.status,
        body: bodyPreview,
      });
    }

    if (response.status === 429) {
      throw new HttpError(429, 'OPENAI_IMAGE_RATE_LIMITED', `${actionLabel}失败，OpenAI 当前较忙，请稍后重试。`);
    }

    throw new HttpError(502, 'OPENAI_IMAGE_REQUEST_FAILED', `${actionLabel}失败，OpenAI 返回异常状态。`, {
      status: response.status,
      body: bodyPreview,
    });
  }

  if (!rawText.trim()) {
    throw new HttpError(502, 'OPENAI_IMAGE_EMPTY_RESPONSE', `${actionLabel}返回为空，请稍后重试。`);
  }

  try {
    return JSON.parse(rawText);
  } catch (error) {
    throw new HttpError(502, 'OPENAI_IMAGE_RESPONSE_PARSE_FAILED', `${actionLabel}返回格式异常。`, error);
  }
};

const extractImageFromOpenAiResponse = (responseJson: any, prompt: string) => {
  const first = Array.isArray(responseJson?.data) ? responseJson.data[0] : null;
  const b64 = typeof first?.b64_json === 'string' ? first.b64_json.trim() : '';
  if (!b64) {
    throw new HttpError(502, 'OPENAI_IMAGE_NOT_RETURNED', 'OpenAI 没有返回图片，请稍后重试。');
  }

  return {
    url: `data:image/png;base64,${b64}`,
    prompt,
    usage: responseJson?.usage || null,
  };
};

const postOpenAiImageEdit = async (params: {
  modelId: string;
  prompt: string;
  images: ImagePayload[];
  aspectRatio?: string;
  imageSize?: string;
  actionLabel: string;
  requestBehavior?: ImageRequestBehavior;
  signal?: AbortSignal;
}) => {
  if (!env.openAiApiKey) {
    throw new HttpError(503, 'OPENAI_NOT_CONFIGURED', 'OpenAI 服务尚未在服务器端配置。');
  }

  const merged = createMergedAbortController({
    timeoutMs: params.requestBehavior?.timeoutMs ?? 90000,
    signal: params.signal,
  });

  const form = new FormData();
  form.append('model', params.modelId);
  form.append('prompt', params.prompt);
  form.append('size', toOpenAiImageSize(params.aspectRatio));
  form.append('quality', toOpenAiQuality(params.imageSize));

  params.images.forEach((image, index) => appendImagePayload(form, image, `input-${index + 1}.png`));

  try {
    const response = await fetch(`${getOpenAiBaseUrl()}/images/edits`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.openAiApiKey}`,
      },
      body: form,
      signal: merged.signal,
    });

    const responseJson = await parseOpenAiImageResponse(response, params.actionLabel);
    return extractImageFromOpenAiResponse(responseJson, params.prompt);
  } catch (error) {
    if (merged.signal.aborted) {
      if (merged.wasAbortedByExternalSignal() && !merged.wasAbortedByTimeout()) {
        throw new HttpError(499, 'REQUEST_ABORTED', '请求已取消，请重试。');
      }

      throw new HttpError(504, 'OPENAI_IMAGE_TIMEOUT', `${params.actionLabel}超时，请稍后重试。`);
    }

    if (error instanceof HttpError) {
      throw error;
    }

    const rawMessage = normalizeErrorText(error instanceof Error ? error.message : String(error || ''));
    throw new HttpError(502, 'OPENAI_IMAGE_NETWORK_ERROR', `${params.actionLabel}失败，请稍后重试。`, { rawMessage });
  } finally {
    merged.cleanup();
  }
};

export const generateProductImageWithOpenAi = async (params: {
  productBase64: ImagePayload;
  refBase64: ImagePayload | null;
  refUrl?: string | null;
  supplementalProductBase64?: ImagePayload[];
  prompt: string;
  aspectRatio?: string;
  imageSize?: string;
  imageIndex?: number;
  totalImages?: number;
  requestBehavior?: ImageRequestBehavior;
  modelId?: string;
  signal?: AbortSignal;
}) => {
  throwIfRequestAborted(params.signal);
  const product = assertImagePayload(params.productBase64, '产品图');
  const supplemental = assertOptionalImageArray(params.supplementalProductBase64, '补充产品图');
  const ref = params.refBase64
    ? assertImagePayload(params.refBase64, '参考图')
    : params.refUrl
      ? assertImagePayload(await fetchRemoteImageAsBase64(params.refUrl, { signal: params.signal }), '参考图')
      : null;
  const prompt = buildProductGenerationPrompt(params.prompt, params.imageIndex, params.totalImages);

  return postOpenAiImageEdit({
    modelId: params.modelId?.trim() || env.openAiImageModel,
    prompt,
    images: [product, ...supplemental, ...(ref ? [ref] : [])],
    aspectRatio: params.aspectRatio,
    imageSize: params.imageSize,
    actionLabel: '图片生成',
    requestBehavior: params.requestBehavior,
    signal: params.signal,
  });
};

export const editGeneratedImageLocallyWithOpenAi = async (params: {
  baseImageBase64: ImagePayload;
  productBase64: ImagePayload;
  refBase64?: ImagePayload | null;
  refUrl?: string | null;
  supplementalProductBase64?: ImagePayload[];
  prompt: string;
  aspectRatio?: string;
  imageSize?: string;
  requestBehavior?: ImageRequestBehavior;
  maxSupplementalProductImages?: number;
  modelId?: string;
  signal?: AbortSignal;
}) => {
  throwIfRequestAborted(params.signal);
  const base = assertImagePayload(params.baseImageBase64, '当前生成图');
  const product = assertImagePayload(params.productBase64, '产品图');
  const supplemental = assertOptionalImageArray(params.supplementalProductBase64, '补充产品图')
    .slice(0, Math.max(0, params.maxSupplementalProductImages ?? 1));
  const ref = params.refBase64
    ? assertImagePayload(params.refBase64, '参考图')
    : params.refUrl
      ? assertImagePayload(await fetchRemoteImageAsBase64(params.refUrl, { signal: params.signal }), '参考图')
      : null;

  return postOpenAiImageEdit({
    modelId: params.modelId?.trim() || env.openAiImageModel,
    prompt: buildLocalEditPrompt(params.prompt),
    images: [base, product, ...supplemental, ...(ref ? [ref] : [])],
    aspectRatio: params.aspectRatio,
    imageSize: params.imageSize,
    actionLabel: '局部编辑',
    requestBehavior: params.requestBehavior,
    signal: params.signal,
  });
};
