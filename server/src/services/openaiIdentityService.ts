import type { ProductIdentityProfile } from '../types/domain';
import { env } from '../config/env';
import { HttpError } from '../utils/http';
import { assertImagePayload, assertOptionalImageArray } from '../utils/imagePayload';
import { extractOpenAiJsonObject, extractOpenAiResponseText, postOpenAiResponses } from '../utils/openai';

const normalizeList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map(item => String(item || '').trim()).filter(Boolean).slice(0, 12)
    : [];

const getConfiguredModels = () =>
  [env.openAiIdentityModel, env.openAiIdentityFallbackModel]
    .map(model => model.trim())
    .filter((model, index, models) => Boolean(model) && models.indexOf(model) === index);

export const analyzeProductIdentityWithOpenAi = async (
  mainImageBase64: { data: string; mimeType: string },
  supplementalImagesBase64: { data: string; mimeType: string }[] = [],
  contextSignal = '',
  signal?: AbortSignal,
): Promise<ProductIdentityProfile> => {
  const safeMainImage = assertImagePayload(mainImageBase64, '主产品图');
  const safeSupplementalImages = assertOptionalImageArray(supplementalImagesBase64, '补充产品图');

  if (!env.openAiApiKey) {
    throw new HttpError(503, 'OPENAI_NOT_CONFIGURED', '产品身份识别服务尚未在服务器端配置。');
  }

  const prompt = [
    'You are a high-precision product identity recognition system for e-commerce image generation.',
    'Identify what must remain unchanged so a generation model does not drift into a generic lookalike product.',
    'The first image is the primary uploaded product. Any additional images are supplemental views of the same exact product.',
    'Focus on high-confusion categories such as vacuum cleaners, projectors, cameras, and small appliances.',
    'Return JSON only with this shape:',
    '{',
    '  "category": "short category label",',
    '  "identitySummary": "one concise paragraph describing the true product identity",',
    '  "mustMatch": ["specific structure/color/part details that must stay the same"],',
    '  "forbiddenChanges": ["specific drifts that would turn it into a different product"],',
    '  "confusionWarnings": ["common mistaken lookalike patterns the generation model must avoid"],',
    '  "confidence": 0',
    '}',
    contextSignal.trim() ? `Additional category/context signal from the app: ${contextSignal.trim()}` : '',
  ].filter(Boolean).join('\n');

  const inputContent: Array<Record<string, unknown>> = [
    { type: 'input_text', text: prompt },
    {
      type: 'input_image',
      image_url: `data:${safeMainImage.mimeType};base64,${safeMainImage.data}`,
    },
  ];

  safeSupplementalImages.slice(0, 2).forEach(image => {
    inputContent.push({
      type: 'input_image',
      image_url: `data:${image.mimeType};base64,${image.data}`,
    });
  });

  let lastError: unknown;
  for (const model of getConfiguredModels()) {
    try {
      const responseJson = await postOpenAiResponses({
        model,
        input: [
          {
            role: 'user',
            content: inputContent,
          },
        ],
        maxOutputTokens: 900,
        timeoutMs: 45000,
        signal,
        actionLabel: '产品身份识别',
      });

      const outputText = extractOpenAiResponseText(responseJson);
      if (!outputText) {
        throw new Error('产品身份识别返回为空，请稍后重试。');
      }

      const parsed = extractOpenAiJsonObject(outputText);
      const profile: ProductIdentityProfile = {
        category: String(parsed?.category || '').trim(),
        identitySummary: String(parsed?.identitySummary || '').trim(),
        mustMatch: normalizeList(parsed?.mustMatch),
        forbiddenChanges: normalizeList(parsed?.forbiddenChanges),
        confusionWarnings: normalizeList(parsed?.confusionWarnings),
        confidence: Math.max(0, Math.min(100, Number(parsed?.confidence || 0))),
      };

      if (!profile.identitySummary) {
        throw new Error('产品身份识别未返回可用结果，请稍后重试。');
      }

      return profile;
    } catch (error) {
      if (signal?.aborted) {
        throw error;
      }
      lastError = error;
    }
  }

  throw new HttpError(
    502,
    'OPENAI_IDENTITY_FAILED',
    lastError instanceof Error ? lastError.message : '产品身份识别失败，请稍后重试。',
  );
};
