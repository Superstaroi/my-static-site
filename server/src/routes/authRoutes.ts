import { Router } from 'express';
import { adminLogin, adminLogout, adminMe, login, logout, me } from '../controllers/authController';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAdminAuth, requireFrontAuth } from '../middleware/requireAuth';

export const authRoutes = Router();
const frontAuthRoutes = Router();
const adminAuthRoutes = Router();

frontAuthRoutes.post('/login', asyncHandler(login));
frontAuthRoutes.post('/logout', asyncHandler(logout));
frontAuthRoutes.get('/me', requireFrontAuth, asyncHandler(me));

adminAuthRoutes.post('/login', asyncHandler(adminLogin));
adminAuthRoutes.post('/logout', asyncHandler(adminLogout));
adminAuthRoutes.get('/me', requireAdminAuth, asyncHandler(adminMe));

authRoutes.use('/front', frontAuthRoutes);
authRoutes.use('/admin', adminAuthRoutes);
