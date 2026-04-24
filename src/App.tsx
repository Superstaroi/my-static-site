import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, 
  FileSpreadsheet, 
  Image as ImageIcon, 
  FileText,
  Play, 
  Download, 
  AlertCircle, 
  CheckCircle2, 
  Loader2, 
  Trash2, 
  RefreshCw, 
  X,
  ChevronDown,
  Maximize,
  Layers,
  Zap,
  Palette,
  Settings2,
  Info,
  Sparkles,
  Plus,
  Wand2,
  Store,
  House,
  Star,
  Video
} from 'lucide-react';
import { ExcelRow, GenerationMode, ImageType, CommercialTone, SceneStrictness, DetailSetPlatform } from './types';
import { parseExcel } from './utils/excelParser';
import { fetchImageAsBase64, blobToBase64, generateProductImage, editGeneratedImageLocally, buildPrompt, getSizeInstruction, parseAspectRatio, BuildPromptOptions, normalizeCopyText, ImageRequestBehavior } from './services/geminiService';
import { 
  MODE_OPTIONS, 
  IMAGE_TYPE_OPTIONS, 
  COMMERCIAL_TONE_OPTIONS, 
  SCENE_STRICTNESS_OPTIONS,
  ASPECT_RATIO_OPTIONS
} from './constants';

import { ProductFingerprint, VerificationResult } from './types/product';
import {
  analyzeProductFingerprintWithOpenAI,
  generateDetailSetGlobalPrompt,
  updateFingerprintFromTextDraft,
} from './services/productAnalysisService';
import { verifyGeneratedImage, isVerificationPassed, summarizeVerificationFailures } from './services/imageVerificationService';
import { addIdsToArrays } from './utils/fingerprintMapping';
import { v4 as uuidv4 } from 'uuid';
import { buildDetailSetGenerationGuardrails, buildDetailSetVerificationRequirements, createDetailSetPlan, DETAIL_SET_PLATFORM_OPTIONS, DetailSetPlanItem, getDetailSetSupplementalReferenceLimit, resolveDetailSetGuidanceForSlot } from './detailSetTemplates';
import { analyzeProductIdentityWithOpenAI, buildProductIdentityHardConstraintPrompt, ProductIdentityProfile, shouldUseOpenAiProductIdentityEnhancement } from './services/openaiIdentityService';
import { SelectField } from './components/SelectField';
import { BatchResultsSection } from './features/batch-generation/BatchResultsSection';
import { DetailSetWorkspace } from './features/detail-set/DetailSetWorkspace';
import { getDetailSetFailureMessage, getDetailSetResolvedStatus } from './features/detail-set/display';
import { SingleGenerationSection } from './features/single-generation/SingleGenerationSection';
import { DetailSetGeneratedItem, SingleGeneratedImage, SingleGenerationState, SingleImageOperationKind, UploadedImageAsset } from './features/shared/models';
import { FavoritesPage, HomePage, homeMediaItems, type HomeMediaItem } from './pages/HomePage';
import { GenerationHistoryPage } from './pages/GenerationHistoryPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { apiPost, GenerationHistorySourceType } from './services/api';

interface AppProps {
  entryMode:
    | 'home'
    | 'favorites'
    | 'single'
    | 'batch'
    | 'detail'
    | 'history'
    | 'uploads'
    | 'prompts'
    | 'styles'
    | 'text-to-image'
    | 'ai-video';
  onNavigateEntry: (
    entryMode:
      | 'home'
      | 'favorites'
      | 'single'
      | 'batch'
      | 'detail'
      | 'history'
      | 'uploads'
      | 'prompts'
      | 'styles'
      | 'text-to-image'
      | 'ai-video'
  ) => void;
  workspaceHeaderActions?: React.ReactNode;
  workspaceSidebarFooter?: React.ReactNode;
}

type WorkspaceMode = 'home' | 'favorites' | 'studio' | 'detail_set' | 'history' | 'placeholder';
type StudioMode = 'single' | 'batch';
type PlaceholderWorkspaceKey = 'uploads' | 'prompts' | 'styles' | 'text-to-image' | 'ai-video';
type SidebarKey =
  | 'home'
  | 'favorites'
  | 'single'
  | 'batch'
  | 'detail'
  | 'history'
  | 'uploads'
  | 'prompts'
  | 'styles'
  | 'text-to-image'
  | 'ai-video';
type SingleGeneratePhase = 'idle' | 'preparing' | 'generating' | 'verifying';
type BatchRowPendingAction = 'generate' | 'local_edit' | 'verifying';
type DetailItemPendingAction = 'generate' | 'regenerate' | 'local_edit' | 'verifying';

const MAX_CONCURRENT_SINGLE_IMAGE_REGENERATIONS = 3;
const MAX_SINGLE_GENERATION_CONCURRENCY = 3;
const MAX_DETAIL_SET_GENERATION_CONCURRENCY = 5;
const MAX_BATCH_STYLE_CONCURRENCY = 5;
const SINGLE_IMAGE_REGENERATION_WATCHDOG_MS = 120000;
const SINGLE_MODE_REGENERATION_REQUEST_BEHAVIOR: ImageRequestBehavior = {
  timeoutMs: 85000,
  maxRetries: 0,
};
const SINGLE_MODE_LOCAL_EDIT_REQUEST_BEHAVIOR: ImageRequestBehavior = {
  timeoutMs: 75000,
  maxRetries: 0,
};
const BATCH_ROW_GENERATION_REQUEST_BEHAVIOR: ImageRequestBehavior = {
  timeoutMs: 90000,
  maxRetries: 0,
};
const BATCH_ROW_LOCAL_EDIT_REQUEST_BEHAVIOR: ImageRequestBehavior = {
  timeoutMs: 75000,
  maxRetries: 0,
};
const MAX_SINGLE_LOCAL_EDIT_SUPPLEMENTAL_IMAGES = 1;
const MAX_BATCH_LOCAL_EDIT_SUPPLEMENTAL_IMAGES = 1;
const MAX_DETAIL_LOCAL_EDIT_SUPPLEMENTAL_IMAGES = 2;
const MAX_DETAIL_SET_GENERATION_SUPPLEMENTAL_IMAGES = 2;
const MAX_LIGHT_DETAIL_VERIFICATION_SUPPLEMENTAL_IMAGES = 2;
const MAX_IMAGE_FILE_SIZE = 10 * 1024 * 1024;
const MAX_EXCEL_FILE_SIZE = 20 * 1024 * 1024;
const FINGERPRINT_ANALYSIS_TIMEOUT_MS = 60000;
const IDENTITY_ANALYSIS_TIMEOUT_MS = 45000;
const VERIFICATION_TIMEOUT_MS = 60000;
const BATCH_REFERENCE_PRODUCT_REPLACEMENT_HARD_CONSTRAINT = [
  'Reference-image product must be treated as a placeholder only and must not remain in the final image.',
  'Use the reference image only for composition, camera angle, scene, environment, prop placement, hand placement, lighting, layout, and other non-product context cues.',
  'Do not retain, copy, blend, or partially preserve any physical product structure, silhouette, attachment, color blocking, branding, or visible fragment from the reference-image product.',
  'The final visible product must be the uploaded product only, fully replacing the reference-image product.'
].join('\n');
const HOME_MEDIA_FAVORITES_STORAGE_KEY = 'vx-home-media-favorites';
const GENERATION_HISTORY_PREVIEW_MAX_DIMENSION = 480;
const GENERATION_HISTORY_PREVIEW_QUALITY = 0.82;
const PLACEHOLDER_PAGE_COPY: Record<PlaceholderWorkspaceKey, { title: string; description: string }> = {
  uploads: {
    title: '上传素材',
    description: '上传素材模块入口已开放，具体内容后续补充。',
  },
  prompts: {
    title: 'Prompt 模板',
    description: 'Prompt 模板模块入口已开放，具体内容后续补充。',
  },
  styles: {
    title: '风格库',
    description: '风格库模块入口已开放，具体内容后续补充。',
  },
  'text-to-image': {
    title: '文生图',
    description: '文生图模块入口已开放，具体内容后续补充。',
  },
  'ai-video': {
    title: 'AI视频',
    description: 'AI视频模块入口已开放，具体内容后续补充。',
  },
};
const debugLog = (..._args: unknown[]) => undefined;
const singleGenInitialState: SingleGenerationState = {
  status: 'idle',
  generatedImages: [] as SingleGeneratedImage[],
  error: '',
  size: '1:1',
  copyText: '',
  prompt: '',
  count: 1,
  regeneratingIndices: [] as number[],
  regenerationStartedAt: {} as Record<number, number>,
  regenerationTimeoutAt: {} as Record<number, number>,
  regenerationKinds: {} as Record<number, SingleImageOperationKind>,
  mode: 'auto' as GenerationMode | 'auto',
  imageType: 'main' as ImageType,
  commercialTone: 'premium' as CommercialTone,
  sceneStrictness: 'auto' as SceneStrictness | 'auto',
  preserveProductText: true
};

const detailSetInitialState = {
  platform: 'amazon' as DetailSetPlatform,
  globalPrompt: '',
  promptSource: 'manual' as 'manual' | 'ai',
  gridLayout: '2x3' as '2x3' | '3x3',
  status: 'idle' as 'idle' | 'analyzing' | 'planning' | 'generating' | 'completed' | 'error',
  error: '',
  generatedItems: [] as DetailSetGeneratedItem[],
  aspectRatioOverrides: {} as Record<string, string>,
};

const revokeObjectUrlIfNeeded = (url?: string | null) => {
  if (url && url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
};

const assertFileSizeWithinLimit = (file: File, maxBytes: number, message: string) => {
  if (file.size > maxBytes) {
    throw new Error(message);
  }
};

const readImageAssetFromFile = async (file: File): Promise<UploadedImageAsset> => {
  assertFileSizeWithinLimit(file, MAX_IMAGE_FILE_SIZE, '图片不能超过 10MB，请压缩后重新上传');
  const base64Data = await blobToBase64(file);
  return {
    file,
    dataUrl: URL.createObjectURL(file),
    base64: {
      data: base64Data.data,
      mimeType: base64Data.mimeType
    }
  };
};

const createVerificationFailureResult = (description: string): VerificationResult => ({
  passed: false,
  score: 0,
  subjectCount: 0,
  checks: {
    singleSubject: false,
    colorMatch: false,
    structureMatch: false,
    accessoryMatch: false,
    logoMatch: false,
    materialMatch: false,
    noCollage: false,
    noExtraParts: false,
  },
  issues: [
    {
      type: 'other',
      description,
      severity: 'high',
    }
  ],
  recommendations: ['请人工复核当前生成结果。'],
});

const createSingleImageStableId = (slot: number) => `single-image-${slot}`;

const buildSingleGeneratedImage = (
  slot: number,
  result: { url: string; prompt: string },
  adjustmentPrompt: string = ''
): SingleGeneratedImage => ({
  id: createSingleImageStableId(slot),
  slot,
  url: result.url,
  prompt: result.prompt,
  adjustmentPrompt,
});

type DetailSetGenerationOutcome = {
  result: { url: string; prompt: string };
  usedPromptOptions: BuildPromptOptions;
  verificationOptions: {
    mustContain?: string[];
    mustNotContain?: string[];
  };
};

const hasUsableGeneratedImageResult = (result: { url?: string | null } | null | undefined) =>
  typeof result?.url === 'string' && result.url.trim().length > 0;

const getLimitedBase64References = <T extends { base64: { data: string; mimeType: string } }>(
  images: T[],
  limit: number
) => images.slice(0, Math.max(0, limit)).map(image => image.base64);

const getExplicitOutputDimensions = (size: string) => {
  const normalizedSize = size.replace(/\*/g, 'x').replace(/\s+/g, '').trim().toLowerCase();
  const match = normalizedSize.match(/^(\d+)x(\d+)$/);
  if (!match) {
    return null;
  }

  const width = parseInt(match[1], 10);
  const height = parseInt(match[2], 10);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  return { width, height };
};

const formatConfidencePercent = (value: number | undefined | null) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '--';
  }

  const normalized = value <= 1 ? value * 100 : value;
  return `${Math.max(0, Math.min(100, Math.round(normalized)))}%`;
};

const buildCompactBackgroundContext = (
  prompt: string,
  maxSegments: number = 4,
  maxChars: number = 600
) => {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return '';
  }

  const segments = trimmed
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(segment => segment.trim())
    .filter(Boolean)
    .slice(0, maxSegments);

  const compact = segments.join(' | ');
  if (!compact) {
    return '';
  }

  return compact.length > maxChars
    ? `${compact.slice(0, maxChars).trim()}...`
    : compact;
};

const buildPrioritizedVisibleInstructionPrompt = (
  instruction: string,
  {
    hasRefImage = false,
    instructionLabel = 'user instructions',
  }: {
    hasRefImage?: boolean;
    instructionLabel?: string;
  } = {}
) => {
  const trimmed = instruction.trim();
  if (!trimmed) {
    return '';
  }

  return [
    `The ${instructionLabel} below are a visible requirement for the final image and must be clearly satisfied.`,
    hasRefImage
      ? `If the ${instructionLabel} conflict with the optional reference image, satisfy the ${instructionLabel} first and use the reference image only as secondary support afterward.`
      : '',
    'Keep the uploaded product recognizable, but do not ignore explicit requested changes to the scene, framing, props, support container, basket, planter, stand, base, accessory size, or relative scale.',
    'Avoid changing unrelated parts of the image beyond what is needed to satisfy the requested visible change.',
    trimmed,
  ]
    .filter(Boolean)
    .join('\n');
};

const buildDetailSetRetryCorrectionPrompt = (
  verification: VerificationResult | null,
  item: Pick<DetailSetPlanItem, 'slot' | 'imageType' | 'title' | 'description'>,
  fingerprint?: ProductFingerprint | null,
) => {
  if (!verification || isVerificationPassed(verification)) {
    return '';
  }

  const issueLines = verification.issues
    .map(issue => String(issue.description || '').trim())
    .filter(Boolean)
    .slice(0, 4)
    .map(issue => `- ${issue}`);

  const keyPartReminder = fingerprint?.structure?.keyParts?.filter(Boolean).slice(0, 4).join(', ');
  const colorReminder = fingerprint?.colors?.filter(Boolean).slice(0, 3).map(color => color.name).join(', ');

  return [
    'The previous attempt failed verification. Fix every issue below before returning the next image.',
    ...issueLines,
    (!verification.checks.singleSubject || !verification.checks.noCollage)
      ? 'Return one coherent full-frame image with one product subject only. Do not use collage, split-screen, picture-in-picture, multi-view, or duplicate products.'
      : '',
    item.imageType === 'detail'
      ? 'For this detail-focused image, keep one continuous anchor region from the same product. Do not merge distant parts or multiple viewpoints into a synthetic close-up.'
      : '',
    !verification.checks.structureMatch
      ? `Keep the original connected part layout and overall shape${fingerprint?.structure?.overallShape ? `: ${fingerprint.structure.overallShape}` : ''}.`
      : '',
    (!verification.checks.colorMatch || !verification.checks.materialMatch)
      ? `Preserve the original visible color and material zones exactly${colorReminder ? `: ${colorReminder}` : ''}. Do not repaint or reinterpret the finish.`
      : '',
    (!verification.checks.accessoryMatch || !verification.checks.noExtraParts)
      ? 'Do not add docks, wall mounts, chargers, stands, baskets, planters, trays, remotes, or any accessory that is not visible in the uploaded product images or explicitly required by the current slot instructions.'
      : '',
    keyPartReminder ? `Keep these key parts faithful and connected: ${keyPartReminder}.` : '',
  ]
    .filter(Boolean)
    .join('\n');
};

const buildImageBase64Signature = (image: { data: string; mimeType: string }) =>
  `${image.mimeType}:${image.data.length}:${image.data.slice(0, 24)}:${image.data.slice(-24)}`;

const base64ToDataUrl = (base64: { data: string; mimeType: string }) =>
  `data:${base64.mimeType};base64,${base64.data}`;

const parseDataImageUrl = (url: string) => {
  const normalized = String(url || '').trim();
  const matched = normalized.match(/^data:(image\/[^;,]+);base64,(.+)$/i);
  if (!matched || !matched[1] || !matched[2]) {
    throw new Error('图片数据格式无效，请重新上传后再试。');
  }

  const mimeType = matched[1];
  const data = matched[2];
  return { data, mimeType };
};

const resolveImageUrlToBase64 = async (
  imageUrl: string,
  sourceLabel: string,
  signal?: AbortSignal,
): Promise<{ data: string; mimeType: string }> => {
  try {
    return imageUrl.startsWith('data:image')
      ? parseDataImageUrl(imageUrl)
      : await fetchImageAsBase64(imageUrl, signal);
  } catch (error: any) {
    const reason = error?.message || '图片加载失败。';
    throw new Error(`${sourceLabel}: ${reason}`);
  }
};

const loadImageFromDataUrl = (dataUrl: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('生成图读取失败，无法输出指定尺寸。'));
    image.src = dataUrl;
  });

const getImageDimensionsFromBase64 = async (imageBase64: { data: string; mimeType: string }) => {
  const dataUrl = base64ToDataUrl(imageBase64);
  const image = await loadImageFromDataUrl(dataUrl);
  return {
    width: image.naturalWidth,
    height: image.naturalHeight,
  };
};

const createGenerationHistoryPreviewDataUrl = async (imageUrl: string): Promise<string> => {
  const sourceBase64 = await resolveImageUrlToBase64(imageUrl, '生成记录预览图加载失败');
  const sourceDataUrl = base64ToDataUrl(sourceBase64);
  const image = await loadImageFromDataUrl(sourceDataUrl);
  const largestDimension = Math.max(image.naturalWidth, image.naturalHeight);
  const scale =
    largestDimension > GENERATION_HISTORY_PREVIEW_MAX_DIMENSION
      ? GENERATION_HISTORY_PREVIEW_MAX_DIMENSION / largestDimension
      : 1;
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('生成记录预览图创建失败。');
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, width, height);

  return canvas.toDataURL('image/jpeg', GENERATION_HISTORY_PREVIEW_QUALITY);
};

const toExplicitOutputSize = (dimensions: { width: number; height: number } | null | undefined) => {
  if (!dimensions) {
    return null;
  }

  const width = Math.round(Number(dimensions.width));
  const height = Math.round(Number(dimensions.height));

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  return `${width}x${height}`;
};

const resolveLocalEditRequestImageSize = (
  dimensions: { width: number; height: number } | null | undefined,
  fallback: string = '4K'
) => {
  if (!dimensions) {
    return fallback;
  }

  const largestDimension = Math.max(dimensions.width || 0, dimensions.height || 0);
  if (!largestDimension || !Number.isFinite(largestDimension)) {
    return fallback;
  }

  if (largestDimension > 2048) {
    return '4K';
  }

  if (largestDimension > 1024) {
    return '2K';
  }

  return '1K';
};

const isLikelyLocalEditTransportFailure = (error: unknown) => {
  const raw = error as { code?: unknown; message?: unknown; status?: unknown } | null;
  const code = String(raw?.code || '').trim().toUpperCase();
  const message = String(raw?.message || error || '').trim().toUpperCase();
  const status = Number(raw?.status);

  /* const resolvedSidebarGroups = sidebarGroups.map((group, groupIndex) => {
    const nextItems = group.items.map(item => {
      if (item.key === 'history') {
        return { ...item, active: isHistoryView };
      }

      if (item.key === 'uploads') {
        return { ...item, active: placeholderMode === 'uploads' };
      }

      if (item.key === 'prompts') {
        return { ...item, active: placeholderMode === 'prompts' };
      }

      if (item.key === 'styles') {
        return { ...item, active: placeholderMode === 'styles' };
      }

      return item;
    });

    if (groupIndex !== 0) {
      return {
        ...group,
        items: nextItems,
      };
    }

    return {
      ...group,
      items: [
        ...nextItems,
        { key: 'text-to-image' as const, label: '文生图', icon: FileText, active: placeholderMode === 'text-to-image' },
        { key: 'ai-video' as const, label: 'AI视频', icon: Video, active: placeholderMode === 'ai-video' },
      ],
    };
  });

  }); */

  return (
    code === 'GEMINI_PROVIDER_UNREACHABLE' ||
    code === 'GEMINI_UPSTREAM_TIMEOUT' ||
    code === 'NETWORK_ERROR' ||
    code === 'REQUEST_TIMEOUT' ||
    status === 503 ||
    status === 504 ||
    message.includes('GEMINI 服务当前无法连接'.toUpperCase()) ||
    message.includes('FETCH FAILED') ||
    message.includes('FAILED TO FETCH') ||
    message.includes('ECONNRESET') ||
    message.includes('ETIMEDOUT') ||
    message.includes('UND_ERR_SOCKET') ||
    message.includes('UND_ERR_CONNECT_TIMEOUT')
  );
};

const getLocalEditTransportMaxDimension = (
  requestImageSize: string,
  assetKind: 'base' | 'reference',
  mode: 'preferred' | 'fallback' = 'preferred'
) => {
  if (mode === 'fallback') {
    return assetKind === 'base' ? 1536 : 1280;
  }

  if (requestImageSize === '4K') {
    return assetKind === 'base' ? 3072 : 2048;
  }

  if (requestImageSize === '2K') {
    return assetKind === 'base' ? 2048 : 1536;
  }

  return assetKind === 'base' ? 1536 : 1280;
};

const getDetailVerificationState = (verification: VerificationResult | null) => {
  if (!verification || isVerificationPassed(verification)) {
    return {
      status: 'success' as const,
      error: '',
    };
  }

  return {
    status: 'error' as const,
    error: summarizeVerificationFailures(verification),
  };
};

const verifyDetailSetOutputLight = async (
  generatedImageUrl: string,
  fingerprint: ProductFingerprint,
  imageType: ImageType,
  productImages: UploadedImageAsset[],
  verificationOptions?: {
    mustContain?: string[];
    mustNotContain?: string[];
  },
  externalSignal?: AbortSignal,
): Promise<VerificationResult | null> => {
  const [mainProductImage, ...supplementalProductImages] = productImages;
  if (!mainProductImage) {
    return null;
  }

  const generatedBase64Obj = await resolveImageUrlToBase64(generatedImageUrl, '详情图校验图片加载失败', externalSignal);
  return verifyGeneratedImage(
    generatedBase64Obj,
    fingerprint,
    mainProductImage.base64,
    getLimitedBase64References(supplementalProductImages, MAX_LIGHT_DETAIL_VERIFICATION_SUPPLEMENTAL_IMAGES),
    {
      imageType,
      mustContain: verificationOptions?.mustContain,
      mustNotContain: verificationOptions?.mustNotContain,
    },
    externalSignal,
  );
};

const buildDetailGeneratedItemVerificationUpdater = (
  itemId: string,
  generatedImage: string,
  verification: VerificationResult | null
) => (prev: typeof detailSetInitialState) => {
  const currentItem = prev.generatedItems.find(item => item.id === itemId);
  if (!currentItem || currentItem.generatedImage !== generatedImage) {
    return prev;
  }

  const verificationState = getDetailVerificationState(verification);
  if (currentItem.status === verificationState.status && (currentItem.error || '') === verificationState.error) {
    return prev;
  }

  const updatedItems = prev.generatedItems.map(item =>
    item.id === itemId
      ? { ...item, status: verificationState.status, error: verificationState.error }
      : item
  );

  return {
    ...prev,
    status: getDetailSetResolvedStatus(updatedItems),
    generatedItems: updatedItems,
    error: getDetailSetFailureMessage(updatedItems),
  };
};

type FingerprintPathSegment = string | number;

interface FingerprintTextDraft {
  productDescription: string;
  extractedFeatures: string;
  productFingerprint: string;
}

const FINGERPRINT_EDITOR_SECTIONS = [
  { key: 'productDescription' as const, title: '产品描述' },
  { key: 'extractedFeatures' as const, title: '提取特征' },
  { key: 'productFingerprint' as const, title: '产品指纹' },
];

const cloneJsonValue = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const updateJsonValueAtPath = (
  source: any,
  path: FingerprintPathSegment[],
  nextValue: any
) => {
  const next = cloneJsonValue(source);
  let cursor = next;

  for (let index = 0; index < path.length - 1; index += 1) {
    cursor = cursor[path[index]];
  }

  cursor[path[path.length - 1]] = nextValue;
  return next;
};

const isLongFingerprintText = (value: string) =>
  value.length > 60 || value.includes('\n');

const normalizeFingerprintFieldLabel = (label: string) =>
  label.toLowerCase().replace(/[\s_-]/g, '');

const getFingerprintFieldKind = (label: string) => {
  const normalized = normalizeFingerprintFieldLabel(label);

  if (normalized === 'id' || normalized === '_id' || label === 'id' || label === '_id') return 'internal_id';
  if (normalized.includes('hex') || label.includes('十六进制')) return 'internal_hex';
  if (normalized.includes('mustpreserve') || label.includes('必须保留')) return 'internal_flag';
  if (normalized.includes('confidence') || label.includes('置信')) return 'internal_confidence';
  if (normalized.includes('verifierchecklist') || label.includes('校验清单') || label.includes('验证清单')) return 'internal_checklist';
  if (normalized.includes('attached') || label.includes('已连接')) return 'internal_flag';
  if (normalized.includes('haslogo') || label.includes('有标志') || label.includes('有Logo')) return 'internal_flag';

  if (normalized.includes('category') || label.includes('类目')) return 'category';
  if (normalized.includes('productsummary') || label.includes('产品总结') || label.includes('产品总述')) return 'product_summary';
  if (normalized.includes('color') || label === '颜色' || label.includes('颜色')) return 'colors';
  if (normalized.includes('material') || label.includes('材质')) return 'materials';
  if (normalized.includes('structure') || label.includes('结构')) return 'structure';
  if (normalized.includes('accessor') || label.includes('配件')) return 'accessories';
  if (normalized.includes('logo') || label.includes('标志') || label.includes('Logo')) return 'logo';
  if (normalized.includes('forbiddenchanges') || label.includes('禁止') || label.includes('禁改')) return 'forbidden_changes';
  if (normalized.includes('name') || label.includes('名称')) return 'name';
  if (normalized.includes('location') || label.includes('位置')) return 'location';
  if (normalized.includes('finish') || label.includes('表面处理')) return 'finish';
  if (normalized.includes('overallshape') || label.includes('整体形状')) return 'overall_shape';
  if (normalized.includes('keyparts') || label.includes('关键部件')) return 'key_parts';
  if (normalized.includes('proportions') || label.includes('比例')) return 'proportions';
  if (normalized.includes('visiblecontrols') || label.includes('可见控件')) return 'visible_controls';
  if (normalized.includes('openings') || label.includes('开口')) return 'openings';
  if (normalized.includes('distinctivefeatures') || label.includes('显著特征')) return 'distinctive_features';
  if (normalized.includes('count') || label.includes('数量')) return 'count';
  if (normalized.includes('position') || label.includes('位置')) return 'position';
  if (normalized.includes('text') || label.includes('文本')) return 'text';
  if (normalized.includes('shape') || label.includes('形状')) return 'shape';
  if (normalized.includes('area') || label.includes('区域')) return 'area';

  return normalized;
};

