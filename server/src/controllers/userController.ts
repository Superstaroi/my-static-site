import type { Request, Response } from 'express';
import {
  clearUserGenerationHistory,
  createUserGenerationHistory,
  deleteUserGenerationHistoryItem,
  listUserGenerationHistory,
} from '../services/generationHistoryService';
import { getQuotaSnapshot } from '../services/quotaService';

export const getProfile = async (req: Request, res: Response) => {
  const user = req.authUser!;
  res.json({
    id: user.id,
    username: user.username,
    role: user.role,
    is_active: user.isActive,
  });
};

export const getQuota = async (req: Request, res: Response) => {
  res.json(await getQuotaSnapshot(req.authUser!.id));
};

export const getGenerationHistory = async (req: Request, res: Response) => {
  const records = await listUserGenerationHistory(req.authUser!.id);
  res.json(records);
};

export const postGenerationHistory = async (req: Request, res: Response) => {
  const previewUrl = typeof req.body?.previewUrl === 'string'
    ? req.body.previewUrl.trim()
    : '';
  const sourceType = typeof req.body?.sourceType === 'string'
    ? req.body.sourceType.trim()
    : null;

  if (!previewUrl) {
    res.status(400).json({
      success: false,
      code: 'INVALID_GENERATION_HISTORY_PAYLOAD',
      message: '生成记录预览图不能为空。',
    });
    return;
  }

  await createUserGenerationHistory(req.authUser!.id, previewUrl, sourceType);
  res.status(201).json({ success: true });
};

export const deleteGenerationHistoryItem = async (req: Request, res: Response) => {
  const historyId = Number(req.params.id);

  if (!Number.isInteger(historyId) || historyId <= 0) {
    res.status(400).json({
      success: false,
      code: 'INVALID_GENERATION_HISTORY_ID',
      message: '生成记录 ID 无效。',
    });
    return;
  }

  const deleted = await deleteUserGenerationHistoryItem(req.authUser!.id, historyId);
  res.json({ success: true, deleted });
};

export const clearGenerationHistory = async (req: Request, res: Response) => {
  const deleted = await clearUserGenerationHistory(req.authUser!.id);
  res.json({ success: true, deleted });
};
