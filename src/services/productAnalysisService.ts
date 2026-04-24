import { apiPost } from './api';
import { ProductFingerprint } from '../types/product';
import { DetailSetPlatform } from '../types';
import { assertClientImagePayload, normalizeClientImageArray } from './geminiService';

interface FingerprintTextDraft {
  productDescription: string;
  extractedFeatures: string;
  productFingerprint: string;
}

export const analyzeProductFingerprint = async (
  mainImageBase64: { data: string; mimeType: string },
  supplementalImagesBase64: { data: string; mimeType: string }[] = [],
  signal?: AbortSignal,
): Promise<{ canonicalEn: ProductFingerprint; displayZh: any }> =>
  apiPost('/api/analyze/fingerprint', {
    mainImageBase64: assertClientImagePayload(mainImageBase64, '主产品图'),
    supplementalImagesBase64: normalizeClientImageArray(supplementalImagesBase64, '补充产品图'),
  }, { signal });

export const analyzeProductFingerprintWithOpenAI = analyzeProductFingerprint;

export const updateFingerprintFromTextDraft = async (
  draft: FingerprintTextDraft,
  currentCanonicalEn: ProductFingerprint,
  currentDisplayZh: any,
  signal?: AbortSignal,
): Promise<{ canonicalEn: ProductFingerprint; displayZh: any }> =>
  apiPost('/api/analyze/fingerprint/update', {
    draft,
    currentCanonicalEn,
    currentDisplayZh,
  }, { signal });

export const generateDetailSetGlobalPrompt = async (
  platform: DetailSetPlatform,
  fingerprint: ProductFingerprint,
  signal?: AbortSignal,
): Promise<string> => {
  const response = await apiPost<{ prompt: string }>('/api/analyze/detail-set-prompt', {
    platform,
    fingerprint,
  }, { signal });

  return String(response?.prompt || '').trim();
};

export const buildLockedFeatureSummary = (fingerprint: ProductFingerprint): string => {
  const lockedColors = fingerprint.colors.filter(c => c.mustPreserve).map(c => c.name).join(', ');
  const lockedMaterials = fingerprint.materials.filter(m => m.mustPreserve).map(m => m.name).join(', ');
  const lockedAccessories = fingerprint.accessories.filter(a => a.mustPreserve).map(a => a.name).join(', ');

  let summary = `Category: ${fingerprint.category}\n`;
  if (lockedColors) summary += `Locked Colors: ${lockedColors}\n`;
  if (lockedMaterials) summary += `Locked Materials: ${lockedMaterials}\n`;
  if (lockedAccessories) summary += `Locked Accessories: ${lockedAccessories}\n`;
  if (fingerprint.logo.hasLogo && fingerprint.logo.mustPreserve) {
    summary += `Locked Logo: ${fingerprint.logo.text || 'Present'} at ${fingerprint.logo.position}\n`;
  }

  return summary.trim();
};
