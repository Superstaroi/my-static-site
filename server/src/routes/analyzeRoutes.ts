import { Router } from 'express';
import {
  postAnalyzeDetailSetPrompt,
  postAnalyzeFingerprint,
  postAnalyzeIdentity,
  postAnalyzeVerify,
  postUpdateFingerprint,
} from '../controllers/analyzeController';
import { asyncHandler } from '../utils/asyncHandler';

export const analyzeRoutes = Router();

analyzeRoutes.post('/fingerprint', asyncHandler(postAnalyzeFingerprint));
analyzeRoutes.post('/fingerprint/update', asyncHandler(postUpdateFingerprint));
analyzeRoutes.post('/detail-set-prompt', asyncHandler(postAnalyzeDetailSetPrompt));
analyzeRoutes.post('/identity', asyncHandler(postAnalyzeIdentity));
analyzeRoutes.post('/verify', asyncHandler(postAnalyzeVerify));
