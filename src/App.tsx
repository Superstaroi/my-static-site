import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, 
  FileSpreadsheet, 
  Image as ImageIcon, 
  Play, 
  Download, 
  AlertCircle, 
  CheckCircle2, 
  Loader2, 
  Trash2, 
  Key, 
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
  LayoutTemplate,
  Store
} from 'lucide-react';
import { ExcelRow, GenerationMode, ImageType, CommercialTone, SceneStrictness, DetailSetPlatform } from './types';
import { parseExcel } from './utils/excelParser';
import { fetchImageAsBase64, blobToBase64, generateProductImage, editGeneratedImageLocally, buildPrompt, getSizeInstruction, parseAspectRatio, BuildPromptOptions, normalizeCopyText, hasConfiguredGeminiApiKey, getCurrentGeminiApiKeyLast4, ImageRequestBehavior } from './services/geminiService';
import { 
  MODE_OPTIONS, 
  IMAGE_TYPE_OPTIONS, 
  COMMERCIAL_TONE_OPTIONS, 
  SCENE_STRICTNESS_OPTIONS,
  ASPECT_RATIO_OPTIONS
} from './constants';

import { ProductFingerprint, VerificationResult } from './types/product';
import { analyzeProductFingerprint } from './services/productAnalysisService';
import { verifyGeneratedImage, isVerificationPassed, summarizeVerificationFailures } from './services/imageVerificationService';
import { addIdsToArrays, applyLocalEdits } from './utils/fingerprintMapping';
import { v4 as uuidv4 } from 'uuid';
import { createDetailSetPlan, DETAIL_SET_PLATFORM_OPTIONS, DetailSetPlanItem } from './detailSetTemplates';
import { SelectField } from './components/SelectField';
import { BatchResultsSection } from './features/batch-generation/BatchResultsSection';
import { DetailSetWorkspace } from './features/detail-set/DetailSetWorkspace';
import { getDetailSetFailureMessage, getDetailSetResolvedStatus } from './features/detail-set/display';
import { SingleGenerationSection } from './features/single-generation/SingleGenerationSection';
import { DetailSetGeneratedItem, SingleGeneratedImage, SingleGenerationState, SingleImageOperationKind, UploadedImageAsset } from './features/shared/models';

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

type WorkspaceMode = 'studio' | 'detail_set';

const MAX_CONCURRENT_SINGLE_IMAGE_REGENERATIONS = 3;
const SINGLE_IMAGE_REGENERATION_WATCHDOG_MS = 120000;
const SINGLE_MODE_REGENERATION_REQUEST_BEHAVIOR: ImageRequestBehavior = {
  timeoutMs: 50000,
  maxRetries: 0,
};
const SINGLE_MODE_LOCAL_EDIT_REQUEST_BEHAVIOR: ImageRequestBehavior = {
  timeoutMs: 45000,
  maxRetries: 0,
};

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
  status: 'idle' as 'idle' | 'analyzing' | 'planning' | 'generating' | 'completed' | 'error',
  error: '',
  generatedItems: [] as DetailSetGeneratedItem[],
};

const revokeObjectUrlIfNeeded = (url?: string | null) => {
  if (url && url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
};

const readImageAssetFromFile = async (file: File): Promise<UploadedImageAsset> => {
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
  recommendations: ['Review the generated image manually.'],
});

