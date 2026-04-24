import { CommercialTone, GenerationMode, ImageType, Language, SceneStrictness } from './types';

export const MODE_OPTIONS: { label: string; value: GenerationMode | 'auto' }[] = [
  { label: '自动判断', value: 'auto' },
  { label: '按参考图换背景', value: 'background_transfer' },
  { label: '参考图风格参考', value: 'style_inspiration' },
  { label: '按参考图构图生成', value: 'strict_layout_match' },
  { label: '场景展示图', value: 'lifestyle_listing' },
  { label: '卖点说明图', value: 'infographic_listing' },
];

export const IMAGE_TYPE_OPTIONS: { label: string; value: ImageType }[] = [
  { label: '主图', value: 'main' },
  { label: '场景图', value: 'lifestyle' },
  { label: '细节图', value: 'detail' },
  { label: '对比图', value: 'comparison' },
  { label: '横幅图', value: 'banner' },
];

export const LANGUAGE_OPTIONS: { label: string; value: Language }[] = [
  { label: '自动', value: 'auto' },
  { label: '英文', value: 'en' },
  { label: '中文', value: 'zh' },
  { label: '多语言', value: 'multi' },
];

export const COMMERCIAL_TONE_OPTIONS: { label: string; value: CommercialTone }[] = [
  { label: '简洁清爽', value: 'clean' },
  { label: '高级质感', value: 'premium' },
  { label: '轻奢高端', value: 'luxury' },
  { label: '科技感', value: 'tech' },
  { label: '自然生活感', value: 'natural' },
];

export const SCENE_STRICTNESS_OPTIONS: { label: string; value: SceneStrictness | 'auto' }[] = [
  { label: '自动', value: 'auto' },
  { label: '严格贴近', value: 'strict' },
  { label: '适当发挥', value: 'loose' },
];

export const ASPECT_RATIO_OPTIONS = [
  { label: '1:1（方图）', value: '1:1' },
  { label: '3:4（竖版）', value: '3:4' },
  { label: '1000×1334', value: '1000*1334' },
  { label: '4:3（横版）', value: '4:3' },
  { label: '9:16（高图）', value: '9:16' },
  { label: '16:9（宽图）', value: '16:9' },
  { label: 'A+（1464×600）', value: '1464x600' },
];

export const DETAIL_SET_ASPECT_RATIO_OPTIONS = [
  { label: '1:1（方图）', value: '1:1' },
  { label: '3:4（竖版）', value: '3:4' },
  { label: '1000×1334', value: '1000*1334' },
  { label: '4:3（横版）', value: '4:3' },
  { label: '16:9（宽图）', value: '16:9' },
  { label: 'A+（1464×600）', value: '1464x600' },
];
