import { apiPost } from './api';
import {
  CommercialTone,
  GenerationMode,
  ImageType,
  Language,
  SceneStrictness,
  TextMode,
} from '../types';
import { ProductFingerprint } from '../types/product';

export interface ImagePayload {
  data: string;
  mimeType: string;
}

export interface ImageRequestBehavior {
  timeoutMs?: number;
  maxRetries?: number;
}

export interface BuildPromptOptions {
  productTitle?: string;
  copyText?: string;
  sizeInstruction?: string;
  hasRefImage?: boolean;
  customPrompt?: string;
  hardConstraintPrompt?: string;
  identityLockPrompt?: string;
  fingerprint?: ProductFingerprint;
  mode?: GenerationMode;
  imageType?: ImageType;
  textMode?: TextMode;
  language?: Language;
  preserveProductText?: boolean;
  commercialTone?: CommercialTone;
  sceneStrictness?: SceneStrictness;
}

const MODEL_ASPECT_RATIO_OPTIONS = [
  { value: 1 / 1, label: '1:1' },
  { value: 3 / 4, label: '3:4' },
  { value: 4 / 3, label: '4:3' },
  { value: 9 / 16, label: '9:16' },
  { value: 16 / 9, label: '16:9' },
  { value: 21 / 9, label: '21:9' },
] as const;

const SUPPORTED_ASPECT_RATIO_MAP = new Map<string, string>(
  MODEL_ASPECT_RATIO_OPTIONS.map(option => [option.label, option.label]),
);

const normalizeAspectRatioKey = (value: string) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/\*/g, 'x');

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

const resolveExplicitDimensionsToAspectRatio = (value: string): string | null => {
  const matched = value.match(/^(\d+)x(\d+)$/i);
  if (!matched) {
    return null;
  }

  const width = Number.parseInt(matched[1], 10);
  const height = Number.parseInt(matched[2], 10);
  return resolveNumericPairToAspectRatio(width, height);
};

const resolveRatioTextToAspectRatio = (value: string): string | null => {
  const matched = value.match(/^(\d+):(\d+)$/);
  if (!matched) {
    return null;
  }

  const width = Number.parseInt(matched[1], 10);
  const height = Number.parseInt(matched[2], 10);
  return resolveNumericPairToAspectRatio(width, height);
};

const parseDataImageUrl = (url: string): ImagePayload => {
  const normalized = String(url || '').trim();
  const matched = normalized.match(/^data:(image\/[^;,]+);base64,(.+)$/i);

  if (!matched || !matched[1] || !matched[2]) {
    throw new Error('图片数据格式无效，请重新上传后再试。');
  }

  return {
    mimeType: matched[1],
    data: matched[2],
  };
};

const summarizeFingerprint = (fingerprint?: ProductFingerprint) => {
  if (!fingerprint) {
    return [];
  }

  const lines = [
    fingerprint.category ? `- Category: ${fingerprint.category}` : '',
    fingerprint.productSummary ? `- Product summary: ${fingerprint.productSummary}` : '',
  ];

  const lockedColors = fingerprint.colors.filter(item => item.mustPreserve).map(item => item.name);
  if (lockedColors.length > 0) {
    lines.push(`- Locked colors: ${lockedColors.join(', ')}`);
  }

  const lockedMaterials = fingerprint.materials
    .filter(item => item.mustPreserve)
    .map(item => `${item.name} @ ${item.location}`);
  if (lockedMaterials.length > 0) {
    lines.push(`- Locked materials: ${lockedMaterials.join(', ')}`);
  }

  if (fingerprint.structure.overallShape) {
    lines.push(`- Overall shape: ${fingerprint.structure.overallShape}`);
  }

  if (fingerprint.structure.keyParts.length > 0) {
    lines.push(`- Key parts: ${fingerprint.structure.keyParts.join(', ')}`);
  }

  if (fingerprint.logo.hasLogo && fingerprint.logo.mustPreserve) {
    lines.push(
      `- Logo must stay unchanged: ${fingerprint.logo.text || 'present'} @ ${fingerprint.logo.position || 'original position'}`,
    );
  }

  if (fingerprint.forbiddenChanges.length > 0) {
    lines.push(`- Forbidden changes: ${fingerprint.forbiddenChanges.join('; ')}`);
  }

  return lines.filter(Boolean);
};