// Optimized Select Component
export default function App() {
  const currentGeminiApiKeyLast4 = getCurrentGeminiApiKeyLast4();
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('studio');
  const [productImage, setProductImage] = useState<{ file: File, dataUrl: string, base64: { data: string, mimeType: string } } | null>(null);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [referenceImage, setReferenceImage] = useState<{ file: File, dataUrl: string, base64: { data: string, mimeType: string } } | null>(null);
  const [singleGen, setSingleGen] = useState(singleGenInitialState);
  const [rows, setRows] = useState<ExcelRow[]>([]);
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
  const [hasApiKey, setHasApiKey] = useState<boolean>(true);
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);
  const [detailSetProductImage, setDetailSetProductImage] = useState<UploadedImageAsset | null>(null);
  const [detailSetFingerprint, setDetailSetFingerprint] = useState<ProductFingerprint | null>(null);
  const [detailSet, setDetailSet] = useState(detailSetInitialState);

  // Premium Mode State (Now Default)
  const [productFingerprint, setProductFingerprint] = useState<ProductFingerprint | null>(null);
  const [productFingerprintZh, setProductFingerprintZh] = useState<any | null>(null);
  const [draftFingerprintZh, setDraftFingerprintZh] = useState<any | null>(null);
  const [draftFingerprintText, setDraftFingerprintText] = useState('');
  const [fingerprintStatus, setFingerprintStatus] = useState<'idle' | 'analyzing' | 'ready' | 'error'>('idle');
  const [fingerprintError, setFingerprintError] = useState<string | null>(null);
  const [isFingerprintDirty, setIsFingerprintDirty] = useState<boolean>(false);
  const [verificationMap, setVerificationMap] = useState<Map<string, VerificationResult>>(new Map());
  const [subjectReferenceImages, setSubjectReferenceImages] = useState<{ file: File, dataUrl: string, base64: { data: string, mimeType: string } }[]>([]);
  const usedDownloadNamesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (draftFingerprintZh) {
      setDraftFingerprintText(JSON.stringify(draftFingerprintZh, null, 2));
    } else {
      setDraftFingerprintText('');
    }
  }, [draftFingerprintZh]);

  const productInputRef = useRef<HTMLInputElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);
  const subjectReferenceInputRef = useRef<HTMLInputElement>(null);
  const detailSetProductInputRef = useRef<HTMLInputElement>(null);
  const singlePromptOptionsCacheRef = useRef<{ key: string; prepared: BuildPromptOptions } | null>(null);

  const handleSubjectReferenceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newImages = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) continue;
      
      try {
        const base64Data = await blobToBase64(file);
        const dataUrl = URL.createObjectURL(file);
        newImages.push({
          file,
          dataUrl,
          base64: {
            data: base64Data.data,
            mimeType: base64Data.mimeType
          }
        });
      } catch (err) {
        console.error("Error reading subject reference image:", err);
      }
    }
    
    setSubjectReferenceImages(prev => [...prev, ...newImages]);
    setIsFingerprintDirty(true);
    if (subjectReferenceInputRef.current) {
      subjectReferenceInputRef.current.value = '';
    }
  };

  const removeSubjectReferenceImage = (index: number) => {
    setSubjectReferenceImages(prev => {
      const newImages = [...prev];
      revokeObjectUrlIfNeeded(newImages[index]?.dataUrl);
      newImages.splice(index, 1);
      return newImages;
    });
    setIsFingerprintDirty(true);
  };

  useEffect(() => {
    const checkApiKey = async () => {
      const hasLocalKey = hasConfiguredGeminiApiKey();
      if (window.aistudio?.hasSelectedApiKey) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(hasKey || hasLocalKey);
      } else {
        setHasApiKey(hasLocalKey);
      }
    };
    checkApiKey();
  }, []);

  // Transition single generation from 'generated' to 'success' or 'needs_review'
  useEffect(() => {
    if (singleGen.status === 'generated' && singleGen.generatedImages.length > 0) {
      const results = singleGen.generatedImages.map(img => verificationMap.get(img.url));
      const anyFailed = results.some(v => v && !isVerificationPassed(v));
      
      if (anyFailed) {
        setSingleGen(prev => ({ ...prev, status: 'needs_review' }));
      } else {
        const allVerified = results.every(v => !!v);
        if (allVerified) {
          setSingleGen(prev => ({ ...prev, status: 'success' }));
        }
      }
    }
  }, [verificationMap, singleGen.generatedImages, singleGen.status]);

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
          `Image ${groupedLabels.regenerate.join(', ')} regeneration timed out or was interrupted. Please try again.`
        );
      }

      if (groupedLabels.local_edit.length > 0) {
        messages.push(
          `Image ${groupedLabels.local_edit.join(', ')} local edit timed out or was interrupted. Please simplify the adjustment and try again.`
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
    if (!productImage) throw new Error("Product image is required for extraction.");
    setFingerprintStatus('analyzing');
    setFingerprintError(null);
    try {
      const supplementalBase64 = subjectReferenceImages.map(img => img.base64);
      const { canonicalEn, displayZh } = await analyzeProductFingerprint(productImage.base64, supplementalBase64);
      const canonicalEnWithIds = addIdsToArrays(canonicalEn);
      const displayZhWithIds = addIdsToArrays(displayZh);
      setProductFingerprint(canonicalEnWithIds);
      setProductFingerprintZh(displayZhWithIds);
      setDraftFingerprintZh(JSON.parse(JSON.stringify(displayZhWithIds)));
      setFingerprintStatus('ready');
      setIsFingerprintDirty(false);
      return canonicalEnWithIds;
    } catch (err: any) {
      console.error("Fingerprint analysis failed:", err);
      setFingerprintError(err.message || "Failed to analyze product fingerprint.");
      setFingerprintStatus('error');
      throw err;
    }
  };

  const extractFingerprintFromAsset = async (asset: UploadedImageAsset): Promise<ProductFingerprint> => {
    const { canonicalEn } = await analyzeProductFingerprint(asset.base64, []);
    return addIdsToArrays(canonicalEn);
  };

  const handleSelectApiKey = async () => {
    if (window.aistudio?.openSelectKey) {
      await window.aistudio.openSelectKey();
      // Assume success to mitigate race condition
      setHasApiKey(true);
    }
  };

  const handleProductImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setError('Please upload a valid product image file.');
        return;
      }
      
      // Revoke old object URLs to prevent memory leaks
      revokeObjectUrlIfNeeded(productImage?.dataUrl);
      subjectReferenceImages.forEach(img => {
        revokeObjectUrlIfNeeded(img.dataUrl);
      });

      // Reset ALL related states when new product image uploaded
      setSingleGen(singleGenInitialState);
      setRows(prev => prev.map(r => ({ ...r, status: 'pending', generatedImage: undefined, generatedPrompt: undefined, error: undefined })));
      setVerificationMap(new Map());
      setError(null);
      setFingerprintStatus('idle');
      setProductFingerprint(null);
      setProductFingerprintZh(null);
      setDraftFingerprintZh(null);
      setIsFingerprintDirty(true);
      setSubjectReferenceImages([]); // Clear old supplemental images

      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        const [header, data] = dataUrl.split(',');
        const mimeType = header.split(':')[1].split(';')[0];
        setProductImage({ file, dataUrl, base64: { data, mimeType } });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleStep2Upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isImage = file.type.startsWith('image/');
    const isSpreadsheet = 
      file.name.endsWith('.xlsx') || 
      file.name.endsWith('.xls') || 
      file.name.endsWith('.csv') ||
      file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.type === 'application/vnd.ms-excel' ||
      file.type === 'text/csv';

    if (!isImage && !isSpreadsheet) {
      setError('Please upload a valid image file or a spreadsheet (.xlsx, .xls, .csv).');
      if (excelInputRef.current) {
        excelInputRef.current.value = '';
      }
      return;
    }

    // Reset ALL related states when new Excel or reference image uploaded
    setVerificationMap(new Map());
    setError(null);

    if (isImage) {
      setExcelFile(null);
      setRows([]);
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        const [header, data] = dataUrl.split(',');
        const mimeType = header.split(':')[1].split(';')[0];
        setReferenceImage({ file, dataUrl, base64: { data, mimeType } });
        setSingleGen(prev => ({ ...prev, status: 'idle', generatedImages: [], error: '' }));
      };
      reader.readAsDataURL(file);
    } else {
      setReferenceImage(null);
      setExcelFile(file);
      setSingleGen(singleGenInitialState); // Fully reset single mode state when Excel uploaded
      try {
        const parsedRows = await parseExcel(file);
        setRows(parsedRows);
      } catch (err) {
        setError('Failed to parse Excel file. Please ensure it is a valid .xlsx or .csv file.');
        console.error(err);
      }
    }
  };

  const removeProductImage = () => {
    revokeObjectUrlIfNeeded(productImage?.dataUrl);
    subjectReferenceImages.forEach(img => {
      revokeObjectUrlIfNeeded(img.dataUrl);
    });

    setProductImage(null);
    setSubjectReferenceImages([]);
    setProductFingerprint(null);
    setProductFingerprintZh(null);
    setDraftFingerprintZh(null);
    setFingerprintStatus('idle');
    setFingerprintError(null);
    setIsFingerprintDirty(false);
    setVerificationMap(new Map());
    setSingleGen(singleGenInitialState);
    setRows(prev => prev.map(r => ({ ...r, status: 'pending', generatedImage: undefined, generatedPrompt: undefined, error: undefined })));
    if (productInputRef.current) productInputRef.current.value = '';
    if (subjectReferenceInputRef.current) subjectReferenceInputRef.current.value = '';
  };

  const removeStep2File = () => {
    setExcelFile(null);
    setRows([]);
    setReferenceImage(null);
    setVerificationMap(new Map());
    setError(null);
    setSingleGen(singleGenInitialState);
    if (excelInputRef.current) excelInputRef.current.value = '';
  };

  const handleDetailSetProductImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setDetailSet(prev => ({ ...prev, status: 'error', error: 'Please upload a valid image file for the detail-set workspace.' }));
      return;
    }

    try {
      revokeObjectUrlIfNeeded(detailSetProductImage?.dataUrl);
      const imageAsset = await readImageAssetFromFile(file);
      setDetailSetProductImage(imageAsset);
      setDetailSetFingerprint(null);
      setDetailSet(prev => ({
        ...prev,
        status: 'idle',
        error: '',
        generatedItems: [],
      }));
    } catch (err: any) {
      setDetailSet(prev => ({
        ...prev,
        status: 'error',
        error: err.message || 'Failed to read the selected product image.',
      }));
    } finally {
      if (detailSetProductInputRef.current) {
        detailSetProductInputRef.current.value = '';
      }
    }
  };

  const removeDetailSetProductImage = () => {
    revokeObjectUrlIfNeeded(detailSetProductImage?.dataUrl);
    setDetailSetProductImage(null);
    setDetailSetFingerprint(null);
    setDetailSet(detailSetInitialState);
    if (detailSetProductInputRef.current) {
      detailSetProductInputRef.current.value = '';
    }
  };

  const ensureDetailSetFingerprint = async () => {
    if (!detailSetProductImage) {
      throw new Error('Please upload a product image first.');
    }

    const fingerprint = detailSetFingerprint || await extractFingerprintFromAsset(detailSetProductImage);
    setDetailSetFingerprint(fingerprint);
    return fingerprint;
  };

  const generateDetailSetImage = async (
    item: DetailSetPlanItem,
    fingerprint: ProductFingerprint,
    productBase64: { data: string, mimeType: string }
  ) => {
    const promptOptions = await preparePromptOptions(
      {
        productTitle: item.productTitle,
        copyText: item.copyText,
        sizeInstruction: getSizeInstruction(item.aspectRatio),
        hasRefImage: false,
        customPrompt: item.customPrompt,
        mode: item.mode,
        imageType: item.imageType,
        textMode: item.copyText.trim() ? 'render_text' : 'none',
        preserveProductText: true,
        commercialTone: item.commercialTone,
        sceneStrictness: item.sceneStrictness,
      },
      fingerprint
    );

    return generateImageWithFallback({
      promptOptions,
      refBase64: null,
      aspectRatio: parseAspectRatio(item.aspectRatio),
      productBase64,
      supplementalProductBase64: [],
    });
  };

  const handleGenerateDetailSet = async () => {
    if (!hasApiKey) {
      setDetailSet(prev => ({ ...prev, status: 'error', error: 'Please select an API key first.' }));
      return;
    }

    if (!detailSetProductImage) {
      setDetailSet(prev => ({ ...prev, status: 'error', error: 'Please upload a product image first.' }));
      return;
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setDetailSet(prev => ({ ...prev, status: 'error', error: 'Network connection was lost. Please reconnect and try again.' }));
      return;
    }

    try {
      setDetailSet(prev => ({
        ...prev,
        status: 'analyzing',
        error: '',
        generatedItems: [],
      }));

      const fingerprint = await ensureDetailSetFingerprint();

      setDetailSet(prev => ({
        ...prev,
        status: 'planning',
      }));

      const plan = createDetailSetPlan({
        platform: detailSet.platform,
        fingerprint,
        globalGuidance: detailSet.globalPrompt,
      });

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

      const concurrencyLimit = 2;

      for (let i = 0; i < plan.length; i += concurrencyLimit) {
        const chunk = plan.slice(i, i + concurrencyLimit);

        setDetailSet(prev => ({
          ...prev,
          generatedItems: prev.generatedItems.map(existingItem =>
            chunk.some(chunkItem => chunkItem.id === existingItem.id)
              ? { ...existingItem, status: 'generating', error: '' }
              : existingItem
          ),
        }));

        const chunkResults = await Promise.allSettled(
          chunk.map(item => generateDetailSetImage(item, fingerprint, detailSetProductImage.base64))
        );

        generatedItems = generatedItems.map(existingItem => {
          const chunkIndex = chunk.findIndex(chunkItem => chunkItem.id === existingItem.id);
          if (chunkIndex === -1) {
            return existingItem;
          }

          const result = chunkResults[chunkIndex];
          if (result.status === 'fulfilled') {
            return {
              ...existingItem,
              status: 'success',
              generatedImage: result.value.result.url,
              generatedPrompt: result.value.result.prompt,
              error: '',
            };
          }

          return {
            ...existingItem,
            status: 'error',
            error: result.reason?.message || 'Failed to generate this detail-set image.',
          };
        });

        setDetailSet(prev => ({
          ...prev,
          generatedItems,
        }));
      }

      const successCount = generatedItems.filter(item => item.status === 'success').length;
      const failedCount = generatedItems.length - successCount;

      setDetailSet(prev => ({
        ...prev,
        status: successCount > 0 ? 'completed' : 'error',
        error: failedCount > 0 ? getDetailSetFailureMessage(generatedItems) : '',
        generatedItems,
      }));
    } catch (err: any) {
      setDetailSet(prev => ({
        ...prev,
        status: 'error',
        error: err.message || 'Failed to generate the detail-set.',
      }));
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

  const handleRegenerateDetailSetItem = async (itemId: string) => {
    if (!hasApiKey) {
      setDetailSet(prev => ({ ...prev, error: 'Please select an API key first.' }));
      return;
    }

    const currentProductImage = detailSetProductImage;
    if (!currentProductImage) {
      setDetailSet(prev => ({ ...prev, error: 'Please upload a product image first.' }));
      return;
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setDetailSet(prev => ({ ...prev, error: 'Network connection was lost. Please reconnect and try again.' }));
      return;
    }

    const currentItem = detailSet.generatedItems.find(item => item.id === itemId);
    if (!currentItem || currentItem.status === 'generating') {
      return;
    }

    setDetailSet(prev => {
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
      const fingerprint = await ensureDetailSetFingerprint();
      const { result } = await generateDetailSetImage(currentItem, fingerprint, currentProductImage.base64);

      setDetailSet(prev => {
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
          status: 'completed',
          generatedItems: updatedItems,
          error: getDetailSetFailureMessage(updatedItems),
        };
      });
    } catch (err: any) {
      setDetailSet(prev => {
        const updatedItems = prev.generatedItems.map(item =>
          item.id === itemId
            ? {
                ...item,
                status: 'error' as const,
                error: err.message || 'Failed to regenerate this detail-set image.',
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
    }
  };

  const handleEditDetailSetItemLocally = async (itemId: string) => {
    if (!hasApiKey) {
      setDetailSet(prev => ({ ...prev, error: 'Please select an API key first.' }));
      return;
    }

    const currentProductImage = detailSetProductImage;
    if (!currentProductImage) {
      setDetailSet(prev => ({ ...prev, error: 'Please upload a product image first.' }));
      return;
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setDetailSet(prev => ({ ...prev, error: 'Network connection was lost. Please reconnect and try again.' }));
      return;
    }

    const currentItem = detailSet.generatedItems.find(item => item.id === itemId);
    if (!currentItem || !currentItem.generatedImage || currentItem.status === 'generating') {
      return;
    }

    const adjustmentPrompt = currentItem.adjustmentPrompt.trim();
    if (!adjustmentPrompt) {
      alert('Please enter adjustment instructions for this detail-set image.');
      return;
    }

    setDetailSet(prev => {
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
      const baseImageBase64 = await fetchImageAsBase64(currentItem.generatedImage);
      const localEditPrompt = getSingleImageLocalEditPrompt(
        currentItem.generatedPrompt || currentItem.customPrompt,
        adjustmentPrompt,
        currentItem.copyText
      );

      const result = await editGeneratedImageLocally(
        baseImageBase64,
        currentProductImage.base64,
        [],
        localEditPrompt,
        parseAspectRatio(currentItem.aspectRatio),
        imageSize
      );

      setDetailSet(prev => {
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
          status: 'completed',
          generatedItems: updatedItems,
          error: getDetailSetFailureMessage(updatedItems),
        };
      });
    } catch (err: any) {
      setDetailSet(prev => {
        const updatedItems = prev.generatedItems.map(item =>
          item.id === itemId
            ? {
                ...item,
                status: 'error' as const,
                error: err.message || 'Failed to apply the local edit to this detail-set image.',
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
      // Inference logic for batch mode based on the 5 basic fields
      const remarks = (currentRow.customPrompt || '').trim();
      
      // Default values for batch mode
      // If hasRefImage is true, mode is locked to background_transfer
      let mode: GenerationMode = hasRefImage ? 'background_transfer' : 'infographic_listing';
      let imageType: ImageType = 'main';
      let sceneStrictness: SceneStrictness = 'strict';
      let commercialTone: CommercialTone = 'premium';

      // Lightweight keyword-based inference from remarks (customPrompt)
      const lifestyleKeywords = ['lifestyle', 'home', 'living', 'kitchen', 'bathroom', 'outdoor', 'office', 'studio', 'environment', 'scene'];
      const detailKeywords = ['detail', 'material', 'structure', 'comparison', 'feature', 'closeup', 'close-up', 'macro'];

      const lowerRemarks = remarks.toLowerCase();
      
      // Only infer mode if there is NO reference image. 
      // If there IS a reference image, we stick to background_transfer but can still infer imageType.
      if (lifestyleKeywords.some(k => lowerRemarks.includes(k))) {
        if (!hasRefImage) mode = 'lifestyle_listing';
        imageType = 'lifestyle';
      } else if (detailKeywords.some(k => lowerRemarks.includes(k))) {
        if (!hasRefImage) mode = 'infographic_listing';
        imageType = lowerRemarks.includes('comparison') ? 'comparison' : 'detail';
      }

      const resolvedImageType = currentRow.imageType || imageType;
      const resolvedMode = currentRow.mode || (
        hasRefImage
          ? 'background_transfer'
          : (resolvedImageType === 'lifestyle' || resolvedImageType === 'banner' ? 'lifestyle_listing' : mode)
      );

      return {
        productTitle: currentRow.productTitle,
        copyText: (currentRow.copyText || '').trim(),
        sizeInstruction: getSizeInstruction(currentRow.size),
        hasRefImage: hasRefImage,
        customPrompt: remarks,
        mode: resolvedMode,
        imageType: resolvedImageType,
        textMode: (currentRow.copyText || '').trim() ? 'render_text' : 'none',
        language: currentRow.language || 'auto',
        preserveProductText: currentRow.preserveProductText !== false,
        commercialTone: currentRow.commercialTone || commercialTone,
        sceneStrictness: currentRow.sceneStrictness || sceneStrictness
      };
    } else if (!isBatch && singleGenData) {
      const inferredSingleMode = hasRefImage
        ? 'background_transfer'
        : (singleGenData.imageType === 'lifestyle' || singleGenData.imageType === 'banner'
          ? 'lifestyle_listing'
          : 'infographic_listing');

      return {
        productTitle: '',
        copyText: singleGenData.copyText.trim(),
        sizeInstruction: getSizeInstruction(singleGenData.size),
        hasRefImage: hasRefImage,
        customPrompt: singleGenData.prompt.trim(),
        mode: singleGenData.mode === 'auto' ? inferredSingleMode : singleGenData.mode,
        imageType: singleGenData.imageType,
        textMode: singleGenData.copyText.trim() ? 'render_text' : 'none',
        preserveProductText: singleGenData.preserveProductText,
        commercialTone: singleGenData.commercialTone,
        sceneStrictness: singleGenData.sceneStrictness === 'auto' ? 'strict' : singleGenData.sceneStrictness
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

  const prepareSinglePromptOptions = async (
    fingerprint: ProductFingerprint | null | undefined,
    hasRefImage: boolean
  ): Promise<BuildPromptOptions> => {
    const baseOptions = createPromptOptions(false, undefined, singleGen, hasRefImage);
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
    aspectRatio,
    imageIndex,
    totalImages,
    productBase64,
    supplementalProductBase64,
    requestBehavior,
  }: {
    promptOptions: BuildPromptOptions;
    refBase64: { data: string, mimeType: string } | null;
    aspectRatio: string;
    imageIndex?: number;
    totalImages?: number;
    productBase64?: { data: string, mimeType: string };
    supplementalProductBase64?: { data: string, mimeType: string }[];
    requestBehavior?: ImageRequestBehavior;
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
      requestBehavior
    );

    return { result, usedPromptOptions: attemptOptions };
  };

  const withOperationTimeout = async <T,>(
    operation: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string
  ): Promise<T> => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(timeoutMessage));
      }, timeoutMs);
    });

    try {
      return await Promise.race([operation, timeoutPromise]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  };

  const downscaleBaseImageForLocalEdit = async (
    image: { data: string; mimeType: string },
    maxDimension: number = 1536
  ): Promise<{ resized: boolean; image: { data: string; mimeType: string } }> => {
    if (typeof document === 'undefined') {
      return { resized: false, image };
    }

    const imageUrl = `data:${image.mimeType};base64,${image.data}`;

    const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => resolve({ width: img.width, height: img.height });
      img.onerror = () => reject(new Error('Failed to decode the current generated image for local edit.'));
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
      throw new Error('Failed to create a canvas context for local edit image resizing.');
    }

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new window.Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Failed to load the current generated image for local edit resizing.'));
      element.src = imageUrl;
    });

    context.drawImage(img, 0, 0, targetWidth, targetHeight);

    const resizedBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        blob => {
          if (!blob) {
            reject(new Error('Failed to export the resized local edit base image.'));
            return;
          }
          resolve(blob);
        },
        image.mimeType === 'image/png' ? 'image/png' : 'image/jpeg',
        0.92
      );
    });

    const resizedBase64 = await blobToBase64(resizedBlob);
    return {
      resized: true,
      image: resizedBase64,
    };
  };

  const getSingleImageOperationTimeoutMs = (operation: 'generate' | 'local_edit') => {
    if (operation === 'local_edit') {
      return (SINGLE_MODE_LOCAL_EDIT_REQUEST_BEHAVIOR.timeoutMs ?? 45000) + 15000;
    }

    return 50000;
  };

  const regenerateRow = async (rowId: string, rowData?: ExcelRow, activeFp?: ProductFingerprint | null) => {
    if (!hasApiKey || !productImage) return;

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setRows(prev => prev.map(row =>
        row.id === rowId
          ? { ...row, status: 'error', error: 'Network connection was lost. Please reconnect and try again.' }
          : row
      ));
      return;
    }

    const currentRow = rowData || rowsRef.current.find(r => r.id === rowId);
    if (!currentRow) return;

    if (currentRow.status === 'generating') return;
    
    // Set status to generating
    setRows(prev => {
      const newRows = [...prev];
      const idx = newRows.findIndex(r => r.id === rowId);
      if (idx !== -1) {
        newRows[idx] = { ...newRows[idx], status: 'generating', error: undefined };
      }
      return newRows;
    });

    try {
      let fpToUse = activeFp !== undefined ? activeFp : productFingerprint;
      if (!fpToUse || isFingerprintDirty) {
        fpToUse = await extractProductFingerprintFn();
      }

      let refBase64 = null;
      if (currentRow.refUrl) {
        try {
          refBase64 = await fetchImageAsBase64(currentRow.refUrl);
        } catch (fetchErr) {
          throw new Error(`Failed to load reference image from URL: ${currentRow.refUrl}`);
        }
      }

      const promptOptions = await preparePromptOptions(
        createPromptOptions(true, currentRow, singleGen, !!refBase64),
        fpToUse
      );
      const aspectRatio = parseAspectRatio(currentRow.size);

      const { result, usedPromptOptions } = await generateImageWithFallback({
        promptOptions,
        refBase64,
        aspectRatio,
      });

      const generatedImageUrl = result.url;
      const generatedPrompt = result.prompt;

      setRows(prev => {
        const newRows = [...prev];
        const idx = newRows.findIndex(r => r.id === rowId);
        if (idx !== -1) {
          newRows[idx] = { 
            ...newRows[idx], 
            status: fpToUse ? 'generated' : 'success',
            generatedImage: generatedImageUrl,
            generatedPrompt: generatedPrompt
          };
        }
        return newRows;
      });

      if (fpToUse) {
        // Run verification asynchronously
        (async () => {
          try {
            console.log(`Verifying row ${rowId} asynchronously...`);
            
            // Extract base64 directly from data URL to avoid re-fetching
            let generatedBase64Obj: { data: string, mimeType: string };
            if (generatedImageUrl.startsWith('data:image')) {
              const [header, data] = generatedImageUrl.split(',');
              const mimeType = header.split(':')[1].split(';')[0];
              generatedBase64Obj = { data, mimeType };
            } else {
              generatedBase64Obj = await fetchImageAsBase64(generatedImageUrl);
            }

            const supplementalBase64 = subjectReferenceImages.map(img => img.base64);
            const verification = await verifyGeneratedImage(
              generatedBase64Obj, 
              fpToUse,
              productImage.base64,
              supplementalBase64,
                {
                  targetOutputLanguage: usedPromptOptions.language,
                  imageType: usedPromptOptions.imageType,
                  expectedCopyText: usedPromptOptions.copyText?.trim() ? usedPromptOptions.copyText : undefined,
                }
              );
            
            setVerificationMap(prev => {
              const newMap = new Map(prev);
              newMap.set(generatedImageUrl, verification);
              return newMap;
            });

            if (!isVerificationPassed(verification)) {
              console.warn(`Row ${rowId} failed verification. Score: ${verification.score}`);
              setRows(prev => {
                const newRows = [...prev];
                const idx = newRows.findIndex(r => r.id === rowId);
                if (idx !== -1 && newRows[idx].generatedImage === generatedImageUrl) {
                  newRows[idx] = { ...newRows[idx], status: 'needs_review' };
                }
                return newRows;
              });
            } else {
              console.log(`Row ${rowId} passed verification.`);
              setRows(prev => {
                const newRows = [...prev];
                const idx = newRows.findIndex(r => r.id === rowId);
                if (idx !== -1 && newRows[idx].generatedImage === generatedImageUrl) {
                  newRows[idx] = { ...newRows[idx], status: 'success' };
                }
                return newRows;
              });
            }
          } catch (verErr) {
            console.error(`Verification error for row ${rowId}:`, verErr);
            // If verification fails, we still consider it generated, but maybe we should mark it as needs_review
            setRows(prev => {
              const newRows = [...prev];
              const idx = newRows.findIndex(r => r.id === rowId);
              if (idx !== -1 && newRows[idx].generatedImage === generatedImageUrl) {
                newRows[idx] = { ...newRows[idx], status: 'needs_review' };
              }
              return newRows;
            });
          }
        })();
      }
    } catch (err: any) {
      console.error(`Error regenerating image for row ${currentRow.rowNumber}:`, err);
      if (err.message?.includes('Requested entity was not found')) {
        setHasApiKey(false);
        setError('API Key error. Please re-select your API Key.');
      }
      setRows(prev => {
        const newRows = [...prev];
        const idx = newRows.findIndex(r => r.id === rowId);
        if (idx !== -1) {
          newRows[idx] = { ...newRows[idx], status: 'error', error: err.message || 'Failed to generate image' };
        }
        return newRows;
      });
    }
  };

  const handleSingleGenerate = async () => {
    if (!hasApiKey) {
      if (productImage && !excelFile) {
        setSingleGen(prev => ({ ...prev, error: 'Please select an API Key first.' }));
      } else {
        setError('Please select an API Key first.');
      }
      return;
    }
    if (!productImage) {
      setError('Please upload a product image first.');
      return;
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setSingleGen(prev => ({ ...prev, error: 'Network connection was lost. Please reconnect and try again.' }));
      return;
    }

    const activeFp = !isFingerprintDirty ? productFingerprint : null;

    setSingleGen(prev => ({ ...prev, status: 'generating', error: '', generatedImages: [] }));
    setVerificationMap(new Map());
    setError(null);

    try {
      const hasRef = !!referenceImage;
      const basePromptOptions = await prepareSinglePromptOptions(activeFp, hasRef);
      const aspectRatio = parseAspectRatio(singleGen.size);

      const concurrencyLimit = 3;
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
          const { result, usedPromptOptions } = await generateImageWithFallback({
            promptOptions: basePromptOptions,
            refBase64: hasRef ? referenceImage.base64 : null,
            aspectRatio,
            imageIndex,
            totalImages: total,
          });

          // Asynchronous verification
          if (activeFp) {
            (async () => {
              try {
                console.log(`Verifying image ${imageIndex} asynchronously...`);
                
                let generatedBase64Obj: { data: string, mimeType: string };
                if (result.url.startsWith('data:image')) {
                  const [header, data] = result.url.split(',');
                  const mimeType = header.split(':')[1].split(';')[0];
                  generatedBase64Obj = { data, mimeType };
                } else {
                  generatedBase64Obj = await fetchImageAsBase64(result.url);
                }

                const supplementalBase64 = subjectReferenceImages.map(img => img.base64);
                const verification = await verifyGeneratedImage(
                  generatedBase64Obj, 
                  activeFp,
                  productImage.base64,
                  supplementalBase64,
                  {
                    targetOutputLanguage: usedPromptOptions.language,
                    imageType: usedPromptOptions.imageType,
                    expectedCopyText: usedPromptOptions.copyText?.trim() ? usedPromptOptions.copyText : undefined,
                  }
                );
                
                setVerificationMap(prev => {
                  const newMap = new Map(prev);
                  newMap.set(result.url, verification);
                  return newMap;
                });

                if (!isVerificationPassed(verification)) {
                  console.warn(`Image ${imageIndex} failed verification:`, verification.issues);
                  // The useEffect will handle status transition
                } else {
                  console.log(`Image ${imageIndex} passed verification.`);
                }
              } catch (verErr) {
                console.error(`Verification error for image ${imageIndex}:`, verErr);
                setVerificationMap(prev => {
                  const newMap = new Map(prev);
                  newMap.set(
                    result.url,
                    createVerificationFailureResult(`Verification failed for image ${imageIndex}. Please review manually.`)
                  );
                  return newMap;
                });
              }
            })();
          }

          return { imageIndex, result };
        });

          const chunkResults = await Promise.allSettled(chunkPromises);

          chunkResults.forEach((item, resultIdx) => {
            const imageIndex = chunkIndices[resultIdx];

            if (item.status === 'fulfilled') {
              resultsByIndex.set(imageIndex, {
                ...item.value.result,
                adjustmentPrompt: resultsByIndex.get(imageIndex)?.adjustmentPrompt || '',
              });
            } else {
              pendingImageIndices.push(imageIndex);
              lastError = item.reason?.message || 'Generation failed';
            }
          });

          setSingleGen(prev => ({
            ...prev,
            generatedImages: Array.from({ length: total }, (_, resultIdx) => resultsByIndex.get(resultIdx + 1))
              .filter((item): item is SingleGeneratedImage => !!item)
          }));
        }
      }

      const successfulCount = resultsByIndex.size;

      if (successfulCount === 0 && lastError) {
        throw new Error(lastError);
      } else if (pendingImageIndices.length > 0) {
        const partialMessage = `Only generated ${successfulCount}/${total} image(s). ${pendingImageIndices.length} image(s) still failed. ${lastError}`.trim();
        setSingleGen(prev => ({ ...prev, status: 'needs_review', error: partialMessage }));
      } else {
        setSingleGen(prev => ({ ...prev, status: activeFp ? 'generated' : 'success' }));
      }
    } catch (err: any) {
      if (err.message?.includes('Requested entity was not found')) {
        setHasApiKey(false);
        setSingleGen(prev => ({ ...prev, error: 'API Key error. Please re-select your API Key.' }));
      }
      setSingleGen(prev => ({ ...prev, status: 'error', error: err.message || 'Generation failed' }));
    }
  };

  const handleRegenerateSingleImage = async (indexToRegenerate: number) => {
    if (!hasApiKey) {
      setSingleGen(prev => ({ ...prev, error: 'Please select an API Key first.' }));
      return;
    }
    if (!productImage) {
      setSingleGen(prev => ({ ...prev, error: 'Please upload a product image first.' }));
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setSingleGen(prev => ({ ...prev, error: 'Network connection was lost. Please reconnect and try again.' }));
      return;
    }

    const regenerationWatchdogMs = getSingleImageOperationTimeoutMs('generate') + 15000;
    if (!tryStartSingleImageRegeneration(indexToRegenerate, 'regenerate', regenerationWatchdogMs)) {
      if (!isSingleImageRegenerating(indexToRegenerate) && hasReachedSingleImageRegenerationLimit) {
        setSingleGen(prev => ({
          ...prev,
          error: `You can retry up to ${MAX_CONCURRENT_SINGLE_IMAGE_REGENERATIONS} single images at the same time.`,
        }));
      }
      return;
    }

    try {
      setSingleGen(prev => ({ ...prev, error: '' }));
      const fpToUse = !isFingerprintDirty ? productFingerprint : null;
      const regenerateLogPrefix = `[single-regenerate:${indexToRegenerate + 1}]`;

      const hasRef = !!referenceImage;
      const promptPreparationStartedAt = Date.now();
      console.log(`${regenerateLogPrefix} prompt preparation start`, {
        hasReferenceImage: hasRef,
        supplementalReferenceCount: subjectReferenceImages.length,
      });
      const promptOptions = await prepareSinglePromptOptions(fpToUse, hasRef);
      console.log(`${regenerateLogPrefix} prompt preparation end`, {
        durationMs: Date.now() - promptPreparationStartedAt,
      });
      const aspectRatio = parseAspectRatio(singleGen.size);
      const supplementalRetryReferences = subjectReferenceImages.slice(0, 1).map(img => img.base64);
      const operationTimeoutMs = getSingleImageOperationTimeoutMs('generate');
      const { result, usedPromptOptions } = await withOperationTimeout(
        generateImageWithFallback({
          promptOptions,
          refBase64: hasRef ? referenceImage.base64 : null,
          aspectRatio,
          imageIndex: indexToRegenerate + 1,
          totalImages: singleGen.count,
          supplementalProductBase64: supplementalRetryReferences,
          requestBehavior: SINGLE_MODE_REGENERATION_REQUEST_BEHAVIOR,
        }),
        operationTimeoutMs,
        `Image ${indexToRegenerate + 1} regeneration took too long. Please try again after simplifying the scene or checking your network connection.`
      );

      setSingleGen(prev => {
        const newImages = [...prev.generatedImages];
        newImages[indexToRegenerate] = {
          ...result,
          adjustmentPrompt: prev.generatedImages[indexToRegenerate]?.adjustmentPrompt || '',
        };
        return { ...prev, generatedImages: newImages, status: fpToUse ? 'generated' : 'success' };
      });
      
      if (fpToUse) {
        // Run verification asynchronously
        (async () => {
          try {
            console.log(`Verifying regenerated image ${indexToRegenerate + 1} asynchronously...`);
            
            let generatedBase64Obj: { data: string, mimeType: string };
            if (result!.url.startsWith('data:image')) {
              const [header, data] = result!.url.split(',');
              const mimeType = header.split(':')[1].split(';')[0];
              generatedBase64Obj = { data, mimeType };
            } else {
              generatedBase64Obj = await fetchImageAsBase64(result!.url);
            }

            const supplementalBase64 = subjectReferenceImages.map(img => img.base64);
            const verification = await verifyGeneratedImage(
              generatedBase64Obj, 
              fpToUse,
              productImage.base64,
              supplementalBase64,
              {
                targetOutputLanguage: usedPromptOptions.language,
                imageType: usedPromptOptions.imageType,
                expectedCopyText: usedPromptOptions.copyText?.trim() ? usedPromptOptions.copyText : undefined,
              }
            );
            
            setVerificationMap(prev => {
              const newMap = new Map(prev);
              newMap.set(result!.url, verification);
              return newMap;
            });

            if (!isVerificationPassed(verification)) {
              console.warn(`Regenerated image ${indexToRegenerate + 1} failed verification:`, verification.issues);
              // The useEffect will handle status transition
            } else {
              console.log(`Regenerated image ${indexToRegenerate + 1} passed verification.`);
            }
          } catch (verErr) {
            console.error(`Verification error for regenerated image ${indexToRegenerate + 1}:`, verErr);
            setVerificationMap(prev => {
              const newMap = new Map(prev);
              newMap.set(
                result.url,
                createVerificationFailureResult(`Verification failed for regenerated image ${indexToRegenerate + 1}. Please review manually.`)
              );
              return newMap;
            });
          }
        })();
      }
    } catch (err: any) {
      if (err.message?.includes('Requested entity was not found')) {
        setHasApiKey(false);
        setSingleGen(prev => ({ ...prev, error: 'API Key error. Please re-select your API Key.' }));
      }
      setSingleGen(prev => ({
        ...prev,
        error: `Failed to regenerate image ${indexToRegenerate + 1}: ${err.message}`,
      }));
    } finally {
      finishSingleImageRegeneration(indexToRegenerate);
    }
  };

  const handleEditSingleImageLocally = async (indexToEdit: number) => {
    if (!hasApiKey) {
      setSingleGen(prev => ({ ...prev, error: 'Please select an API Key first.' }));
      return;
    }
    if (!productImage) {
      setSingleGen(prev => ({ ...prev, error: 'Please upload a product image first.' }));
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setSingleGen(prev => ({ ...prev, error: 'Network connection was lost. Please reconnect and try again.' }));
      return;
    }

    const currentImage = singleGen.generatedImages[indexToEdit];
    const adjustmentPrompt = currentImage?.adjustmentPrompt?.trim() || '';

    if (!currentImage) return;

    if (!adjustmentPrompt) {
      setSingleGen(prev => ({ ...prev, error: 'Please enter a specific adjustment for this image first.' }));
      return;
    }

    const localEditWatchdogMs = getSingleImageOperationTimeoutMs('local_edit') + 15000;
    if (!tryStartSingleImageRegeneration(indexToEdit, 'local_edit', localEditWatchdogMs)) {
      if (!isSingleImageRegenerating(indexToEdit) && hasReachedSingleImageRegenerationLimit) {
        setSingleGen(prev => ({
          ...prev,
          error: `You can retry up to ${MAX_CONCURRENT_SINGLE_IMAGE_REGENERATIONS} single images at the same time.`,
        }));
      }
      return;
    }

    const localEditLogPrefix = `[single-local-edit:${indexToEdit + 1}]`;

    try {
      setSingleGen(prev => ({ ...prev, error: '' }));
      const fpToUse = !isFingerprintDirty ? productFingerprint : null;
      const operationTimeoutMs = getSingleImageOperationTimeoutMs('local_edit');
      const result = await withOperationTimeout(
        (async () => {
          const baseConversionStartedAt = Date.now();
          console.log(`${localEditLogPrefix} base image conversion start`, {
            source: currentImage.url.startsWith('data:') ? 'data_url' : 'remote_url',
          });
          const originalBaseImageBase64 = await fetchImageAsBase64(currentImage.url);
          console.log(`${localEditLogPrefix} base image conversion end`, {
            durationMs: Date.now() - baseConversionStartedAt,
            mimeType: originalBaseImageBase64.mimeType,
            base64Length: originalBaseImageBase64.data.length,
          });

          const baseResizeStartedAt = Date.now();
          console.log(`${localEditLogPrefix} base image resize check start`);
          const { image: baseImageBase64, resized } = await downscaleBaseImageForLocalEdit(originalBaseImageBase64);
          console.log(`${localEditLogPrefix} base image resize check end`, {
            durationMs: Date.now() - baseResizeStartedAt,
            resized,
            mimeType: baseImageBase64.mimeType,
            base64Length: baseImageBase64.data.length,
          });

          const aspectRatio = parseAspectRatio(singleGen.size);
          const localEditPrompt = getSingleImageLocalEditPrompt(singleGen.prompt, adjustmentPrompt, singleGen.copyText);
          const localEditImageSize = '1K';
          const productReferenceResizeStartedAt = Date.now();
          console.log(`${localEditLogPrefix} product reference resize check start`);
          const { image: localEditProductReference, resized: productReferenceResized } = await downscaleBaseImageForLocalEdit(
            productImage.base64,
            1280
          );
          console.log(`${localEditLogPrefix} product reference resize check end`, {
            durationMs: Date.now() - productReferenceResizeStartedAt,
            resized: productReferenceResized,
            mimeType: localEditProductReference.mimeType,
            base64Length: localEditProductReference.data.length,
          });

          console.log(`${localEditLogPrefix} local edit request start`, {
            aspectRatio,
            imageSize: localEditImageSize,
            supplementalReferenceCount: 0,
            promptLength: localEditPrompt.length,
          });

          const requestStartedAt = Date.now();

          try {
            const editedResult = await editGeneratedImageLocally(
              baseImageBase64,
              localEditProductReference,
              [],
              localEditPrompt,
              aspectRatio,
              localEditImageSize,
              SINGLE_MODE_LOCAL_EDIT_REQUEST_BEHAVIOR
            );

            console.log(`${localEditLogPrefix} local edit request end`, {
              durationMs: Date.now() - requestStartedAt,
              returnedImage: editedResult.url.startsWith('data:image'),
            });

            return editedResult;
          } catch (requestError: any) {
            console.error(`${localEditLogPrefix} local edit request failed`, {
              durationMs: Date.now() - requestStartedAt,
              reason: requestError?.message || String(requestError),
            });
            throw requestError;
          }
        })(),
        operationTimeoutMs,
        `Image ${indexToEdit + 1} local edit took too long. Please try again after simplifying the adjustment or checking your network connection.`
      );

      setSingleGen(prev => {
        const newImages = [...prev.generatedImages];
        newImages[indexToEdit] = {
          ...result,
          adjustmentPrompt: prev.generatedImages[indexToEdit]?.adjustmentPrompt || '',
        };
        return { ...prev, generatedImages: newImages, status: fpToUse ? 'generated' : 'success' };
      });

      if (fpToUse) {
        (async () => {
          try {
            console.log(`Verifying locally edited image ${indexToEdit + 1} asynchronously...`);

            let generatedBase64Obj: { data: string, mimeType: string };
            if (result.url.startsWith('data:image')) {
              const [header, data] = result.url.split(',');
              const mimeType = header.split(':')[1].split(';')[0];
              generatedBase64Obj = { data, mimeType };
            } else {
              generatedBase64Obj = await fetchImageAsBase64(result.url);
            }

            const supplementalBase64 = subjectReferenceImages.map(img => img.base64);
            const verification = await verifyGeneratedImage(
              generatedBase64Obj,
              fpToUse,
              productImage.base64,
              supplementalBase64,
              {
                imageType: singleGen.imageType,
                expectedCopyText: singleGen.copyText.trim() ? singleGen.copyText.trim() : undefined,
              }
            );

            setVerificationMap(prev => {
              const newMap = new Map(prev);
              newMap.set(result.url, verification);
              return newMap;
            });

            if (!isVerificationPassed(verification)) {
              console.warn(`Locally edited image ${indexToEdit + 1} failed verification:`, verification.issues);
            } else {
              console.log(`Locally edited image ${indexToEdit + 1} passed verification.`);
            }
          } catch (verErr) {
            console.error(`Verification error for locally edited image ${indexToEdit + 1}:`, verErr);
            setVerificationMap(prev => {
              const newMap = new Map(prev);
              newMap.set(
                result.url,
                createVerificationFailureResult(`Verification failed for locally edited image ${indexToEdit + 1}. Please review manually.`)
              );
              return newMap;
            });
          }
        })();
      }
    } catch (err: any) {
      console.error(`${localEditLogPrefix} final error`, err);
      if (err.message?.includes('Requested entity was not found')) {
        setHasApiKey(false);
        setSingleGen(prev => ({ ...prev, error: 'API Key error. Please re-select your API Key.' }));
      }
      setSingleGen(prev => ({
        ...prev,
        error: `Failed to edit image ${indexToEdit + 1}: ${err.message}`,
      }));
    } finally {
      console.log(`${localEditLogPrefix} loading cleanup`);
      finishSingleImageRegeneration(indexToEdit);
    }
  };

  const generateImages = async () => {
    if (!hasApiKey) {
      setError('Please select an API Key first.');
      return;
    }
    if (!productImage) {
      setError('Please upload a product image first.');
      return;
    }
    if (rowsRef.current.length === 0) {
      setError('Please upload an Excel file with valid data.');
      return;
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setError('Network connection was lost. Please reconnect and try again.');
      return;
    }

    let activeFp = productFingerprint;
    if (!activeFp || isFingerprintDirty) {
      try {
        activeFp = await extractProductFingerprintFn();
      } catch (err: any) {
        setError('Failed to extract product features. Please check the Premium Settings section.');
        return;
      }
    }

    setIsGenerating(true);
    setError(null);

    try {
      const rowsToProcess = rows.filter(r => r.status === 'pending' || r.status === 'error' || r.status === 'needs_review');
      const concurrencyLimit = 3;

      for (let i = 0; i < rowsToProcess.length; i += concurrencyLimit) {
        const chunk = rowsToProcess.slice(i, i + concurrencyLimit);
        await Promise.all(chunk.map(row => regenerateRow(row.id, row, activeFp)));
      }
    } catch (err: any) {
      setError(err?.message || 'Batch generation failed.');
    } finally {
      setIsGenerating(false);
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

  const getSingleImageLocalEditPrompt = (
    basePrompt: string,
    adjustmentPrompt: string,
    copyText: string
  ) => {
    const trimmedAdjustmentPrompt = adjustmentPrompt.trim();
    const trimmedCopyText = copyText.trim();

    const lines = [
      "LOCAL EDIT TASK:",
      `- PRIMARY CHANGE REQUEST: "${trimmedAdjustmentPrompt}".`,
      "- The primary change request above is the highest-priority instruction for this edit and overrides earlier generation intent if there is any conflict.",
      "- The final image must visibly reflect the requested change. Returning an unchanged or almost unchanged image is incorrect.",
      "- Treat the first image as the current image to edit directly.",
      "- Keep the same product identity so the result still matches the uploaded product reference.",
      "- Keep the same main scene, framing, and overall composition unless the user clearly asks for a broader change.",
      "- Make only the minimum necessary visual changes to satisfy the request, while keeping the rest of the image naturally consistent.",
      "- Do not turn this into a brand-new concept, a different product, or a fully redesigned scene."
    ];

    if (trimmedCopyText) {
      lines.push(`- Preserve the current marketing text unless the user explicitly asks to change it. Expected text: "${trimmedCopyText}".`);
    }

    if (basePrompt.trim()) {
      lines.push("- Use the earlier generation intent only as low-priority background context. Do not let it override the current local edit request.");
    }

    lines.push("- If the request can be satisfied with a local edit, avoid unnecessary changes elsewhere.");
    lines.push("- Before finishing, make sure a reviewer can clearly point to the requested change in the final image.");

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
    console.log(`[single-operation:${index + 1}] start`, {
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

  const finishSingleImageRegeneration = (index: number) => {
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

    console.log(`[single-operation:${index + 1}] finish`, {
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

  const detailSetPlanPreview = createDetailSetPlan({
    platform: detailSet.platform,
    fingerprint: detailSetFingerprint,
    globalGuidance: detailSet.globalPrompt,
  });
  const showTopStudioError = !!error && (!productImage || !!excelFile || rows.length > 0);
  const showSingleSectionError = !!productImage && !excelFile && !rows.length && !!singleGen.error;

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

  const isAnyDetailSetItemGenerating = detailSet.generatedItems.some(item => item.status === 'generating');

  if (!hasApiKey) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 text-[#1d1d1f] font-sans relative">
        {/* Premium E-commerce Background */}
        <div className="fixed inset-0 w-full h-full pointer-events-none overflow-hidden z-0 bg-[#f8fafc]">
          {/* 1. Design Studio Grid with Fade */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_70%,transparent_100%)]"></div>
          
          {/* 2. Rich Soft Mesh Gradients */}
          <div className="absolute left-[-10%] top-[-10%] -z-10 h-[500px] w-[500px] rounded-full bg-indigo-500/20 blur-[120px]"></div>
          <div className="absolute right-[-5%] top-[10%] -z-10 h-[400px] w-[400px] rounded-full bg-violet-500/20 blur-[100px]"></div>
          <div className="absolute left-[15%] bottom-[-10%] -z-10 h-[600px] w-[600px] rounded-full bg-emerald-400/15 blur-[120px]"></div>
          <div className="absolute right-[15%] bottom-[10%] -z-10 h-[500px] w-[500px] rounded-full bg-rose-400/15 blur-[120px]"></div>
          <div className="absolute left-[40%] top-[30%] -z-10 h-[300px] w-[300px] rounded-full bg-amber-300/15 blur-[100px]"></div>
          
          {/* 3. Animated Floating Geometric Elements */}
          {/* Rings */}
          <div className="absolute top-[15%] left-[8%] w-32 h-32 border-[1.5px] border-indigo-300/40 rounded-full animate-float"></div>
          <div className="absolute bottom-[25%] right-[8%] w-48 h-48 border-[1.5px] border-rose-300/30 rounded-full animate-float-delayed"></div>
          <div className="absolute top-[40%] right-[15%] w-16 h-16 border-[1.5px] border-violet-300/40 rounded-full animate-float"></div>
          
          {/* Pills */}
          <div className="absolute top-[25%] right-[25%] w-24 h-8 border-[1.5px] border-emerald-300/40 rounded-full rotate-45 animate-float-delayed"></div>
          <div className="absolute bottom-[20%] left-[20%] w-32 h-10 border-[1.5px] border-amber-300/40 rounded-full -rotate-12 animate-float"></div>
          
          {/* Plus Signs */}
          <div className="absolute top-[10%] right-[30%] text-indigo-300/50 font-light text-4xl animate-pulse">+</div>
          <div className="absolute bottom-[15%] left-[35%] text-emerald-300/50 font-light text-5xl animate-float">+</div>
          <div className="absolute top-[50%] left-[5%] text-violet-300/50 font-light text-3xl animate-float-delayed">+</div>
          
          {/* Dot Matrix Pattern */}
          <div className="absolute top-[60%] right-[5%] w-32 h-32 bg-[radial-gradient(circle,#80808030_2px,transparent_2px)] bg-[size:16px_16px] animate-float"></div>
          <div className="absolute bottom-[5%] left-[5%] w-40 h-40 bg-[radial-gradient(circle,#80808030_2px,transparent_2px)] bg-[size:16px_16px] animate-float-delayed"></div>

          {/* 4. Diagonal Tech Lines */}
          <svg className="absolute top-0 right-0 w-1/2 h-full opacity-[0.04] text-indigo-900" viewBox="0 0 100 100" preserveAspectRatio="none">
            <path d="M0,100 L100,0" stroke="currentColor" strokeWidth="0.5" fill="none" />
            <path d="M20,100 L100,20" stroke="currentColor" strokeWidth="0.5" fill="none" />
            <path d="M40,100 L100,40" stroke="currentColor" strokeWidth="0.5" fill="none" />
            <path d="M60,100 L100,60" stroke="currentColor" strokeWidth="0.5" fill="none" />
          </svg>
        </div>
        
        <div className="bg-white/80 backdrop-blur-2xl p-10 rounded-[2rem] shadow-[0_20px_60px_rgba(0,0,0,0.04)] border border-white max-w-md w-full text-center relative z-10">
          <div className="mx-auto mb-6 flex justify-center">
            <img src="/favicon.svg" alt="VXStudio" className="h-14 w-14 rounded-2xl shadow-sm" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight mb-3">API Key Required</h2>
          
          {window.aistudio?.openSelectKey ? (
            <>
              <p className="text-slate-500 mb-8 leading-relaxed text-sm">
                To use the high-quality image generation model, you need to select a Google Cloud project with billing enabled.
              </p>
              <button
                onClick={handleSelectApiKey}
                className="w-full py-4 px-4 bg-[#1d1d1f] hover:bg-[#000000] text-white rounded-2xl font-semibold transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 cursor-pointer"
              >
                Select API Key
              </button>
            </>
          ) : (
            <div className="text-left bg-slate-50 p-4 rounded-xl border border-slate-200 text-sm text-slate-600">
              <p className="mb-2 font-semibold text-slate-800">Local Deployment Detected</p>
              <p className="mb-2">To run this application locally, please create a <code className="bg-slate-200 px-1 py-0.5 rounded">.env</code> file in the root directory and add your Gemini API Key:</p>
              <pre className="bg-slate-800 text-emerald-400 p-3 rounded-lg overflow-x-auto text-xs">
                VITE_GEMINI_API_KEY=your_api_key_here
              </pre>
              <p className="mt-3 text-xs text-slate-500">After adding the key, please restart the development server.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-[#1d1d1f] font-sans relative">
      {/* Premium E-commerce Background */}
      <div className="fixed inset-0 w-full h-full pointer-events-none overflow-hidden z-0 bg-[#f8fafc]">
        {/* 1. Design Studio Grid with Fade */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_70%,transparent_100%)]"></div>
        
        {/* 2. Rich Soft Mesh Gradients */}
        <div className="absolute left-[-10%] top-[-10%] -z-10 h-[500px] w-[500px] rounded-full bg-indigo-500/20 blur-[120px]"></div>
        <div className="absolute right-[-5%] top-[10%] -z-10 h-[400px] w-[400px] rounded-full bg-violet-500/20 blur-[100px]"></div>
        <div className="absolute left-[15%] bottom-[-10%] -z-10 h-[600px] w-[600px] rounded-full bg-emerald-400/15 blur-[120px]"></div>
        <div className="absolute right-[15%] bottom-[10%] -z-10 h-[500px] w-[500px] rounded-full bg-rose-400/15 blur-[120px]"></div>
        <div className="absolute left-[40%] top-[30%] -z-10 h-[300px] w-[300px] rounded-full bg-amber-300/15 blur-[100px]"></div>
        
        {/* 3. Animated Floating Geometric Elements */}
        {/* Rings */}
        <div className="absolute top-[15%] left-[8%] w-32 h-32 border-[1.5px] border-indigo-300/40 rounded-full animate-float"></div>
        <div className="absolute bottom-[25%] right-[8%] w-48 h-48 border-[1.5px] border-rose-300/30 rounded-full animate-float-delayed"></div>
        <div className="absolute top-[40%] right-[15%] w-16 h-16 border-[1.5px] border-violet-300/40 rounded-full animate-float"></div>
        
        {/* Pills */}
        <div className="absolute top-[25%] right-[25%] w-24 h-8 border-[1.5px] border-emerald-300/40 rounded-full rotate-45 animate-float-delayed"></div>
        <div className="absolute bottom-[20%] left-[20%] w-32 h-10 border-[1.5px] border-amber-300/40 rounded-full -rotate-12 animate-float"></div>
        
        {/* Plus Signs */}
        <div className="absolute top-[10%] right-[30%] text-indigo-300/50 font-light text-4xl animate-pulse">+</div>
        <div className="absolute bottom-[15%] left-[35%] text-emerald-300/50 font-light text-5xl animate-float">+</div>
        <div className="absolute top-[50%] left-[5%] text-violet-300/50 font-light text-3xl animate-float-delayed">+</div>
        
        {/* Dot Matrix Pattern */}
        <div className="absolute top-[60%] right-[5%] w-32 h-32 bg-[radial-gradient(circle,#80808030_2px,transparent_2px)] bg-[size:16px_16px] animate-float"></div>
        <div className="absolute bottom-[5%] left-[5%] w-40 h-40 bg-[radial-gradient(circle,#80808030_2px,transparent_2px)] bg-[size:16px_16px] animate-float-delayed"></div>

        {/* 4. Diagonal Tech Lines */}
        <svg className="absolute top-0 right-0 w-1/2 h-full opacity-[0.04] text-indigo-900" viewBox="0 0 100 100" preserveAspectRatio="none">
          <path d="M0,100 L100,0" stroke="currentColor" strokeWidth="0.5" fill="none" />
          <path d="M20,100 L100,20" stroke="currentColor" strokeWidth="0.5" fill="none" />
          <path d="M40,100 L100,40" stroke="currentColor" strokeWidth="0.5" fill="none" />
          <path d="M60,100 L100,60" stroke="currentColor" strokeWidth="0.5" fill="none" />
        </svg>
      </div>

      <div className="relative z-10">
        <header className="sticky top-0 z-50 bg-white/70 backdrop-blur-2xl border-b border-slate-200/50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/favicon.svg" alt="VXStudio" className="h-11 w-11 rounded-xl shadow-md" />
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                VXStudio
              </h1>
              <p className="text-xs font-medium text-slate-500">
                Product Image Studio
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {currentGeminiApiKeyLast4 && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white/80 shadow-sm text-xs font-semibold text-slate-600">
                <Key className="w-3.5 h-3.5 text-slate-400" />
                <span>{`Current Key ****${currentGeminiApiKeyLast4}`}</span>
              </div>
            )}
            <SelectField 
              label="" 
              value={imageSize} 
              onChange={(val) => setImageSize(val)}
              options={[
                { label: '512px', value: '512px' },
                { label: '1K (Standard)', value: '1K' },
                { label: '2K (High)', value: '2K' },
                { label: '4K (Ultra)', value: '4K' },
              ]}
              className="min-w-[140px]"
            />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
        <div className="bg-white/80 backdrop-blur-2xl p-3 rounded-[2rem] shadow-[0_20px_60px_rgba(0,0,0,0.03)] border border-white">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <button
              onClick={() => {
                setWorkspaceMode('studio');
                document.getElementById('studio-workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className={`rounded-[1.5rem] px-5 py-4 text-left transition-all border cursor-pointer ${
                workspaceMode === 'studio'
                  ? 'bg-slate-900 text-white border-slate-900 shadow-lg'
                  : 'bg-white/70 text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${workspaceMode === 'studio' ? 'bg-white/15' : 'bg-slate-100 text-slate-700'}`}>
                  <Store className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-base font-bold">Single / Batch Studio</p>
                  <p className={`text-sm ${workspaceMode === 'studio' ? 'text-slate-300' : 'text-slate-500'}`}>
                    Single-image and Excel batch workflow.
                  </p>
                </div>
              </div>
            </button>

            <button
              onClick={() => {
                setWorkspaceMode('detail_set');
                document.getElementById('detail-set-workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className={`rounded-[1.5rem] px-5 py-4 text-left transition-all border cursor-pointer ${
                workspaceMode === 'detail_set'
                  ? 'bg-slate-900 text-white border-slate-900 shadow-lg'
                  : 'bg-white/70 text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${workspaceMode === 'detail_set' ? 'bg-white/15' : 'bg-slate-100 text-slate-700'}`}>
                  <LayoutTemplate className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-base font-bold">One-Click Detail Set</p>
                  <p className={`text-sm ${workspaceMode === 'detail_set' ? 'text-slate-300' : 'text-slate-500'}`}>
                    Upload one product image, choose a platform, and generate a full detail image set.
                  </p>
                </div>
              </div>
            </button>
          </div>
        </div>

        <div id="studio-workspace" className={workspaceMode === 'studio' ? 'space-y-10' : 'hidden'}>
        {showTopStudioError && (
          <div className="bg-red-50/90 backdrop-blur-sm border border-red-200/80 text-red-700 px-5 py-4 rounded-2xl flex items-start gap-3 shadow-sm">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-500" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Product Image Upload */}
          <div className="bg-white/80 backdrop-blur-2xl p-8 rounded-[2rem] shadow-[0_20px_60px_rgba(0,0,0,0.03)] border border-white transition-all hover:shadow-[0_20px_60px_rgba(0,0,0,0.06)]">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-3 tracking-tight">
              <div className="p-2 bg-slate-100 rounded-xl text-slate-700">
                <ImageIcon className="w-5 h-5" />
              </div>
              1. Product Image
            </h2>
            
            {!productImage ? (
              <div 
                className="border-2 border-dashed border-slate-200/80 rounded-3xl p-10 text-center hover:bg-slate-50/50 hover:border-slate-400 transition-all cursor-pointer group"
                onClick={() => productInputRef.current?.click()}
              >
                <div className="w-16 h-16 bg-slate-100 group-hover:bg-slate-200 rounded-full flex items-center justify-center mx-auto mb-4 transition-colors">
                  <Upload className="w-8 h-8 text-slate-500 group-hover:text-slate-700 transition-colors" />
                </div>
                <p className="text-base font-semibold text-slate-700 mb-1">Click to upload product image</p>
                <p className="text-sm text-slate-500">PNG, JPG up to 10MB</p>
                <input 
                  type="file" 
                  ref={productInputRef} 
                  onChange={handleProductImageUpload} 
                  accept="image/*" 
                  className="hidden" 
                />
              </div>
            ) : (
              <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 aspect-square flex items-center justify-center group">
                <img src={productImage.dataUrl} alt="Product" className="max-w-full max-h-full object-contain p-4 transition-transform duration-500 group-hover:scale-105" />
                <button 
                  onClick={removeProductImage}
                  className="absolute top-4 right-4 bg-white/90 backdrop-blur p-2 rounded-full shadow-md hover:bg-red-50 hover:text-red-500 text-slate-600 transition-all opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0"
                  title="Remove image"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>

          {/* Step 2 Upload */}
          <div className="bg-white/80 backdrop-blur-2xl p-8 rounded-[2rem] shadow-[0_20px_60px_rgba(0,0,0,0.03)] border border-white transition-all hover:shadow-[0_20px_60px_rgba(0,0,0,0.06)] flex flex-col">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-3 tracking-tight">
              <div className="p-2 bg-slate-100 rounded-xl text-slate-700">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              2. Excel Data or Reference Image <span className="text-sm font-normal text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md ml-auto">(Optional)</span>
            </h2>
            
            {!excelFile && !referenceImage ? (
              <div 
                className="border-2 border-dashed border-slate-200/80 rounded-3xl p-10 text-center hover:bg-slate-50/50 hover:border-slate-400 transition-all cursor-pointer group flex-1 flex flex-col items-center justify-center"
                onClick={() => excelInputRef.current?.click()}
              >
                <div className="w-16 h-16 bg-slate-100 group-hover:bg-slate-200 rounded-full flex items-center justify-center mx-auto mb-4 transition-colors">
                  <Upload className="w-8 h-8 text-slate-500 group-hover:text-slate-700 transition-colors" />
                </div>
                <p className="text-base font-semibold text-slate-700 mb-1">Click to upload Excel or Image</p>
                <p className="text-sm text-slate-500">Upload .xlsx, .csv for batch generation, or an image as reference</p>
                <input 
                  type="file" 
                  ref={excelInputRef} 
                  onChange={handleStep2Upload} 
                  accept=".xlsx, .xls, .csv, image/*" 
                  className="hidden" 
                />
              </div>
            ) : excelFile ? (
              <div className="border border-slate-200/80 rounded-3xl p-5 flex items-center justify-between bg-white/50 backdrop-blur-sm">
                <div className="flex items-center gap-4 overflow-hidden">
                  <div className="p-3 bg-white rounded-2xl shadow-sm border border-slate-100">
                    <FileSpreadsheet className="w-8 h-8 text-slate-700 shrink-0" />
                  </div>
                  <div className="truncate">
                    <p className="text-base font-bold text-slate-800 truncate">{excelFile.name}</p>
                    <p className="text-sm font-medium text-slate-600 bg-slate-100 inline-block px-2.5 py-1 rounded-lg mt-1">{rows.length} rows loaded</p>
                  </div>
                </div>
                <button 
                  onClick={removeStep2File}
                  className="p-3 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-colors cursor-pointer"
                  title="Remove file"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ) : referenceImage ? (
              <div className="border border-slate-200/80 rounded-3xl p-5 flex items-center justify-between bg-white/50 backdrop-blur-sm">
                <div className="flex items-center gap-4 overflow-hidden">
                  <div className="w-16 h-16 rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0">
                    <img src={referenceImage.dataUrl} alt="Reference" className="w-full h-full object-cover" />
                  </div>
                  <div className="truncate">
                    <p className="text-base font-bold text-slate-800 truncate">{referenceImage.file.name}</p>
                    <p className="text-sm font-medium text-slate-600 bg-slate-100 inline-block px-2.5 py-1 rounded-lg mt-1">Reference Image</p>
                  </div>
                </div>
                <button 
                  onClick={removeStep2File}
                  className="p-3 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-colors cursor-pointer"
                  title="Remove reference image"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ) : null}

            {rows.length > 0 && (
              <div className="mt-auto pt-8">
                <button
                  onClick={generateImages}
                  disabled={isGenerating || !productImage || fingerprintStatus !== 'ready'}
                  className="w-full py-4 px-6 bg-[#1d1d1f] hover:bg-[#000000] disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white rounded-2xl font-bold text-lg flex items-center justify-center gap-3 transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-6 h-6 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Play className="w-6 h-6 fill-current" />
                      {`Generate ${rows.length} Images`}
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Premium Mode Settings */}
        <AnimatePresence>
            <motion.div
              initial={{ opacity: 0, height: 0, y: -20 }}
              animate={{ opacity: 1, height: 'auto', y: 0 }}
              exit={{ opacity: 0, height: 0, y: -20 }}
              className="bg-white/80 backdrop-blur-2xl p-8 rounded-[2rem] shadow-[0_20px_60px_rgba(0,0,0,0.03)] border border-white overflow-hidden"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold flex items-center gap-3 tracking-tight">
                  <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  Premium Settings & Fingerprint
                </h2>
                
                {fingerprintStatus === 'analyzing' && (
                  <div className="flex items-center gap-2 text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg text-sm font-medium">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Analyzing Product...
                  </div>
                )}
                {fingerprintStatus === 'ready' && !isFingerprintDirty && (
                  <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg text-sm font-medium">
                    <CheckCircle2 className="w-4 h-4" />
                    Fingerprint Ready
                  </div>
                )}
                {isFingerprintDirty && productFingerprint && (
                  <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg text-sm font-medium">
                    <AlertCircle className="w-4 h-4" />
                    Fingerprint Stale
                  </div>
                )}
                {fingerprintStatus === 'error' && (
                  <div className="flex items-center gap-2 text-red-600 bg-red-50 px-3 py-1.5 rounded-lg text-sm font-medium">
                    <AlertCircle className="w-4 h-4" />
                    Analysis Failed
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Supplemental Images */}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 mb-1">Supplemental Images (Optional)</h3>
                    <p className="text-xs text-slate-500 mb-3">Upload additional angles or details to improve product recognition.</p>
                  </div>
                  
                  <div className="flex flex-wrap gap-3">
                    {subjectReferenceImages.map((img, index) => (
                      <div key={index} className="relative w-20 h-20 rounded-xl border border-slate-200 overflow-hidden group">
                        <img src={img.dataUrl} alt={`Supplemental ${index + 1}`} className="w-full h-full object-cover" />
                        <button
                          onClick={() => removeSubjectReferenceImage(index)}
                          className="absolute top-1 right-1 bg-white/90 p-1 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-500"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    
                    <button
                      onClick={() => subjectReferenceInputRef.current?.click()}
                      className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 hover:text-indigo-500 hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors"
                    >
                      <Upload className="w-5 h-5 mb-1" />
                      <span className="text-[10px] font-medium">Add Image</span>
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
                </div>

                {/* Fingerprint Display */}
                <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 h-64 overflow-y-auto relative">
                  <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center justify-between">
                    Extracted Features
                    {productFingerprint && !isFingerprintDirty && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-normal text-slate-500 bg-white px-2 py-1 rounded-md border border-slate-200">
                          Confidence: {productFingerprint.confidence}%
                        </span>
                        {JSON.stringify(draftFingerprintZh) !== JSON.stringify(productFingerprintZh) && (
                          <div className="flex items-center gap-1">
                            <button 
                              onClick={() => setDraftFingerprintZh(JSON.parse(JSON.stringify(productFingerprintZh)))}
                              className="text-xs font-medium text-slate-600 bg-slate-200 hover:bg-slate-300 px-2 py-1 rounded-md transition-colors"
                            >
                              Reset
                            </button>
                            <button 
                              onClick={async () => {
                                try {
                                  const updatedEn = applyLocalEdits(draftFingerprintZh, productFingerprintZh, productFingerprint!);
                                  const updatedEnWithIds = addIdsToArrays(updatedEn);
                                  
                                  setProductFingerprint(updatedEnWithIds);
                                  setProductFingerprintZh(draftFingerprintZh);
                                  alert('Features saved locally.');
                                } catch (err) {
                                  console.error("Failed to save edits:", err);
                                  alert('Failed to save edits.');
                                }
                              }}
                              className="text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 px-2 py-1 rounded-md transition-colors flex items-center gap-1"
                            >
                              Save
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </h3>
                  
                  {fingerprintStatus === 'idle' && !productImage && (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 pb-8">
                      <Layers className="w-8 h-8 mb-2 opacity-50" />
                      <p className="text-sm">Upload a product image to extract features</p>
                    </div>
                  )}
                  
                  {(fingerprintStatus === 'idle' || isFingerprintDirty) && fingerprintStatus !== 'analyzing' && fingerprintStatus !== 'error' && productImage && (
                    <div className="h-full flex flex-col items-center justify-center text-slate-500 pb-8">
                      <Layers className="w-8 h-8 mb-3 opacity-50" />
                      <p className="text-sm mb-4 text-center px-4">
                        {isFingerprintDirty && productFingerprint 
                          ? "Images have changed. Re-extract features to update the fingerprint." 
                          : "Ready to extract product features from your uploaded images."}
                      </p>
                      <button
                        onClick={extractProductFingerprintFn}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors shadow-sm"
                      >
                        <Wand2 className="w-4 h-4" />
                        Extract Features
                      </button>
                    </div>
                  )}
                  
                  {fingerprintStatus === 'analyzing' && (
                    <div className="h-full flex flex-col items-center justify-center text-indigo-400 pb-8">
                      <Loader2 className="w-8 h-8 mb-2 animate-spin opacity-50" />
                      <p className="text-sm">Extracting product fingerprint...</p>
                    </div>
                  )}
                  
                  {fingerprintStatus === 'error' && (
                    <div className="h-full flex flex-col items-center justify-center text-red-400 pb-8">
                      <AlertCircle className="w-8 h-8 mb-2 opacity-50" />
                      <p className="text-sm text-center px-4">{fingerprintError}</p>
                      <button 
                        onClick={extractProductFingerprintFn}
                        className="mt-3 text-xs bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-50"
                      >
                        Retry Analysis
                      </button>
                    </div>
                  )}
                  
                  {fingerprintStatus === 'ready' && !isFingerprintDirty && productFingerprint && draftFingerprintZh && (
                    <div className="space-y-4 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-700">Editable Fingerprint JSON</p>
                          <p className="mt-1 text-xs text-slate-500">Review or adjust the extracted fingerprint locally, then save it back into the app.</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {draftFingerprintText !== JSON.stringify(productFingerprintZh, null, 2) && (
                            <>
                              <button
                                onClick={() => {
                                  const resetValue = JSON.stringify(productFingerprintZh, null, 2);
                                  setDraftFingerprintZh(JSON.parse(JSON.stringify(productFingerprintZh)));
                                  setDraftFingerprintText(resetValue);
                                }}
                                className="text-xs font-medium text-slate-600 bg-slate-200 hover:bg-slate-300 px-2 py-1 rounded-md transition-colors"
                              >
                                Reset
                              </button>
                              <button
                                onClick={() => {
                                  try {
                                    const parsed = JSON.parse(draftFingerprintText);
                                    const updatedEn = applyLocalEdits(parsed, productFingerprintZh, productFingerprint!);
                                    const updatedEnWithIds = addIdsToArrays(updatedEn);
                                    setProductFingerprint(updatedEnWithIds);
                                    setProductFingerprintZh(parsed);
                                    setDraftFingerprintZh(parsed);
                                    setDraftFingerprintText(JSON.stringify(parsed, null, 2));
                                    alert('Features saved locally.');
                                  } catch (err) {
                                    console.error('Failed to save fingerprint edits:', err);
                                    alert('Invalid fingerprint JSON. Please check the format and try again.');
                                  }
                                }}
                                className="text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 px-2 py-1 rounded-md transition-colors"
                              >
                                Save
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      <textarea
                        value={draftFingerprintText}
                        onChange={(e) => setDraftFingerprintText(e.target.value)}
                        rows={18}
                        spellCheck={false}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs leading-6 text-slate-700 shadow-sm outline-none transition-all focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 resize-y"
                      />
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
        </AnimatePresence>

        {/* Results Section for Excel */}
        <BatchResultsSection
          rows={rows}
          productImagePresent={!!productImage}
          onRegenerateRow={regenerateRow}
          onRowChange={handleRowChange}
          onDownloadImage={downloadImage}
          onOpenImage={(url) => setEnlargedImage(url)}
        />

        {/* Results Section for Single Image */}
        <SingleGenerationSection
          singleGen={singleGen}
          productImagePresent={!!productImage && !excelFile}
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
        />
        </div>

        <DetailSetWorkspace
          visible={workspaceMode === 'detail_set'}
          detailSet={detailSet}
          detailSetProductImage={detailSetProductImage}
          detailSetProductInputRef={detailSetProductInputRef}
          detailSetPlanPreview={detailSetPlanPreview}
          detailSetStepIndex={detailSetStepIndex}
          isAnyDetailSetItemGenerating={isAnyDetailSetItemGenerating}
          onDetailSetProductImageUpload={handleDetailSetProductImageUpload}
          onRemoveDetailSetProductImage={removeDetailSetProductImage}
          onPlatformChange={(platform) => setDetailSet(prev => ({ ...prev, platform }))}
          onGlobalPromptChange={(value) => setDetailSet(prev => ({ ...prev, globalPrompt: value }))}
          onGenerateDetailSet={handleGenerateDetailSet}
          onDetailSetItemAdjustmentChange={handleDetailSetItemAdjustmentChange}
          onRegenerateDetailSetItem={handleRegenerateDetailSetItem}
          onEditDetailSetItemLocally={handleEditDetailSetItemLocally}
          onDownloadImage={downloadImage}
          onOpenImage={(url) => setEnlargedImage(url)}
        />
      </main>

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
  );
}
