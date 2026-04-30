import type { RowDataPacket } from 'mysql2/promise';
import { env } from '../config/env';
import { pool } from '../db/pool';
import { HttpError } from '../utils/http';

export type ImageGenerationModelKey = 'image2' | 'banana2' | 'bananapro';
export type ImageGenerationProvider = 'openai' | 'gemini';

export interface ImageGenerationModelOption {
  key: ImageGenerationModelKey;
  label: string;
  provider: ImageGenerationProvider;
  providerLabel: string;
  description: string;
  modelId: string;
  configured: boolean;
}

export interface AdminSettingsPayload {
  imageGenerationModel: ImageGenerationModelKey;
  modelUsageConsoleLogEnabled: boolean;
  availableImageModels: ImageGenerationModelOption[];
}

const IMAGE_GENERATION_MODEL_SETTING_KEY = 'image_generation_model';
const MODEL_USAGE_LOG_SETTING_KEY = 'model_usage_console_log_enabled';
const DEFAULT_IMAGE_GENERATION_MODEL: ImageGenerationModelKey = 'banana2';

const normalizeBooleanSetting = (value: string | null | undefined, fallback: boolean) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(normalized);
};

export const getAvailableImageGenerationModels = (): ImageGenerationModelOption[] => [
  {
    key: 'image2',
    label: 'image2',
    provider: 'openai',
    providerLabel: 'OpenAI',
    description: '高质量图像生成模型，适用于通用图像生成场景',
    modelId: env.openAiImageModel,
    configured: Boolean(env.openAiApiKey),
  },
  {
    key: 'banana2',
    label: 'banana2',
    provider: 'gemini',
    providerLabel: 'Banana',
    description: '高精度图像生成模型，平衡质量与成本',
    modelId: env.geminiImageModel,
    configured: Boolean(env.geminiApiKey),
  },
  {
    key: 'bananapro',
    label: 'bananapro',
    provider: 'gemini',
    providerLabel: 'Banana',
    description: '专业级图像生成模型，追求极致细节与真实感',
    modelId: env.geminiImageProModel,
    configured: Boolean(env.geminiApiKey),
  },
];

const getModelOptionByKey = (key: string | null | undefined) =>
  getAvailableImageGenerationModels().find(model => model.key === key);

const normalizeImageModelKey = (value: string | null | undefined): ImageGenerationModelKey => {
  const option = getModelOptionByKey(String(value || '').trim());
  return option?.key || DEFAULT_IMAGE_GENERATION_MODEL;
};

const getSettingsMap = async () => {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN (?, ?)',
    [IMAGE_GENERATION_MODEL_SETTING_KEY, MODEL_USAGE_LOG_SETTING_KEY],
  );

  const map = new Map<string, string>();
  rows.forEach(row => {
    map.set(String(row.setting_key), String(row.setting_value ?? ''));
  });
  return map;
};

export const getAdminSettings = async (): Promise<AdminSettingsPayload> => {
  const settings = await getSettingsMap();
  const selectedModel = normalizeImageModelKey(settings.get(IMAGE_GENERATION_MODEL_SETTING_KEY));

  return {
    imageGenerationModel: selectedModel,
    modelUsageConsoleLogEnabled: normalizeBooleanSetting(settings.get(MODEL_USAGE_LOG_SETTING_KEY), true),
    availableImageModels: getAvailableImageGenerationModels(),
  };
};

export const updateAdminSettings = async (params: {
  imageGenerationModel: string;
  modelUsageConsoleLogEnabled: boolean;
}) => {
  const selectedModel = getModelOptionByKey(params.imageGenerationModel);
  if (!selectedModel) {
    throw new HttpError(400, 'INVALID_IMAGE_MODEL', '请选择有效的图片生成模型。');
  }

  if (!selectedModel.configured) {
    throw new HttpError(
      400,
      'IMAGE_MODEL_NOT_CONFIGURED',
      `${selectedModel.label} 尚未在服务器端配置，请先配置对应 API Key。`,
    );
  }

  await pool.query(
    `
      INSERT INTO system_settings (setting_key, setting_value) VALUES
        (?, ?),
        (?, ?)
      ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
    `,
    [
      IMAGE_GENERATION_MODEL_SETTING_KEY,
      selectedModel.key,
      MODEL_USAGE_LOG_SETTING_KEY,
      params.modelUsageConsoleLogEnabled ? 'true' : 'false',
    ],
  );

  return getAdminSettings();
};

export const getActiveImageGenerationModel = async () => {
  const settings = await getAdminSettings();
  const selectedModel = getModelOptionByKey(settings.imageGenerationModel) || getModelOptionByKey(DEFAULT_IMAGE_GENERATION_MODEL);

  if (!selectedModel) {
    throw new HttpError(500, 'IMAGE_MODEL_CONFIG_MISSING', '图片生成模型配置缺失。');
  }

  if (!selectedModel.configured) {
    throw new HttpError(
      503,
      'IMAGE_MODEL_NOT_CONFIGURED',
      `${selectedModel.label} 尚未在服务器端配置，请检查对应 API Key。`,
    );
  }

  return {
    ...selectedModel,
    usageConsoleLogEnabled: settings.modelUsageConsoleLogEnabled,
  };
};
