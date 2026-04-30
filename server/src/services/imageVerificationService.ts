import type { ProductFingerprint, VerificationResult } from '../types/domain';
import { env } from '../config/env';
import { assertImagePayload, assertOptionalImageArray } from '../utils/imagePayload';
import { generateStructuredJsonWithGemini } from './geminiService';

export interface VerificationOptions {
  targetOutputLanguage?: string;
  imageType?: string;
  expectedCopyText?: string;
  mustContain?: string[];
  mustNotContain?: string[];
}

const summarizeFingerprintForVerification = (fingerprint: ProductFingerprint) => ({
  category: fingerprint.category,
  productSummary: fingerprint.productSummary,
  colors: fingerprint.colors.slice(0, 6).map(color => ({
    name: color.name,
    area: color.area,
    mustPreserve: color.mustPreserve,
  })),
  materials: fingerprint.materials.slice(0, 6).map(material => ({
    name: material.name,
    location: material.location,
    finish: material.finish,
    mustPreserve: material.mustPreserve,
  })),
  structure: {
    overallShape: fingerprint.structure.overallShape,
    keyParts: fingerprint.structure.keyParts.slice(0, 8),
    proportions: fingerprint.structure.proportions,
    visibleControls: (fingerprint.structure.visibleControls || []).slice(0, 8),
    openings: (fingerprint.structure.openings || []).slice(0, 8),
    distinctiveFeatures: fingerprint.structure.distinctiveFeatures.slice(0, 8),
  },
  accessories: fingerprint.accessories.slice(0, 6).map(accessory => ({
    name: accessory.name,
    count: accessory.count,
    position: accessory.position,
    attached: accessory.attached,
    mustPreserve: accessory.mustPreserve,
  })),
  logo: fingerprint.logo,
  forbiddenChanges: fingerprint.forbiddenChanges.slice(0, 8),
  verifierChecklist: fingerprint.verifierChecklist.slice(0, 8),
  confidence: fingerprint.confidence,
});

const normalizeBoolean = (value: unknown, fallback = false) =>
  typeof value === 'boolean'
    ? value
    : typeof value === 'string'
      ? value.trim().toLowerCase() === 'true'
      : fallback;

const normalizeScore = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  const scaled = numeric <= 1 ? numeric * 100 : numeric;
  return Math.max(0, Math.min(100, Math.round(scaled)));
};

const normalizeSubjectCount = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Math.max(0, Math.round(numeric));
};

const normalizeIssues = (value: unknown): VerificationResult['issues'] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(item => ({
      type: typeof item?.type === 'string' && item.type.trim() ? item.type.trim() : 'other',
      description:
        typeof item?.description === 'string' && item.description.trim()
          ? item.description.trim()
          : '未提供详细原因。',
      severity:
        item?.severity === 'low' || item?.severity === 'medium' || item?.severity === 'high'
          ? item.severity
          : 'medium',
    }))
    .filter(issue => Boolean(issue.description));
};

const normalizeRecommendations = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(item => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, 8);
};

const normalizeVerificationResult = (value: any): VerificationResult => {
  const checks = value?.checks && typeof value.checks === 'object' ? value.checks : {};
  const issues = normalizeIssues(value?.issues);
  const recommendations = normalizeRecommendations(value?.recommendations);

  return {
    passed: normalizeBoolean(value?.passed, false),
    score: normalizeScore(value?.score),
    subjectCount: normalizeSubjectCount(value?.subjectCount),
    checks: {
      singleSubject: normalizeBoolean(checks.singleSubject),
      colorMatch: normalizeBoolean(checks.colorMatch),
      structureMatch: normalizeBoolean(checks.structureMatch),
      accessoryMatch: normalizeBoolean(checks.accessoryMatch),
      logoMatch: normalizeBoolean(checks.logoMatch),
      materialMatch: normalizeBoolean(checks.materialMatch),
      noCollage: normalizeBoolean(checks.noCollage),
      noExtraParts: normalizeBoolean(checks.noExtraParts),
      ...(checks.languageMatch === undefined ? {} : { languageMatch: normalizeBoolean(checks.languageMatch) }),
      ...(checks.textContentMatch === undefined ? {} : { textContentMatch: normalizeBoolean(checks.textContentMatch) }),
    },
    detectedText: typeof value?.detectedText === 'string' ? value.detectedText : '',
    issues,
    recommendations,
  };
};

