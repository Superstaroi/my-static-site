import { CommercialTone, GenerationMode, ImageType } from '../../types';
import { DetailSetPlanItem } from '../../detailSetTemplates';
import { DetailSetGeneratedItem } from '../shared/models';

export const DETAIL_SET_COPY_ZH: Record<string, { title: string; description: string }> = {
  'amazon-hero': {
    title: '主图场景展示',
    description: '用直观的主图场景快速说明产品是什么、适合放在哪里。',
  },
  'amazon-detail': {
    title: '结构细节展示',
    description: '聚焦产品结构、材质与关键细节，适合做卖点特写。',
  },
  'amazon-use-case': {
    title: '使用场景展示',
    description: '展示产品在真实使用环境中的落地感和代入感。',
  },
  'amazon-material': {
    title: '工艺卖点特写',
    description: '突出质感、表面处理和做工，让商品更显高级。',
  },
  'amazon-banner': {
    title: '宽幅横版展示',
    description: '适合头图区或 A+ 模块的宽幅详情图。',
  },
  'amazon-angle': {
    title: '补充角度展示',
    description: '补充一个更清晰的产品角度，凑齐完整六图详情组。',
  },
  'walmart-hero': {
    title: '信任感主图',
    description: '强调清晰、安全和大众零售友好的主图画面。',
  },
  'walmart-detail': {
    title: '性价比细节展示',
    description: '通过近景突出做工、结构和可见价值感。',
  },
  'walmart-lifestyle': {
    title: '日常使用展示',
    description: '展示轻松日常使用方式的真实场景。',
  },
  'walmart-comparison': {
    title: '对比说明画面',
    description: '用同一产品真实视角构成的结构化说明画面。',
  },
  'walmart-banner': {
    title: '零售宽幅展示',
    description: '适合零售页面横幅、模块头图或重点信息区。',
  },
  'walmart-feature': {
    title: '补充卖点特写',
    description: '再补一张能强调做工与价值感的近景图。',
  },
  'other-hero': {
    title: '通用主图',
    description: '适合大多数平台详情页的通用主视觉。',
  },
  'other-detail': {
    title: '结构细节展示',
    description: '用近景展示产品结构、材质和关键细节。',
  },
  'other-lifestyle': {
    title: '使用场景展示',
    description: '贴合当前品类的真实使用场景。',
  },
  'other-banner': {
    title: 'A+ / 横幅展示',
    description: '适合 A+ 模块、PDP 或横幅区域的宽幅详情图。',
  },
  'other-closeup': {
    title: '工艺细节特写',
    description: '补充展示纹理、表面处理和细节质感。',
  },
  'other-angle': {
    title: '辅助角度展示',
    description: '补足一个不同视角的画面，让整组详情图更完整。',
  },
};

export const DETAIL_SET_IMAGE_TYPE_LABELS: Record<ImageType, string> = {
  main: '主图',
  lifestyle: '场景图',
  detail: '细节图',
  comparison: '对比图',
  banner: '横幅图',
};

export const DETAIL_SET_MODE_LABELS: Record<GenerationMode, string> = {
  background_transfer: '背景替换',
  style_inspiration: '风格参考',
  strict_layout_match: '构图对齐',
  lifestyle_listing: '生活化展示',
  infographic_listing: '卖点信息图',
};

export const DETAIL_SET_TONE_LABELS: Record<CommercialTone, string> = {
  clean: '清爽',
  premium: '高级感',
  luxury: '轻奢',
  tech: '科技感',
  natural: '自然',
};

export const DETAIL_SET_STATUS_LABELS: Record<DetailSetGeneratedItem['status'], string> = {
  pending: '待生成',
  generating: '生成中',
  success: '已完成',
  error: '失败',
};

export const getDetailSetDisplayCopy = (item: Pick<DetailSetPlanItem, 'id' | 'title' | 'description'>) => {
  return DETAIL_SET_COPY_ZH[item.id] || { title: item.title, description: item.description };
};

export const getDetailSetFailureMessage = (items: DetailSetGeneratedItem[]) => {
  const failedCount = items.filter(item => item.status === 'error').length;
  return failedCount > 0 ? `${failedCount} 张详情图未通过校验，你仍可查看和下载已生成的图片。` : '';
};

export const getDetailSetResolvedStatus = (items: DetailSetGeneratedItem[]) => {
  if (items.some(item => item.status === 'generating')) {
    return 'generating';
  }

  if (items.some(item => item.status === 'success')) {
    return 'completed';
  }

  return 'error';
};
