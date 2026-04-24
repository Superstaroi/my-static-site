import type { Request, Response } from 'express';
import { buildSystemConfigPayload } from '../utils/modelConfig';

export const getSystemConfig = async (_req: Request, res: Response) => {
  res.json(buildSystemConfigPayload());
};

export const getAdminSystemConfig = async (_req: Request, res: Response) => {
  res.json(buildSystemConfigPayload());
};
