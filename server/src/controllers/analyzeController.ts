import type { Request, Response } from 'express';
import { analyzeProductIdentityWithOpenAi } from '../services/openaiIdentityService';
import {
  analyzeProductFingerprintWithOpenAi,
  generateDetailSetGlobalPromptWithOpenAi,
  updateFingerprintFromTextDraft,
} from '../services/productAnalysisService';
import { executeQuotaControlledAction } from '../services/quotaService';
import { verifyGeneratedImageWithGemini } from '../services/imageVerificationService';
import { HttpError } from '../utils/http';
import { assertImagePayload, assertOptionalImageArray } from '../utils/imagePayload';
import { createRequestAbortController, throwIfRequestAborted } from '../utils/requestAbort';

interface FingerprintDraftPayload {
  productDescription?: unknown;
  extractedFeatures?: unknown;
  productFingerprint?: unknown;
}

const normalizeDraftSectionValue = (value: unknown): string => {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value
      .map(item => normalizeDraftSectionValue(item))
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  if (value && typeof value === 'object') {
    const serialized = JSON.stringify(value, null, 2);
    return serialized === '{}' || serialized === '[]' ? '' : serialized;
  }

  if (value == null) {
    return '';
  }

  return String(value).trim();
};

const normalizeFingerprintDraft = (draft: unknown): string => {
  if (typeof draft === 'string') {
    return draft.trim();
  }

  if (!draft || typeof draft !== 'object') {
    return '';
  }

  const payload = draft as FingerprintDraftPayload;
  const sections = [
    ['产品描述', normalizeDraftSectionValue(payload.productDescription)],
    ['提取特征', normalizeDraftSectionValue(payload.extractedFeatures)],
    ['产品指纹', normalizeDraftSectionValue(payload.productFingerprint)],
  ]
    .filter(([, value]) => Boolean(value))
    .map(([label, value]) => `${label}:\n${value}`);

  return sections.join('\n\n').trim();
};

const respondIfActive = (res: Response, signal: AbortSignal, payload: unknown) => {
  throwIfRequestAborted(signal);
  if (res.writableEnded || res.destroyed) {
    return;
  }
  res.json(payload);
};

export const postAnalyzeFingerprint = async (req: Request, res: Response) => {
  const mainImageBase64 = assertImagePayload(req.body?.mainImageBase64, '主产品图');
  const supplementalImagesBase64 = assertOptionalImageArray(req.body?.supplementalImagesBase64, '补充产品图');
  const requestAbort = createRequestAbortController(req, res);

  try {
    const result = await executeQuotaControlledAction({
      userId: req.authUser!.id,
      actionType: 'analyze_fingerprint',
      quotaCost: 1,
      requestPayload: { supplementalCount: supplementalImagesBase64.length },
      signal: requestAbort.signal,
      summarizeResponse: (value: { canonicalEn?: { category?: string; confidence?: number } }) => ({
        category: value.canonicalEn?.category,
        confidence: value.canonicalEn?.confidence,
      }),
      task: () => analyzeProductFingerprintWithOpenAi(mainImageBase64, supplementalImagesBase64, requestAbort.signal),
    });

    respondIfActive(res, requestAbort.signal, result);
  } finally {
    requestAbort.cleanup();
  }
};

export const postUpdateFingerprint = async (req: Request, res: Response) => {
  if (!req.body?.currentCanonicalEn || typeof req.body.currentCanonicalEn !== 'object') {
    throw new HttpError(400, 'INVALID_FINGERPRINT', '当前产品指纹不能为空。');
  }

  const normalizedDraft = normalizeFingerprintDraft(req.body?.draft);
  const requestAbort = createRequestAbortController(req, res);

  try {
    const result = await executeQuotaControlledAction({
      userId: req.authUser!.id,
      actionType: 'update_fingerprint',
      quotaCost: 1,
      requestPayload: { hasDraft: true },
      signal: requestAbort.signal,
      summarizeResponse: (value: { canonicalEn?: { category?: string; confidence?: number } }) => ({
        category: value.canonicalEn?.category,
        confidence: value.canonicalEn?.confidence,
      }),
      task: () =>
        updateFingerprintFromTextDraft(
          normalizedDraft,
          req.body.currentCanonicalEn,
          requestAbort.signal,
        ),
    });

    respondIfActive(res, requestAbort.signal, result);
  } finally {
    requestAbort.cleanup();
  }
};

