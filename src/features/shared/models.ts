import { CommercialTone, GenerationMode, ImageType, SceneStrictness } from '../../types';
import { DetailSetPlanItem } from '../../detailSetTemplates';

export interface SingleGeneratedImage {
  id: string;
  slot: number;
  url: string;
  prompt: string;
  adjustmentPrompt: string;
}

export type SingleImageOperationKind = 'regenerate' | 'local_edit';

export type SingleGenerationStatus =
  | 'idle'
  | 'generating'
  | 'generated'
  | 'success'
  | 'error'
  | 'needs_review';

export interface SingleGenerationState {
  status: SingleGenerationStatus;
  generatedImages: SingleGeneratedImage[];
  error: string;
  size: string;
  copyText: string;
  prompt: string;
  count: number;
  regeneratingIndices: number[];
  regenerationStartedAt: Record<number, number>;
  regenerationTimeoutAt: Record<number, number>;
  regenerationKinds: Record<number, SingleImageOperationKind>;
  mode: GenerationMode | 'auto';
  imageType: ImageType;
  commercialTone: CommercialTone;
  sceneStrictness: SceneStrictness | 'auto';
  preserveProductText: boolean;
}

export interface UploadedImageAsset {
  file: File;
  dataUrl: string;
  base64: { data: string; mimeType: string };
}

export interface DetailSetGeneratedItem extends DetailSetPlanItem {
  status: 'pending' | 'generating' | 'success' | 'error';
  generatedImage?: string;
  generatedPrompt?: string;
  error?: string;
  adjustmentPrompt: string;
}
