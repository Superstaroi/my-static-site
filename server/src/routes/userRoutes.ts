import { Router } from 'express';
import {
  clearGenerationHistory,
  deleteGenerationHistoryItem,
  getGenerationHistory,
  getProfile,
  getQuota,
  postGenerationHistory,
} from '../controllers/userController';
import { asyncHandler } from '../utils/asyncHandler';

export const userRoutes = Router();

userRoutes.get('/profile', asyncHandler(getProfile));
userRoutes.get('/quota', asyncHandler(getQuota));
userRoutes.get('/generation-history', asyncHandler(getGenerationHistory));
userRoutes.post('/generation-history', asyncHandler(postGenerationHistory));
userRoutes.delete('/generation-history/:id', asyncHandler(deleteGenerationHistoryItem));
userRoutes.delete('/generation-history', asyncHandler(clearGenerationHistory));
