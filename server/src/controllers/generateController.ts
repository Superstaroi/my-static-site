import type { Request, Response } from 'express';
import {
  editGeneratedImageLocallyWithGemini,
  generateProductImageWithGemini,
  normalizeCopyTextWithGemini,
} from '../services/geminiService';
import { executeQuotaControlledAction } from '../services/quotaService';
import { HttpError } from '../utils/http';
import { assertImagePayload, assertOptionalImageArray } from '../utils/imagePayload';
import { fetchRemoteImageAsBase64 } from '../utils/remoteImage';
import { createRequestAbortController, throwIfRequestAborted } from '../utils/requestAbort';

const respondIfActive = (res: Response, signal: AbortSignal, payload: unknown) => {
  throwIfRequestAborted(signal);
  if (res.writableEnded || res.destroyed) {
    return;
  }
  res.json(payload);
};

export const postGenerateImage = async (req: Request, res: Response) => {
  const productBase64 = assertImagePayload(req.body?.productBase64, '产品图');
  const refBase64 = req.body?.refBase64 == null ? null : assertImagePayload(req.body.refBase64, '参考图');
  const supplementalProductBase64 = assertOptionalImageArray(req.body?.supplementalProductBase64, '补充产品图');
  const requestAbort = createRequestAbortController(req, res);

  try {
    const result = await executeQuotaControlledAction({
      userId: req.authUser!.id,
      actionType: 'generate_image',
      quotaCost: 1,
      signal: requestAbort.signal,
      requestPayload: {
        aspectRatio: req.body?.aspectRatio,
        imageSize: req.body?.imageSize,
        imageIndex: req.body?.imageIndex,
        totalImages: req.body?.totalImages,
        hasRefUrl: Boolean(req.body?.refUrl),
      },
      summarizeResponse: value => ({
        hasImage: Boolean(value.url),
        promptLength: value.prompt.length,
      }),
      task: () =>
        generateProductImageWithGemini({
          productBase64,
          refBase64,
          refUrl: req.body?.refUrl,
          supplementalProductBase64,
          prompt: req.body?.prompt,
          aspectRatio: req.body?.aspectRatio,
          imageSize: req.body?.imageSize,
          imageIndex: req.body?.imageIndex,
          totalImages: req.body?.totalImages,
          textMode: req.body?.textMode,
          requestBehavior: req.body?.requestBehavior,
          signal: requestAbort.signal,
        }),
    });

    respondIfActive(res, requestAbort.signal, result);
  } finally {
    requestAbort.cleanup();
  }
};

export const postEditImage = async (req: Request, res: Response) => {
  const baseImageBase64 = assertImagePayload(req.body?.baseImageBase64, '当前生成图');
  const productBase64 = assertImagePayload(req.body?.productBase64, '产品图');
  const refBase64 = req.body?.refBase64 == null ? null : assertImagePayload(req.body.refBase64, '参考图');
  const supplementalProductBase64 = assertOptionalImageArray(req.body?.supplementalProductBase64, '补充产品图');
  const requestAbort = createRequestAbortController(req, res);

  try {
    const result = await executeQuotaControlledAction({
      userId: req.authUser!.id,
      actionType: 'edit_image',
      quotaCost: 1,
      signal: requestAbort.signal,
      requestPayload: {
        aspectRatio: req.body?.aspectRatio,
        imageSize: req.body?.imageSize,
        maxSupplementalProductImages: req.body?.maxSupplementalProductImages,
        hasRefUrl: Boolean(req.body?.refUrl),
      },
      summarizeResponse: value => ({
        hasImage: Boolean(value.url),
        promptLength: value.prompt.length,
      }),
      task: () =>
        editGeneratedImageLocallyWithGemini({
          baseImageBase64,
          productBase64,
          refBase64,
          refUrl: req.body?.refUrl,
          supplementalProductBase64,
          prompt: req.body?.prompt,
          aspectRatio: req.body?.aspectRatio,
          imageSize: req.body?.imageSize,
          requestBehavior: req.body?.requestBehavior,
          maxSupplementalProductImages: req.body?.maxSupplementalProductImages,
          signal: requestAbort.signal,
        }),
    });

    respondIfActive(res, requestAbort.signal, result);
  } finally {
    requestAbort.cleanup();
  }
};

export const postNormalizeCopy = async (req: Request, res: Response) => {
  const requestAbort = createRequestAbortController(req, res);

  try {
    const text = await executeQuotaControlledAction({
      userId: req.authUser!.id,
      actionType: 'normalize_copy',
      quotaCost: 0,
      signal: requestAbort.signal,
      requestPayload: { targetLanguage: req.body?.targetLanguage },
      summarizeResponse: value => ({ textLength: value.length }),
      task: () => normalizeCopyTextWithGemini(req.body?.text, req.body?.targetLanguage, requestAbort.signal),
    });

    respondIfActive(res, requestAbort.signal, { text });
  } finally {
    requestAbort.cleanup();
  }
};

export const postResolveImage = async (req: Request, res: Response) => {
  const requestedUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
  if (!requestedUrl) {
    throw new HttpError(400, 'INVALID_REFERENCE_URL', '参考图地址不能为空。');
  }

  const requestAbort = createRequestAbortController(req, res);

  try {
    const image = await executeQuotaControlledAction({
      userId: req.authUser!.id,
      actionType: 'resolve_image_url',
      quotaCost: 0,
      signal: requestAbort.signal,
      requestPayload: { url: requestedUrl },
      summarizeResponse: value => ({
        mimeType: value.mimeType,
        base64Length: value.data.length,
      }),
      task: () => fetchRemoteImageAsBase64(requestedUrl, { signal: requestAbort.signal }),
    });

    respondIfActive(res, requestAbort.signal, image);
  } finally {
    requestAbort.cleanup();
  }
};