export const verifyGeneratedImageWithGemini = async (
  generatedImageBase64: { data: string; mimeType: string },
  originalFingerprint: ProductFingerprint,
  mainImageBase64: { data: string; mimeType: string },
  supplementalImagesBase64: { data: string; mimeType: string }[] = [],
  options: VerificationOptions = {},
  signal?: AbortSignal,
): Promise<VerificationResult> => {
  const safeGeneratedImage = assertImagePayload(generatedImageBase64, '生成图');
  const safeMainImage = assertImagePayload(mainImageBase64, '主产品图');
  const safeSupplementalImages = assertOptionalImageArray(supplementalImagesBase64, '补充产品图');
  const images = [safeGeneratedImage, safeMainImage, ...safeSupplementalImages];
  const { targetOutputLanguage, imageType, expectedCopyText } = options;
  const allowComparisonLayout = imageType === 'comparison';
  const shouldCheckCopyText = Boolean(expectedCopyText?.trim());
  const mustContain = Array.isArray(options.mustContain)
    ? options.mustContain.map(item => String(item || '').trim()).filter(Boolean)
    : [];
  const mustNotContain = Array.isArray(options.mustNotContain)
    ? options.mustNotContain.map(item => String(item || '').trim()).filter(Boolean)
    : [];

  const prompt = `
    You are an expert product image verifier. Evaluate the FIRST image (generated) against the remaining original product reference image(s) and the original product fingerprint.

    Original Product Fingerprint:
    ${JSON.stringify(summarizeFingerprintForVerification(originalFingerprint), null, 2)}

    ${allowComparisonLayout ? 'Comparison layouts are allowed, but all visible product depictions must still represent the same original product.' : 'Require exactly one complete product subject.'}

    Check:
    1. Subject consistency
    2. Color match
    3. Structure match
    4. Accessory match
    5. Logo match
    6. Material match
    7. Composition integrity
    8. No extra parts
    ${targetOutputLanguage ? `9. Language match for requested language: ${targetOutputLanguage}` : ''}
    ${shouldCheckCopyText ? `10. Rendered text must closely match: "${expectedCopyText!.trim()}". When this is requested, checks.textContentMatch is mandatory and must be false if any number, unit, mode name, or headline is missing or misspelled.` : ''}
    ${mustContain.length > 0 ? `Must contain expectations: ${mustContain.join('; ')}` : ''}
    ${mustNotContain.length > 0 ? `Must not contain: ${mustNotContain.join('; ')}` : ''}

    Return strict JSON only.
    - score must be an integer from 0 to 100.
    - checks must include every boolean field listed in the schema.
    - issues must include type, description, severity.
  `;

  const schema = {
    type: 'object',
    properties: {
      passed: { type: 'boolean' },
      score: { type: 'number' },
      subjectCount: { type: 'number' },
      checks: {
        type: 'object',
        properties: {
          singleSubject: { type: 'boolean' },
          colorMatch: { type: 'boolean' },
          structureMatch: { type: 'boolean' },
          accessoryMatch: { type: 'boolean' },
          logoMatch: { type: 'boolean' },
          materialMatch: { type: 'boolean' },
          noCollage: { type: 'boolean' },
          noExtraParts: { type: 'boolean' },
          languageMatch: { type: 'boolean' },
          textContentMatch: { type: 'boolean' },
        },
        required: [
          'singleSubject',
          'colorMatch',
          'structureMatch',
          'accessoryMatch',
          'logoMatch',
          'materialMatch',
          'noCollage',
          'noExtraParts',
          ...(targetOutputLanguage ? ['languageMatch'] : []),
          ...(shouldCheckCopyText ? ['textContentMatch'] : []),
        ],
      },
      detectedText: { type: 'string' },
      issues: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string' },
            description: { type: 'string' },
            severity: { type: 'string' },
          },
          required: ['type', 'description', 'severity'],
        },
      },
      recommendations: { type: 'array', items: { type: 'string' } },
    },
    required: ['passed', 'score', 'subjectCount', 'checks', 'issues', 'recommendations'],
  };

  const rawResult = await generateStructuredJsonWithGemini(
    prompt,
    images,
    schema,
    false,
    env.geminiVerificationModel,
    signal,
  ) as VerificationResult;

  return normalizeVerificationResult(rawResult);
};
