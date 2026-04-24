import { apiPost } from './api';
import { assertClientImagePayload, normalizeClientImageArray } from './geminiService';

export interface ProductIdentityProfile {
  category: string;
  identitySummary: string;
  mustMatch: string[];
  forbiddenChanges: string[];
  confusionWarnings: string[];
  confidence: number;
}

const HIGH_CONFUSION_CATEGORY_KEYWORDS = [
  'vacuum',
  'vacuum cleaner',
  'stick vacuum',
  'cordless vacuum',
  'projector',
  'portable projector',
  'camera',
  'security camera',
  'webcam',
  'monitor camera',
  'appliance',
  'small appliance',
  '家电',
  '小家电',
  '吸尘器',
  '投影仪',
  '摄像头',
  '监控',
];

const clipIdentityText = (value: string, maxChars: number) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  return trimmed.length > maxChars
    ? `${trimmed.slice(0, maxChars).trim()}...`
    : trimmed;
};

export const shouldUseOpenAiProductIdentityEnhancement = (signalText: string) => {
  const normalized = signalText.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return HIGH_CONFUSION_CATEGORY_KEYWORDS.some(keyword => normalized.includes(keyword));
};

export const analyzeProductIdentityWithOpenAI = async (
  mainImageBase64: { data: string; mimeType: string },
  supplementalImagesBase64: { data: string; mimeType: string }[] = [],
  contextSignal = '',
  signal?: AbortSignal,
): Promise<ProductIdentityProfile> =>
  apiPost<ProductIdentityProfile>('/api/analyze/identity', {
    mainImageBase64: assertClientImagePayload(mainImageBase64, '主产品图'),
    supplementalImagesBase64: normalizeClientImageArray(supplementalImagesBase64, '补充产品图'),
    contextSignal,
  }, { signal });

export const buildProductIdentityHardConstraintPrompt = (profile: ProductIdentityProfile): string => {
  const lines = [
    profile.category ? `Recognized product category: ${clipIdentityText(profile.category, 80)}` : '',
    profile.identitySummary ? `Recognized product identity: ${clipIdentityText(profile.identitySummary, 240)}` : '',
    ...profile.mustMatch.slice(0, 5).map(item => `Must match exactly: ${clipIdentityText(item, 180)}`),
    ...profile.forbiddenChanges.slice(0, 4).map(item => `Forbidden drift: ${clipIdentityText(item, 180)}`),
    ...profile.confusionWarnings.slice(0, 3).map(item => `Lookalike warning: ${clipIdentityText(item, 180)}`),
  ].filter(Boolean);

  return lines.join('\n');
};
