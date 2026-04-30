import { HttpError } from '../utils/http';
import {
  editGeneratedImageLocallyWithGemini,
  generateProductImageWithGemini,
  ImageRequestBehavior,
  TextMode,
} from './geminiService';
import {
  editGeneratedImageLocallyWithOpenAi,
  generateProductImageWithOpenAi,
} from './openaiImageService';
import { getActiveImageGenerationModel } from './systemSettingsService';

type ImagePayload = { data: string; mimeType: string };

const toUsageTokenValue = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 'unknown');

const extractOpenAiUsage = (usage: any) => ({
  inputTokens: toUsageTokenValue(usage?.input_tokens ?? usage?.prompt_tokens),
  outputTokens: toUsageTokenValue(usage?.output_tokens ?? usage?.completion_tokens),
  totalTokens: toUsageTokenValue(usage?.total_tokens),
});

const logModelUsage = (params: {
  enabled: boolean;
  action: 'image_generate' | 'image_edit';
  provider: string;
  model: string;
  modelKey: string;
  userId: number;
  imageSize?: string;
  imageCount: number;
  durationMs: number;
  success: boolean;
  usage?: unknown;
  error?: unknown;
}) => {
  if (!params.enabled) {
    return;
  }

  const usage = params.provider === 'openai' ? extractOpenAiUsage(params.usage) : {
    inputTokens: 'unknown',
    outputTokens: 'unknown',
    totalTokens: 'unknown',
  };
  const errorCode = params.error instanceof HttpError
    ? params.error.code
    : params.error instanceof Error
      ? params.error.name
      : undefined;

  console.info('[model-usage]', JSON.stringify({
    event: 'model_usage',
    action: params.action,
    provider: params.provider,
    model: params.model,
    modelKey: params.modelKey,
    userId: params.userId,
    imageSize: params.imageSize || '1K',
    imageCount: params.imageCount,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    durationMs: params.durationMs,
    success: params.success,
    ...(errorCode ? { errorCode } : {}),
  }));
};

export const generateProductImage = async (params: {
  userId: number;
  productBase64: ImagePayload;
  refBase64: ImagePayload | null;
  refUrl?: string | null;
  supplementalProductBase64?: ImagePayload[];
  prompt: string;
  aspectRatio?: string;
  imageSize?: string;
  imageIndex?: number;
  totalImages?: number;
  textMode?: TextMode;
  requestBehavior?: ImageRequestBehavior;
  signal?: AbortSignal;
}) => {
  const selectedModel = await getActiveImageGenerationModel();
  const startedAt = Date.now();

  try {
    const result = selectedModel.provider === 'openai'
      ? await generateProductImageWithOpenAi({
          ...params,
          modelId: selectedModel.modelId,
        })
      : await generateProductImageWithGemini({
          ...params,
          modelId: selectedModel.modelId,
        });

    logModelUsage({
      enabled: selectedModel.usageConsoleLogEnabled,
      action: 'image_generate',
      provider: selectedModel.provider,
      model: selectedModel.modelId,
      modelKey: selectedModel.key,
      userId: params.userId,
      imageSize: params.imageSize,
      imageCount: 1,
      durationMs: Date.now() - startedAt,
      success: true,
      usage: (result as { usage?: unknown }).usage,
    });

    return result;
  } catch (error) {
    logModelUsage({
      enabled: selectedModel.usageConsoleLogEnabled,
      action: 'image_generate',
      provider: selectedModel.provider,
      model: selectedModel.modelId,
      modelKey: selectedModel.key,
      userId: params.userId,
      imageSize: params.imageSize,
      imageCount: 0,
      durationMs: Date.now() - startedAt,
      success: false,
      error,
    });
    throw error;
  }
};

export const editGeneratedImageLocally = async (params: {
  userId: number;
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
  signal?: AbortSignal;
}) => {
  const selectedModel = await getActiveImageGenerationModel();
  const startedAt = Date.now();

  try {
    const result = selectedModel.provider === 'openai'
      ? await editGeneratedImageLocallyWithOpenAi({
          ...params,
          modelId: selectedModel.modelId,
        })
      : await editGeneratedImageLocallyWithGemini({
          ...params,
          modelId: selectedModel.modelId,
        });

    logModelUsage({
      enabled: selectedModel.usageConsoleLogEnabled,
      action: 'image_edit',
      provider: selectedModel.provider,
      model: selectedModel.modelId,
      modelKey: selectedModel.key,
      userId: params.userId,
      imageSize: params.imageSize,
      imageCount: 1,
      durationMs: Date.now() - startedAt,
      success: true,
      usage: (result as { usage?: unknown }).usage,
    });

    return result;
  } catch (error) {
    logModelUsage({
      enabled: selectedModel.usageConsoleLogEnabled,
      action: 'image_edit',
      provider: selectedModel.provider,
      model: selectedModel.modelId,
      modelKey: selectedModel.key,
      userId: params.userId,
      imageSize: params.imageSize,
      imageCount: 0,
      durationMs: Date.now() - startedAt,
      success: false,
      error,
    });
    throw error;
  }
};