const shouldHideFingerprintField = (label: string) => {
  const kind = getFingerprintFieldKind(label);
  return (
    kind === 'internal_id' ||
    kind === 'internal_hex' ||
    kind === 'internal_flag' ||
    kind === 'internal_confidence' ||
    kind === 'internal_checklist'
  );
};

const getFingerprintSectionEntries = (source: any, allowedKinds: string[]) => {
  if (!source || typeof source !== 'object') {
    return [];
  }

  return Object.entries(source).filter(([key]) => allowedKinds.includes(getFingerprintFieldKind(key)));
};

const getFingerprintValueByKind = (source: any, kind: string): any => {
  if (!source || typeof source !== 'object') {
    return undefined;
  }

  const entry = Object.entries(source).find(([key]) => getFingerprintFieldKind(key) === kind);
  return entry ? entry[1] : undefined;
};

const toFingerprintTextList = (value: any): string[] => {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map(item => String(item).trim()).filter(Boolean);
  }

  return [String(value).trim()].filter(Boolean);
};

const FINGERPRINT_DISPLAY_TERM_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bprimary\b/gi, '主要'],
  [/\bsecondary\b/gi, '次要'],
  [/\baccent\b/gi, '点缀'],
  [/\bfront\b/gi, '前侧'],
  [/\bback\b/gi, '后侧'],
  [/\bleft\b/gi, '左侧'],
  [/\bright\b/gi, '右侧'],
  [/\btop\b/gi, '顶部'],
  [/\bbottom\b/gi, '底部'],
  [/\bcenter\b/gi, '中心'],
  [/\bmiddle\b/gi, '中部'],
  [/\bmatte\b/gi, '哑光'],
  [/\bglossy\b/gi, '亮面'],
  [/\bpolished\b/gi, '抛光'],
  [/\bbrushed\b/gi, '拉丝'],
  [/\bmetal\b/gi, '金属'],
  [/\bplastic\b/gi, '塑料'],
  [/\bwood(?:en)?\b/gi, '木质'],
  [/\bglass\b/gi, '玻璃'],
  [/\bceramic\b/gi, '陶瓷'],
  [/\bfabric\b/gi, '布艺'],
  [/\bleather\b/gi, '皮革'],
  [/\bindoor\b/gi, '室内'],
  [/\boutdoor\b/gi, '室外'],
  [/\bround\b/gi, '圆形'],
  [/\bsquare\b/gi, '方形'],
  [/\brectangular\b/gi, '矩形'],
  [/\boval\b/gi, '椭圆'],
  [/\bcylindrical\b/gi, '柱形'],
  [/\btransparent\b/gi, '透明'],
  [/\bwhite\b/gi, '白色'],
  [/\bblack\b/gi, '黑色'],
  [/\bgray\b/gi, '灰色'],
  [/\bgrey\b/gi, '灰色'],
  [/\bsilver\b/gi, '银色'],
  [/\bgold\b/gi, '金色'],
  [/\bred\b/gi, '红色'],
  [/\bblue\b/gi, '蓝色'],
  [/\bgreen\b/gi, '绿色'],
  [/\byellow\b/gi, '黄色'],
  [/\bbrown\b/gi, '棕色'],
  [/\bbeige\b/gi, '米色'],
  [/\bpink\b/gi, '粉色'],
  [/\bpurple\b/gi, '紫色'],
  [/\borange\b/gi, '橙色'],
  [/\bartificial\b/gi, '仿真'],
  [/\bpotted\b/gi, '盆栽'],
  [/\bpot\b/gi, '花盆'],
  [/\bplant\b/gi, '植物'],
  [/\btree\b/gi, '树'],
  [/\bleaf\b/gi, '叶片'],
  [/\bleaves\b/gi, '叶片'],
  [/\bbranch\b/gi, '枝干'],
  [/\bbranches\b/gi, '枝干'],
  [/\bolive\b/gi, '橄榄'],
  [/\bft\b/gi, '英尺'],
  [/\binches?\b/gi, '英寸'],
  [/\bcm\b/gi, '厘米'],
  [/\bmm\b/gi, '毫米'],
];

const sanitizeFingerprintDisplayText = (value: unknown): string => {
  if (value == null) {
    return '';
  }

  let text = String(value).trim();
  if (!text) {
    return '';
  }

  FINGERPRINT_DISPLAY_TERM_REPLACEMENTS.forEach(([pattern, replacement]) => {
    text = text.replace(pattern, replacement);
  });

  text = text
    .replace(/[A-Za-z]+(?:[A-Za-z0-9'".-]*[A-Za-z0-9])?/g, '')
    .replace(/\(\s*\)/g, '')
    .replace(/（\s*）/g, '')
    .replace(/\[\s*\]/g, '')
    .replace(/【\s*】/g, '')
    .replace(/\s*\/\s*/g, '、')
    .replace(/\s+/g, ' ')
    .replace(/\s*([，。；：、])/g, '$1')
    .replace(/([（(【\[])\s+/g, '$1')
    .replace(/\s+([）)】\]])/g, '$1')
    .replace(/([，。；：、]){2,}/g, '$1')
    .replace(/[，、；：\-\s]+(?=[，。；：、）)】\]]|$)/g, '')
    .replace(/^[，、；：\-\s]+|[，、；：\-\s]+$/g, '')
    .trim();

  return /[\u4e00-\u9fff0-9]/u.test(text) ? text : '';
};

const getFingerprintDisplayValueByKind = (source: any, kind: string): string =>
  sanitizeFingerprintDisplayText(getFingerprintValueByKind(source, kind));

const toFingerprintDisplayTextList = (value: any): string[] =>
  toFingerprintTextList(value)
    .map(item => sanitizeFingerprintDisplayText(item))
    .filter(Boolean);

const buildFingerprintTextDraft = (source: any): FingerprintTextDraft => {
  const category = getFingerprintDisplayValueByKind(source, 'category');
  const productSummary = getFingerprintDisplayValueByKind(source, 'product_summary');
  const colors = getFingerprintValueByKind(source, 'colors');
  const materials = getFingerprintValueByKind(source, 'materials');
  const structure = getFingerprintValueByKind(source, 'structure');
  const accessories = getFingerprintValueByKind(source, 'accessories');
  const logo = getFingerprintValueByKind(source, 'logo');
  const forbiddenChanges = getFingerprintValueByKind(source, 'forbidden_changes');

  const descriptionLines = [
    category ? `类目：${category}` : '',
    productSummary ? `产品描述：${productSummary}` : '',
  ].filter(Boolean);

  const colorSummary = Array.isArray(colors)
    ? colors
        .map(item => {
          const name = getFingerprintDisplayValueByKind(item, 'name');
          const area = getFingerprintDisplayValueByKind(item, 'area');
          return [name, area].filter(Boolean).join(' / ');
        })
        .filter(Boolean)
        .join('；')
    : '';

  const materialSummary = Array.isArray(materials)
    ? materials
        .map(item => {
          const name = getFingerprintDisplayValueByKind(item, 'name');
          const location = getFingerprintDisplayValueByKind(item, 'location');
          const finish = getFingerprintDisplayValueByKind(item, 'finish');
          return [name, location, finish].filter(Boolean).join(' / ');
        })
        .filter(Boolean)
        .join('；')
    : '';

  const structureLines = [
    getFingerprintDisplayValueByKind(structure, 'overall_shape') ? `整体：${getFingerprintDisplayValueByKind(structure, 'overall_shape')}` : '',
    toFingerprintDisplayTextList(getFingerprintValueByKind(structure, 'key_parts')).length
      ? `关键部件：${toFingerprintDisplayTextList(getFingerprintValueByKind(structure, 'key_parts')).join('、')}`
      : '',
    getFingerprintDisplayValueByKind(structure, 'proportions') ? `比例：${getFingerprintDisplayValueByKind(structure, 'proportions')}` : '',
    toFingerprintDisplayTextList(getFingerprintValueByKind(structure, 'distinctive_features')).length
      ? `显著特征：${toFingerprintDisplayTextList(getFingerprintValueByKind(structure, 'distinctive_features')).join('、')}`
      : '',
  ].filter(Boolean).join('；');

  const accessorySummary = Array.isArray(accessories)
    ? accessories
        .map(item => {
          const count = getFingerprintValueByKind(item, 'count');
          const name = getFingerprintDisplayValueByKind(item, 'name');
          const position = getFingerprintDisplayValueByKind(item, 'position') || getFingerprintDisplayValueByKind(item, 'location');
          return [count ? `${count}个` : '', name, position ? `位置：${position}` : ''].filter(Boolean).join(' ');
        })
        .filter(Boolean)
        .join('；')
    : '';

  const logoText = logo && typeof logo === 'object'
    ? [
        getFingerprintDisplayValueByKind(logo, 'text') ? `文本：${getFingerprintDisplayValueByKind(logo, 'text')}` : '',
        getFingerprintDisplayValueByKind(logo, 'position') ? `位置：${getFingerprintDisplayValueByKind(logo, 'position')}` : '',
        getFingerprintDisplayValueByKind(logo, 'shape') ? `形状：${getFingerprintDisplayValueByKind(logo, 'shape')}` : '',
      ].filter(Boolean).join('；')
    : '';

  const extractedFeatureLines = [
    colorSummary ? `颜色：${colorSummary}` : '',
    materialSummary ? `材质：${materialSummary}` : '',
    structureLines ? `结构：${structureLines}` : '',
    accessorySummary ? `配件：${accessorySummary}` : '',
    logoText ? `标识：${logoText}` : '',
  ].filter(Boolean);

  const fingerprintLines = toFingerprintDisplayTextList(forbiddenChanges).map(item => `- ${item}`);

  return {
    productDescription: descriptionLines.join('\n'),
    extractedFeatures: extractedFeatureLines.join('\n'),
    productFingerprint: fingerprintLines.join('\n'),
  };
};

const joinNaturalList = (items: string[], delimiter: string = '、') =>
  items.filter(Boolean).join(delimiter);

const toNaturalSentence = (text: string, ending: string = '。') => {
  const trimmed = text.trim().replace(/[。；;，,\s]+$/u, '');
  return trimmed ? `${trimmed}${ending}` : '';
};

const buildReadableFingerprintTextDraft = (source: any): FingerprintTextDraft => {
  const legacyDraft = buildFingerprintTextDraft(source);
  const category = getFingerprintDisplayValueByKind(source, 'category');
  const productSummary = getFingerprintDisplayValueByKind(source, 'product_summary');
  const colors = getFingerprintValueByKind(source, 'colors');
  const materials = getFingerprintValueByKind(source, 'materials');
  const structure = getFingerprintValueByKind(source, 'structure');
  const accessories = getFingerprintValueByKind(source, 'accessories');
  const logo = getFingerprintValueByKind(source, 'logo');
  const forbiddenChanges = getFingerprintValueByKind(source, 'forbidden_changes');

  const descriptionParts = [
    productSummary ? toNaturalSentence(String(productSummary)) : '',
    category ? `当前归类为${category}。` : '',
  ].filter(Boolean);

  const colorSummary = Array.isArray(colors)
    ? colors
        .map(item => {
          const name = getFingerprintDisplayValueByKind(item, 'name');
          const area = getFingerprintValueByKind(item, 'area');

          if (!name) {
            return '';
          }

          if (area === 'primary' || area === '主要') return `${name}为主色`;
          if (area === 'secondary' || area === '次要') return `${name}为辅助色`;
          if (area === 'accent' || area === '点缀') return `${name}为点缀色`;

          return String(name);
        })
        .filter(Boolean)
        .join('，')
    : '';

  const materialSummary = Array.isArray(materials)
    ? materials
        .map(item => {
          const name = getFingerprintDisplayValueByKind(item, 'name');
          const location = getFingerprintDisplayValueByKind(item, 'location');
          const finish = getFingerprintDisplayValueByKind(item, 'finish');
          const parts = [name, location, finish].filter(Boolean);
          return parts.length ? parts.join('、') : '';
        })
        .filter(Boolean)
        .join('；')
    : '';

  const structureSummary = [
    getFingerprintDisplayValueByKind(structure, 'overall_shape')
      ? `整体外观为${getFingerprintDisplayValueByKind(structure, 'overall_shape')}`
      : '',
    toFingerprintDisplayTextList(getFingerprintValueByKind(structure, 'key_parts')).length
      ? `关键部分包括${joinNaturalList(toFingerprintDisplayTextList(getFingerprintValueByKind(structure, 'key_parts')))}`
      : '',
    getFingerprintDisplayValueByKind(structure, 'proportions')
      ? `比例表现为${getFingerprintDisplayValueByKind(structure, 'proportions')}`
      : '',
    toFingerprintDisplayTextList(getFingerprintValueByKind(structure, 'visible_controls')).length
      ? `可见细节有${joinNaturalList(toFingerprintDisplayTextList(getFingerprintValueByKind(structure, 'visible_controls')))}`
      : '',
    toFingerprintDisplayTextList(getFingerprintValueByKind(structure, 'openings')).length
      ? `开口或连接位置为${joinNaturalList(toFingerprintDisplayTextList(getFingerprintValueByKind(structure, 'openings')))}`
      : '',
    toFingerprintDisplayTextList(getFingerprintValueByKind(structure, 'distinctive_features')).length
      ? `显著特征有${joinNaturalList(toFingerprintDisplayTextList(getFingerprintValueByKind(structure, 'distinctive_features')))}`
      : '',
  ].filter(Boolean).join('，');

  const accessorySummary = Array.isArray(accessories)
    ? accessories
        .map(item => {
          const count = getFingerprintValueByKind(item, 'count');
          const name = getFingerprintDisplayValueByKind(item, 'name');
          const position = getFingerprintDisplayValueByKind(item, 'position') || getFingerprintDisplayValueByKind(item, 'location');

          if (!name) {
            return '';
          }

          const countText = count ? `${count}个` : '';
          const positionText = position ? `位于${position}` : '';
          return [countText, name, positionText].filter(Boolean).join('');
        })
        .filter(Boolean)
        .join('；')
    : '';

  const logoSummary = logo && typeof logo === 'object'
    ? [
        getFingerprintDisplayValueByKind(logo, 'text') ? `文字为${getFingerprintDisplayValueByKind(logo, 'text')}` : '',
        getFingerprintDisplayValueByKind(logo, 'position') ? `位置在${getFingerprintDisplayValueByKind(logo, 'position')}` : '',
        getFingerprintDisplayValueByKind(logo, 'shape') ? `形态为${getFingerprintDisplayValueByKind(logo, 'shape')}` : '',
      ].filter(Boolean).join('，')
    : '';

  const extractedFeatures = [
    colorSummary ? `颜色上${colorSummary}` : '',
    materialSummary ? `材质上可见${materialSummary}` : '',
    structureSummary,
    accessorySummary ? `配件包括${accessorySummary}` : '',
    logoSummary ? `标识特征为${logoSummary}` : '',
  ]
    .filter(Boolean)
    .map(item => toNaturalSentence(item))
    .join('\n');

  const fingerprintItems = toFingerprintDisplayTextList(forbiddenChanges);

  return {
    productDescription: descriptionParts.join('\n') || legacyDraft.productDescription,
    extractedFeatures: extractedFeatures || legacyDraft.extractedFeatures,
    productFingerprint: fingerprintItems.length
      ? `生成时必须保持${joinNaturalList(fingerprintItems)}等关键特征一致。`
      : legacyDraft.productFingerprint,
  };
};

const mergeFingerprintTextDraft = (
  primaryDraft: FingerprintTextDraft,
  fallbackDraft?: FingerprintTextDraft | null,
): FingerprintTextDraft => {
  if (!fallbackDraft) {
    return primaryDraft;
  }

  return {
    productDescription: primaryDraft.productDescription.trim() || fallbackDraft.productDescription.trim(),
    extractedFeatures: primaryDraft.extractedFeatures.trim() || fallbackDraft.extractedFeatures.trim(),
    productFingerprint: primaryDraft.productFingerprint.trim() || fallbackDraft.productFingerprint.trim(),
  };
};

const buildFingerprintEditorDraft = (
  primarySource: any,
  fallbackSource?: any,
): FingerprintTextDraft => {
  const primaryDraft = buildReadableFingerprintTextDraft(primarySource);
  const fallbackDraft = fallbackSource ? buildReadableFingerprintTextDraft(fallbackSource) : null;
  return mergeFingerprintTextDraft(primaryDraft, fallbackDraft);
};

const buildCombinedFingerprintEditorText = (draft: FingerprintTextDraft) =>
  FINGERPRINT_EDITOR_SECTIONS
    .map(section => `${section.title}\n${(draft[section.key] || '').trim()}`)
    .join('\n\n')
    .trim();

const isFingerprintTextDraftEmpty = (draft: FingerprintTextDraft | null | undefined) =>
  !draft || FINGERPRINT_EDITOR_SECTIONS.every(section => !(draft[section.key] || '').trim());

const resolveFingerprintDisplaySource = (...candidates: any[]) => {
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') {
      continue;
    }

    const draft = buildFingerprintEditorDraft(candidate);
    if (!isFingerprintTextDraftEmpty(draft)) {
      return candidate;
    }
  }

  return null;
};

const parseCombinedFingerprintEditorText = (
  combinedText: string,
  fallbackDraft: FingerprintTextDraft
): FingerprintTextDraft => {
  const normalized = combinedText.replace(/\r\n?/g, '\n').trim();
  if (!normalized) {
    return {
      productDescription: '',
      extractedFeatures: '',
      productFingerprint: '',
    };
  }

  const markerPattern = /(产品描述|提取特征|产品指纹)\s*\n/g;
  const matches = Array.from(normalized.matchAll(markerPattern));

  if (matches.length === 0) {
    return {
      ...fallbackDraft,
      extractedFeatures: normalized,
    };
  }

  const nextDraft = { ...fallbackDraft };

  matches.forEach((match, index) => {
    const title = match[1];
    const start = (match.index ?? 0) + match[0].length;
    const end = index + 1 < matches.length ? (matches[index + 1].index ?? normalized.length) : normalized.length;
    const content = normalized.slice(start, end).trim();
    const section = FINGERPRINT_EDITOR_SECTIONS.find(item => item.title === title);

    if (section) {
      nextDraft[section.key] = content;
    }
  });

  return nextDraft;
};