export const assertClientImagePayload = (value: unknown, fieldLabel: string): ImagePayload => {
  if (!value || typeof value !== 'object') {
    throw new Error(`${fieldLabel}不能为空。`);
  }

  const data = typeof (value as { data?: unknown }).data === 'string'
    ? (value as { data: string }).data.trim()
    : '';
  const mimeType = typeof (value as { mimeType?: unknown }).mimeType === 'string'
    ? (value as { mimeType: string }).mimeType.trim()
    : '';

  if (!data) {
    throw new Error(`${fieldLabel}缺少图片数据。`);
  }

  if (!mimeType) {
    throw new Error(`${fieldLabel}缺少图片类型。`);
  }

  if (!mimeType.toLowerCase().startsWith('image/')) {
    throw new Error(`${fieldLabel}不是有效的图片格式。`);
  }

  return { data, mimeType };
};

export const normalizeClientImageArray = (value: unknown, fieldLabel: string): ImagePayload[] => {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error(`${fieldLabel}必须是图片数组。`);
  }

  return value.map((item, index) => assertClientImagePayload(item, `${fieldLabel}第 ${index + 1} 张`));
};

export const blobToBase64 = (blob: Blob): Promise<ImagePayload> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const matched = result.match(/^data:([^;,]+);base64,(.+)$/i);

      if (!matched || !matched[1] || !matched[2]) {
        reject(new Error('读取图片失败，请重试。'));
        return;
      }

      resolve({
        mimeType: matched[1],
        data: matched[2],
      });
    };

    reader.onerror = () => reject(reader.error || new Error('读取图片失败，请重试。'));
    reader.onabort = () => reject(new Error('读取图片已取消，请重试。'));
    reader.readAsDataURL(blob);
  });

export const fetchImageAsBase64 = async (rawUrl: string, signal?: AbortSignal): Promise<ImagePayload> => {
  const url = String(rawUrl || '').trim();

  if (!url) {
    throw new Error('参考图地址不能为空。');
  }

  if (url.startsWith('data:image')) {
    return parseDataImageUrl(url);
  }

  return apiPost<ImagePayload>('/api/generate/resolve-image', { url }, { signal });
};

