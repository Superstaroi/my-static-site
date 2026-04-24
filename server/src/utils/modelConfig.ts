import { env } from '../config/env';

type Provider = 'gemini' | 'openai';

export interface ModelStatus {
  id: string | null;
  label: string;
  configured: boolean;
  provider: Provider;
}

const toTitleCase = (value: string) =>
  value
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());

export const formatModelLabel = (modelId: string | null | undefined, provider: Provider) => {
  if (!modelId?.trim()) {
    return '未配置';
  }

  const normalized = modelId.trim();

  if (provider === 'openai') {
    return normalized
      .replace(/^gpt/i, 'GPT')
      .replace(/-mini$/i, '-mini')
      .replace(/-nano$/i, '-nano');
  }

  const geminiMatch = normalized.match(/^gemini-(.+)$/i);
  if (geminiMatch) {
    return `Gemini ${toTitleCase(geminiMatch[1]).replace(/\bPro\b/g, 'Pro').replace(/\bFlash\b/g, 'Flash')}`;
  }

  return toTitleCase(normalized);
};

const buildModelStatus = (
  modelId: string | null | undefined,
  configured: boolean,
  provider: Provider,
): ModelStatus => ({
  id: configured ? modelId?.trim() || null : null,
  label: configured ? formatModelLabel(modelId, provider) : '未配置',
  configured,
  provider,
});

export const buildSystemConfigPayload = () => {
  const geminiConfigured = Boolean(env.geminiApiKey);
  const openaiConfigured = Boolean(env.openAiApiKey);

  const imageGenerationModel = buildModelStatus(env.geminiImageModel, geminiConfigured, 'gemini');
  const imageVerificationModel = buildModelStatus(env.geminiVerificationModel, geminiConfigured, 'gemini');
  const fingerprintAnalysisModel = buildModelStatus(env.openAiAnalysisModel, openaiConfigured, 'openai');
  const identityAnalysisModel = buildModelStatus(env.openAiIdentityModel, openaiConfigured, 'openai');

  return {
    geminiConfigured,
    openaiConfigured,
    imageGenerationModel,
    imageVerificationModel,
    fingerprintAnalysisModel,
    identityAnalysisModel,
    models: {
      imageGeneration: imageGenerationModel,
      imageVerification: imageVerificationModel,
      fingerprintAnalysis: fingerprintAnalysisModel,
      identityRecognition: identityAnalysisModel,
    },
  };
};
