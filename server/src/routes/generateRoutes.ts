import { Router } from 'express';
import { postEditImage, postGenerateImage, postNormalizeCopy, postResolveImage } from '../controllers/generateController';
import { asyncHandler } from '../utils/asyncHandler';

export const generateRoutes = Router();

generateRoutes.post('/image', asyncHandler(postGenerateImage));
generateRoutes.post('/edit', asyncHandler(postEditImage));
generateRoutes.post('/normalize-copy', asyncHandler(postNormalizeCopy));
generateRoutes.post('/resolve-image', asyncHandler(postResolveImage));