export const normalizeCopyText = async (
  text: string,
  targetLanguage?: Language,
  signal?: AbortSignal,
): Promise<string> => {
  const normalizedText = String(text || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n');

  if (!normalizedText) {
    return '';
  }

  const response = await apiPost<{ text: string }>('/api/generate/normalize-copy', {
    text: normalizedText,
    targetLanguage,
  }, { signal });

  return String(response.text || '').trim();
};

export const parseAspectRatio = (value: string): string => {
  const normalized = normalizeAspectRatioKey(value);
  const resolved = SUPPORTED_ASPECT_RATIO_MAP.get(normalized)
    || resolveExplicitDimensionsToAspectRatio(normalized)
    || resolveRatioTextToAspectRatio(normalized);

  if (!resolved) {
    throw new Error(`暂不支持该图片比例：${value}。`);
  }

  return resolved;
};

export const getSizeInstruction = (size: string): string => {
  const normalized = normalizeAspectRatioKey(size);
  if (!normalized) {
    return 'Target output ratio: 1:1.';
  }

  if (/^\d+x\d+$/i.test(normalized)) {
    return `Target output size: ${normalized}.`;
  }

  return `Target output ratio: ${normalized.replace('x', ':')}.`;
};

const TEXT_RENDER_INTENT_PATTERNS = [
  /(add|render|place|put|write|show|include|display).{0,24}(text|copy|headline|title|label|badge|price|word|caption|slogan|discount|off|%)/i,
  /(text|copy|headline|title|label|badge|price|caption|slogan).{0,24}(add|render|place|put|write|show|include|display)/i,
  /(添加|增加|加入|加上|写上|写入|写|标注|放上|显示|呈现).{0,16}(文字|文案|文本|标题|卖点|价格|折扣|标签|标语|字幕|口号|%|off)/i,
  /(文字|文案|文本|标题|卖点|价格|折扣|标签|标语|字幕|口号).{0,16}(添加|增加|加入|加上|写上|写入|写|标注|放上|显示|呈现)/i,
];

const TEXT_SUPPRESSION_INTENT_PATTERN =
  /(no|without|remove|delete|hide|omit|不要|不加|无|去掉|去除|删除|隐藏).{0,16}(text|copy|headline|title|label|badge|price|word|caption|slogan|文字|文案|文本|标题|卖点|价格|折扣|标签|标语|字幕|口号)/i;

const customPromptRequestsRenderedText = (prompt?: string) => {
  const normalized = String(prompt || '').trim();
  if (!normalized || TEXT_SUPPRESSION_INTENT_PATTERN.test(normalized)) {
    return false;
  }

  return TEXT_RENDER_INTENT_PATTERNS.some(pattern => pattern.test(normalized));
};

const getReferenceImageGuidanceInstruction = (mode?: GenerationMode) => {
  if (mode === 'style_inspiration') {
    return 'A reference image is provided. Use it for non-product visual style guidance such as color mood, lighting, atmosphere, scene styling, graphic layout language, typography hierarchy, callout containers, icons, arrows, glow/effect treatments, and overall commercial feel. Do not copy or merge its product identity.';
  }

  if (mode === 'strict_layout_match') {
    return 'A reference image is provided. Use it for non-product composition and design-language guidance such as camera angle, framing, spatial layout, scene depth, prop placement, graphic panels, callout zones, text hierarchy, icons, arrows, glow/effect treatments, and visual rhythm. Do not copy or merge its product identity.';
  }

  if (mode === 'background_transfer') {
    return 'A reference image is provided. Use it for non-product background, environment, lighting, composition, interaction cues, graphic layout language, callout containers, icons, arrows, glow/effect treatments, and commercial visual style. Do not copy or merge its product identity.';
  }

  return 'A reference image is provided. Use it for non-product scene, composition, lighting, atmosphere, commercial layout style, typography hierarchy, callout containers, icons, arrows, glow/effect treatments, and visual design language only, not for product identity.';
};

export const buildPrompt = (options: BuildPromptOptions): string => {
  const shouldAllowUserRequestedText =
    options.textMode !== 'render_text' && customPromptRequestsRenderedText(options.customPrompt);
  const lines = [
    'You are generating a production-ready e-commerce product image.',
    'Preserve the uploaded product identity exactly. Do not redesign the product itself.',
    'Keep the final image commercially usable, realistic, and clean.',
  ];

  if (options.fingerprint) {
    lines.push('Product fingerprint constraints:');
    lines.push(...summarizeFingerprint(options.fingerprint));
  }

  if (options.identityLockPrompt?.trim()) {
    lines.push('Identity lock:');
    lines.push(options.identityLockPrompt.trim());
  }

  if (options.hardConstraintPrompt?.trim()) {
    lines.push('Hard constraints:');
    lines.push(options.hardConstraintPrompt.trim());
  }

  if (options.productTitle?.trim()) {
    lines.push(`Selling point to emphasize: ${options.productTitle.trim()}`);
  }

  if (options.mode) {
    lines.push(`Generation mode: ${options.mode}`);
  }

  if (options.imageType) {
    lines.push(`Image type: ${options.imageType}`);
  }

  if (options.commercialTone) {
    lines.push(`Commercial tone: ${options.commercialTone}`);
  }

  if (options.sceneStrictness) {
    lines.push(`Scene strictness: ${options.sceneStrictness}`);
  }

  if (options.hasRefImage) {
    lines.push(getReferenceImageGuidanceInstruction(options.mode));
  }

  if (options.sizeInstruction?.trim()) {
    lines.push(options.sizeInstruction.trim());
  }

  if (options.textMode === 'render_text' && options.copyText?.trim()) {
    lines.push(`Render this exact marketing copy in the image: "${options.copyText.trim()}"`);
    lines.push('The final image must visibly include the exact marketing copy above. Do not omit it, paraphrase it, or move it outside the readable composition.');
    if (options.hasRefImage) {
      lines.push('When rendering the requested copy, follow the reference image style at a generic design-language level: similar typography hierarchy, placement pattern, graphic containers, badges, callout shapes, icon rhythm, arrow/glow/effect style, color treatment, and spacing. Adapt the style to the uploaded product and requested copy instead of copying the reference product or any brand/logo.');
    }
    if (options.language && options.language !== 'auto') {
      lines.push(`Rendered text language: ${options.language}`);
    }
  } else if (shouldAllowUserRequestedText) {
    lines.push('If the additional user instructions explicitly request visible text, render only that requested text clearly. Do not invent extra promotional copy beyond the request.');
  } else {
    lines.push('Do not add any extra promotional text to the image.');
  }

  if (options.preserveProductText) {
    lines.push('Do not alter, remove, or translate text already printed on the product.');
  }

  if (options.customPrompt?.trim()) {
    lines.push('The final image must visibly satisfy the user instructions below. Do not silently ignore them.');
    if (options.hasRefImage) {
      lines.push('If the user instructions conflict with optional reference-image scene guidance, satisfy the user instructions first and use the reference image only as secondary support.');
    }
    lines.push('Keep the uploaded product recognizable, but do not ignore explicit requested changes to scene, framing, props, support container, basket, planter, stand, base, or the relative scale of secondary elements.');
    lines.push('Avoid changing unrelated parts of the image beyond what is needed to satisfy the requested visible change.');
    if (options.textMode === 'render_text' && options.copyText?.trim()) {
      lines.push('The final image must satisfy both the exact text-rendering requirement and the additional user instructions below at the same time.');
    }
    lines.push('Additional user instructions:');
    lines.push(options.customPrompt.trim());
  }

  return lines.join('\n');
};

export const generateProductImage = async (
  productBase64: ImagePayload,
  refBase64: ImagePayload | null,
  supplementalProductBase64: ImagePayload[] = [],
  prompt: string,
  aspectRatio = '1:1',
  imageSize = '1K',
  imageIndex?: number,
  totalImages?: number,
  textMode?: TextMode,
  requestBehavior?: ImageRequestBehavior,
  refUrl?: string | null,
  signal?: AbortSignal,
): Promise<{ url: string; prompt: string }> =>
  apiPost('/api/generate/image', {
    productBase64: assertClientImagePayload(productBase64, '产品图'),
    refBase64: refBase64 ? assertClientImagePayload(refBase64, '参考图') : null,
    refUrl: refUrl || undefined,
    supplementalProductBase64: normalizeClientImageArray(supplementalProductBase64, '补充产品图'),
    prompt,
    aspectRatio,
    imageSize,
    imageIndex,
    totalImages,
    textMode,
    requestBehavior,
  }, { signal });

export const editGeneratedImageLocally = async (
  baseImageBase64: ImagePayload,
  productBase64: ImagePayload,
  supplementalProductBase64: ImagePayload[] = [],
  prompt: string,
  aspectRatio = '1:1',
  imageSize = '1K',
  requestBehavior?: ImageRequestBehavior,
  maxSupplementalProductImages?: number,
  referenceContext?: {
    refBase64?: ImagePayload | null;
    refUrl?: string | null;
  },
  signal?: AbortSignal,
): Promise<{ url: string; prompt: string }> =>
  apiPost('/api/generate/edit', {
    baseImageBase64: assertClientImagePayload(baseImageBase64, '当前生成图'),
    productBase64: assertClientImagePayload(productBase64, '产品图'),
    refBase64: referenceContext?.refBase64
      ? assertClientImagePayload(referenceContext.refBase64, '参考图')
      : null,
    refUrl: referenceContext?.refUrl || undefined,
    supplementalProductBase64: normalizeClientImageArray(supplementalProductBase64, '补充产品图'),
    prompt,
    aspectRatio,
    imageSize,
    requestBehavior,
    maxSupplementalProductImages,
  }, { signal });
