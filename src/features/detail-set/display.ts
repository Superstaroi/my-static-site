import { CommercialTone, GenerationMode, ImageType } from '../../types';
import { DetailSetPlanItem } from '../../detailSetTemplates';
import { DetailSetGeneratedItem } from '../shared/models';

export const DETAIL_SET_COPY_ZH: Record<string, { title: string; description: string }> = {
  'amazon-hero': {
    title: '主图场景展示',
    description: '用简洁直观的场景快速说明产品是什么、适合放在哪里。',
  },
  'amazon-detail': {
    title: '结构细节展示',
    description: '聚焦产品结构和标志性实体细节的近景画面。',
  },
  'amazon-use-case': {
    title: '使用场景展示',
    description: '贴合当前品类的真实使用场景。',
  },
  'amazon-material': {
    title: '卖点细节聚焦',
    description: '突出材质、表面处理和做工质感的高清画面。',
  },
  'amazon-banner': {
    title: '宽幅横版展示',
    description: '适合头图区域或 A+ 模块的宽幅详情图。',
  },
  'temu-hero': {
    title: '转化主图',
    description: '适合移动端强转化布局、信息传达迅速的主视觉。',
  },
  'temu-feature': {
    title: '功能卖点展示',
    description: '即使不加文字，也能清晰表达卖点的特写画面。',
  },
  'temu-lifestyle': {
    title: '日常使用场景',
    description: '明亮、实用、易理解的生活化展示画面。',
  },
  'temu-comparison': {
    title: '优势对比展示',
    description: '使用同一产品真实视角完成的对比式展示画面。',
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
    description: '用同一产品真实视角构成的结构化对比版式。',
  },
  'shopify-banner': {
    title: '店铺头图横幅',
    description: '适合店铺首页头图和落地页的高级宽幅主视觉。',
  },
  'shopify-lifestyle': {
    title: '品牌氛围场景',
    description: '兼具质感与真实感的品牌叙事型生活场景。',
  },
  'shopify-detail': {
    title: '工艺细节展示',
    description: '用于展示特征、纹理与工艺质感的高端细节图。',
  },
  'shopify-feature': {
    title: '核心卖点展示',
    description: '适合高端商品详情页和转化模块的卖点视觉。',
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
  return failedCount > 0 ? `${failedCount} 张详情图处理失败，你仍可下载已成功生成的结果。` : '';
};

export const getDetailSetResolvedStatus = (items: DetailSetGeneratedItem[]) => {
  return items.some(item => item.generatedImage || item.status === 'success') ? 'completed' : 'error';
};