// Optimized Select Component
export default function App({
  entryMode,
  onNavigateEntry,
  workspaceHeaderActions,
  workspaceSidebarFooter,
}: AppProps) {
  const workspaceMode: WorkspaceMode =
    entryMode === 'home'
      ? 'home'
      : entryMode === 'favorites'
        ? 'favorites'
        : entryMode === 'history'
          ? 'history'
          : entryMode === 'detail'
            ? 'detail_set'
            : entryMode === 'single' || entryMode === 'batch'
              ? 'studio'
              : 'placeholder';
  const studioMode: StudioMode = entryMode === 'batch' ? 'batch' : 'single';
  const placeholderMode: PlaceholderWorkspaceKey | null =
    workspaceMode === 'placeholder'
      ? (entryMode as PlaceholderWorkspaceKey)
      : null;
  const [productImage, setProductImage] = useState<{ file: File, dataUrl: string, base64: { data: string, mimeType: string } } | null>(null);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [referenceImage, setReferenceImage] = useState<{ file: File, dataUrl: string, base64: { data: string, mimeType: string } } | null>(null);
  const [singleGen, setSingleGen] = useState(singleGenInitialState);
  const [singleGeneratePhase, setSingleGeneratePhase] = useState<SingleGeneratePhase>('idle');
  const [rows, setRows] = useState<ExcelRow[]>([]);
  const [batchRowPendingActions, setBatchRowPendingActions] = useState<Record<string, BatchRowPendingAction>>({});
  const rowsRef = useRef<ExcelRow[]>([]);
  const singleGenRef = useRef(singleGenInitialState);
  
  // Keep ref in sync with state
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    singleGenRef.current = singleGen;
  }, [singleGen]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isTranslatingEdits, setIsTranslatingEdits] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<string>('1K');
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);
  const [selectedHomeMedia, setSelectedHomeMedia] = useState<HomeMediaItem | null>(null);
  const [favoriteHomeMediaIds, setFavoriteHomeMediaIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') {
      return [];
    }

    try {
      const rawValue = window.localStorage.getItem(HOME_MEDIA_FAVORITES_STORAGE_KEY);
      if (!rawValue) {
        return [];
      }

      const parsedValue = JSON.parse(rawValue);
      return Array.isArray(parsedValue)
        ? parsedValue.filter((item): item is string => typeof item === 'string')
        : [];
    } catch {
      return [];
    }
  });
  const [detailSetProductImages, setDetailSetProductImages] = useState<UploadedImageAsset[]>([]);
  
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      HOME_MEDIA_FAVORITES_STORAGE_KEY,
      JSON.stringify(favoriteHomeMediaIds)
    );
  }, [favoriteHomeMediaIds]);

  useEffect(() => {
    setSelectedHomeMedia(null);
  }, [entryMode]);
  const [detailSetFingerprint, setDetailSetFingerprint] = useState<ProductFingerprint | null>(null);
  const [detailSet, setDetailSet] = useState(detailSetInitialState);
  const [isGeneratingDetailSetGlobalPrompt, setIsGeneratingDetailSetGlobalPrompt] = useState(false);
  const [detailItemPendingActions, setDetailItemPendingActions] = useState<Record<string, DetailItemPendingAction>>({});
  const [isStudioProductDragActive, setIsStudioProductDragActive] = useState(false);
  const [isStudioStep2DragActive, setIsStudioStep2DragActive] = useState(false);
  const [isSubjectReferenceDragActive, setIsSubjectReferenceDragActive] = useState(false);

  // Premium Mode State (Now Default)
  const [productFingerprint, setProductFingerprint] = useState<ProductFingerprint | null>(null);
  const [productFingerprintZh, setProductFingerprintZh] = useState<any | null>(null);
  const [draftFingerprintZh, setDraftFingerprintZh] = useState<any | null>(null);
  const [fingerprintTextDraft, setFingerprintTextDraft] = useState<FingerprintTextDraft | null>(null);
  const [fingerprintStatus, setFingerprintStatus] = useState<'idle' | 'analyzing' | 'ready' | 'error'>('idle');
  const [fingerprintError, setFingerprintError] = useState<string | null>(null);
  const [fingerprintEditorError, setFingerprintEditorError] = useState<string | null>(null);
  const [isSavingFingerprintDraft, setIsSavingFingerprintDraft] = useState(false);
  const [isFingerprintDirty, setIsFingerprintDirty] = useState<boolean>(false);
  const [verificationMap, setVerificationMap] = useState<Map<string, VerificationResult>>(new Map());
  const [subjectReferenceImages, setSubjectReferenceImages] = useState<{ file: File, dataUrl: string, base64: { data: string, mimeType: string } }[]>([]);
  const usedDownloadNamesRef = useRef<Set<string>>(new Set());

  const productInputRef = useRef<HTMLInputElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);
  const subjectReferenceInputRef = useRef<HTMLInputElement>(null);
  const detailSetProductInputRef = useRef<HTMLInputElement>(null);
  const singlePromptOptionsCacheRef = useRef<{ key: string; prepared: BuildPromptOptions } | null>(null);
  const studioIdentityProfileCacheRef = useRef<{ key: string; profile: ProductIdentityProfile | null } | null>(null);
  const studioIdentityProfilePromiseRef = useRef<{ key: string; promise: Promise<ProductIdentityProfile | null> } | null>(null);
  const batchFingerprintRefreshPromiseRef = useRef<Promise<ProductFingerprint> | null>(null);
  const studioWorkflowVersionRef = useRef(0);
  const detailWorkflowVersionRef = useRef(0);
  const studioFingerprintRequestIdRef = useRef<string | null>(null);
  const detailFingerprintRequestIdRef = useRef<string | null>(null);
  const singleGenerateRequestIdRef = useRef<string | null>(null);
  const batchGenerationRequestIdRef = useRef<string | null>(null);
  const singleImageRequestIdsRef = useRef<Map<number, string>>(new Map());
  const rowRequestIdsRef = useRef<Map<string, string>>(new Map());
  const detailSetGenerationRequestIdRef = useRef<string | null>(null);
  const detailItemRequestIdsRef = useRef<Map<string, string>>(new Map());
  const studioFingerprintAbortControllerRef = useRef<AbortController | null>(null);
  const detailFingerprintAbortControllerRef = useRef<AbortController | null>(null);
  const singleGenerateAbortControllerRef = useRef<AbortController | null>(null);
  const batchGenerationAbortControllerRef = useRef<AbortController | null>(null);
  const singleImageAbortControllersRef = useRef<Map<number, AbortController>>(new Map());
  const rowAbortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const detailSetGenerationAbortControllerRef = useRef<AbortController | null>(null);
  const detailSetGlobalPromptAbortControllerRef = useRef<AbortController | null>(null);
  const detailItemAbortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const generationHistoryQueueRef = useRef<Promise<void>>(Promise.resolve());
  const productImageRef = useRef<typeof productImage>(null);
  const referenceImageRef = useRef<typeof referenceImage>(null);
  const subjectReferenceImagesRef = useRef<typeof subjectReferenceImages>([]);
  const detailSetProductImagesRef = useRef<typeof detailSetProductImages>([]);
  const previousStudioModeRef = useRef<StudioMode>(studioMode);

  const abortControllerIfNeeded = (controller: AbortController | null | undefined) => {
    if (!controller || controller.signal.aborted) {
      return;
    }
    controller.abort();
  };

  const abortControllerMap = (controllers: Map<number | string, AbortController>) => {
    controllers.forEach(controller => {
      abortControllerIfNeeded(controller);
    });
    controllers.clear();
  };

  useEffect(() => {
    productImageRef.current = productImage;
  }, [productImage]);

  useEffect(() => {
    referenceImageRef.current = referenceImage;
  }, [referenceImage]);

  useEffect(() => {
    subjectReferenceImagesRef.current = subjectReferenceImages;
  }, [subjectReferenceImages]);

  useEffect(() => {
    detailSetProductImagesRef.current = detailSetProductImages;
  }, [detailSetProductImages]);

  useEffect(
    () => () => {
      studioWorkflowVersionRef.current += 1;
      detailWorkflowVersionRef.current += 1;
      studioFingerprintRequestIdRef.current = null;
      detailFingerprintRequestIdRef.current = null;
      singleGenerateRequestIdRef.current = null;
      batchGenerationRequestIdRef.current = null;
      detailSetGenerationRequestIdRef.current = null;
      detailItemRequestIdsRef.current.clear();
      singleImageRequestIdsRef.current.clear();
      rowRequestIdsRef.current.clear();
      abortControllerIfNeeded(studioFingerprintAbortControllerRef.current);
      abortControllerIfNeeded(detailFingerprintAbortControllerRef.current);
      abortControllerIfNeeded(singleGenerateAbortControllerRef.current);
      abortControllerIfNeeded(batchGenerationAbortControllerRef.current);
      abortControllerIfNeeded(detailSetGenerationAbortControllerRef.current);
      abortControllerIfNeeded(detailSetGlobalPromptAbortControllerRef.current);
      abortControllerMap(singleImageAbortControllersRef.current);
      abortControllerMap(rowAbortControllersRef.current);
      abortControllerMap(detailItemAbortControllersRef.current);
      revokeObjectUrlIfNeeded(productImageRef.current?.dataUrl);
      revokeObjectUrlIfNeeded(referenceImageRef.current?.dataUrl);
      subjectReferenceImagesRef.current.forEach(image => revokeObjectUrlIfNeeded(image.dataUrl));
      detailSetProductImagesRef.current.forEach(image => revokeObjectUrlIfNeeded(image.dataUrl));
    },
    [],
  );

  const clearVerificationEntries = (keys: string[]) => {
    if (keys.length === 0) {
      return;
    }

    setVerificationMap(prev => {
      const next = new Map(prev);
      let changed = false;

      keys.forEach(key => {
        if (next.delete(key)) {
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  };

  const recordGenerationHistory = async (
    imageUrl: string,
    sourceType: GenerationHistorySourceType,
  ) => {
    try {
      const previewUrl = await createGenerationHistoryPreviewDataUrl(imageUrl);
      await apiPost('/api/user/generation-history', {
        previewUrl,
        sourceType,
      });
    } catch (historyError) {
      console.warn('Failed to record generation history:', historyError);
    }
  };

  const queueGenerationHistoryRecords = (
    imageUrls: Array<string | null | undefined>,
    sourceType: GenerationHistorySourceType,
  ) => {
    const uniqueUrls = Array.from(
      new Set(
        imageUrls
          .map(item => String(item || '').trim())
          .filter(Boolean),
      ),
    );

    uniqueUrls.forEach(imageUrl => {
      generationHistoryQueueRef.current = generationHistoryQueueRef.current
        .catch(() => undefined)
        .then(() => recordGenerationHistory(imageUrl, sourceType));
    });
  };

  const invalidateStudioWorkflowRequests = () => {
    studioWorkflowVersionRef.current += 1;
    abortControllerIfNeeded(studioFingerprintAbortControllerRef.current);
    abortControllerIfNeeded(singleGenerateAbortControllerRef.current);
    abortControllerIfNeeded(batchGenerationAbortControllerRef.current);
    abortControllerMap(singleImageAbortControllersRef.current);
    abortControllerMap(rowAbortControllersRef.current);
    studioFingerprintRequestIdRef.current = null;
    singleGenerateRequestIdRef.current = null;
    batchGenerationRequestIdRef.current = null;
    batchFingerprintRefreshPromiseRef.current = null;
    singleImageRequestIdsRef.current.clear();
    rowRequestIdsRef.current.clear();
    singlePromptOptionsCacheRef.current = null;
    studioIdentityProfileCacheRef.current = null;
    studioIdentityProfilePromiseRef.current = null;
    return studioWorkflowVersionRef.current;
  };

  const invalidateDetailWorkflowRequests = () => {
    detailWorkflowVersionRef.current += 1;
    abortControllerIfNeeded(detailFingerprintAbortControllerRef.current);
    abortControllerIfNeeded(detailSetGenerationAbortControllerRef.current);
    abortControllerIfNeeded(detailSetGlobalPromptAbortControllerRef.current);
    abortControllerMap(detailItemAbortControllersRef.current);
    detailFingerprintRequestIdRef.current = null;
    detailSetGenerationRequestIdRef.current = null;
    detailItemRequestIdsRef.current.clear();
    return detailWorkflowVersionRef.current;
  };

  const isStudioWorkflowCurrent = (workflowVersion: number) =>
    studioWorkflowVersionRef.current === workflowVersion;

  const isDetailWorkflowCurrent = (workflowVersion: number) =>
    detailWorkflowVersionRef.current === workflowVersion;

  const startStudioFingerprintRequest = () => {
    abortControllerIfNeeded(studioFingerprintAbortControllerRef.current);
    const controller = new AbortController();
    const requestId = uuidv4();
    studioFingerprintRequestIdRef.current = requestId;
    studioFingerprintAbortControllerRef.current = controller;
    return { requestId, workflowVersion: studioWorkflowVersionRef.current, controller };
  };

  const isStudioFingerprintRequestCurrent = (requestId: string, workflowVersion: number) =>
    studioFingerprintRequestIdRef.current === requestId && isStudioWorkflowCurrent(workflowVersion);

  const startDetailFingerprintRequest = () => {
    abortControllerIfNeeded(detailFingerprintAbortControllerRef.current);
    const controller = new AbortController();
    const requestId = uuidv4();
    detailFingerprintRequestIdRef.current = requestId;
    detailFingerprintAbortControllerRef.current = controller;
    return { requestId, workflowVersion: detailWorkflowVersionRef.current, controller };
  };

  const isDetailFingerprintRequestCurrent = (requestId: string, workflowVersion: number) =>
    detailFingerprintRequestIdRef.current === requestId && isDetailWorkflowCurrent(workflowVersion);

  const startSingleGenerateRequest = () => {
    abortControllerIfNeeded(singleGenerateAbortControllerRef.current);
    abortControllerMap(singleImageAbortControllersRef.current);
    const controller = new AbortController();
    const requestId = uuidv4();
    singleGenerateRequestIdRef.current = requestId;
    singleImageRequestIdsRef.current.clear();
    singleGenerateAbortControllerRef.current = controller;
    return { requestId, workflowVersion: studioWorkflowVersionRef.current, controller };
  };

  const isSingleGenerateRequestCurrent = (requestId: string, workflowVersion: number) =>
    singleGenerateRequestIdRef.current === requestId && isStudioWorkflowCurrent(workflowVersion);

  const startSingleImageRequest = (index: number) => {
    abortControllerIfNeeded(singleImageAbortControllersRef.current.get(index));
    const controller = new AbortController();
    const requestId = uuidv4();
    singleImageRequestIdsRef.current.set(index, requestId);
    singleImageAbortControllersRef.current.set(index, controller);
    return { requestId, workflowVersion: studioWorkflowVersionRef.current, controller };
  };

  const isSingleImageRequestCurrent = (index: number, requestId: string, workflowVersion: number) =>
    singleImageRequestIdsRef.current.get(index) === requestId && isStudioWorkflowCurrent(workflowVersion);

  const startBatchGenerationRequest = () => {
    abortControllerIfNeeded(batchGenerationAbortControllerRef.current);
    abortControllerMap(rowAbortControllersRef.current);
    const controller = new AbortController();
    const requestId = uuidv4();
    batchGenerationRequestIdRef.current = requestId;
    rowRequestIdsRef.current.clear();
    batchGenerationAbortControllerRef.current = controller;
    return { requestId, workflowVersion: studioWorkflowVersionRef.current, controller };
  };

  const isBatchGenerationRequestCurrent = (requestId: string, workflowVersion: number) =>
    batchGenerationRequestIdRef.current === requestId && isStudioWorkflowCurrent(workflowVersion);

  const startRowRequest = (rowId: string) => {
    abortControllerIfNeeded(rowAbortControllersRef.current.get(rowId));
    const controller = new AbortController();
    const requestId = uuidv4();
    rowRequestIdsRef.current.set(rowId, requestId);
    rowAbortControllersRef.current.set(rowId, controller);
    return { requestId, workflowVersion: studioWorkflowVersionRef.current, controller };
  };

  const isRowRequestCurrent = (rowId: string, requestId: string, workflowVersion: number) =>
    rowRequestIdsRef.current.get(rowId) === requestId && isStudioWorkflowCurrent(workflowVersion);

  const startDetailSetGenerationRequest = () => {
    abortControllerIfNeeded(detailSetGenerationAbortControllerRef.current);
    abortControllerMap(detailItemAbortControllersRef.current);
    const controller = new AbortController();
    const requestId = uuidv4();
    detailSetGenerationRequestIdRef.current = requestId;
    detailItemRequestIdsRef.current.clear();
    detailSetGenerationAbortControllerRef.current = controller;
    return { requestId, workflowVersion: detailWorkflowVersionRef.current, controller };
  };

  const isDetailSetGenerationRequestCurrent = (requestId: string, workflowVersion: number) =>
    detailSetGenerationRequestIdRef.current === requestId && isDetailWorkflowCurrent(workflowVersion);

  const startDetailItemRequest = (itemId: string) => {
    abortControllerIfNeeded(detailItemAbortControllersRef.current.get(itemId));
    const controller = new AbortController();
    const requestId = uuidv4();
    detailItemRequestIdsRef.current.set(itemId, requestId);
    detailItemAbortControllersRef.current.set(itemId, controller);
    return { requestId, workflowVersion: detailWorkflowVersionRef.current, controller };
  };

  const isDetailItemRequestCurrent = (itemId: string, requestId: string, workflowVersion: number) =>
    detailItemRequestIdsRef.current.get(itemId) === requestId && isDetailWorkflowCurrent(workflowVersion);

  const clearStudioPendingState = () => {
    setIsGenerating(false);
    setSingleGeneratePhase('idle');
    setBatchRowPendingActions({});
    const currentSingleGen = singleGenRef.current;
    if (currentSingleGen.status === 'generating' || currentSingleGen.regeneratingIndices.length > 0) {
      singleGenRef.current = {
        ...currentSingleGen,
        status:
          currentSingleGen.status === 'generating'
            ? (currentSingleGen.generatedImages.length > 0 ? 'success' : 'idle')
            : currentSingleGen.status,
        regeneratingIndices: [],
        regenerationStartedAt: {},
        regenerationTimeoutAt: {},
        regenerationKinds: {},
      };
    }

    setSingleGen(prev => {
      if (prev.status !== 'generating' && prev.regeneratingIndices.length === 0) {
        return prev;
      }

      return {
        ...prev,
        status:
          prev.status === 'generating'
            ? (prev.generatedImages.length > 0 ? 'success' : 'idle')
            : prev.status,
        regeneratingIndices: [],
        regenerationStartedAt: {},
        regenerationTimeoutAt: {},
        regenerationKinds: {},
      };
    });

    setRows(prev => prev.map(row =>
      row.status === 'generating'
        ? { ...row, status: row.generatedImage ? 'success' : 'pending', error: row.error }
        : row
    ));

    setFingerprintStatus(prev =>
      prev === 'analyzing'
        ? (productFingerprint ? 'ready' : 'idle')
        : prev
    );
  };

  const resetStudioWorkspaceState = () => {
    invalidateStudioWorkflowRequests();
    revokeObjectUrlIfNeeded(productImageRef.current?.dataUrl);
    revokeObjectUrlIfNeeded(referenceImageRef.current?.dataUrl);
    subjectReferenceImagesRef.current.forEach(image => revokeObjectUrlIfNeeded(image.dataUrl));

    productImageRef.current = null;
    referenceImageRef.current = null;
    subjectReferenceImagesRef.current = [];
    rowsRef.current = [];
    singleGenRef.current = singleGenInitialState;

    setProductImage(null);
    setExcelFile(null);
    setReferenceImage(null);
    setSingleGen(singleGenInitialState);
    setSingleGeneratePhase('idle');
    setRows([]);
    setBatchRowPendingActions({});
    setIsGenerating(false);
    setIsTranslatingEdits(false);
    setError(null);
    setImageSize('1K');
    setEnlargedImage(null);
    setVerificationMap(new Map());
    setIsStudioProductDragActive(false);
    setIsStudioStep2DragActive(false);
    setIsSubjectReferenceDragActive(false);
    setProductFingerprint(null);
    setProductFingerprintZh(null);
    setDraftFingerprintZh(null);
    setFingerprintTextDraft(null);
    setFingerprintStatus('idle');
    setFingerprintError(null);
    setFingerprintEditorError(null);
    setIsSavingFingerprintDraft(false);
    setIsFingerprintDirty(false);
    setSubjectReferenceImages([]);

    if (productInputRef.current) {
      productInputRef.current.value = '';
    }
    if (excelInputRef.current) {
      excelInputRef.current.value = '';
    }
    if (subjectReferenceInputRef.current) {
      subjectReferenceInputRef.current.value = '';
    }
  };

  const invalidateStudioSupplementalImageContext = () => {
    invalidateStudioWorkflowRequests();
    clearStudioPendingState();
    setVerificationMap(new Map());
    setFingerprintError(null);
    setFingerprintEditorError(null);
    setFingerprintStatus(productFingerprint ? 'ready' : 'idle');
  };

  const clearDetailPendingState = () => {
    setDetailItemPendingActions({});
    setDetailSet(prev => {
      const nextGeneratedItems = prev.generatedItems.map(item =>
        item.status === 'generating'
          ? { ...item, status: item.generatedImage ? 'success' as const : 'pending' as const }
          : item
      );

      const hadPendingState =
        prev.status === 'analyzing' ||
        prev.status === 'planning' ||
        prev.status === 'generating' ||
        prev.generatedItems.some(item => item.status === 'generating');

      if (!hadPendingState) {
        return prev;
      }

      const hasResolvedItems = nextGeneratedItems.some(item => item.status === 'success' || item.status === 'error');
      return {
        ...prev,
        status: hasResolvedItems ? getDetailSetResolvedStatus(nextGeneratedItems) : 'idle',
        generatedItems: nextGeneratedItems,
        error: getDetailSetFailureMessage(nextGeneratedItems),
      };
    });
  };

  const processSubjectReferenceFiles = async (files: File[]) => {
    if (files.length === 0) return;
    const validImageFiles = files.filter(file => file.type.startsWith('image/'));
    if (validImageFiles.length > 0) {
      invalidateStudioSupplementalImageContext();
    }
    const newImages: UploadedImageAsset[] = [];
    for (const file of validImageFiles) {
      try {
        const asset = await readImageAssetFromFile(file);
        newImages.push(asset);
      } catch (err) {
        console.error('Error reading subject reference image:', err);
        setError(err instanceof Error ? err.message : '补充产品图读取失败，请重试。');
      }
    }

    if (newImages.length === 0) {
      setError('请上传有效的补充产品图片。');
      if (subjectReferenceInputRef.current) {
        subjectReferenceInputRef.current.value = '';
      }
      return;
    }

    setError(null);
    setSubjectReferenceImages(prev => [...prev, ...newImages]);
    setIsFingerprintDirty(true);
    if (subjectReferenceInputRef.current) {
      subjectReferenceInputRef.current.value = '';
    }
  };

  const handleSubjectReferenceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    await processSubjectReferenceFiles(files);
  };

  const removeSubjectReferenceImage = (index: number) => {
    if (!subjectReferenceImages[index]) {
      return;
    }

    invalidateStudioSupplementalImageContext();
    setSubjectReferenceImages(prev => {
      const newImages = [...prev];
      revokeObjectUrlIfNeeded(newImages[index]?.dataUrl);
      newImages.splice(index, 1);
      return newImages;
    });
    setIsFingerprintDirty(true);
  };

  const hasFingerprintDraftChanges =
    !!fingerprintTextDraft &&
    !!productFingerprintZh &&
    JSON.stringify(fingerprintTextDraft) !== JSON.stringify(buildFingerprintEditorDraft(productFingerprintZh, productFingerprint));

  const handleResetFingerprintDraft = () => {
    if (!productFingerprintZh && !productFingerprint) {
      return;
    }

    setDraftFingerprintZh(productFingerprintZh ? cloneJsonValue(productFingerprintZh) : null);
    setFingerprintTextDraft(buildFingerprintEditorDraft(productFingerprintZh, productFingerprint));
    setFingerprintEditorError(null);
  };

  const handleSaveFingerprintDraft = async () => {
    if (!fingerprintTextDraft || !productFingerprintZh || !productFingerprint || isSavingFingerprintDraft) {
      return;
    }

    try {
      setIsSavingFingerprintDraft(true);
      const updatedResult = await updateFingerprintFromTextDraft(
        fingerprintTextDraft,
        productFingerprint,
        productFingerprintZh
      );
      const updatedEnWithIds = addIdsToArrays(updatedResult.canonicalEn);
      const resolvedDisplaySource =
        resolveFingerprintDisplaySource(updatedResult.displayZh, productFingerprintZh, updatedResult.canonicalEn)
        ?? updatedResult.canonicalEn;
      const updatedZhWithIds = addIdsToArrays(resolvedDisplaySource);

      setProductFingerprint(updatedEnWithIds);
      setProductFingerprintZh(cloneJsonValue(updatedZhWithIds));
      setDraftFingerprintZh(cloneJsonValue(updatedZhWithIds));
      setFingerprintTextDraft(buildFingerprintEditorDraft(updatedZhWithIds, updatedEnWithIds));
      setFingerprintEditorError(null);
    } catch (err) {
      console.error('Failed to save fingerprint edits:', err);
      setFingerprintEditorError('保存修改失败，请重试。');
    } finally {
      setIsSavingFingerprintDraft(false);
    }
  };

  // Transition single generation from 'generated' to 'success' or 'needs_review'
  useEffect(() => {
    if (previousStudioModeRef.current === studioMode) {
      return;
    }

    previousStudioModeRef.current = studioMode;
    resetStudioWorkspaceState();
  }, [studioMode]);

  useEffect(() => {
    if (singleGen.status !== 'generating') {
      setSingleGeneratePhase('idle');
    }
  }, [singleGen.status]);

  useEffect(() => {
    if (singleGen.regeneratingIndices.length === 0) {
      return;
    }

    const buildSingleImageWatchdogError = (
      expiredIndices: number[],
      operationKinds: Record<number, SingleImageOperationKind>
    ) => {
      const groupedLabels = expiredIndices.reduce(
        (acc, index) => {
          const kind = operationKinds[index] || 'regenerate';
          acc[kind].push(index + 1);
          return acc;
        },
        {
          regenerate: [] as number[],
          local_edit: [] as number[],
        }
      );

      const messages: string[] = [];

      if (groupedLabels.regenerate.length > 0) {
        messages.push(
          `图片 ${groupedLabels.regenerate.join('、')} 的重新生成已超时或被中断，请重试。`
        );
      }

      if (groupedLabels.local_edit.length > 0) {
        messages.push(
          `图片 ${groupedLabels.local_edit.join('、')} 的局部补充修改已超时或被中断，请简化要求后重试。`
        );
      }

      return messages.join(' ');
    };

    const intervalId = window.setInterval(() => {
      const currentSingleGen = singleGenRef.current;
      const now = Date.now();
      const expiredIndices = currentSingleGen.regeneratingIndices.filter(index => {
        const timeoutAt = currentSingleGen.regenerationTimeoutAt[index];
        const startedAt = currentSingleGen.regenerationStartedAt[index];

        if (timeoutAt) {
          return now > timeoutAt;
        }

        return startedAt && now - startedAt > SINGLE_IMAGE_REGENERATION_WATCHDOG_MS;
      });

      if (expiredIndices.length === 0) {
        return;
      }

      console.warn('[single-operation] watchdog expired', {
        expiredIndices: expiredIndices.map(index => ({
          index,
          imageNumber: index + 1,
          operationKind: currentSingleGen.regenerationKinds[index] || 'regenerate',
          startedAt: currentSingleGen.regenerationStartedAt[index] || null,
          timeoutAt: currentSingleGen.regenerationTimeoutAt[index] || null,
        })),
      });

      const nextStartedAt = { ...currentSingleGen.regenerationStartedAt };
      const nextTimeoutAt = { ...currentSingleGen.regenerationTimeoutAt };
      const nextKinds = { ...currentSingleGen.regenerationKinds };
      expiredIndices.forEach(index => {
        delete nextStartedAt[index];
        delete nextTimeoutAt[index];
        delete nextKinds[index];
      });

      singleGenRef.current = {
        ...currentSingleGen,
        regeneratingIndices: currentSingleGen.regeneratingIndices.filter(index => !expiredIndices.includes(index)),
        regenerationStartedAt: nextStartedAt,
        regenerationTimeoutAt: nextTimeoutAt,
        regenerationKinds: nextKinds,
      };

      setSingleGen(prev => {
        const nextStartedAt = { ...prev.regenerationStartedAt };
        const nextTimeoutAt = { ...prev.regenerationTimeoutAt };
        const nextKinds = { ...prev.regenerationKinds };
        expiredIndices.forEach(index => {
          delete nextStartedAt[index];
          delete nextTimeoutAt[index];
          delete nextKinds[index];
        });

        return {
          ...prev,
          regeneratingIndices: prev.regeneratingIndices.filter(index => !expiredIndices.includes(index)),
          regenerationStartedAt: nextStartedAt,
          regenerationTimeoutAt: nextTimeoutAt,
          regenerationKinds: nextKinds,
        };
      });

      setSingleGen(prev => ({
        ...prev,
        error: buildSingleImageWatchdogError(expiredIndices, currentSingleGen.regenerationKinds),
      }));
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [singleGen.regeneratingIndices, singleGen.regenerationStartedAt, singleGen.regenerationTimeoutAt]);

  const extractProductFingerprintFn = async (): Promise<ProductFingerprint> => {
    if (!productImage) throw new Error('请先上传产品图后再提取特征。');
    const { requestId, workflowVersion, controller } = startStudioFingerprintRequest();
    setFingerprintStatus('analyzing');
    setFingerprintError(null);
    setFingerprintEditorError(null);
    try {
      const supplementalBase64 = subjectReferenceImages.map(img => img.base64);
      const { canonicalEn, displayZh } = await analyzeProductFingerprintWithAbort(
        productImage.base64,
        supplementalBase64,
        controller.signal,
      );
      const canonicalEnWithIds = addIdsToArrays(canonicalEn);
      const resolvedDisplaySource = resolveFingerprintDisplaySource(displayZh, canonicalEn) ?? canonicalEn;
      const displayZhWithIds = addIdsToArrays(resolvedDisplaySource);

      if (!isStudioFingerprintRequestCurrent(requestId, workflowVersion)) {
        return canonicalEnWithIds;
      }

      setProductFingerprint(canonicalEnWithIds);
      setProductFingerprintZh(cloneJsonValue(displayZhWithIds));
      setDraftFingerprintZh(cloneJsonValue(displayZhWithIds));
      setFingerprintTextDraft(buildFingerprintEditorDraft(displayZhWithIds, canonicalEnWithIds));
      setFingerprintStatus('ready');
      setIsFingerprintDirty(false);
      return canonicalEnWithIds;
    } catch (err: any) {
      if (!isStudioFingerprintRequestCurrent(requestId, workflowVersion)) {
        throw err;
      }
      console.error("Fingerprint analysis failed:", err);
      setFingerprintError(err.message || "产品特征提取失败，请重试。");
      setFingerprintStatus('error');
      throw err;
    }
  };

  const ensureStudioFingerprintReadyForBatch = async (): Promise<ProductFingerprint> => {
    if (productFingerprint && !isFingerprintDirty) {
      return productFingerprint;
    }

    if (!productImage) {
      throw new Error('请先上传产品图。');
    }

    if (batchFingerprintRefreshPromiseRef.current) {
      return batchFingerprintRefreshPromiseRef.current;
    }

    const refreshPromise = extractProductFingerprintFn().finally(() => {
      if (batchFingerprintRefreshPromiseRef.current === refreshPromise) {
        batchFingerprintRefreshPromiseRef.current = null;
      }
    });

    batchFingerprintRefreshPromiseRef.current = refreshPromise;
    return refreshPromise;
  };

  const extractFingerprintFromAssets = async (
    assets: UploadedImageAsset[],
    externalSignal?: AbortSignal,
  ): Promise<ProductFingerprint> => {
    const [mainAsset, ...supplementalAssets] = assets;
    if (!mainAsset) {
      throw new Error('请先上传至少一张产品图。');
    }

    const { canonicalEn } = await analyzeProductFingerprintWithAbort(
      mainAsset.base64,
      supplementalAssets.map(asset => asset.base64),
      externalSignal,
    );
    return addIdsToArrays(canonicalEn);
  };

  const isSpreadsheetFile = (file: File) =>
    file.name.endsWith('.xlsx') ||
    file.name.endsWith('.xls') ||
    file.name.endsWith('.csv') ||
    file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    file.type === 'application/vnd.ms-excel' ||
    file.type === 'text/csv';

  const setDragActiveFromEvent = (
    e: React.DragEvent<HTMLElement>,
    setter: React.Dispatch<React.SetStateAction<boolean>>
  ) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    setter(true);
  };

  const clearDragActiveFromEvent = (
    e: React.DragEvent<HTMLElement>,
    setter: React.Dispatch<React.SetStateAction<boolean>>
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const nextTarget = e.relatedTarget as Node | null;
    if (nextTarget && e.currentTarget.contains(nextTarget)) {
      return;
    }
    setter(false);
  };

  const processProductImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('请上传有效的产品图片文件。');
      return;
    }

    const workflowVersion = invalidateStudioWorkflowRequests();
    setIsGenerating(false);
    revokeObjectUrlIfNeeded(productImage?.dataUrl);
    subjectReferenceImages.forEach(img => {
      revokeObjectUrlIfNeeded(img.dataUrl);
    });

    setSingleGen(singleGenInitialState);
    setRows(prev => prev.map(r => ({ ...r, status: 'pending', generatedImage: undefined, generatedPrompt: undefined, error: undefined })));
    setVerificationMap(new Map());
    setError(null);
    setFingerprintStatus('idle');
    setProductFingerprint(null);
    setProductFingerprintZh(null);
    setDraftFingerprintZh(null);
    setFingerprintTextDraft(null);
    setFingerprintEditorError(null);
    setIsFingerprintDirty(true);
    setSubjectReferenceImages([]);
    setIsSubjectReferenceDragActive(false);

    void readImageAssetFromFile(file)
      .then(asset => {
        if (!isStudioWorkflowCurrent(workflowVersion)) {
          revokeObjectUrlIfNeeded(asset.dataUrl);
          return;
        }
        setProductImage(asset);
      })
      .catch(error => {
        if (!isStudioWorkflowCurrent(workflowVersion)) {
          return;
        }
        setError(error instanceof Error ? error.message : '产品图读取失败，请重新上传后再试。');
      });
  };

  const setBatchRowPendingAction = (rowId: string, action: BatchRowPendingAction | null) => {
    setBatchRowPendingActions(prev => {
      if (!action) {
        if (!(rowId in prev)) {
          return prev;
        }
        const next = { ...prev };
        delete next[rowId];
        return next;
      }

      if (prev[rowId] === action) {
        return prev;
      }

      return {
        ...prev,
        [rowId]: action,
      };
    });
  };

  const setDetailItemPendingAction = (itemId: string, action: DetailItemPendingAction | null) => {
    setDetailItemPendingActions(prev => {
      if (!action) {
        if (!(itemId in prev)) {
          return prev;
        }
        const next = { ...prev };
        delete next[itemId];
        return next;
      }

      if (prev[itemId] === action) {
        return prev;
      }

      return {
        ...prev,
        [itemId]: action,
      };
    });
  };

  const handleProductImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processProductImageFile(file);
    }
    if (productInputRef.current) {
      productInputRef.current.value = '';
    }
  };

  const processStep2File = async (file: File) => {
    const isImage = file.type.startsWith('image/');
    const isSpreadsheet = isSpreadsheetFile(file);

    const workflowVersion = invalidateStudioWorkflowRequests();
    setIsGenerating(false);
    setVerificationMap(new Map());
    setError(null);

    if (studioMode === 'single') {
      if (!isImage) {
        setError('单图模式只支持上传参考图片。');
        return;
      }

      revokeObjectUrlIfNeeded(referenceImage?.dataUrl);
      setExcelFile(null);
      setRows([]);
      try {
        const asset = await readImageAssetFromFile(file);
        if (!isStudioWorkflowCurrent(workflowVersion)) {
          revokeObjectUrlIfNeeded(asset.dataUrl);
          return;
        }
        setReferenceImage(asset);
        setSingleGen(prev => ({ ...prev, status: 'idle', generatedImages: [], error: '' }));
      } catch (error) {
        if (!isStudioWorkflowCurrent(workflowVersion)) {
          return;
        }
        setError(error instanceof Error ? error.message : '参考图读取失败，请重新上传后再试。');
      }
      return;
    }

    if (!isSpreadsheet) {
      setError('批量模式只支持上传 Excel 或 CSV 文件。');
      return;
    }

    assertFileSizeWithinLimit(file, MAX_EXCEL_FILE_SIZE, 'Excel 文件不能超过 20MB，请压缩后重新上传');
    revokeObjectUrlIfNeeded(referenceImage?.dataUrl);
    setReferenceImage(null);
    setExcelFile(file);
    setSingleGen(singleGenInitialState);
    try {
      const parsedRows = await parseExcel(file);
      if (!isStudioWorkflowCurrent(workflowVersion)) {
        return;
      }
      setRows(parsedRows);
    } catch (err) {
      if (!isStudioWorkflowCurrent(workflowVersion)) {
        return;
      }
      setError('Excel 解析失败，请确认文件格式正确（.xlsx、.xls、.csv）。');
      console.error(err);
    }
  };

  const handleStep2Upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processStep2File(file);
    if (excelInputRef.current) {
      excelInputRef.current.value = '';
    }
  };

  const handleStudioProductDrop = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsStudioProductDragActive(false);

    const droppedFiles = Array.from(e.dataTransfer.files || []) as File[];
    const imageFile = droppedFiles.find(file => file.type.startsWith('image/'));
    if (!imageFile) {
      setError('请拖入有效的产品图片文件。');
      return;
    }

    processProductImageFile(imageFile);
  };

  const handleStudioStep2Drop = async (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsStudioStep2DragActive(false);

    const droppedFiles = Array.from(e.dataTransfer.files || []) as File[];
    const nextFile =
      studioMode === 'single'
        ? droppedFiles.find(file => file.type.startsWith('image/')) || droppedFiles[0]
        : droppedFiles.find(file => isSpreadsheetFile(file)) || droppedFiles[0];
    if (!nextFile) {
      return;
    }

    await processStep2File(nextFile);
  };

  const handleSubjectReferenceDrop = async (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsSubjectReferenceDragActive(false);
    const files = Array.from(e.dataTransfer.files || []) as File[];
    await processSubjectReferenceFiles(files);
  };

  const removeProductImage = () => {
    invalidateStudioWorkflowRequests();
    setIsGenerating(false);
    revokeObjectUrlIfNeeded(productImage?.dataUrl);
    subjectReferenceImages.forEach(img => {
      revokeObjectUrlIfNeeded(img.dataUrl);
    });

    setProductImage(null);
    setSubjectReferenceImages([]);
    setProductFingerprint(null);
    setProductFingerprintZh(null);
    setDraftFingerprintZh(null);
    setFingerprintTextDraft(null);
    setFingerprintEditorError(null);
    setFingerprintStatus('idle');
    setFingerprintError(null);
    setIsFingerprintDirty(false);
    setIsSubjectReferenceDragActive(false);
    setVerificationMap(new Map());
    setSingleGen(singleGenInitialState);
    setRows(prev => prev.map(r => ({ ...r, status: 'pending', generatedImage: undefined, generatedPrompt: undefined, error: undefined })));
    if (productInputRef.current) productInputRef.current.value = '';
    if (subjectReferenceInputRef.current) subjectReferenceInputRef.current.value = '';
  };

  const removeStep2File = () => {
    invalidateStudioWorkflowRequests();
    setIsGenerating(false);
    revokeObjectUrlIfNeeded(referenceImage?.dataUrl);
    setExcelFile(null);
    setRows([]);
    setReferenceImage(null);
    setVerificationMap(new Map());
    setError(null);
    setSingleGen(singleGenInitialState);
    if (excelInputRef.current) excelInputRef.current.value = '';
  };

  const processDetailSetProductFiles = async (files: File[]) => {
    if (files.length === 0) return;

    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      setDetailSet(prev => ({ ...prev, status: 'error', error: '详情图工作区请上传有效的图片文件。' }));
      return;
    }

    const workflowVersion = invalidateDetailWorkflowRequests();
    try {
      const imageAssets = await Promise.all(imageFiles.map(file => readImageAssetFromFile(file)));
      if (!isDetailWorkflowCurrent(workflowVersion)) {
        imageAssets.forEach(image => revokeObjectUrlIfNeeded(image.dataUrl));
        return;
      }
      setDetailSetProductImages(prev => [...prev, ...imageAssets]);
      setDetailSetFingerprint(null);
      setDetailSet(prev => ({
        ...prev,
        globalPrompt: prev.promptSource === 'ai' ? '' : prev.globalPrompt,
        status: 'idle',
        error: '',
        generatedItems: [],
      }));
    } catch (err: any) {
      if (!isDetailWorkflowCurrent(workflowVersion)) {
        return;
      }
      setDetailSet(prev => ({
        ...prev,
        status: 'error',
        error: err.message || '读取所选产品图失败，请重试。',
      }));
    } finally {
      if (detailSetProductInputRef.current) {
        detailSetProductInputRef.current.value = '';
      }
    }
  };

  const handleDetailSetProductImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    await processDetailSetProductFiles(files);
    if (detailSetProductInputRef.current) {
      detailSetProductInputRef.current.value = '';
    }
  };

  const removeDetailSetProductImage = (index?: number) => {
    invalidateDetailWorkflowRequests();
    const remainingCount =
      typeof index === 'number'
        ? Math.max(detailSetProductImages.length - 1, 0)
        : 0;

    setDetailSetProductImages(prev => {
      if (typeof index !== 'number') {
        prev.forEach(image => revokeObjectUrlIfNeeded(image.dataUrl));
        return [];
      }

      const nextImages = [...prev];
      const imageToRemove = nextImages[index];
      revokeObjectUrlIfNeeded(imageToRemove?.dataUrl);
      nextImages.splice(index, 1);
      return nextImages;
    });
    setDetailSetFingerprint(null);
    setDetailSet(prev => ({
      ...prev,
      globalPrompt: prev.promptSource === 'ai' ? '' : prev.globalPrompt,
      status: 'idle',
      error: '',
      generatedItems: [],
      aspectRatioOverrides: remainingCount > 0 ? prev.aspectRatioOverrides : {},
    }));
    if (detailSetProductInputRef.current) {
      detailSetProductInputRef.current.value = '';
    }
  };

  const ensureDetailSetFingerprint = async () => {
    if (detailSetProductImages.length === 0) {
      throw new Error('请先上传至少一张产品图。');
    }

    if (detailSetFingerprint) {
      return detailSetFingerprint;
    }

    const { requestId, workflowVersion, controller } = startDetailFingerprintRequest();
    const fingerprint = await extractFingerprintFromAssets(detailSetProductImages, controller.signal);

    if (isDetailFingerprintRequestCurrent(requestId, workflowVersion)) {
      setDetailSetFingerprint(fingerprint);
    }

    return fingerprint;
  };

  const createDetailSetGenerationSnapshot = () => ({
    platform: detailSet.platform,
    globalPrompt: detailSet.globalPrompt.trim(),
    gridLayout: detailSet.gridLayout,
    aspectRatioOverrides: cloneJsonValue(detailSet.aspectRatioOverrides),
    productImages: [...detailSetProductImages],
    fingerprint: detailSetFingerprint ? cloneJsonValue(detailSetFingerprint) : null,
  });

  const resolveDetailSetFingerprintForSnapshot = async (
    detailSetSnapshot: ReturnType<typeof createDetailSetGenerationSnapshot>,
    externalSignal?: AbortSignal,
  ) => {
    if (detailSetSnapshot.fingerprint) {
      return detailSetSnapshot.fingerprint;
    }

    return extractFingerprintFromAssets(detailSetSnapshot.productImages, externalSignal);
  };

  const resolveDetailSetIdentityProfileForSnapshot = async (
    detailSetSnapshot: ReturnType<typeof createDetailSetGenerationSnapshot>,
    fingerprint: ProductFingerprint,
    externalSignal?: AbortSignal,
  ): Promise<ProductIdentityProfile | null> => {
    const [mainProductImage, ...supplementalProductImages] = detailSetSnapshot.productImages;
    if (!mainProductImage) {
      return null;
    }

    const signalText = [fingerprint.category, fingerprint.productSummary]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    if (!shouldUseOpenAiProductIdentityEnhancement(signalText)) {
      return null;
    }

    try {
      return await analyzeProductIdentityWithAbort(
        mainProductImage.base64,
        supplementalProductImages.map(image => image.base64),
        signalText,
        externalSignal,
      );
    } catch (identityError) {
      console.error('Detail-set identity recognition failed:', identityError);
      return null;
    }
  };

  const buildResolvedDetailSetPlanFromSnapshot = (
    detailSetSnapshot: ReturnType<typeof createDetailSetGenerationSnapshot>,
    fingerprint?: ProductFingerprint | null,
  ) => {
    const basePlan = createDetailSetPlan({
      platform: detailSetSnapshot.platform,
      fingerprint,
      globalGuidance: detailSetSnapshot.globalPrompt,
    });

    return basePlan.map(item => ({
      ...item,
      aspectRatio: detailSetSnapshot.aspectRatioOverrides[item.id] || item.aspectRatio,
    }));
  };

  const runDetailSetItemVerification = (
    itemId: string,
    generatedImageUrl: string,
    imageType: ImageType,
    fingerprint: ProductFingerprint,
    detailSetSnapshot: ReturnType<typeof createDetailSetGenerationSnapshot>,
    verificationOptions: {
      mustContain?: string[];
      mustNotContain?: string[];
    },
    isCurrent: () => boolean,
    externalSignal?: AbortSignal,
  ) => {
    void (async () => {
      try {
        const verification = await withOperationTimeout(
          signal =>
            verifyDetailSetOutputLight(
              generatedImageUrl,
              fingerprint,
              imageType,
              detailSetSnapshot.productImages,
              verificationOptions,
              signal,
            ),
          VERIFICATION_TIMEOUT_MS,
          '详情图校验超时，已保留当前图片，请人工检查。',
          externalSignal,
        );

        if (!isCurrent()) {
          return;
        }

        setDetailSet(buildDetailGeneratedItemVerificationUpdater(itemId, generatedImageUrl, verification));
      } catch (verificationError: any) {
        if (externalSignal?.aborted || verificationError?.name === 'AbortError') {
          return;
        }

        console.warn('Detail-set async verification skipped:', verificationError);
      }
    })();
  };

  const generateDetailSetImageWithSnapshot = async (
    item: DetailSetPlanItem & { adjustmentPrompt?: string },
    fingerprint: ProductFingerprint,
    detailSetSnapshot: ReturnType<typeof createDetailSetGenerationSnapshot>,
    identityProfile?: ProductIdentityProfile | null,
    externalSignal?: AbortSignal,
  ): Promise<DetailSetGenerationOutcome> => {
    const [mainProductImage, ...supplementalProductImages] = detailSetSnapshot.productImages;
    if (!mainProductImage) {
      throw new Error('请先上传至少一张产品图。');
    }

    const slotGuidance = resolveDetailSetGuidanceForSlot(detailSetSnapshot.globalPrompt, item.slot);
    const prioritizedAdjustmentPrompt = buildPrioritizedVisibleInstructionPrompt(
      item.adjustmentPrompt || '',
      { instructionLabel: 'current-image instructions' },
    );
    const isWideBannerItem = item.imageType === 'banner' || item.aspectRatio === '1464x600';

    const operationTimeoutMs = (BATCH_ROW_GENERATION_REQUEST_BEHAVIOR.timeoutMs ?? 90000) + 15000;
    const detailSetGuardrails = buildDetailSetGenerationGuardrails(
      item,
      fingerprint,
      detailSetSnapshot.globalPrompt,
      prioritizedAdjustmentPrompt,
    );
    const detailSetVerificationRequirements = buildDetailSetVerificationRequirements(
      item,
      fingerprint,
      detailSetSnapshot.globalPrompt,
      prioritizedAdjustmentPrompt,
    );
    const promptOptions = await preparePromptOptions(
      {
        productTitle: item.productTitle,
        copyText: item.copyText,
        sizeInstruction: getSizeInstruction(item.aspectRatio),
        hasRefImage: false,
        customPrompt: [item.customPrompt, prioritizedAdjustmentPrompt]
          .filter(Boolean)
          .join('\n'),
        hardConstraintPrompt: [slotGuidance, ...detailSetGuardrails]
          .filter(Boolean)
          .join('\n'),
        identityLockPrompt: identityProfile
          ? buildProductIdentityHardConstraintPrompt(identityProfile)
          : undefined,
        mode: item.mode,
        imageType: item.imageType,
        textMode: item.copyText.trim() ? 'render_text' : 'none',
        preserveProductText: true,
        commercialTone: item.commercialTone,
        sceneStrictness: item.sceneStrictness,
      },
      fingerprint,
    );
    const supplementalReferenceLimit = getDetailSetSupplementalReferenceLimit(item, fingerprint, 0);

    const { result, usedPromptOptions } = await withOperationTimeout(
      signal =>
        generateImageWithFallback({
          promptOptions,
          refBase64: null,
          aspectRatio: parseAspectRatio(item.aspectRatio),
          productBase64: mainProductImage.base64,
          supplementalProductBase64: isWideBannerItem
            ? []
            : getLimitedBase64References(
                supplementalProductImages,
                supplementalReferenceLimit,
              ),
          signal,
        }),
      operationTimeoutMs,
      '详情图生成超时了，请简化要求后重试。',
      externalSignal,
    );

    const finalizedResult = await finalizeGeneratedResultForSize(result, item.aspectRatio);
    if (!hasUsableGeneratedImageResult(finalizedResult)) {
      throw new Error('该详情图未返回有效图片结果，请重试。');
    }

    return {
      result: finalizedResult,
      usedPromptOptions,
      verificationOptions: detailSetVerificationRequirements,
    };
  };

  const generateDetailSetImage = async (
    item: DetailSetPlanItem,
    fingerprint: ProductFingerprint,
    detailSetSnapshot: ReturnType<typeof createDetailSetGenerationSnapshot>,
    externalSignal?: AbortSignal,
  ) => {
    const { globalPrompt, productImages } = detailSetSnapshot;
    const [mainProductImage, ...supplementalProductImages] = productImages;
    if (!mainProductImage) {
      throw new Error('请先上传至少一张产品图。');
    }

    const detailSetGuardrails = buildDetailSetGenerationGuardrails(item, fingerprint);
    const isWideBannerItem = item.imageType === 'banner' || item.aspectRatio === '1464x600';

    const promptOptions = await preparePromptOptions(
      {
        productTitle: item.productTitle,
        copyText: item.copyText,
        sizeInstruction: getSizeInstruction(item.aspectRatio),
        hasRefImage: false,
        customPrompt: item.customPrompt,
        hardConstraintPrompt: [globalPrompt, ...detailSetGuardrails]
          .filter(Boolean)
          .join('\n'),
        mode: item.mode,
        imageType: item.imageType,
        textMode: item.copyText.trim() ? 'render_text' : 'none',
        preserveProductText: true,
        commercialTone: item.commercialTone,
        sceneStrictness: item.sceneStrictness,
      },
      fingerprint
    );

    const operationTimeoutMs = (BATCH_ROW_GENERATION_REQUEST_BEHAVIOR.timeoutMs ?? 90000) + 15000;
    const { result, usedPromptOptions } = await withOperationTimeout(
      signal =>
        generateImageWithFallback({
          promptOptions,
          refBase64: null,
          aspectRatio: parseAspectRatio(item.aspectRatio),
          productBase64: mainProductImage.base64,
          supplementalProductBase64: isWideBannerItem
            ? []
            : getLimitedBase64References(
                supplementalProductImages,
                MAX_DETAIL_SET_GENERATION_SUPPLEMENTAL_IMAGES
              ),
          signal,
        }),
      operationTimeoutMs,
      '详情图生成超时了，请简化要求后重试。'
    );

    return {
      result: await finalizeGeneratedResultForSize(result, item.aspectRatio),
      usedPromptOptions,
    };
  };

  const buildResolvedDetailSetPlan = (fingerprint?: ProductFingerprint | null) => {
    const basePlan = createDetailSetPlan({
      platform: detailSet.platform,
      fingerprint,
      globalGuidance: detailSet.globalPrompt.trim(),
    });

    return basePlan.map(item => ({
      ...item,
      aspectRatio: detailSet.aspectRatioOverrides[item.id] || item.aspectRatio,
    }));
  };

  const handleGenerateDetailSetGlobalPrompt = async () => {
    if (detailSetProductImages.length === 0) {
      setDetailSet(prev => ({ ...prev, error: '请先上传至少一张产品图。' }));
      return;
    }

    const workflowVersion = detailWorkflowVersionRef.current;
    const platform = detailSet.platform;
    abortControllerIfNeeded(detailSetGlobalPromptAbortControllerRef.current);
    const controller = new AbortController();
    detailSetGlobalPromptAbortControllerRef.current = controller;
    setIsGeneratingDetailSetGlobalPrompt(true);
    try {
      const fingerprint = await ensureDetailSetFingerprint();
      if (!isDetailWorkflowCurrent(workflowVersion) || controller.signal.aborted) {
        return;
      }

      const prompt = await generateDetailSetGlobalPrompt(platform, fingerprint, controller.signal);
      if (!isDetailWorkflowCurrent(workflowVersion) || controller.signal.aborted) {
        return;
      }

      setDetailSet(prev => {
        if (!isDetailWorkflowCurrent(workflowVersion) || prev.platform !== platform || prev.promptSource !== 'ai') {
          return prev;
        }

        return {
          ...prev,
          globalPrompt: prompt,
          error: '',
        };
      });
    } catch (err: any) {
      if (!isDetailWorkflowCurrent(workflowVersion) || controller.signal.aborted || err?.name === 'AbortError') {
        return;
      }

      setDetailSet(prev => {
        if (!isDetailWorkflowCurrent(workflowVersion) || prev.platform !== platform || prev.promptSource !== 'ai') {
          return prev;
        }

        return {
          ...prev,
          error: err?.message || 'AI 提示词生成失败，请稍后重试。',
        };
      });
    } finally {
      if (detailSetGlobalPromptAbortControllerRef.current === controller) {
        detailSetGlobalPromptAbortControllerRef.current = null;
        setIsGeneratingDetailSetGlobalPrompt(false);
      }
    }
  };

  const handleGenerateDetailSet = async () => {
    if (detailSetProductImages.length === 0) {
      setDetailSet(prev => ({ ...prev, status: 'error', error: '请先上传至少一张产品图。' }));
      return;
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setDetailSet(prev => ({ ...prev, status: 'error', error: '网络连接已断开，请恢复后重试。' }));
      return;
    }

    const { requestId, workflowVersion, controller } = startDetailSetGenerationRequest();
    const detailSetSnapshot = createDetailSetGenerationSnapshot();
    try {
      setDetailSet(prev => ({
        ...prev,
        status: 'analyzing',
        error: '',
        generatedItems: [],
      }));

      const fingerprint = await resolveDetailSetFingerprintForSnapshot(detailSetSnapshot, controller.signal);
      if (!isDetailSetGenerationRequestCurrent(requestId, workflowVersion)) {
        return;
      }
      const identityProfile = await resolveDetailSetIdentityProfileForSnapshot(
        detailSetSnapshot,
        fingerprint,
        controller.signal,
      );
      if (!isDetailSetGenerationRequestCurrent(requestId, workflowVersion)) {
        return;
      }

      setDetailSet(prev => ({
        ...prev,
        status: 'planning',
      }));

      const plan = buildResolvedDetailSetPlanFromSnapshot(detailSetSnapshot, fingerprint);

      let generatedItems: DetailSetGeneratedItem[] = plan.map(item => ({
        ...item,
        status: 'pending',
        adjustmentPrompt: '',
      }));

      setDetailSet(prev => ({
        ...prev,
        status: 'generating',
        generatedItems,
      }));

      const concurrencyLimit = MAX_DETAIL_SET_GENERATION_CONCURRENCY;

      for (let i = 0; i < plan.length; i += concurrencyLimit) {
        if (!isDetailSetGenerationRequestCurrent(requestId, workflowVersion)) {
          return;
        }
        const chunk = plan.slice(i, i + concurrencyLimit);

        setDetailSet(prev => ({
          ...prev,
          generatedItems: prev.generatedItems.map(existingItem =>
            chunk.some(chunkItem => chunkItem.id === existingItem.id)
              ? { ...existingItem, status: 'generating', error: '' }
              : existingItem
          ),
        }));
        chunk.forEach(item => setDetailItemPendingAction(item.id, 'generate'));
        chunk.forEach(item => {
          detailItemRequestIdsRef.current.set(item.id, requestId);
        });

        const chunkResults = await Promise.allSettled(
          chunk.map(item =>
            generateDetailSetImageWithSnapshot(
              item,
              fingerprint,
              detailSetSnapshot,
              identityProfile,
              controller.signal,
            ).then(outcome => {
              if (!isDetailItemRequestCurrent(item.id, requestId, workflowVersion)) {
                return outcome;
              }

              if (hasUsableGeneratedImageResult(outcome.result)) {
                generatedItems = generatedItems.map(existingItem =>
                  existingItem.id === item.id
                    ? {
                        ...existingItem,
                        status: 'success' as const,
                        generatedImage: outcome.result.url,
                        generatedPrompt: outcome.result.prompt,
                        error: '',
                      }
                    : existingItem
                );

                queueGenerationHistoryRecords([outcome.result.url], 'detail');

                setDetailSet(prev => ({
                  ...prev,
                  generatedItems,
                  error: getDetailSetFailureMessage(generatedItems),
                }));

                runDetailSetItemVerification(
                  item.id,
                  outcome.result.url,
                  item.imageType,
                  fingerprint,
                  detailSetSnapshot,
                  outcome.verificationOptions,
                  () => isDetailItemRequestCurrent(item.id, requestId, workflowVersion),
                  controller.signal,
                );
              }

              setDetailItemPendingAction(item.id, null);
              return outcome;
            })
          )
        );
        if (!isDetailSetGenerationRequestCurrent(requestId, workflowVersion)) {
          return;
        }

        generatedItems = generatedItems.map(existingItem => {
          const chunkIndex = chunk.findIndex(chunkItem => chunkItem.id === existingItem.id);
          if (chunkIndex === -1) {
            return existingItem;
          }

          const result = chunkResults[chunkIndex];
          if (result.status === 'fulfilled' && hasUsableGeneratedImageResult(result.value.result)) {
            return existingItem;
          }

          return {
            ...existingItem,
            status: 'error',
            error:
              result.status === 'fulfilled'
                ? '该详情图未返回有效图片结果，请重试。'
                : (result.reason?.message || '该详情图生成失败。'),
          };
        });

        setDetailSet(prev => ({
          ...prev,
          generatedItems,
        }));

        chunkResults.forEach((result, chunkIndex) => {
          if (result.status !== 'fulfilled') {
            setDetailItemPendingAction(chunk[chunkIndex].id, null);
          }
        });
      }

      if (!isDetailSetGenerationRequestCurrent(requestId, workflowVersion)) {
        return;
      }

      setDetailSet(prev => ({
        ...prev,
        status: getDetailSetResolvedStatus(generatedItems),
        error: getDetailSetFailureMessage(generatedItems),
        generatedItems,
      }));
      generatedItems.forEach(item => {
        if (item.status !== 'generating') {
          setDetailItemPendingAction(item.id, null);
        }
      });
    } catch (err: any) {
      if (!isDetailSetGenerationRequestCurrent(requestId, workflowVersion)) {
        return;
      }
      setDetailSet(prev => ({
        ...prev,
        status: 'error',
        error: err.message || '详情图套组生成失败。',
      }));
      setDetailItemPendingActions({});
    }
  };

  const handleDetailSetItemAdjustmentChange = (itemId: string, adjustmentPrompt: string) => {
    setDetailSet(prev => ({
      ...prev,
      generatedItems: prev.generatedItems.map(item =>
        item.id === itemId
          ? { ...item, adjustmentPrompt }
          : item
        ),
    }));
  };

  const handleDetailSetItemAspectRatioChange = (itemId: string, aspectRatio: string) => {
    setDetailSet(prev => ({
      ...prev,
      aspectRatioOverrides: {
        ...prev.aspectRatioOverrides,
        [itemId]: aspectRatio,
      },
      generatedItems: prev.generatedItems.map(item =>
        item.id === itemId
          ? { ...item, aspectRatio }
          : item
      ),
    }));
  };

  const handleRegenerateDetailSetItem = async (itemId: string) => {
    if (detailSetProductImages.length === 0) {
      setDetailSet(prev => ({ ...prev, error: '请先上传至少一张产品图。' }));
      return;
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setDetailSet(prev => ({ ...prev, error: '网络连接已断开，请恢复后重试。' }));
      return;
    }

    const currentItem = detailSet.generatedItems.find(item => item.id === itemId);
    if (!currentItem) {
      setDetailSet(prev => ({ ...prev, error: '当前详情图已不存在，请重新生成。' }));
      return;
    }

    if (currentItem.status === 'generating') {
      setDetailSet(prev => ({ ...prev, error: '这张详情图正在生成中，请稍候再试。' }));
      return;
    }

    const { requestId, workflowVersion, controller } = startDetailItemRequest(itemId);
    const detailSetSnapshot = createDetailSetGenerationSnapshot();
    setDetailItemPendingAction(itemId, 'regenerate');

    setDetailSet(prev => {
      if (!isDetailItemRequestCurrent(itemId, requestId, workflowVersion)) {
        return prev;
      }
      const updatedItems = prev.generatedItems.map(item =>
        item.id === itemId
          ? { ...item, status: 'generating' as const, error: '' }
          : item
      );

      return {
        ...prev,
        generatedItems: updatedItems,
        error: getDetailSetFailureMessage(updatedItems),
      };
    });

    try {
      const fingerprint = await resolveDetailSetFingerprintForSnapshot(detailSetSnapshot, controller.signal);
      if (!isDetailItemRequestCurrent(itemId, requestId, workflowVersion)) {
        return;
      }
      const identityProfile = await resolveDetailSetIdentityProfileForSnapshot(
        detailSetSnapshot,
        fingerprint,
        controller.signal,
      );
      if (!isDetailItemRequestCurrent(itemId, requestId, workflowVersion)) {
        return;
      }
      const generationOutcome = await generateDetailSetImageWithSnapshot(
        currentItem,
        fingerprint,
        detailSetSnapshot,
        identityProfile,
        controller.signal,
      );
      const { result } = generationOutcome;
      if (!hasUsableGeneratedImageResult(result)) {
        throw new Error('这张详情图未返回有效图片结果，请重试。');
      }

      if (!isDetailItemRequestCurrent(itemId, requestId, workflowVersion)) {
        return;
      }

      queueGenerationHistoryRecords([result.url], 'detail');

      setDetailSet(prev => {
        if (!isDetailItemRequestCurrent(itemId, requestId, workflowVersion)) {
          return prev;
        }
        const updatedItems = prev.generatedItems.map(item =>
          item.id === itemId
            ? {
                ...item,
                status: 'success' as const,
                generatedImage: result.url,
                generatedPrompt: result.prompt,
                error: '',
                adjustmentPrompt: item.adjustmentPrompt || '',
              }
            : item
        );

        return {
          ...prev,
          status: getDetailSetResolvedStatus(updatedItems),
          generatedItems: updatedItems,
          error: getDetailSetFailureMessage(updatedItems),
        };
      });

      runDetailSetItemVerification(
        itemId,
        result.url,
        currentItem.imageType,
        fingerprint,
        detailSetSnapshot,
        generationOutcome.verificationOptions,
        () => isDetailItemRequestCurrent(itemId, requestId, workflowVersion),
        controller.signal,
      );
      setDetailItemPendingAction(itemId, null);
    } catch (err: any) {
      if (!isDetailItemRequestCurrent(itemId, requestId, workflowVersion)) {
        return;
      }
      setDetailSet(prev => {
        if (!isDetailItemRequestCurrent(itemId, requestId, workflowVersion)) {
          return prev;
        }
        const updatedItems = prev.generatedItems.map(item =>
          item.id === itemId
            ? {
                ...item,
                status: 'error' as const,
                error: err.message || '这张详情图重新生成失败。',
              }
            : item
        );

        return {
          ...prev,
          status: getDetailSetResolvedStatus(updatedItems),
          generatedItems: updatedItems,
          error: getDetailSetFailureMessage(updatedItems),
        };
      });
      setDetailItemPendingAction(itemId, null);
    }
  };

  const handleEditDetailSetItemLocally = async (itemId: string) => {
    const detailSetSnapshot = createDetailSetGenerationSnapshot();
    const [currentProductImage, ...supplementalDetailSetImages] = detailSetSnapshot.productImages;
    if (!currentProductImage) {
      setDetailSet(prev => ({ ...prev, error: '请先上传至少一张产品图。' }));
      return;
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setDetailSet(prev => ({ ...prev, error: '网络连接已断开，请恢复后重试。' }));
      return;
    }

    const currentItem = detailSet.generatedItems.find(item => item.id === itemId);
    if (!currentItem) {
      setDetailSet(prev => ({ ...prev, error: '当前详情图已不存在，请重新生成。' }));
      return;
    }

    if (currentItem.status === 'generating') {
      setDetailSet(prev => ({ ...prev, error: '这张详情图正在生成中，请稍候再试。' }));
      return;
    }

    if (!currentItem.generatedImage) {
      setDetailSet(prev => ({ ...prev, error: '请先生成这张详情图，再进行局部补充修改。' }));
      return;
    }

    const adjustmentPrompt = currentItem.adjustmentPrompt.trim();
    if (!adjustmentPrompt) {
      setDetailSet(prev => ({ ...prev, error: '请先填写这张详情图的局部补充说明。' }));
      return;
    }

    const { requestId, workflowVersion, controller } = startDetailItemRequest(itemId);
    setDetailItemPendingAction(itemId, 'local_edit');

    setDetailSet(prev => {
      if (!isDetailItemRequestCurrent(itemId, requestId, workflowVersion)) {
        return prev;
      }
      const updatedItems = prev.generatedItems.map(item =>
        item.id === itemId
          ? { ...item, status: 'generating' as const, error: '' }
          : item
      );

      return {
        ...prev,
        generatedItems: updatedItems,
        error: getDetailSetFailureMessage(updatedItems),
      };
    });

    try {
      const fingerprint = await resolveDetailSetFingerprintForSnapshot(detailSetSnapshot, controller.signal);
      if (!isDetailItemRequestCurrent(itemId, requestId, workflowVersion)) {
        return;
      }

      const localEditPrompt = getSingleImageLocalEditPrompt(
        '',
        adjustmentPrompt,
        currentItem.copyText,
        detailSetSnapshot.globalPrompt
      );
      const localEditSupplementalProductImages = getLimitedBase64References(
        supplementalDetailSetImages,
        MAX_DETAIL_LOCAL_EDIT_SUPPLEMENTAL_IMAGES
      );
      const operationTimeoutMs = getSingleImageOperationTimeoutMs('local_edit');
      let localEditOutputSize = currentItem.aspectRatio;
      let localEditRequestImageSize = imageSize;

      const result = await withOperationTimeout(
        async signal => {
          const originalBaseImageBase64 = await resolveImageUrlToBase64(
            currentItem.generatedImage!,
            'Detail local edit base image loading failed',
            signal,
          );
          const baseImageDimensions = await getImageDimensionsFromBase64(originalBaseImageBase64);
          localEditOutputSize =
            toExplicitOutputSize(baseImageDimensions)
            || currentItem.aspectRatio;
          localEditRequestImageSize = resolveLocalEditRequestImageSize(baseImageDimensions, imageSize);
          const aspectRatio = parseAspectRatio(currentItem.aspectRatio);
          const attemptLocalEdit = async (mode: 'preferred' | 'fallback') => {
            const transportAssets = await prepareLocalEditTransportAssets({
              baseImage: originalBaseImageBase64,
              productReference: currentProductImage.base64,
              supplementalReferences: localEditSupplementalProductImages,
              requestImageSize: localEditRequestImageSize,
              mode,
            });

            return editGeneratedImageLocally(
              transportAssets.baseImageBase64,
              transportAssets.productReferenceBase64,
              transportAssets.supplementalReferences,
              localEditPrompt,
              aspectRatio,
              localEditRequestImageSize,
              undefined,
              MAX_DETAIL_LOCAL_EDIT_SUPPLEMENTAL_IMAGES,
              undefined,
              signal,
            );
          };

          try {
            return await attemptLocalEdit('preferred');
          } catch (error) {
            if (!isLikelyLocalEditTransportFailure(error)) {
              throw error;
            }

            return attemptLocalEdit('fallback');
          }
        },
        operationTimeoutMs,
        '这张详情图局部补充修改超时了，请简化要求后重试。',
        controller.signal,
      );
      const finalizedResult = await finalizeGeneratedResultForSize(result, localEditOutputSize);
      if (!hasUsableGeneratedImageResult(finalizedResult)) {
        throw new Error('这张详情图局部补充修改未返回有效图片结果，请重试。');
      }

      if (!isDetailItemRequestCurrent(itemId, requestId, workflowVersion)) {
        return;
      }

      queueGenerationHistoryRecords([finalizedResult.url], 'detail');

      setDetailSet(prev => {
        if (!isDetailItemRequestCurrent(itemId, requestId, workflowVersion)) {
          return prev;
        }
        const updatedItems = prev.generatedItems.map(item =>
          item.id === itemId
            ? {
                ...item,
                status: 'success' as const,
                generatedImage: finalizedResult.url,
                generatedPrompt: finalizedResult.prompt,
                error: '',
                adjustmentPrompt: item.adjustmentPrompt || '',
              }
            : item
        );

        return {
          ...prev,
          status: getDetailSetResolvedStatus(updatedItems),
          generatedItems: updatedItems,
          error: getDetailSetFailureMessage(updatedItems),
        };
      });
      setDetailItemPendingAction(itemId, null);
    } catch (err: any) {
      if (!isDetailItemRequestCurrent(itemId, requestId, workflowVersion)) {
        return;
      }
      setDetailSet(prev => {
        if (!isDetailItemRequestCurrent(itemId, requestId, workflowVersion)) {
          return prev;
        }
        const updatedItems = prev.generatedItems.map(item =>
          item.id === itemId
            ? {
                ...item,
                status: 'error' as const,
                error: err.message || '这张详情图局部补充修改失败。',
              }
            : item
        );

        return {
          ...prev,
          status: getDetailSetResolvedStatus(updatedItems),
          generatedItems: updatedItems,
          error: getDetailSetFailureMessage(updatedItems),
        };
      });
      setDetailItemPendingAction(itemId, null);
    }
  };

  const handleRowChange = (id: string, field: keyof ExcelRow, value: string) => {
    setRows(prev => prev.map(row => row.id === id ? { ...row, [field]: value } : row));
  };

  const createPromptOptions = (
    isBatch: boolean,
    currentRow?: ExcelRow,
    singleGenData?: typeof singleGen,
    hasRefImage?: boolean
  ): BuildPromptOptions => {
    if (isBatch && currentRow) {
      const remarks = (currentRow.customPrompt || '').trim();
      const emphasizedRemarks = buildPrioritizedVisibleInstructionPrompt(remarks, {
        hasRefImage: Boolean(hasRefImage),
        instructionLabel: 'row-level scene instructions',
      });
      let sceneStrictness: SceneStrictness = remarks ? 'loose' : 'strict';
      let commercialTone: CommercialTone = 'premium';

      const lifestyleKeywords = ['lifestyle', 'home', 'living', 'kitchen', 'bathroom', 'outdoor', 'office', 'studio', 'environment', 'scene'];
      const lowerRemarks = remarks.toLowerCase();
      if (lifestyleKeywords.some(k => lowerRemarks.includes(k))) {
        commercialTone = currentRow.commercialTone || 'premium';
      }

      const resolvedImageType: ImageType =
        currentRow.imageType === 'banner'
          ? 'banner'
          : 'lifestyle';
      const resolvedMode: GenerationMode = currentRow.mode
        || (hasRefImage
          ? (remarks ? 'background_transfer' : 'strict_layout_match')
          : 'lifestyle_listing');
      const referenceReplacementConstraints = hasRefImage
        ? [
            BATCH_REFERENCE_PRODUCT_REPLACEMENT_HARD_CONSTRAINT,
            remarks
              ? 'When the row-level scene instructions conflict with the reference image, the row-level scene instructions win. Use the reference image only to support composition, atmosphere, and layout after the row-level scene instructions are satisfied.'
              : '',
          ]
            .filter(Boolean)
            .join('\n')
        : '';

      return {
        productTitle: currentRow.productTitle,
        copyText: (currentRow.copyText || '').trim(),
        sizeInstruction: getSizeInstruction(currentRow.size),
        hasRefImage: hasRefImage,
        customPrompt: emphasizedRemarks,
        hardConstraintPrompt: referenceReplacementConstraints,
        mode: resolvedMode,
        imageType: resolvedImageType,
        textMode: (currentRow.copyText || '').trim() ? 'render_text' : 'none',
        language: currentRow.language || 'auto',
        preserveProductText: currentRow.preserveProductText !== false,
        commercialTone: currentRow.commercialTone || commercialTone,
        sceneStrictness: currentRow.sceneStrictness || sceneStrictness
      };
    } else if (!isBatch && singleGenData) {
      const singlePrompt = singleGenData.prompt.trim();
      const emphasizedSinglePrompt = buildPrioritizedVisibleInstructionPrompt(singlePrompt, {
        hasRefImage: Boolean(hasRefImage),
        instructionLabel: 'user supplemental instructions',
      });
      const inferredSingleMode = hasRefImage
        ? 'background_transfer'
        : (singleGenData.imageType === 'lifestyle' || singleGenData.imageType === 'banner'
          ? 'lifestyle_listing'
          : 'infographic_listing');
      const singleReferenceConstraints = hasRefImage
        ? [
            'Use the reference image only for scene, lighting, composition, or atmosphere support.',
            singlePrompt
              ? 'The user supplemental instructions below must be visibly satisfied before any reference-image guidance is applied.'
              : '',
            singlePrompt
              ? 'If the user supplemental instructions conflict with the reference image, the user supplemental instructions win.'
              : '',
          ]
            .filter(Boolean)
            .join('\n')
        : '';

      return {
        productTitle: '',
        copyText: singleGenData.copyText.trim(),
        sizeInstruction: getSizeInstruction(singleGenData.size),
        hasRefImage: hasRefImage,
        customPrompt: emphasizedSinglePrompt,
        hardConstraintPrompt: singleReferenceConstraints,
        mode: singleGenData.mode === 'auto' ? inferredSingleMode : singleGenData.mode,
        imageType: singleGenData.imageType,
        textMode: singleGenData.copyText.trim() ? 'render_text' : 'none',
        preserveProductText: singleGenData.preserveProductText,
        commercialTone: singleGenData.commercialTone,
        sceneStrictness: singleGenData.sceneStrictness === 'auto'
          ? (singlePrompt ? 'loose' : 'strict')
          : singleGenData.sceneStrictness
      };
    }
    return {};
  };

  const preparePromptOptions = async (
    baseOptions: BuildPromptOptions,
    fingerprint?: ProductFingerprint | null
  ): Promise<BuildPromptOptions> => {
    const preparedOptions: BuildPromptOptions = { ...baseOptions };

    if (preparedOptions.copyText) {
      preparedOptions.copyText = await normalizeCopyText(preparedOptions.copyText, preparedOptions.language);
    }

    if (fingerprint) {
      preparedOptions.fingerprint = fingerprint;
    }

    return preparedOptions;
  };

  const buildStudioIdentitySignal = (fingerprint?: ProductFingerprint | null) =>
    [
      fingerprint?.category,
      fingerprint?.productSummary,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

  const buildStudioIdentityCacheKey = (fingerprint?: ProductFingerprint | null) => {
    if (!productImage) {
      return '';
    }

    return JSON.stringify({
      main: buildImageBase64Signature(productImage.base64),
      supplemental: subjectReferenceImages
        .slice(0, 2)
        .map(image => buildImageBase64Signature(image.base64)),
      category: fingerprint?.category || '',
      productSummary: fingerprint?.productSummary || '',
    });
  };

  const resolveStudioIdentityProfile = async (
    fingerprint?: ProductFingerprint | null,
    externalSignal?: AbortSignal,
  ): Promise<ProductIdentityProfile | null> => {
    if (!productImage) {
      return null;
    }

    const signal = buildStudioIdentitySignal(fingerprint);
    if (!shouldUseOpenAiProductIdentityEnhancement(signal)) {
      return null;
    }

    const cacheKey = buildStudioIdentityCacheKey(fingerprint);
    if (studioIdentityProfileCacheRef.current?.key === cacheKey) {
      return studioIdentityProfileCacheRef.current.profile;
    }

    if (studioIdentityProfilePromiseRef.current?.key === cacheKey) {
      return studioIdentityProfilePromiseRef.current.promise;
    }

    const identityPromise = analyzeProductIdentityWithAbort(
      productImage.base64,
      subjectReferenceImages.map(img => img.base64),
      signal,
      externalSignal,
    )
      .catch(identityError => {
        console.error('OpenAI product identity recognition failed:', identityError);
        return null;
      })
      .then(profile => {
        if (studioIdentityProfilePromiseRef.current?.key === cacheKey) {
          studioIdentityProfilePromiseRef.current = null;
        }
        studioIdentityProfileCacheRef.current = {
          key: cacheKey,
          profile,
        };
        return profile;
      });

    studioIdentityProfilePromiseRef.current = {
      key: cacheKey,
      promise: identityPromise,
    };

    return identityPromise;
  };

  const resolveBatchIdentityProfile = async (
    fingerprint?: ProductFingerprint | null,
    _currentRow?: ExcelRow,
    externalSignal?: AbortSignal,
  ): Promise<ProductIdentityProfile | null> => {
    return resolveStudioIdentityProfile(fingerprint, externalSignal);
  };

  const resolveSingleIdentityProfile = async (
    fingerprint?: ProductFingerprint | null,
    externalSignal?: AbortSignal,
  ): Promise<ProductIdentityProfile | null> => {
    return resolveStudioIdentityProfile(fingerprint, externalSignal);
  };

  const prepareSinglePromptOptions = async (
    fingerprint: ProductFingerprint | null | undefined,
    hasRefImage: boolean,
    identityProfile?: ProductIdentityProfile | null
  ): Promise<BuildPromptOptions> => {
    const baseOptions = {
      ...createPromptOptions(false, undefined, singleGen, hasRefImage),
      identityLockPrompt: identityProfile
        ? buildProductIdentityHardConstraintPrompt(identityProfile)
        : undefined
    };
    const cacheKey = JSON.stringify({
      baseOptions,
      fingerprint: fingerprint || null,
    });

    if (singlePromptOptionsCacheRef.current?.key === cacheKey) {
      return { ...singlePromptOptionsCacheRef.current.prepared };
    }

    const prepared = await preparePromptOptions(baseOptions, fingerprint);
    singlePromptOptionsCacheRef.current = {
      key: cacheKey,
      prepared,
    };

    return { ...prepared };
  };

  const generateImageWithFallback = async ({
    promptOptions,
    refBase64,
    refUrl,
    aspectRatio,
    imageIndex,
    totalImages,
    productBase64,
    supplementalProductBase64,
    requestBehavior,
    signal,
  }: {
    promptOptions: BuildPromptOptions;
    refBase64: { data: string, mimeType: string } | null;
    refUrl?: string | null;
    aspectRatio: string;
    imageIndex?: number;
    totalImages?: number;
    productBase64?: { data: string, mimeType: string };
    supplementalProductBase64?: { data: string, mimeType: string }[];
    requestBehavior?: ImageRequestBehavior;
    signal?: AbortSignal;
  }): Promise<{ result: { url: string, prompt: string }, usedPromptOptions: BuildPromptOptions }> => {
    let attemptOptions: BuildPromptOptions = { ...promptOptions };
    let prompt = buildPrompt(attemptOptions);

    const result = await generateProductImage(
      productBase64 || productImage!.base64,
      refBase64,
      supplementalProductBase64 || subjectReferenceImages.map(img => img.base64),
      prompt,
      aspectRatio,
      imageSize,
      imageIndex,
      totalImages,
      attemptOptions.textMode,
      requestBehavior,
      refUrl,
      signal
    );

    return { result, usedPromptOptions: attemptOptions };
  };

  const withOperationTimeout = async <T,>(
    operation: (signal: AbortSignal) => Promise<T>,
    timeoutMs: number,
    timeoutMessage: string,
    externalSignal?: AbortSignal,
  ): Promise<T> => {
    const controller = new AbortController();
    let timedOut = false;
    const abortFromExternalSignal = () => {
      controller.abort();
    };

    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort();
      } else {
        externalSignal.addEventListener('abort', abortFromExternalSignal, { once: true });
      }
    }

    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      return await operation(controller.signal);
    } catch (error) {
      if (timedOut && controller.signal.aborted) {
        throw new Error(timeoutMessage);
      }
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', abortFromExternalSignal);
      }
    }
  };

  const analyzeProductFingerprintWithTimeout = (
    mainImageBase64: { data: string; mimeType: string },
    supplementalImagesBase64: { data: string; mimeType: string }[] = [],
    externalSignal?: AbortSignal,
  ) =>
    withOperationTimeout(
      signal => analyzeProductFingerprintWithOpenAI(mainImageBase64, supplementalImagesBase64, signal),
      FINGERPRINT_ANALYSIS_TIMEOUT_MS,
      '产品指纹分析超时，请稍后重试。'
    );

  const analyzeProductIdentityWithTimeout = (
    mainImageBase64: { data: string; mimeType: string },
    supplementalImagesBase64: { data: string; mimeType: string }[] = [],
    contextSignal = '',
  ) =>
    withOperationTimeout(
      signal => analyzeProductIdentityWithOpenAI(mainImageBase64, supplementalImagesBase64, contextSignal, signal),
      IDENTITY_ANALYSIS_TIMEOUT_MS,
      '产品身份识别超时，请稍后重试。'
    );

  const verifyGeneratedImageWithTimeout = (
    generatedImageBase64: { data: string; mimeType: string },
    originalFingerprint: ProductFingerprint,
    mainImageBase64: { data: string; mimeType: string },
    supplementalImagesBase64: { data: string; mimeType: string }[] = [],
    options: { targetOutputLanguage?: string; imageType?: ImageType; expectedCopyText?: string } = {},
  ) =>
    withOperationTimeout(
      signal =>
        verifyGeneratedImage(
          generatedImageBase64,
          originalFingerprint,
          mainImageBase64,
          supplementalImagesBase64,
          options,
          signal,
        ),
      VERIFICATION_TIMEOUT_MS,
      '生成结果校验超时，请稍后重试。'
    );

  const analyzeProductFingerprintWithAbort = (
    mainImageBase64: { data: string; mimeType: string },
    supplementalImagesBase64: { data: string; mimeType: string }[] = [],
    externalSignal?: AbortSignal,
  ) =>
    withOperationTimeout(
      signal => analyzeProductFingerprintWithOpenAI(mainImageBase64, supplementalImagesBase64, signal),
      FINGERPRINT_ANALYSIS_TIMEOUT_MS,
      '产品指纹分析超时，请稍后重试。',
      externalSignal,
    );

  const analyzeProductIdentityWithAbort = (
    mainImageBase64: { data: string; mimeType: string },
    supplementalImagesBase64: { data: string; mimeType: string }[] = [],
    contextSignal = '',
    externalSignal?: AbortSignal,
  ) =>
    withOperationTimeout(
      signal => analyzeProductIdentityWithOpenAI(mainImageBase64, supplementalImagesBase64, contextSignal, signal),
      IDENTITY_ANALYSIS_TIMEOUT_MS,
      '产品身份识别超时，请稍后重试。',
      externalSignal,
    );

  const verifyGeneratedImageWithAbort = (
    generatedImageBase64: { data: string; mimeType: string },
    originalFingerprint: ProductFingerprint,
    mainImageBase64: { data: string; mimeType: string },
    supplementalImagesBase64: { data: string; mimeType: string }[] = [],
    options: { targetOutputLanguage?: string; imageType?: ImageType; expectedCopyText?: string } = {},
    externalSignal?: AbortSignal,
  ) =>
    withOperationTimeout(
      signal =>
        verifyGeneratedImage(
          generatedImageBase64,
          originalFingerprint,
          mainImageBase64,
          supplementalImagesBase64,
          options,
          signal,
        ),
      VERIFICATION_TIMEOUT_MS,
      '生成结果校验超时，请稍后重试。',
      externalSignal,
    );

  const downscaleBaseImageForLocalEdit = async (
    image: { data: string; mimeType: string },
    maxDimension: number = Number.POSITIVE_INFINITY
  ): Promise<{ resized: boolean; image: { data: string; mimeType: string } }> => {
    if (typeof document === 'undefined') {
      return { resized: false, image };
    }

    if (!Number.isFinite(maxDimension) || maxDimension <= 0) {
      return { resized: false, image };
    }

    const imageUrl = `data:${image.mimeType};base64,${image.data}`;

    const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => resolve({ width: img.width, height: img.height });
      img.onerror = () => reject(new Error('当前生成图读取失败，无法进行局部补充修改。'));
      img.src = imageUrl;
    });

    const largestDimension = Math.max(dimensions.width, dimensions.height);
    if (!largestDimension || largestDimension <= maxDimension) {
      return { resized: false, image };
    }

    const scale = maxDimension / largestDimension;
    const targetWidth = Math.max(1, Math.round(dimensions.width * scale));
    const targetHeight = Math.max(1, Math.round(dimensions.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('局部补充修改前处理图片失败，请重试。');
    }

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new window.Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('当前生成图加载失败，无法进行局部补充修改。'));
      element.src = imageUrl;
    });

    context.drawImage(img, 0, 0, targetWidth, targetHeight);

    const resizedBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        blob => {
          if (!blob) {
            reject(new Error('局部补充修改前导出图片失败，请重试。'));
            return;
          }
          resolve(blob);
        },
        'image/png'
      );
    });

    const resizedBase64 = await blobToBase64(resizedBlob);
    return {
      resized: true,
      image: resizedBase64,
    };
  };

  const prepareLocalEditTransportAssets = async ({
    baseImage,
    productReference,
    supplementalReferences = [],
    requestImageSize,
    mode = 'preferred',
  }: {
    baseImage: { data: string; mimeType: string };
    productReference: { data: string; mimeType: string };
    supplementalReferences?: { data: string; mimeType: string }[];
    requestImageSize: string;
    mode?: 'preferred' | 'fallback';
  }) => {
    const baseMaxDimension = getLocalEditTransportMaxDimension(requestImageSize, 'base', mode);
    const referenceMaxDimension = getLocalEditTransportMaxDimension(requestImageSize, 'reference', mode);

    const { image: baseImageBase64, resized: baseResized } = await downscaleBaseImageForLocalEdit(
      baseImage,
      baseMaxDimension,
    );
    const { image: productReferenceBase64, resized: productReferenceResized } = await downscaleBaseImageForLocalEdit(
      productReference,
      referenceMaxDimension,
    );
    const preparedSupplementalReferences = await Promise.all(
      supplementalReferences.map(async reference => {
        const { image } = await downscaleBaseImageForLocalEdit(reference, referenceMaxDimension);
        return image;
      }),
    );

    return {
      baseImageBase64,
      productReferenceBase64,
      supplementalReferences: preparedSupplementalReferences,
      baseResized,
      productReferenceResized,
      baseMaxDimension,
      referenceMaxDimension,
    };
  };

  const getSingleImageOperationTimeoutMs = (operation: 'generate' | 'local_edit') => {
    if (operation === 'local_edit') {
      return (SINGLE_MODE_LOCAL_EDIT_REQUEST_BEHAVIOR.timeoutMs ?? 75000) + 15000;
    }

    return (SINGLE_MODE_REGENERATION_REQUEST_BEHAVIOR.timeoutMs ?? 85000) + 15000;
  };

  const runBatchRowVerification = (
    rowId: string,
    rowNumber: number,
    requestId: string,
    workflowVersion: number,
    generatedImageUrl: string,
    fpToUse: ProductFingerprint,
    usedPromptOptions: BuildPromptOptions,
    externalSignal?: AbortSignal,
  ) => {
    void (async () => {
      try {
        setBatchRowPendingAction(rowId, 'verifying');
        debugLog(`Verifying row ${rowId} asynchronously...`);

        const generatedBase64Obj = await resolveImageUrlToBase64(
          generatedImageUrl,
            `第 ${rowNumber} 行校验图片加载失败`
        );

        const supplementalBase64 = subjectReferenceImages.map(img => img.base64);
        const verification = await verifyGeneratedImageWithAbort(
          generatedBase64Obj,
          fpToUse,
          productImage!.base64,
          supplementalBase64,
          {
            targetOutputLanguage: usedPromptOptions.language,
            imageType: usedPromptOptions.imageType,
            expectedCopyText: usedPromptOptions.copyText?.trim() ? usedPromptOptions.copyText : undefined,
          },
          externalSignal,
        );

        if (!isRowRequestCurrent(rowId, requestId, workflowVersion)) {
          return;
        }

        setVerificationMap(prev => {
          const newMap = new Map(prev);
          newMap.set(rowId, verification);
          return newMap;
        });

        if (!isVerificationPassed(verification)) {
          console.warn(`Row ${rowId} failed verification. Score: ${verification.score}`);
          setRows(prev => {
            if (!isRowRequestCurrent(rowId, requestId, workflowVersion)) {
              return prev;
            }
            const newRows = [...prev];
            const idx = newRows.findIndex(r => r.id === rowId);
            if (idx !== -1 && newRows[idx].generatedImage === generatedImageUrl) {
              newRows[idx] = {
                ...newRows[idx],
                status: 'needs_review',
                error: summarizeVerificationFailures(verification),
              };
            }
            return newRows;
          });
        } else {
          debugLog(`Row ${rowId} passed verification.`);
          setRows(prev => {
            if (!isRowRequestCurrent(rowId, requestId, workflowVersion)) {
              return prev;
            }
            const newRows = [...prev];
            const idx = newRows.findIndex(r => r.id === rowId);
            if (idx !== -1 && newRows[idx].generatedImage === generatedImageUrl) {
              newRows[idx] = { ...newRows[idx], status: 'success', error: undefined };
            }
            return newRows;
          });
        }
      } catch (verErr) {
        console.error(`Verification error for row ${rowNumber}:`, verErr);
        setRows(prev => {
          if (!isRowRequestCurrent(rowId, requestId, workflowVersion)) {
            return prev;
          }
          const newRows = [...prev];
          const idx = newRows.findIndex(r => r.id === rowId);
          if (idx !== -1 && newRows[idx].generatedImage === generatedImageUrl) {
            newRows[idx] = {
              ...newRows[idx],
              status: 'needs_review',
              error: (verErr as Error)?.message || '该行结果校验失败，请稍后重试。',
            };
          }
            return newRows;
          });
      }
      finally {
        setBatchRowPendingAction(rowId, null);
      }
    })();
  };

  const editBatchRowFromCurrentImage = async ({
    currentRow,
    identityProfile,
    adjustmentPrompt,
    basePrompt = '',
    timeoutMessage,
    externalSignal,
  }: {
    currentRow: ExcelRow;
    identityProfile: ProductIdentityProfile | null;
    adjustmentPrompt: string;
    basePrompt?: string;
    timeoutMessage: string;
    externalSignal?: AbortSignal;
  }) => {
    const originalBaseImageBase64 = await resolveImageUrlToBase64(
      currentRow.generatedImage!,
      `第 ${currentRow.rowNumber} 行局部补充修改底图加载失败`
    );

    const baseImageDimensions = await getImageDimensionsFromBase64(originalBaseImageBase64);
    const localEditOutputSize =
      toExplicitOutputSize(baseImageDimensions)
      || currentRow.size;
    const localEditRequestImageSize = resolveLocalEditRequestImageSize(baseImageDimensions, imageSize);
    const localEditSupplementalReferences = getLimitedBase64References(
      subjectReferenceImages,
      MAX_BATCH_LOCAL_EDIT_SUPPLEMENTAL_IMAGES
    );
    const hasReferenceImage = Boolean(currentRow.refUrl?.trim());
    const rowScenePrompt = (currentRow.customPrompt || '').trim();
    const localEditCarryForwardHardConstraints = [
      identityProfile ? buildProductIdentityHardConstraintPrompt(identityProfile) : '',
    ].filter(Boolean).join('\n');
    const localEditPrompt = getBatchRowLocalEditPrompt(
      basePrompt,
      adjustmentPrompt,
      currentRow.copyText,
      rowScenePrompt,
      localEditCarryForwardHardConstraints,
      hasReferenceImage,
    );
    const aspectRatio = parseAspectRatio(currentRow.size);
    const operationTimeoutMs = (BATCH_ROW_LOCAL_EDIT_REQUEST_BEHAVIOR.timeoutMs ?? 75000) + 15000;

    const attemptLocalEdit = async (signal: AbortSignal, mode: 'preferred' | 'fallback') => {
      const transportAssets = await prepareLocalEditTransportAssets({
        baseImage: originalBaseImageBase64,
        productReference: productImage!.base64,
        supplementalReferences: localEditSupplementalReferences,
        requestImageSize: localEditRequestImageSize,
        mode,
      });

      return editGeneratedImageLocally(
        transportAssets.baseImageBase64,
        transportAssets.productReferenceBase64,
        transportAssets.supplementalReferences,
        localEditPrompt,
        aspectRatio,
        localEditRequestImageSize,
        BATCH_ROW_LOCAL_EDIT_REQUEST_BEHAVIOR,
        MAX_BATCH_LOCAL_EDIT_SUPPLEMENTAL_IMAGES,
        hasReferenceImage
          ? { refUrl: currentRow.refUrl.trim() }
          : undefined,
        signal,
      );
    };

    const result = await withOperationTimeout(
      async signal => {
        try {
          return await attemptLocalEdit(signal, 'preferred');
        } catch (error) {
          if (!isLikelyLocalEditTransportFailure(error)) {
            throw error;
          }

          return attemptLocalEdit(signal, 'fallback');
        }
      },
      operationTimeoutMs,
      timeoutMessage,
      externalSignal,
    );

    return {
      result,
      outputSize: localEditOutputSize,
    };
  };

  const regenerateRow = async (
    rowId: string,
    rowData?: ExcelRow,
    activeFp?: ProductFingerprint | null,
    activeIdentityProfile?: ProductIdentityProfile | null
  ) => {
    if (!productImage) {
      setRows(prev => prev.map(row =>
        row.id === rowId
          ? { ...row, status: 'error', error: '请先上传产品图。' }
          : row
      ));
      return;
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setRows(prev => prev.map(row =>
        row.id === rowId
          ? { ...row, status: 'error', error: '网络连接已断开，请恢复后重试。' }
          : row
      ));
      return;
    }

    const currentRow = rowData || rowsRef.current.find(r => r.id === rowId);
    if (!currentRow) {
      setError('当前批量行已不存在，请刷新后重试。');
      return;
    }

    if (currentRow.status === 'generating') {
      setRows(prev => prev.map(row =>
        row.id === rowId
          ? { ...row, error: '这一行正在生成中，请稍候再试。' }
          : row
      ));
      return;
    }
    const { requestId, workflowVersion, controller } = startRowRequest(rowId);
    clearVerificationEntries([rowId]);
    setBatchRowPendingAction(rowId, 'generate');
    
    // Set status to generating
    setRows(prev => {
      if (!isRowRequestCurrent(rowId, requestId, workflowVersion)) {
        return prev;
      }
      const newRows = [...prev];
      const idx = newRows.findIndex(r => r.id === rowId);
      if (idx !== -1) {
        newRows[idx] = { ...newRows[idx], status: 'generating', error: undefined };
      }
      return newRows;
    });

    try {
      const fpToUse =
        activeFp !== undefined
          ? activeFp
          : await ensureStudioFingerprintReadyForBatch();
      const identityProfile =
        activeIdentityProfile !== undefined
          ? activeIdentityProfile
          : await resolveBatchIdentityProfile(fpToUse, currentRow, controller.signal);

      const promptOptions = await preparePromptOptions(
        {
          ...createPromptOptions(true, currentRow, singleGen, Boolean(currentRow.refUrl)),
          identityLockPrompt: identityProfile
            ? buildProductIdentityHardConstraintPrompt(identityProfile)
            : undefined
        },
        fpToUse
      );
      const aspectRatio = parseAspectRatio(currentRow.size);
      const operationTimeoutMs = (BATCH_ROW_GENERATION_REQUEST_BEHAVIOR.timeoutMs ?? 90000) + 15000;
      const { result } = await withOperationTimeout(
        signal =>
          generateImageWithFallback({
            promptOptions,
            refBase64: null,
            refUrl: currentRow.refUrl || null,
            aspectRatio,
            requestBehavior: BATCH_ROW_GENERATION_REQUEST_BEHAVIOR,
            signal,
          }),
        operationTimeoutMs,
        `第 ${currentRow.rowNumber} 行生成超时了，请简化要求后重试。`,
        controller.signal,
      );
      const finalizedResult = await finalizeGeneratedResultForSize(result, currentRow.size);
      if (!hasUsableGeneratedImageResult(finalizedResult)) {
        throw new Error(`第 ${currentRow.rowNumber} 行未返回有效图片结果，请重试。`);
      }

      if (!isRowRequestCurrent(rowId, requestId, workflowVersion)) {
        return;
      }

      const generatedImageUrl = finalizedResult.url;
      const generatedPrompt = finalizedResult.prompt;

      queueGenerationHistoryRecords([generatedImageUrl], 'batch');

      setRows(prev => {
        if (!isRowRequestCurrent(rowId, requestId, workflowVersion)) {
          return prev;
        }
        const newRows = [...prev];
        const idx = newRows.findIndex(r => r.id === rowId);
        if (idx !== -1) {
          newRows[idx] = { 
            ...newRows[idx], 
            status: 'success',
            generatedImage: generatedImageUrl,
            generatedPrompt: generatedPrompt
          };
        }
        return newRows;
      });
      setBatchRowPendingAction(rowId, null);
    } catch (err: any) {
      if (!isRowRequestCurrent(rowId, requestId, workflowVersion)) {
        return;
      }
      console.error(`Error regenerating image for row ${currentRow.rowNumber}:`, err);
      setRows(prev => {
        if (!isRowRequestCurrent(rowId, requestId, workflowVersion)) {
          return prev;
        }
        const newRows = [...prev];
        const idx = newRows.findIndex(r => r.id === rowId);
        if (idx !== -1) {
          newRows[idx] = { ...newRows[idx], status: 'error', error: err.message || '这一行生成失败。' };
        }
        return newRows;
      });
      setBatchRowPendingAction(rowId, null);
    }
  };

  const handleEditBatchRowLocally = async (
    rowId: string,
    rowData?: ExcelRow,
  ) => {
    if (!productImage) {
      setRows(prev => prev.map(row =>
        row.id === rowId
          ? { ...row, status: 'error', error: '请先上传产品图。' }
          : row
      ));
      return;
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setRows(prev => prev.map(row =>
        row.id === rowId
          ? { ...row, status: 'error', error: '网络连接已断开，请恢复后重试。' }
          : row
      ));
      return;
    }

    const currentRow = rowData || rowsRef.current.find(r => r.id === rowId);
    if (!currentRow) {
      setError('当前批量行已不存在，请刷新后重试。');
      return;
    }

    if (currentRow.status === 'generating') {
      setRows(prev => prev.map(row =>
        row.id === rowId
          ? { ...row, error: '这一行正在生成中，请稍候再试。' }
          : row
      ));
      return;
    }

    if (!currentRow.generatedImage) {
      setRows(prev => prev.map(row =>
        row.id === rowId
          ? { ...row, status: 'error', error: '请先生成这一行，再进行局部补充修改。' }
          : row
      ));
      return;
    }

    const adjustmentPrompt = (currentRow.adjustmentPrompt || '').trim();
    if (!adjustmentPrompt) {
      setRows(prev => prev.map(row =>
        row.id === rowId
          ? { ...row, status: 'error', error: '请先填写这一行的局部补充说明。' }
          : row
      ));
      return;
    }

    const { requestId, workflowVersion, controller } = startRowRequest(rowId);
    clearVerificationEntries([rowId]);
    setBatchRowPendingAction(rowId, 'local_edit');

    setRows(prev => {
      if (!isRowRequestCurrent(rowId, requestId, workflowVersion)) {
        return prev;
      }
      const newRows = [...prev];
      const idx = newRows.findIndex(r => r.id === rowId);
      if (idx !== -1) {
        newRows[idx] = { ...newRows[idx], status: 'generating', error: undefined };
      }
      return newRows;
    });

    try {
      const fpToUse = await ensureStudioFingerprintReadyForBatch();
      const identityProfile = await resolveBatchIdentityProfile(fpToUse, currentRow, controller.signal);
      if (!isRowRequestCurrent(rowId, requestId, workflowVersion)) {
        return;
      }

      const { result, outputSize } = await editBatchRowFromCurrentImage({
        currentRow,
        identityProfile,
        adjustmentPrompt,
        externalSignal: controller.signal,
        timeoutMessage: `第 ${currentRow.rowNumber} 行局部补充修改超时了，请简化要求后重试。`
      });
      const finalizedResult = await finalizeGeneratedResultForSize(result, outputSize);
      if (!hasUsableGeneratedImageResult(finalizedResult)) {
        throw new Error(`第 ${currentRow.rowNumber} 行局部补充修改未返回有效图片结果，请重试。`);
      }

      if (!isRowRequestCurrent(rowId, requestId, workflowVersion)) {
        return;
      }

      const generatedImageUrl = finalizedResult.url;
      const generatedPrompt = finalizedResult.prompt;

      queueGenerationHistoryRecords([generatedImageUrl], 'batch');

      setRows(prev => {
        if (!isRowRequestCurrent(rowId, requestId, workflowVersion)) {
          return prev;
        }
        const newRows = [...prev];
        const idx = newRows.findIndex(r => r.id === rowId);
        if (idx !== -1) {
          newRows[idx] = {
            ...newRows[idx],
            status: 'success',
            generatedImage: generatedImageUrl,
            generatedPrompt,
          };
        }
        return newRows;
      });
      setBatchRowPendingAction(rowId, null);
    } catch (err: any) {
      if (!isRowRequestCurrent(rowId, requestId, workflowVersion)) {
        return;
      }

      console.error(`Error locally editing image for row ${currentRow.rowNumber}:`, err);
      setRows(prev => {
        if (!isRowRequestCurrent(rowId, requestId, workflowVersion)) {
          return prev;
        }
        const newRows = [...prev];
        const idx = newRows.findIndex(r => r.id === rowId);
        if (idx !== -1) {
          newRows[idx] = { ...newRows[idx], status: 'error', error: err.message || '这一行局部补充修改失败。' };
        }
        return newRows;
      });
      setBatchRowPendingAction(rowId, null);
    }
  };

  const handleSingleGenerate = async () => {
    if (!productImage) {
      setSingleGen(prev => ({ ...prev, error: '请先上传产品图。' }));
      return;
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setSingleGen(prev => ({ ...prev, error: '网络连接已断开，请恢复后重试。' }));
      return;
    }

    const activeFp = !isFingerprintDirty ? productFingerprint : null;
    const { requestId, workflowVersion, controller } = startSingleGenerateRequest();

    setSingleGeneratePhase('preparing');
    setSingleGen(prev => ({ ...prev, status: 'generating', error: '', generatedImages: [] }));
    setVerificationMap(new Map());
    setError(null);

    try {
      const hasRef = !!referenceImage;
      const identityProfile = await resolveSingleIdentityProfile(activeFp, controller.signal);
      if (!isSingleGenerateRequestCurrent(requestId, workflowVersion)) {
        return;
      }
      const basePromptOptions = await prepareSinglePromptOptions(activeFp, hasRef, identityProfile);
      if (!isSingleGenerateRequestCurrent(requestId, workflowVersion)) {
        return;
      }
      setSingleGeneratePhase('generating');
      const aspectRatio = parseAspectRatio(singleGen.size);

      const concurrencyLimit = MAX_BATCH_STYLE_CONCURRENCY;
      const total = singleGen.count;
      const maxGenerationPasses = 2;
      const resultsByIndex = new Map<number, SingleGeneratedImage>();
      let pendingImageIndices = Array.from({ length: total }, (_, idx) => idx + 1);
      let lastError = '';

      for (let pass = 0; pass < maxGenerationPasses && pendingImageIndices.length > 0; pass++) {
        const currentPassIndices = [...pendingImageIndices];
        pendingImageIndices = [];

        for (let i = 0; i < currentPassIndices.length; i += concurrencyLimit) {
          const chunkIndices = currentPassIndices.slice(i, i + concurrencyLimit);
          const chunkPromises = chunkIndices.map(async (imageIndex) => {
          const imageId = createSingleImageStableId(imageIndex);
          const operationTimeoutMs = getSingleImageOperationTimeoutMs('generate');
          const { result } = await withOperationTimeout(
            signal =>
              generateImageWithFallback({
                promptOptions: basePromptOptions,
                refBase64: hasRef ? referenceImage.base64 : null,
                aspectRatio,
                imageIndex,
                totalImages: total,
                requestBehavior: SINGLE_MODE_REGENERATION_REQUEST_BEHAVIOR,
                signal,
              }),
            operationTimeoutMs,
            `第 ${imageIndex} 张图生成超时了，请简化要求后重试。`,
            controller.signal,
          );
          const finalizedResult = await finalizeGeneratedResultForSize(result, singleGen.size);

          if (!isSingleGenerateRequestCurrent(requestId, workflowVersion)) {
            return { imageIndex, result: finalizedResult, imageId, stale: true };
          }
          return { imageIndex, imageId, result: finalizedResult, stale: false };
        });

          const chunkResults = await Promise.allSettled(chunkPromises);
          if (!isSingleGenerateRequestCurrent(requestId, workflowVersion)) {
            return;
          }

          chunkResults.forEach((item, resultIdx) => {
            const imageIndex = chunkIndices[resultIdx];

            if (item.status === 'fulfilled' && !item.value.stale) {
              resultsByIndex.set(imageIndex, {
                ...buildSingleGeneratedImage(
                  imageIndex,
                  item.value.result,
                  resultsByIndex.get(imageIndex)?.adjustmentPrompt || ''
                ),
              });
              queueGenerationHistoryRecords([item.value.result.url], 'single');
            } else {
              pendingImageIndices.push(imageIndex);
              lastError =
                item.status === 'rejected'
                  ? (item.reason?.message || '生成失败，请稍后重试。')
                  : (lastError || '生成失败，请稍后重试。');
            }
          });

          if (!isSingleGenerateRequestCurrent(requestId, workflowVersion)) {
            return;
          }

          setSingleGen(prev => ({
            ...prev,
            generatedImages: Array.from({ length: total }, (_, resultIdx) => resultsByIndex.get(resultIdx + 1))
              .filter((item): item is SingleGeneratedImage => !!item)
          }));
        }
      }

      const successfulCount = resultsByIndex.size;
      if (!isSingleGenerateRequestCurrent(requestId, workflowVersion)) {
        return;
      }

      if (successfulCount === 0 && lastError) {
        setSingleGeneratePhase('idle');
        throw new Error(lastError);
      } else if (pendingImageIndices.length > 0) {
        setSingleGeneratePhase('idle');
        const partialMessage = `本次成功生成 ${successfulCount}/${total} 张图，仍有 ${pendingImageIndices.length} 张失败。${lastError}`.trim();
        setSingleGen(prev => ({ ...prev, status: 'needs_review', error: partialMessage }));
      } else {
        setSingleGeneratePhase('idle');
        setSingleGen(prev => ({ ...prev, status: 'success' }));
      }
    } catch (err: any) {
      if (!isSingleGenerateRequestCurrent(requestId, workflowVersion)) {
        return;
      }
      setSingleGeneratePhase('idle');
      setSingleGen(prev => ({ ...prev, status: 'error', error: err.message || '生成失败，请稍后重试。' }));
    }
  };

  const handleRegenerateSingleImage = async (indexToRegenerate: number) => {
    if (!productImage) {
      setSingleGen(prev => ({ ...prev, error: '请先上传产品图。' }));
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setSingleGen(prev => ({ ...prev, error: '网络连接已断开，请恢复后重试。' }));
      return;
    }

    const regenerationWatchdogMs = getSingleImageOperationTimeoutMs('generate') + 15000;
    if (!tryStartSingleImageRegeneration(indexToRegenerate, 'regenerate', regenerationWatchdogMs)) {
      if (!isSingleImageRegenerating(indexToRegenerate) && hasReachedSingleImageRegenerationLimit) {
        setSingleGen(prev => ({
          ...prev,
          error: `同时最多只能处理 ${MAX_CONCURRENT_SINGLE_IMAGE_REGENERATIONS} 张单图，请稍候再试。`,
        }));
      } else {
        setSingleGen(prev => ({
          ...prev,
          error: `第 ${indexToRegenerate + 1} 张图正在处理中，请稍候再试。`,
        }));
      }
      return;
    }

    const { requestId, workflowVersion, controller } = startSingleImageRequest(indexToRegenerate);
    const currentImageId = singleGen.generatedImages[indexToRegenerate]?.id || createSingleImageStableId(indexToRegenerate + 1);
    clearVerificationEntries([currentImageId]);

    try {
      setSingleGen(prev => ({ ...prev, error: '' }));
      const fpToUse = !isFingerprintDirty ? productFingerprint : null;
      const regenerateLogPrefix = `[single-regenerate:${indexToRegenerate + 1}]`;

      const hasRef = !!referenceImage;
      const promptPreparationStartedAt = Date.now();
      debugLog(`${regenerateLogPrefix} prompt preparation start`, {
        hasReferenceImage: hasRef,
        supplementalReferenceCount: subjectReferenceImages.length,
      });
      const identityProfile = await resolveSingleIdentityProfile(fpToUse, controller.signal);
      if (!isSingleImageRequestCurrent(indexToRegenerate, requestId, workflowVersion)) {
        return;
      }
      const promptOptions = await prepareSinglePromptOptions(fpToUse, hasRef, identityProfile);
      if (!isSingleImageRequestCurrent(indexToRegenerate, requestId, workflowVersion)) {
        return;
      }
      debugLog(`${regenerateLogPrefix} prompt preparation end`, {
        durationMs: Date.now() - promptPreparationStartedAt,
      });
      const aspectRatio = parseAspectRatio(singleGen.size);
      const supplementalRetryReferences = subjectReferenceImages.slice(0, 1).map(img => img.base64);
      const operationTimeoutMs = getSingleImageOperationTimeoutMs('generate');
      const { result, usedPromptOptions } = await withOperationTimeout(
        signal =>
          generateImageWithFallback({
            promptOptions,
            refBase64: hasRef ? referenceImage.base64 : null,
            aspectRatio,
            imageIndex: indexToRegenerate + 1,
            totalImages: singleGen.count,
            supplementalProductBase64: supplementalRetryReferences,
            requestBehavior: SINGLE_MODE_REGENERATION_REQUEST_BEHAVIOR,
            signal,
          }),
        operationTimeoutMs,
        `第 ${indexToRegenerate + 1} 张图重新生成超时了，请简化要求后重试。`,
        controller.signal,
      );
      const finalizedResult = await finalizeGeneratedResultForSize(result, singleGen.size);
      if (!isSingleImageRequestCurrent(indexToRegenerate, requestId, workflowVersion)) {
        return;
      }

      queueGenerationHistoryRecords([finalizedResult.url], 'single');

      setSingleGen(prev => {
        if (!isSingleImageRequestCurrent(indexToRegenerate, requestId, workflowVersion)) {
          return prev;
        }
        const newImages = [...prev.generatedImages];
        newImages[indexToRegenerate] = buildSingleGeneratedImage(
          indexToRegenerate + 1,
          finalizedResult,
          prev.generatedImages[indexToRegenerate]?.adjustmentPrompt || ''
        );
        return { ...prev, generatedImages: newImages, status: 'success' };
      });
    } catch (err: any) {
      if (!isSingleImageRequestCurrent(indexToRegenerate, requestId, workflowVersion)) {
        return;
      }
      setSingleGen(prev => ({
        ...prev,
        error: `第 ${indexToRegenerate + 1} 张图重新生成失败：${err.message}`,
      }));
    } finally {
      finishSingleImageRegeneration(indexToRegenerate, requestId);
    }
  };

  const handleEditSingleImageLocally = async (indexToEdit: number) => {
    if (!productImage) {
      setSingleGen(prev => ({ ...prev, error: '请先上传产品图。' }));
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setSingleGen(prev => ({ ...prev, error: '网络连接已断开，请恢复后重试。' }));
      return;
    }

    const currentImage = singleGen.generatedImages[indexToEdit];
    const adjustmentPrompt = currentImage?.adjustmentPrompt?.trim() || '';

    if (!currentImage) {
      setSingleGen(prev => ({ ...prev, error: '当前图片已不存在，请重新生成后再试。' }));
      return;
    }

    if (!adjustmentPrompt) {
      setSingleGen(prev => ({ ...prev, error: '请先填写这张图的局部补充说明。' }));
      return;
    }

    const localEditWatchdogMs = getSingleImageOperationTimeoutMs('local_edit') + 15000;
    if (!tryStartSingleImageRegeneration(indexToEdit, 'local_edit', localEditWatchdogMs)) {
      if (!isSingleImageRegenerating(indexToEdit) && hasReachedSingleImageRegenerationLimit) {
        setSingleGen(prev => ({
          ...prev,
          error: `同时最多只能处理 ${MAX_CONCURRENT_SINGLE_IMAGE_REGENERATIONS} 张单图，请稍候再试。`,
        }));
      } else {
        setSingleGen(prev => ({
          ...prev,
          error: `第 ${indexToEdit + 1} 张图正在处理中，请稍候再试。`,
        }));
      }
      return;
    }

    const { requestId, workflowVersion, controller } = startSingleImageRequest(indexToEdit);
    const currentImageId = currentImage.id || createSingleImageStableId(indexToEdit + 1);
    clearVerificationEntries([currentImageId]);

    const localEditLogPrefix = `[single-local-edit:${indexToEdit + 1}]`;

    try {
      setSingleGen(prev => ({ ...prev, error: '' }));
      const fpToUse = !isFingerprintDirty ? productFingerprint : null;
      const operationTimeoutMs = getSingleImageOperationTimeoutMs('local_edit');
      let localEditOutputSize = singleGen.size;
      let localEditRequestImageSize = imageSize;
      const result = await withOperationTimeout(
        async signal => {
          const baseConversionStartedAt = Date.now();
          debugLog(`${localEditLogPrefix} base image conversion start`, {
            source: currentImage.url.startsWith('data:') ? 'data_url' : 'remote_url',
          });
          const originalBaseImageBase64 = await resolveImageUrlToBase64(
            currentImage.url,
            `第 ${indexToEdit + 1} 张图局部补充修改底图加载失败`,
            signal,
          );
          debugLog(`${localEditLogPrefix} base image conversion end`, {
            durationMs: Date.now() - baseConversionStartedAt,
            mimeType: originalBaseImageBase64.mimeType,
            base64Length: originalBaseImageBase64.data.length,
          });
          const baseImageDimensions = await getImageDimensionsFromBase64(originalBaseImageBase64);
          localEditOutputSize =
            toExplicitOutputSize(baseImageDimensions)
            || singleGen.size;
          localEditRequestImageSize = resolveLocalEditRequestImageSize(baseImageDimensions, imageSize);

          const aspectRatio = parseAspectRatio(singleGen.size);
          const localEditPrompt = getSingleImageLocalEditPrompt(
            singleGen.prompt,
            adjustmentPrompt,
            singleGen.copyText
          );
          const localEditImageSize = localEditRequestImageSize;
          const localEditSupplementalReferences = getLimitedBase64References(
            subjectReferenceImages,
            MAX_SINGLE_LOCAL_EDIT_SUPPLEMENTAL_IMAGES
          );
          const attemptLocalEdit = async (mode: 'preferred' | 'fallback') => {
            const baseResizeStartedAt = Date.now();
            debugLog(`${localEditLogPrefix} base image resize check start`, {
              mode,
            });
            const transportAssets = await prepareLocalEditTransportAssets({
              baseImage: originalBaseImageBase64,
              productReference: productImage.base64,
              supplementalReferences: localEditSupplementalReferences,
              requestImageSize: localEditImageSize,
              mode,
            });
            debugLog(`${localEditLogPrefix} base image resize check end`, {
              durationMs: Date.now() - baseResizeStartedAt,
              resized: transportAssets.baseResized,
              mimeType: transportAssets.baseImageBase64.mimeType,
              base64Length: transportAssets.baseImageBase64.data.length,
              maxDimension: transportAssets.baseMaxDimension,
            });
            debugLog(`${localEditLogPrefix} product reference resize check end`, {
              resized: transportAssets.productReferenceResized,
              mimeType: transportAssets.productReferenceBase64.mimeType,
              base64Length: transportAssets.productReferenceBase64.data.length,
              maxDimension: transportAssets.referenceMaxDimension,
            });

            debugLog(`${localEditLogPrefix} local edit request start`, {
              aspectRatio,
              imageSize: localEditImageSize,
              supplementalReferenceCount: localEditSupplementalReferences.length,
              promptLength: localEditPrompt.length,
              mode,
            });

            const requestStartedAt = Date.now();

            try {
              const editedResult = await editGeneratedImageLocally(
                transportAssets.baseImageBase64,
                transportAssets.productReferenceBase64,
                transportAssets.supplementalReferences,
                localEditPrompt,
                aspectRatio,
                localEditImageSize,
                SINGLE_MODE_LOCAL_EDIT_REQUEST_BEHAVIOR,
                MAX_SINGLE_LOCAL_EDIT_SUPPLEMENTAL_IMAGES,
                undefined,
                signal,
              );

              debugLog(`${localEditLogPrefix} local edit request end`, {
                durationMs: Date.now() - requestStartedAt,
                returnedImage: editedResult.url.startsWith('data:image'),
                mode,
              });

              return editedResult;
            } catch (requestError: any) {
              console.error(`${localEditLogPrefix} local edit request failed`, {
                durationMs: Date.now() - requestStartedAt,
                reason: requestError?.message || String(requestError),
                mode,
              });
              throw requestError;
            }
          };

          try {
            return await attemptLocalEdit('preferred');
          } catch (requestError) {
            if (!isLikelyLocalEditTransportFailure(requestError)) {
              throw requestError;
            }

            return attemptLocalEdit('fallback');
          }
        },
        operationTimeoutMs,
        `第 ${indexToEdit + 1} 张图局部补充修改超时了，请简化要求后重试。`,
        controller.signal,
      );
      const finalizedResult = await finalizeGeneratedResultForSize(result, localEditOutputSize);
      if (!isSingleImageRequestCurrent(indexToEdit, requestId, workflowVersion)) {
        return;
      }

      queueGenerationHistoryRecords([finalizedResult.url], 'single');

      setSingleGen(prev => {
        if (!isSingleImageRequestCurrent(indexToEdit, requestId, workflowVersion)) {
          return prev;
        }
        const newImages = [...prev.generatedImages];
        newImages[indexToEdit] = buildSingleGeneratedImage(
          indexToEdit + 1,
          finalizedResult,
          prev.generatedImages[indexToEdit]?.adjustmentPrompt || ''
        );
        return { ...prev, generatedImages: newImages, status: 'success' };
      });
    } catch (err: any) {
      if (!isSingleImageRequestCurrent(indexToEdit, requestId, workflowVersion)) {
        return;
      }
      console.error(`${localEditLogPrefix} final error`, err);
      setSingleGen(prev => ({
        ...prev,
        error: `第 ${indexToEdit + 1} 张图局部补充修改失败：${err.message}`,
      }));
    } finally {
      debugLog(`${localEditLogPrefix} loading cleanup`);
      finishSingleImageRegeneration(indexToEdit, requestId);
    }
  };

  const generateImages = async () => {
    if (!productImage) {
      setError('请先上传产品图。');
      return;
    }
    if (rowsRef.current.length === 0) {
      setError('请先上传包含有效数据的 Excel 文件。');
      return;
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setError('网络连接已断开，请恢复后重试。');
      return;
    }

    const { requestId, workflowVersion, controller } = startBatchGenerationRequest();
    setIsGenerating(true);
    setError(null);

    try {
      const activeFp = await ensureStudioFingerprintReadyForBatch();
      if (!isBatchGenerationRequestCurrent(requestId, workflowVersion)) {
        return;
      }

      const activeIdentityProfile = await resolveBatchIdentityProfile(activeFp, rowsRef.current[0], controller.signal);
      if (!isBatchGenerationRequestCurrent(requestId, workflowVersion)) {
        return;
      }

      const rowsToProcess = rowsRef.current.map(row => ({ ...row }));
      const rowIdsToProcess = rowsToProcess.map(row => row.id);

      clearVerificationEntries(rowIdsToProcess);
      setBatchRowPendingActions({});
      setRows(prev =>
        prev.map(row =>
          rowIdsToProcess.includes(row.id)
            ? {
                ...row,
                status: 'pending',
                generatedImage: undefined,
                generatedPrompt: undefined,
                error: undefined,
              }
            : row,
        ),
      );

      const concurrencyLimit = MAX_BATCH_STYLE_CONCURRENCY;

      for (let i = 0; i < rowsToProcess.length; i += concurrencyLimit) {
        if (!isBatchGenerationRequestCurrent(requestId, workflowVersion)) {
          return;
        }
        const chunk = rowsToProcess.slice(i, i + concurrencyLimit);
        await Promise.all(chunk.map(row => regenerateRow(row.id, row, activeFp, activeIdentityProfile)));
      }
    } catch (err: any) {
      if (!isBatchGenerationRequestCurrent(requestId, workflowVersion)) {
        return;
      }
      setError(err?.message || '批量生成失败，请稍后重试。');
    } finally {
      if (isBatchGenerationRequestCurrent(requestId, workflowVersion)) {
        setIsGenerating(false);
      }
    }
  };

  const getImageExtension = (url: string): string => {
    if (url.startsWith('data:image/')) {
      const mimePart = url.slice('data:image/'.length).split(';')[0].toLowerCase();
      if (mimePart === 'jpeg') return 'jpg';
      if (mimePart === 'svg+xml') return 'svg';
      return mimePart || 'png';
    }

    const cleanUrl = url.split('?')[0].split('#')[0];
    const match = cleanUrl.match(/\.([a-zA-Z0-9]+)$/);
    if (!match) return 'png';

    const ext = match[1].toLowerCase();
    return ext === 'jpeg' ? 'jpg' : ext;
  };

  const createUniqueDownloadName = (extension: string): string => {
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    const randomBuffer = new Uint32Array(12);

    for (let attempt = 0; attempt < 20; attempt++) {
      crypto.getRandomValues(randomBuffer);
      let stem = '';

      for (let i = 0; i < randomBuffer.length; i++) {
        stem += chars[randomBuffer[i] % chars.length];
      }

      const candidate = `${stem}.${extension}`;
      if (!usedDownloadNamesRef.current.has(candidate)) {
        usedDownloadNamesRef.current.add(candidate);
        return candidate;
      }
    }

    const fallback = `${Date.now()}${Math.random().toString(36).slice(2, 10)}.${extension}`;
    usedDownloadNamesRef.current.add(fallback);
    return fallback;
  };

  const forceImageToExactOutputSize = async (imageUrl: string, size: string): Promise<string> => {
    const dimensions = getExplicitOutputDimensions(size);
    if (!dimensions) {
      return imageUrl;
    }

    const sourceBase64 = await resolveImageUrlToBase64(
      imageUrl,
      '输出指定尺寸时源图片加载失败'
    );

    const sourceDataUrl = base64ToDataUrl(sourceBase64);
    const image = await loadImageFromDataUrl(sourceDataUrl);

    if (image.naturalWidth === dimensions.width && image.naturalHeight === dimensions.height) {
      return sourceDataUrl;
    }

    const canvas = document.createElement('canvas');
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('输出指定尺寸图片时发生错误，请重试。');
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.clearRect(0, 0, dimensions.width, dimensions.height);
    context.drawImage(image, 0, 0, dimensions.width, dimensions.height);

    return canvas.toDataURL(sourceBase64.mimeType === 'image/png' ? 'image/png' : 'image/png');
  };

  const finalizeGeneratedResultForSize = async (
    result: { url: string; prompt: string },
    size: string
  ) => ({
    ...result,
    url: await forceImageToExactOutputSize(result.url, size),
  });

  const getSingleImageLocalEditPrompt = (
    basePrompt: string,
    adjustmentPrompt: string,
    copyText: string,
    carryForwardContext: string = ''
  ) => {
    const trimmedBasePrompt = buildCompactBackgroundContext(basePrompt);
    const trimmedCarryForwardContext = buildCompactBackgroundContext(carryForwardContext);
    const trimmedAdjustmentPrompt = adjustmentPrompt.trim();
    const trimmedCopyText = copyText.trim();

    const lines = [
      "LOCAL EDIT TASK:",
      `- REQUIRED VISIBLE CHANGE: "${trimmedAdjustmentPrompt}".`,
      "- The required visible change above is the highest-priority instruction for this edit and must be visibly satisfied in the final image.",
      "- The final image must visibly reflect the requested change. Returning an unchanged or almost unchanged image is incorrect.",
      "- Treat the first image only as the current starting image to edit, not as a truth source.",
      "- Keep the same uploaded product identity so the result still matches the uploaded product reference exactly.",
      "- Keep the edit footprint as small as possible. Do not rewrite unrelated parts of the scene, lighting, product, or composition when they are not part of the request.",
      "- If the current image conflicts with the user's hard constraints, correct the product pose, opening direction, spatial relationship, interaction, or composition instead of preserving the mistake.",
      "- Do NOT keep an incorrect product angle, incorrect opening direction, incorrect pouring direction, or incorrect interaction simply because it already appears in the current image.",
      "- If the user explicitly asks to change the size, scale, placement, visibility, or styling of a support element, planter, basket, stand, base, prop, packaging element, or nearby accessory, make that change while keeping the main uploaded subject recognizable.",
      "- When the requested change is local or small, keep the rest of the image as close as possible to the current result.",
      "- Do NOT merge the uploaded product with any placeholder product or borrow structure from another product.",
      "- Keep useful background elements and unrelated scene details only when they do not conflict with the user's hard constraints.",
      "- Do not turn this into a different product or an unrelated concept."
    ];

    if (trimmedCopyText) {
      lines.push(`- The final edited image must render this exact marketing copy unless the user explicitly asks to remove or rewrite it: "${trimmedCopyText}".`);
      lines.push("- The local edit request and the exact marketing copy requirement must both be satisfied in the same final image.");
      lines.push("- If the current image is missing the required marketing copy, add it in a clean, legible, commercially usable layout instead of preserving a text-free version.");
      lines.push("- If the user's request is about text layout, move, rotate, align, resize, or reposition the existing text accordingly while keeping the wording unchanged unless the user explicitly asks to rewrite the text.");
    }

    if (trimmedBasePrompt) {
      lines.push("- Use the earlier generation context below only as low-priority background guidance. Ignore any part that conflicts with the current local edit request or the exact marketing copy requirement.");
      lines.push(`- EARLIER GENERATION CONTEXT: "${trimmedBasePrompt}".`);
    }

    if (trimmedCarryForwardContext && trimmedCarryForwardContext !== trimmedBasePrompt) {
      lines.push("- Additional earlier requirements below are secondary context only. They may guide the edit, but they must not override the current local edit request or the exact marketing copy requirement.");
      lines.push(`- EARLIER GLOBAL CONTEXT: "${trimmedCarryForwardContext}".`);
    }

    lines.push("- Before finishing, make sure a reviewer can clearly point to the requested change and, when required, the exact marketing copy in the final image.");

    return lines.join('\n');
  };

  const getBatchRowLocalEditPrompt = (
    basePrompt: string,
    adjustmentPrompt: string,
    copyText: string,
    rowScenePrompt: string = '',
    carryForwardContext: string = '',
    hasReferenceImage: boolean = false,
  ) => {
    const trimmedRowScenePrompt = buildCompactBackgroundContext(rowScenePrompt, 6, 800);
    const prompt = getSingleImageLocalEditPrompt(
      basePrompt,
      adjustmentPrompt,
      copyText,
      carryForwardContext,
    );

    if (!trimmedRowScenePrompt && !hasReferenceImage) {
      return prompt;
    }

    const lines = [prompt];

    if (trimmedRowScenePrompt) {
      lines.push('- The row-level scene instructions below are still active for this batch row. Keep every part that does not directly conflict with the current local edit request.');
      lines.push(`- ACTIVE ROW SCENE INSTRUCTIONS: "${trimmedRowScenePrompt}".`);
      lines.push('- If the current local edit request asks to change the background or scene, reinterpret the row-level scene instructions inside the new scene instead of discarding them entirely, unless the user explicitly asks to remove those constraints.');
      lines.push('- Do not replace the scene with an unrelated setting that ignores the row-level scene instructions.');
    }

    if (hasReferenceImage) {
      lines.push('- A row-level reference image is also provided for this edit, but it is only tertiary guidance after the current local edit request and the row-level scene instructions.');
      lines.push('- Priority order for this edit: current local edit request > row-level scene instructions > reference image guidance > previous generated scene.');
      lines.push('- Use the reference image only after the requested local change and the row-level scene instructions are both satisfied.');
    }

    return lines.join('\n');
  };

  const handleSingleImageAdjustmentChange = (index: number, adjustmentPrompt: string) => {
    setSingleGen(prev => {
      const newImages = [...prev.generatedImages];
      if (!newImages[index]) {
        return prev;
      }

      newImages[index] = {
        ...newImages[index],
        adjustmentPrompt,
      };

      return {
        ...prev,
        generatedImages: newImages,
      };
    });
  };

  const isSingleImageRegenerating = (index: number) => singleGen.regeneratingIndices.includes(index);
  const hasReachedSingleImageRegenerationLimit =
    singleGen.regeneratingIndices.length >= MAX_CONCURRENT_SINGLE_IMAGE_REGENERATIONS;

  const tryStartSingleImageRegeneration = (
    index: number,
    operationKind: SingleImageOperationKind,
    timeoutMs: number = SINGLE_IMAGE_REGENERATION_WATCHDOG_MS
  ) => {
    const currentSingleGen = singleGenRef.current;

    if (
      currentSingleGen.regeneratingIndices.includes(index) ||
      currentSingleGen.regeneratingIndices.length >= MAX_CONCURRENT_SINGLE_IMAGE_REGENERATIONS
    ) {
      return false;
    }

    const startedAt = Date.now();
    const timeoutAt = startedAt + timeoutMs;
    debugLog(`[single-operation:${index + 1}] start`, {
      operationKind,
      timeoutMs,
      timeoutAt,
    });

    singleGenRef.current = {
      ...currentSingleGen,
      regeneratingIndices: [...currentSingleGen.regeneratingIndices, index],
      regenerationStartedAt: {
        ...currentSingleGen.regenerationStartedAt,
        [index]: startedAt,
      },
      regenerationTimeoutAt: {
        ...currentSingleGen.regenerationTimeoutAt,
        [index]: timeoutAt,
      },
      regenerationKinds: {
        ...currentSingleGen.regenerationKinds,
        [index]: operationKind,
      },
    };

    setSingleGen(prev => {
      if (
        prev.regeneratingIndices.includes(index) ||
        prev.regeneratingIndices.length >= MAX_CONCURRENT_SINGLE_IMAGE_REGENERATIONS
      ) {
        return prev;
      }

      return {
        ...prev,
        regeneratingIndices: [...prev.regeneratingIndices, index],
        regenerationStartedAt: {
          ...prev.regenerationStartedAt,
          [index]: startedAt,
        },
        regenerationTimeoutAt: {
          ...prev.regenerationTimeoutAt,
          [index]: timeoutAt,
        },
        regenerationKinds: {
          ...prev.regenerationKinds,
          [index]: operationKind,
        },
      };
    });

    return true;
  };

  const finishSingleImageRegeneration = (index: number, requestId?: string) => {
    if (requestId && singleImageRequestIdsRef.current.get(index) !== requestId) {
      return;
    }

    const currentSingleGen = singleGenRef.current;
    const operationKind = currentSingleGen.regenerationKinds[index] || 'regenerate';
    const nextStartedAt = { ...currentSingleGen.regenerationStartedAt };
    const nextTimeoutAt = { ...currentSingleGen.regenerationTimeoutAt };
    const nextKinds = { ...currentSingleGen.regenerationKinds };
    delete nextStartedAt[index];
    delete nextTimeoutAt[index];
    delete nextKinds[index];

    singleGenRef.current = {
      ...currentSingleGen,
      regeneratingIndices: currentSingleGen.regeneratingIndices.filter(currentIndex => currentIndex !== index),
      regenerationStartedAt: nextStartedAt,
      regenerationTimeoutAt: nextTimeoutAt,
      regenerationKinds: nextKinds,
    };

    debugLog(`[single-operation:${index + 1}] finish`, {
      operationKind,
    });

    setSingleGen(prev => {
      const nextStartedAt = { ...prev.regenerationStartedAt };
      const nextTimeoutAt = { ...prev.regenerationTimeoutAt };
      const nextKinds = { ...prev.regenerationKinds };
      delete nextStartedAt[index];
      delete nextTimeoutAt[index];
      delete nextKinds[index];

      return {
        ...prev,
        regeneratingIndices: prev.regeneratingIndices.filter(currentIndex => currentIndex !== index),
        regenerationStartedAt: nextStartedAt,
        regenerationTimeoutAt: nextTimeoutAt,
        regenerationKinds: nextKinds,
      };
    });
  };

  const downloadImage = (url: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = createUniqueDownloadName(getImageExtension(url));
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const detailSetPlanPreview = buildResolvedDetailSetPlan(detailSetFingerprint);
  const isHomeView = workspaceMode === 'home';
  const isFavoritesView = workspaceMode === 'favorites';
  const isHistoryView = workspaceMode === 'history';
  const isPlaceholderView = workspaceMode === 'placeholder';
  const usesWideWorkspaceCanvas = isHomeView || isFavoritesView || isHistoryView || isPlaceholderView;
  const isSingleStudioMode = workspaceMode === 'studio' && studioMode === 'single';
  const isBatchStudioMode = workspaceMode === 'studio' && studioMode === 'batch';
  const activePlaceholderCopy = placeholderMode ? PLACEHOLDER_PAGE_COPY[placeholderMode] : null;
  const showTopStudioError = isBatchStudioMode && !!error;
  const showSingleSectionError = isSingleStudioMode && !!singleGen.error;
  const detailSetStepIndex = (
    {
      idle: 1,
      analyzing: 2,
      planning: 3,
      generating: 4,
      completed: 5,
      error: 1,
    } as Record<typeof detailSet.status, number>
  )[detailSet.status];

  const isAnyDetailSetItemGenerating =
    detailSet.generatedItems.some(item => item.status === 'generating') ||
    Object.keys(detailItemPendingActions).length > 0;

  const handleToggleHomeMediaFavorite = (mediaId: string) => {
    setFavoriteHomeMediaIds(prev =>
      prev.includes(mediaId)
        ? prev.filter(id => id !== mediaId)
        : [...prev, mediaId]
    );
  };

  const handleSidebarNavigate = (key: SidebarKey) => {
    if (key === 'home') {
      onNavigateEntry('home');
      return;
    }

    if (key === 'favorites') {
      onNavigateEntry('favorites');
      return;
    }

    if (key === 'detail') {
      onNavigateEntry('detail');
      return;
    }

    if (key === 'single') {
      onNavigateEntry('single');
      return;
    }
    if (key === 'batch') {
      onNavigateEntry('batch');
      return;
    }

    if (key === 'history') {
      onNavigateEntry('history');
      return;
    }

    if (key === 'uploads') {
      onNavigateEntry('uploads');
      return;
    }

    if (key === 'prompts') {
      onNavigateEntry('prompts');
      return;
    }

    if (key === 'styles') {
      onNavigateEntry('styles');
      return;
    }

    if (key === 'text-to-image') {
      onNavigateEntry('text-to-image');
      return;
    }

    if (key === 'ai-video') {
      onNavigateEntry('ai-video');
    }
  };

  const sidebarGroups = [
    {
      title: '工作台',
      items: [
        { key: 'home' as const, label: 'Home', icon: House, active: isHomeView },
        { key: 'single' as const, label: '单图生成', icon: ImageIcon, active: isSingleStudioMode },
        { key: 'batch' as const, label: '批量生成', icon: FileSpreadsheet, active: isBatchStudioMode },
        { key: 'detail' as const, label: '详情图生成', icon: Layers, active: workspaceMode === 'detail_set' },
      ],
    },
    {
      title: '资产',
      items: [
        { key: 'history' as const, label: '我的生成记录', icon: Download, active: false },
        { key: 'favorites' as const, label: '我的收藏', icon: Star, active: isFavoritesView },
        { key: 'uploads' as const, label: '上传素材', icon: Upload, active: false },
      ],
    },
    {
      title: '高级',
      items: [
        { key: 'prompts' as const, label: 'Prompt 模板', icon: Wand2, active: false },
        { key: 'styles' as const, label: '风格库', icon: Palette, active: false },
      ],
    },
  ];

  const resolvedSidebarGroups = sidebarGroups.map((group, groupIndex) => {
    const nextItems = group.items.map(item => {
      if (item.key === 'history') {
        return { ...item, active: isHistoryView };
      }

      if (item.key === 'uploads') {
        return { ...item, active: placeholderMode === 'uploads' };
      }

      if (item.key === 'prompts') {
        return { ...item, active: placeholderMode === 'prompts' };
      }

      if (item.key === 'styles') {
        return { ...item, active: placeholderMode === 'styles' };
      }

      return item;
    });

    if (groupIndex !== 0) {
      return {
        ...group,
        items: nextItems,
      };
    }

    return {
      ...group,
      items: [
        ...nextItems,
        { key: 'text-to-image' as const, label: '文生图', icon: FileText, active: placeholderMode === 'text-to-image' },
        { key: 'ai-video' as const, label: 'AI视频', icon: Video, active: placeholderMode === 'ai-video' },
      ],
    };
  });

  return (
    <div className="vx-workspace-theme relative min-h-screen font-sans">
      {/* Premium E-commerce Background */}
      <div className="pointer-events-none fixed inset-0 z-0 h-full w-full overflow-hidden bg-[radial-gradient(circle_at_top,rgba(124,92,255,0.12),transparent_32%),linear-gradient(180deg,#07090d_0%,#0b1020_54%,#0f1523_100%)]">
        {/* 1. Design Studio Grid with Fade */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_68%,transparent_100%)]"></div>
        
        {/* 2. Rich Soft Mesh Gradients */}
        <div className="absolute left-[-10%] top-[-10%] -z-10 h-[500px] w-[500px] rounded-full bg-indigo-500/14 blur-[120px]"></div>
        <div className="absolute right-[-5%] top-[10%] -z-10 h-[400px] w-[400px] rounded-full bg-violet-500/14 blur-[100px]"></div>
        <div className="absolute left-[15%] bottom-[-10%] -z-10 h-[600px] w-[600px] rounded-full bg-emerald-400/9 blur-[120px]"></div>
        <div className="absolute right-[15%] bottom-[10%] -z-10 h-[500px] w-[500px] rounded-full bg-rose-400/8 blur-[120px]"></div>
        <div className="absolute left-[40%] top-[30%] -z-10 h-[300px] w-[300px] rounded-full bg-amber-300/8 blur-[100px]"></div>
        
        {/* 3. Animated Floating Geometric Elements */}
        {/* Rings */}
        <div className="absolute left-[8%] top-[15%] h-32 w-32 rounded-full border-[1.5px] border-indigo-300/18 animate-float"></div>
        <div className="absolute bottom-[25%] right-[8%] h-48 w-48 rounded-full border-[1.5px] border-rose-300/14 animate-float-delayed"></div>
        <div className="absolute right-[15%] top-[40%] h-16 w-16 rounded-full border-[1.5px] border-violet-300/18 animate-float"></div>
        
        {/* Pills */}
        <div className="absolute right-[25%] top-[25%] h-8 w-24 rotate-45 rounded-full border-[1.5px] border-emerald-300/16 animate-float-delayed"></div>
        <div className="absolute bottom-[20%] left-[20%] h-10 w-32 -rotate-12 rounded-full border-[1.5px] border-amber-300/16 animate-float"></div>
        
        {/* Plus Signs */}
        <div className="absolute right-[30%] top-[10%] animate-pulse text-4xl font-light text-indigo-300/24">+</div>
        <div className="absolute bottom-[15%] left-[35%] animate-float text-5xl font-light text-emerald-300/22">+</div>
        <div className="absolute left-[5%] top-[50%] animate-float-delayed text-3xl font-light text-violet-300/24">+</div>
        
        {/* Dot Matrix Pattern */}
        <div className="absolute right-[5%] top-[60%] h-32 w-32 animate-float bg-[radial-gradient(circle,rgba(255,255,255,0.16)_2px,transparent_2px)] bg-[size:16px_16px]"></div>
        <div className="absolute bottom-[5%] left-[5%] h-40 w-40 animate-float-delayed bg-[radial-gradient(circle,rgba(255,255,255,0.14)_2px,transparent_2px)] bg-[size:16px_16px]"></div>

        {/* 4. Diagonal Tech Lines */}
        <svg className="absolute right-0 top-0 h-full w-1/2 text-white opacity-[0.06]" viewBox="0 0 100 100" preserveAspectRatio="none">
          <path d="M0,100 L100,0" stroke="currentColor" strokeWidth="0.5" fill="none" />
          <path d="M20,100 L100,20" stroke="currentColor" strokeWidth="0.5" fill="none" />
          <path d="M40,100 L100,40" stroke="currentColor" strokeWidth="0.5" fill="none" />
          <path d="M60,100 L100,60" stroke="currentColor" strokeWidth="0.5" fill="none" />
        </svg>
      </div>

      <div className="relative z-10 flex min-h-screen">
        <aside className="hidden overflow-hidden border-r border-white/8 bg-[linear-gradient(180deg,rgba(20,24,36,0.98),rgba(12,15,24,0.96))] px-4 pb-3 pt-5 shadow-[18px_0_45px_rgba(2,6,23,0.42)] backdrop-blur-2xl lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:w-[248px] lg:flex-col">
          <div className="flex items-center gap-3">
            <img src="/favicon.svg" alt="VXStudio" className="h-11 w-11 rounded-xl shadow-md" />
            <div>
              <h1 className="text-[1.45rem] font-black tracking-tight text-white">VXStudio</h1>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {resolvedSidebarGroups.map(group => (
              <div key={group.title} className="space-y-2.5">
                <p className="px-2 text-[11px] font-semibold tracking-[0.15em] text-white/35">{group.title}</p>
                <div className="space-y-1">
                  {group.items.map(item => {
                    const Icon = item.icon;
                    const badge = 'badge' in item ? item.badge : null;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => handleSidebarNavigate(item.key)}
                        className={`flex w-full cursor-pointer items-center gap-3 rounded-2xl px-4 py-3 text-left text-[15px] font-semibold transition-all ${
                          item.active
                            ? 'bg-gradient-to-r from-violet-500 to-indigo-500 text-white shadow-[0_12px_30px_rgba(99,102,241,0.32)]'
                            : 'text-white/78 hover:bg-white/[0.045] hover:text-white'
                        }`}
                      >
                        <Icon className="h-[18px] w-[18px] shrink-0" />
                        <span className="flex-1 whitespace-nowrap leading-none">{item.label}</span>
                        {badge ? (
                          <span
                            className={`inline-flex min-w-[28px] items-center justify-center rounded-full px-2 py-1 text-[11px] font-bold ${
                              item.active
                                ? 'bg-white/18 text-white'
                                : 'bg-[rgba(124,92,255,0.2)] text-violet-200'
                            }`}
                          >
                            {badge}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {workspaceSidebarFooter ? (
            <div className="mt-auto border-t border-white/10 pt-3">
              {workspaceSidebarFooter}
            </div>
          ) : null}
        </aside>

        <div className="flex min-h-screen flex-1 flex-col lg:pl-[248px]">
          <header className="sticky top-0 z-50 border-b border-white/8 bg-[rgba(11,16,32,0.72)] backdrop-blur-2xl shadow-[0_10px_30px_rgba(2,6,23,0.22)]">
            <div className="flex h-[72px] w-full items-center justify-end px-4 sm:px-6 lg:px-8">
              {workspaceHeaderActions}
            </div>
          </header>

          <main
            className={
              usesWideWorkspaceCanvas
                ? 'w-full space-y-10 px-4 py-10 sm:px-6 lg:px-8 xl:px-10 2xl:px-12'
                : 'mx-auto w-full max-w-7xl space-y-10 px-4 py-10 sm:px-6 lg:px-8'
            }
          >
        {isHomeView && (
          <HomePage
            onNavigateEntry={entry => onNavigateEntry(entry)}
            items={homeMediaItems}
            favoriteIds={favoriteHomeMediaIds}
            onToggleFavorite={handleToggleHomeMediaFavorite}
            onPreviewItem={setSelectedHomeMedia}
          />
        )}

        {isFavoritesView && (
          <FavoritesPage
            onBackHome={() => onNavigateEntry('home')}
            items={homeMediaItems}
            favoriteIds={favoriteHomeMediaIds}
            onToggleFavorite={handleToggleHomeMediaFavorite}
            onPreviewItem={setSelectedHomeMedia}
          />
        )}

        {isHistoryView && (
          <GenerationHistoryPage />
        )}

        {isPlaceholderView && activePlaceholderCopy && (
          <PlaceholderPage
            title={activePlaceholderCopy.title}
            description={activePlaceholderCopy.description}
          />
        )}

        <div id="studio-workspace" className={workspaceMode === 'studio' ? 'flex flex-col gap-10' : 'hidden'}>
        {showTopStudioError && (
          <div className="flex items-start gap-3 rounded-2xl border border-red-500/20 bg-[rgba(127,29,29,0.42)] px-5 py-4 text-red-100 shadow-[0_12px_30px_rgba(127,29,29,0.18)] backdrop-blur-sm">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-300" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {/* Premium Mode Settings */}
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, height: 0, y: -20 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -20 }}
            className="vx-panel order-2 overflow-hidden rounded-[2rem] p-8"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="flex items-center gap-3 text-xl font-bold tracking-tight text-[var(--vx-text)]">
                <div className="rounded-xl bg-[linear-gradient(135deg,rgba(124,92,255,0.26),rgba(76,195,255,0.18))] p-2 text-[var(--vx-brand-2)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                  <Sparkles className="w-5 h-5" />
                </div>
                {'高级设置与产品指纹'}
              </h2>

              {fingerprintStatus === 'analyzing' && (
                <div className="vx-status-warning flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {'正在分析产品...'}
                </div>
              )}
              {fingerprintStatus === 'ready' && !isFingerprintDirty && (
                <div className="vx-status-success flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium">
                  <CheckCircle2 className="w-4 h-4" />
                  {'产品指纹已就绪'}
                </div>
              )}
              {isFingerprintDirty && productFingerprint && (
                <div className="vx-status-warning flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium">
                  <AlertCircle className="w-4 h-4" />
                  {'产品指纹待更新'}
                </div>
              )}
              {fingerprintStatus === 'error' && (
                <div className="vx-status-danger flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium">
                  <AlertCircle className="w-4 h-4" />
                  {'分析失败'}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div>
                  <h3 className="mb-1 text-sm font-bold text-[var(--vx-text)]">{'补充图片（可选）'}</h3>
                  <p className="mb-3 text-xs text-[var(--vx-text-soft)]">{'上传更多角度或细节图，帮助提升产品识别准确度。'}</p>
                </div>

                <div
                  className={`vx-dropzone relative rounded-2xl p-4 transition-all ${
                    isSubjectReferenceDragActive
                      ? 'vx-dropzone-active'
                      : ''
                  }`}
                  onDragOver={(e) => setDragActiveFromEvent(e, setIsSubjectReferenceDragActive)}
                  onDragLeave={(e) => clearDragActiveFromEvent(e, setIsSubjectReferenceDragActive)}
                  onDrop={handleSubjectReferenceDrop}
                >
                  <div className="flex flex-wrap gap-3">
                    {subjectReferenceImages.map((img, index) => (
                      <div key={index} className="group relative h-20 w-20 overflow-hidden rounded-xl border border-white/10 bg-[rgba(8,11,18,0.7)]">
                        <button
                          type="button"
                          onClick={() => setEnlargedImage(img.dataUrl)}
                          className="h-full w-full cursor-zoom-in"
                          title="点击查看大图"
                        >
                          <img src={img.dataUrl} alt={`Supplemental ${index + 1}`} className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.04]" />
                        </button>
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/30 group-hover:opacity-100">
                          <span className="rounded-full border border-white/15 bg-black/55 p-2 text-white shadow-sm">
                            <Maximize className="h-3.5 w-3.5" />
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            removeSubjectReferenceImage(index);
                          }}
                          className="absolute right-1 top-1 rounded-full border border-white/8 bg-black/55 p-1 text-white/70 opacity-0 shadow-sm transition-opacity hover:bg-[rgba(239,68,68,0.18)] hover:text-white group-hover:opacity-100"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}

                    <button
                      onClick={() => subjectReferenceInputRef.current?.click()}
                      className="vx-dropzone flex h-20 w-20 flex-col items-center justify-center rounded-xl text-[var(--vx-text-muted)] transition-colors hover:text-[var(--vx-brand-2)]"
                    >
                      <Upload className="w-5 h-5 mb-1" />
                      <span className="text-[10px] font-medium">{'添加图片'}</span>
                    </button>
                    <input
                      type="file"
                      ref={subjectReferenceInputRef}
                      onChange={handleSubjectReferenceUpload}
                      accept="image/*"
                      multiple
                      className="hidden"
                    />
                  </div>

                  {isSubjectReferenceDragActive && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-[rgba(124,92,255,0.16)] text-sm font-semibold text-white backdrop-blur-[1px]">
                      {'将补充图片拖拽到这里'}
                    </div>
                  )}
                </div>
              </div>

              <div className="vx-subpanel relative rounded-2xl p-5">
                <h3 className="mb-3 flex items-center justify-between text-sm font-bold text-[var(--vx-text)]">
                  {'提取特征'}
                  {productFingerprint && !isFingerprintDirty && (
                    <div className="flex items-center gap-2">
                      <span className="vx-chip rounded-md px-2 py-1 text-xs font-normal">
                        {'置信度：'}{formatConfidencePercent(productFingerprint.confidence)}
                      </span>
                      <button
                        type="button"
                        onClick={extractProductFingerprintFn}
                        disabled={isSavingFingerprintDraft}
                        className="vx-button-secondary inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        {'重新提取'}
                      </button>
                      {hasFingerprintDraftChanges && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={handleResetFingerprintDraft}
                            disabled={isSavingFingerprintDraft}
                            className="vx-button-secondary rounded-md px-2 py-1 text-xs font-medium transition-colors"
                          >
                            {'重置'}
                          </button>
                          <button
                            onClick={handleSaveFingerprintDraft}
                            disabled={isSavingFingerprintDraft}
                            className="vx-button-primary flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors"
                          >
                            {'保存'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </h3>

                {fingerprintStatus === 'idle' && !productImage && (
                  <div className="flex h-full flex-col items-center justify-center pb-8 text-[var(--vx-text-muted)]">
                    <Layers className="w-8 h-8 mb-2 opacity-50" />
                    <p className="text-sm">{'上传产品图片后即可提取特征'}</p>
                  </div>
                )}

                {(fingerprintStatus === 'idle' || isFingerprintDirty) && fingerprintStatus !== 'analyzing' && fingerprintStatus !== 'error' && productImage && (
                  <div className="flex h-full flex-col items-center justify-center pb-8 text-[var(--vx-text-soft)]">
                    <Layers className="w-8 h-8 mb-3 opacity-50" />
                    <p className="text-sm mb-4 text-center px-4">
                      {isFingerprintDirty && productFingerprint
                        ? '图片已变更，请重新提取特征以更新产品指纹。'
                        : '已准备就绪，可从已上传图片中提取产品特征。'}
                    </p>
                    <button
                      onClick={extractProductFingerprintFn}
                      className="vx-button-primary flex items-center gap-2 rounded-xl px-4 py-2 font-medium transition-colors shadow-sm"
                    >
                      <Wand2 className="w-4 h-4" />
                      {'提取特征'}
                    </button>
                  </div>
                )}

                {fingerprintStatus === 'analyzing' && (
                  <div className="flex h-full flex-col items-center justify-center pb-8 text-[var(--vx-brand-2)]">
                    <Loader2 className="w-8 h-8 mb-2 animate-spin opacity-50" />
                    <p className="text-sm">{'正在提取产品指纹...'}</p>
                  </div>
                )}

                {fingerprintStatus === 'error' && (
                  <div className="flex h-full flex-col items-center justify-center pb-8 text-red-300">
                    <AlertCircle className="w-8 h-8 mb-2 opacity-50" />
                    <p className="text-sm text-center px-4">{fingerprintError}</p>
                    <button
                      onClick={extractProductFingerprintFn}
                      className="vx-button-secondary mt-3 rounded-lg px-3 py-1.5 text-xs"
                    >
                      {'重新分析'}
                    </button>
                  </div>
                )}

                {fingerprintStatus === 'ready' && !isFingerprintDirty && productFingerprint && fingerprintTextDraft && (
                  <div className="space-y-4 text-sm">
                    <textarea
                      value={buildCombinedFingerprintEditorText(fingerprintTextDraft)}
                      onChange={(event) => {
                        setFingerprintTextDraft(prev =>
                          prev
                            ? parseCombinedFingerprintEditorText(event.target.value, prev)
                            : prev
                        );
                        setFingerprintEditorError(null);
                      }}
                      rows={12}
                      className="vx-input w-full resize-y rounded-2xl px-4 py-3 text-sm leading-7 shadow-sm transition-all"
                    />
                    {fingerprintEditorError && (
                      <p className="text-xs font-medium text-red-300">{fingerprintEditorError}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

          <div className="order-1 grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Product Image Upload */}
          <div className="vx-panel rounded-[2rem] p-8 transition-all hover:-translate-y-0.5">
            <h2 className="mb-6 flex items-center gap-3 text-xl font-bold tracking-tight text-[var(--vx-text)]">
              <div className="vx-icon-surface rounded-xl p-2">
                <ImageIcon className="w-5 h-5" />
              </div>
              1. 产品图
            </h2>
            
            {!productImage ? (
              <div 
                className={`vx-dropzone group cursor-pointer rounded-3xl p-10 text-center transition-all ${
                  isStudioProductDragActive
                    ? 'vx-dropzone-active'
                    : ''
                }`}
                onClick={() => productInputRef.current?.click()}
                onDragOver={(e) => setDragActiveFromEvent(e, setIsStudioProductDragActive)}
                onDragLeave={(e) => clearDragActiveFromEvent(e, setIsStudioProductDragActive)}
                onDrop={handleStudioProductDrop}
              >
                <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full transition-colors ${
                  isStudioProductDragActive ? 'bg-[rgba(124,92,255,0.24)]' : 'bg-white/8 group-hover:bg-white/10'
                }`}>
                  <Upload className={`w-8 h-8 transition-colors ${
                    isStudioProductDragActive ? 'text-[var(--vx-brand-2)]' : 'text-[var(--vx-text-soft)] group-hover:text-[var(--vx-text)]'
                  }`} />
                </div>
                <p className="mb-1 text-base font-semibold text-[var(--vx-text)]">
                  {isStudioProductDragActive ? '松开以上传产品图' : '点击或拖拽上传产品图'}
                </p>
                <p className="text-sm text-[var(--vx-text-soft)]">支持 PNG、JPG，单张不超过 10MB</p>
                <input 
                  type="file" 
                  ref={productInputRef} 
                  onChange={handleProductImageUpload} 
                  accept="image/*" 
                  className="hidden" 
                />
              </div>
            ) : (
              <div
                className={`vx-media-surface group relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl transition-all ${
                  isStudioProductDragActive
                    ? 'vx-dropzone-active'
                    : ''
                }`}
                onDragOver={(e) => setDragActiveFromEvent(e, setIsStudioProductDragActive)}
                onDragLeave={(e) => clearDragActiveFromEvent(e, setIsStudioProductDragActive)}
                onDrop={handleStudioProductDrop}
              >
                <img src={productImage.dataUrl} alt="Product" className="max-w-full max-h-full object-contain p-4 transition-transform duration-500 group-hover:scale-105" />
                {isStudioProductDragActive && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-[rgba(124,92,255,0.16)] text-sm font-semibold text-white backdrop-blur-sm">
                    松开以替换当前产品图
                  </div>
                )}
                <button 
                  onClick={removeProductImage}
                  className="absolute right-4 top-4 z-20 translate-y-2 rounded-full border border-white/10 bg-black/55 p-2 text-white/70 opacity-0 shadow-md backdrop-blur transition-all hover:bg-[rgba(239,68,68,0.18)] hover:text-white group-hover:translate-y-0 group-hover:opacity-100"
                  title="移除图片"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>

          {/* Step 2 Upload */}
          <div className="vx-panel flex flex-col rounded-[2rem] p-8 transition-all hover:-translate-y-0.5">
            <h2 className="mb-6 flex items-center gap-3 text-xl font-bold tracking-tight text-[var(--vx-text)]">
              <div className="vx-icon-surface rounded-xl p-2">
                {isSingleStudioMode ? <ImageIcon className="w-5 h-5" /> : <FileSpreadsheet className="w-5 h-5" />}
              </div>
              {isSingleStudioMode ? '2. 参考图（可选）' : '2. Excel 数据'}
            </h2>
            
            {isSingleStudioMode && !referenceImage ? (
              <div 
                className={`vx-dropzone group flex flex-1 cursor-pointer flex-col items-center justify-center rounded-3xl p-10 text-center transition-all ${
                  isStudioStep2DragActive
                    ? 'vx-dropzone-active'
                    : ''
                }`}
                onClick={() => excelInputRef.current?.click()}
                onDragOver={(e) => setDragActiveFromEvent(e, setIsStudioStep2DragActive)}
                onDragLeave={(e) => clearDragActiveFromEvent(e, setIsStudioStep2DragActive)}
                onDrop={handleStudioStep2Drop}
              >
                <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full transition-colors ${
                  isStudioStep2DragActive ? 'bg-[rgba(124,92,255,0.24)]' : 'bg-white/8 group-hover:bg-white/10'
                }`}>
                  <Upload className={`w-8 h-8 transition-colors ${
                    isStudioStep2DragActive ? 'text-[var(--vx-brand-2)]' : 'text-[var(--vx-text-soft)] group-hover:text-[var(--vx-text)]'
                  }`} />
                </div>
                <p className="mb-1 text-base font-semibold text-[var(--vx-text)]">
                  {isStudioStep2DragActive ? '松开以上传参考图' : '点击或拖拽上传参考图'}
                </p>
                <p className="text-sm text-[var(--vx-text-soft)]">支持 PNG、JPG，单张不超过 10MB</p>
                <input 
                  type="file" 
                  ref={excelInputRef} 
                  onChange={handleStep2Upload} 
                  accept="image/*" 
                  className="hidden" 
                />
              </div>
            ) : isBatchStudioMode && !excelFile ? (
              <div 
                className={`vx-dropzone group flex flex-1 cursor-pointer flex-col items-center justify-center rounded-3xl p-10 text-center transition-all ${
                  isStudioStep2DragActive
                    ? 'vx-dropzone-active'
                    : ''
                }`}
                onClick={() => excelInputRef.current?.click()}
                onDragOver={(e) => setDragActiveFromEvent(e, setIsStudioStep2DragActive)}
                onDragLeave={(e) => clearDragActiveFromEvent(e, setIsStudioStep2DragActive)}
                onDrop={handleStudioStep2Drop}
              >
                <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full transition-colors ${
                  isStudioStep2DragActive ? 'bg-[rgba(124,92,255,0.24)]' : 'bg-white/8 group-hover:bg-white/10'
                }`}>
                  <Upload className={`w-8 h-8 transition-colors ${
                    isStudioStep2DragActive ? 'text-[var(--vx-brand-2)]' : 'text-[var(--vx-text-soft)] group-hover:text-[var(--vx-text)]'
                  }`} />
                </div>
                <p className="mb-1 text-base font-semibold text-[var(--vx-text)]">
                  {isStudioStep2DragActive ? '松开以上传 Excel 文件' : '点击或拖拽上传 Excel 文件'}
                </p>
                <p className="text-sm text-[var(--vx-text-soft)]">支持 .xlsx、.xls、.csv，文件不超过 20MB</p>
                <input 
                  type="file" 
                  ref={excelInputRef} 
                  onChange={handleStep2Upload} 
                  accept=".xlsx, .xls, .csv" 
                  className="hidden" 
                />
              </div>
            ) : isBatchStudioMode && excelFile ? (
              <div
                className={`vx-subpanel flex items-center justify-between rounded-3xl p-5 transition-all ${
                  isStudioStep2DragActive
                    ? 'vx-dropzone-active'
                    : ''
                }`}
                onDragOver={(e) => setDragActiveFromEvent(e, setIsStudioStep2DragActive)}
                onDragLeave={(e) => clearDragActiveFromEvent(e, setIsStudioStep2DragActive)}
                onDrop={handleStudioStep2Drop}
              >
                <div className="flex items-center gap-4 overflow-hidden">
                  <div className="vx-icon-surface rounded-2xl p-3">
                    <FileSpreadsheet className="w-8 h-8 shrink-0" />
                  </div>
                  <div className="truncate">
                    <p className="truncate text-base font-bold text-[var(--vx-text)]">{excelFile.name}</p>
                    <p className="vx-chip mt-1 inline-block rounded-lg px-2.5 py-1 text-sm font-medium">已加载 {rows.length} 行数据</p>
                  </div>
                </div>
                <button 
                  onClick={removeStep2File}
                  className="cursor-pointer rounded-2xl p-3 text-[var(--vx-text-muted)] transition-colors hover:bg-white/8 hover:text-white"
                  title="移除文件"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ) : isSingleStudioMode && referenceImage ? (
              <div
                className={`vx-subpanel flex items-center justify-between rounded-3xl p-5 transition-all ${
                  isStudioStep2DragActive
                    ? 'vx-dropzone-active'
                    : ''
                }`}
                onDragOver={(e) => setDragActiveFromEvent(e, setIsStudioStep2DragActive)}
                onDragLeave={(e) => clearDragActiveFromEvent(e, setIsStudioStep2DragActive)}
                onDrop={handleStudioStep2Drop}
              >
                <div className="flex items-center gap-4 overflow-hidden">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-[rgba(8,11,18,0.7)]">
                    <img src={referenceImage.dataUrl} alt="Reference" className="w-full h-full object-cover" />
                  </div>
                  <div className="truncate">
                    <p className="truncate text-base font-bold text-[var(--vx-text)]">{referenceImage.file.name}</p>
                    <p className="vx-chip mt-1 inline-block rounded-lg px-2.5 py-1 text-sm font-medium">参考图</p>
                  </div>
                </div>
                <button 
                  onClick={removeStep2File}
                  className="cursor-pointer rounded-2xl p-3 text-[var(--vx-text-muted)] transition-colors hover:bg-white/8 hover:text-white"
                  title="移除参考图"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ) : null}

            {isBatchStudioMode && (
              <div className="mt-6">
                <SelectField
                  label="输出分辨率"
                  value={imageSize}
                  onChange={value => setImageSize(String(value))}
                  options={[
                    { label: '1K（标准）', value: '1K' },
                    { label: '2K（高清）', value: '2K' },
                    { label: '4K（超清）', value: '4K' },
                  ]}
                />
              </div>
            )}

            {isBatchStudioMode && rows.length > 0 && (
              <div className="mt-auto pt-8">
                <button
                  onClick={generateImages}
                  disabled={isGenerating || !productImage}
                  className="vx-button-primary flex w-full cursor-pointer items-center justify-center gap-3 rounded-2xl px-6 py-4 text-lg font-bold transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-6 h-6 animate-spin" />
                      正在生成...
                    </>
                  ) : (
                    <>
                      <Play className="w-6 h-6 fill-current" />
                      {`生成 ${rows.length} 张图片`}
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
        {isBatchStudioMode && (
          <div className="order-3">
            <BatchResultsSection
              rows={rows}
              productImagePresent={!!productImage}
              rowPendingActions={batchRowPendingActions}
              onRegenerateRow={regenerateRow}
              onEditRowLocally={handleEditBatchRowLocally}
              onRowChange={handleRowChange}
              onDownloadImage={downloadImage}
              onOpenImage={(url) => setEnlargedImage(url)}
            />
          </div>
        )}

        {isSingleStudioMode && (
          <div className="order-3 grid grid-cols-1 items-start gap-8 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
            <SingleGenerationSection
              singleGen={singleGen}
              singleGeneratePhase={singleGeneratePhase}
              productImagePresent={!!productImage}
              showError={showSingleSectionError}
              setSingleGen={setSingleGen}
              hasReachedSingleImageRegenerationLimit={hasReachedSingleImageRegenerationLimit}
              isSingleImageRegenerating={isSingleImageRegenerating}
              onGenerate={handleSingleGenerate}
              onRegenerateSingleImage={handleRegenerateSingleImage}
              onSingleImageAdjustmentChange={handleSingleImageAdjustmentChange}
              onEditSingleImageLocally={handleEditSingleImageLocally}
              onDownloadImage={downloadImage}
              onOpenImage={(url) => setEnlargedImage(url)}
              imageSize={imageSize}
              setImageSize={setImageSize}
              layout="settings-only"
            />
            <SingleGenerationSection
              singleGen={singleGen}
              singleGeneratePhase={singleGeneratePhase}
              productImagePresent={!!productImage}
              showError={false}
              setSingleGen={setSingleGen}
              hasReachedSingleImageRegenerationLimit={hasReachedSingleImageRegenerationLimit}
              isSingleImageRegenerating={isSingleImageRegenerating}
              onGenerate={handleSingleGenerate}
              onRegenerateSingleImage={handleRegenerateSingleImage}
              onSingleImageAdjustmentChange={handleSingleImageAdjustmentChange}
              onEditSingleImageLocally={handleEditSingleImageLocally}
              onDownloadImage={downloadImage}
              onOpenImage={(url) => setEnlargedImage(url)}
              imageSize={imageSize}
              setImageSize={setImageSize}
              layout="results-only"
            />
          </div>
        )}
        </div>

        <DetailSetWorkspace
          visible={workspaceMode === 'detail_set'}
          detailSet={detailSet}
          detailSetProductImages={detailSetProductImages}
          detailSetProductInputRef={detailSetProductInputRef}
          detailSetPlanPreview={detailSetPlanPreview}
          detailSetStepIndex={detailSetStepIndex}
          isAnyDetailSetItemGenerating={isAnyDetailSetItemGenerating}
          isGeneratingGlobalPrompt={isGeneratingDetailSetGlobalPrompt}
          detailItemPendingActions={detailItemPendingActions}
          onDetailSetProductImageUpload={handleDetailSetProductImageUpload}
          onDetailSetProductFilesDrop={processDetailSetProductFiles}
          onRemoveDetailSetProductImage={removeDetailSetProductImage}
          onPlatformChange={(platform) => setDetailSet(prev => ({
            ...prev,
            platform,
            status: 'idle',
            error: '',
            generatedItems: [],
            aspectRatioOverrides: {},
          }))}
          onGlobalPromptChange={(value) => setDetailSet(prev => ({ ...prev, globalPrompt: value }))}
          onPromptSourceChange={(promptSource) => setDetailSet(prev => ({ ...prev, promptSource }))}
          onGridLayoutChange={(gridLayout) => setDetailSet(prev => ({ ...prev, gridLayout }))}
          onGenerateGlobalPrompt={handleGenerateDetailSetGlobalPrompt}
          onGenerateDetailSet={handleGenerateDetailSet}
          onDetailSetItemAspectRatioChange={handleDetailSetItemAspectRatioChange}
          onDetailSetItemAdjustmentChange={handleDetailSetItemAdjustmentChange}
          onRegenerateDetailSetItem={handleRegenerateDetailSetItem}
          onEditDetailSetItemLocally={handleEditDetailSetItemLocally}
          onDownloadImage={downloadImage}
          onOpenImage={(url) => setEnlargedImage(url)}
        />
      </main>

      {selectedHomeMedia && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/82 p-4 backdrop-blur-md"
          onClick={() => setSelectedHomeMedia(null)}
        >
          <div
            className="relative w-full max-w-6xl overflow-hidden rounded-[2rem] border border-white/10 bg-[rgba(8,11,18,0.96)] p-3 shadow-[0_30px_80px_rgba(0,0,0,0.52)]"
            onClick={(event) => event.stopPropagation()}
          >
            <img
              src={selectedHomeMedia.src}
              alt={selectedHomeMedia.title}
              className="max-h-[82vh] w-full rounded-[1.4rem] bg-black object-contain"
            />

            <button
              className="absolute right-5 top-5 rounded-full border border-white/10 bg-black/55 p-2 text-white/80 transition-colors hover:bg-black/80 hover:text-white"
              onClick={() => setSelectedHomeMedia(null)}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {/* Enlarged Image Modal */}
      {enlargedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setEnlargedImage(null)}
        >
          <img
            src={enlargedImage}
            alt="Enlarged view"
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="absolute top-6 right-6 text-white bg-black/50 hover:bg-black/80 rounded-full p-2 transition-colors cursor-pointer"
            onClick={() => setEnlargedImage(null)}
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      )}
      </div>
    </div>
    </div>
  );
}

