import { Router } from 'express';
import { getSystemConfig } from '../controllers/systemController';
import { asyncHandler } from '../utils/asyncHandler';

export const systemRoutes = Router();

systemRoutes.get('/config', asyncHandler(getSystemConfig));
