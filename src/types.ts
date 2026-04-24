export type GenerationMode = 'background_transfer' | 'style_inspiration' | 'strict_layout_match' | 'lifestyle_listing' | 'infographic_listing';
export type ImageType = 'main' | 'lifestyle' | 'detail' | 'comparison' | 'banner';
export type TextMode = 'none' | 'render_text';
export type Language = 'auto' | 'en' | 'zh' | 'multi';
export type CommercialTone = 'clean' | 'premium' | 'luxury' | 'tech' | 'natural';
export type SceneStrictness = 'strict' | 'loose';
export type DetailSetPlatform = 'amazon' | 'walmart' | 'other';

export interface ExcelRow {
  id: string;
  rowNumber: number;
  copyText: string;
  size: string;
  productTitle: string;
  refUrl: string;
  customPrompt?: string;
  adjustmentPrompt?: string;
  status: 'pending' | 'generating' | 'generated' | 'success' | 'error' | 'needs_review';
  generatedImage?: string;
  error?: string;
  generatedPrompt?: string;
  
  // New production parameters
  mode?: GenerationMode;
  imageType?: ImageType;
  language?: Language;
  preserveProductText?: boolean;
  commercialTone?: CommercialTone;
  sceneStrictness?: SceneStrictness;
}