export const postAnalyzeIdentity = async (req: Request, res: Response) => {
  const mainImageBase64 = assertImagePayload(req.body?.mainImageBase64, '主产品图');
  const supplementalImagesBase64 = assertOptionalImageArray(req.body?.supplementalImagesBase64, '补充产品图');
  const requestAbort = createRequestAbortController(req, res);

  try {
    const result = await executeQuotaControlledAction({
      userId: req.authUser!.id,
      actionType: 'analyze_identity',
      quotaCost: 0,
      requestPayload: { supplementalCount: supplementalImagesBase64.length },
      signal: requestAbort.signal,
      summarizeResponse: value => ({
        category: value.category,
        confidence: value.confidence,
      }),
      task: () =>
        analyzeProductIdentityWithOpenAi(
          mainImageBase64,
          supplementalImagesBase64,
          req.body?.contextSignal || '',
          requestAbort.signal,
        ),
    });

    respondIfActive(res, requestAbort.signal, result);
  } finally {
    requestAbort.cleanup();
  }
};

export const postAnalyzeVerify = async (req: Request, res: Response) => {
  const generatedImageBase64 = assertImagePayload(req.body?.generatedImageBase64, '生成图');
  const mainImageBase64 = assertImagePayload(req.body?.mainImageBase64, '主产品图');
  const supplementalImagesBase64 = assertOptionalImageArray(req.body?.supplementalImagesBase64, '补充产品图');

  if (!req.body?.originalFingerprint || typeof req.body.originalFingerprint !== 'object') {
    throw new HttpError(400, 'INVALID_FINGERPRINT', '产品指纹不能为空。');
  }

  const requestAbort = createRequestAbortController(req, res);

  try {
    const result = await executeQuotaControlledAction({
      userId: req.authUser!.id,
      actionType: 'analyze_verify',
      quotaCost: 0,
      requestPayload: { imageType: req.body?.options?.imageType },
      signal: requestAbort.signal,
      summarizeResponse: value => ({
        passed: value.passed,
        score: value.score,
      }),
      task: () =>
        verifyGeneratedImageWithGemini(
          generatedImageBase64,
          req.body.originalFingerprint,
          mainImageBase64,
          supplementalImagesBase64,
          req.body?.options || {},
          requestAbort.signal,
        ),
    });

    respondIfActive(res, requestAbort.signal, result);
  } finally {
    requestAbort.cleanup();
  }
};

export const postAnalyzeDetailSetPrompt = async (req: Request, res: Response) => {
  const platform = String(req.body?.platform || '').trim() as 'amazon' | 'walmart' | 'other';
  if (!['amazon', 'walmart', 'other'].includes(platform)) {
    throw new HttpError(400, 'INVALID_PLATFORM', '平台参数无效，请重新选择。');
  }

  if (!req.body?.fingerprint || typeof req.body.fingerprint !== 'object') {
    throw new HttpError(400, 'INVALID_FINGERPRINT', '产品指纹不能为空。');
  }

  const requestAbort = createRequestAbortController(req, res);

  try {
    const result = await executeQuotaControlledAction({
      userId: req.authUser!.id,
      actionType: 'generate_detail_prompt',
      quotaCost: 0,
      requestPayload: { platform },
      signal: requestAbort.signal,
      summarizeResponse: value => ({
        platform,
        promptLength: String(value?.prompt || '').length,
      }),
      task: () => generateDetailSetGlobalPromptWithOpenAi(platform, req.body.fingerprint, requestAbort.signal),
    });

    respondIfActive(res, requestAbort.signal, result);
  } finally {
    requestAbort.cleanup();
  }
};
