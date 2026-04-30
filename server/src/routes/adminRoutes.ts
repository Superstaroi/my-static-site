import { Router } from 'express';
import { deleteUser, getSettings, getUsageLogs, getUsageSummary, getUsers, patchSettings, patchUser, postAddQuota, postResetPassword, postUser } from '../controllers/adminController';
import { getAdminSystemConfig } from '../controllers/systemController';
import { asyncHandler } from '../utils/asyncHandler';

export const adminRoutes = Router();

adminRoutes.get('/system/config', asyncHandler(getAdminSystemConfig));
adminRoutes.get('/settings', asyncHandler(getSettings));
adminRoutes.patch('/settings', asyncHandler(patchSettings));
adminRoutes.get('/users', asyncHandler(getUsers));
adminRoutes.post('/users', asyncHandler(postUser));
adminRoutes.patch('/users/:id', asyncHandler(patchUser));
adminRoutes.delete('/users/:id', asyncHandler(deleteUser));
adminRoutes.post('/users/:id/reset-password', asyncHandler(postResetPassword));
adminRoutes.post('/users/:id/add-quota', asyncHandler(postAddQuota));
adminRoutes.get('/usage-logs', asyncHandler(getUsageLogs));
adminRoutes.get('/usage-summary', asyncHandler(getUsageSummary));
