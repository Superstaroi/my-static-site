import React from 'react';
import {
  AlertCircle,
  Download,
  Image as ImageIcon,
  LayoutTemplate,
  Loader2,
  Maximize,
  Plus,
  RefreshCw,
  Sparkles,
  Store,
  Trash2,
  Upload,
} from 'lucide-react';
import { DetailSetPlanItem, DETAIL_SET_PLATFORM_OPTIONS } from '../../detailSetTemplates';
import { DetailSetPlatform } from '../../types';
import { DETAIL_SET_ASPECT_RATIO_OPTIONS } from '../../constants';
import { SelectField } from '../../components/SelectField';
import { DetailSetGeneratedItem, UploadedImageAsset } from '../shared/models';
import {
  DETAIL_SET_IMAGE_TYPE_LABELS,
  DETAIL_SET_MODE_LABELS,
  DETAIL_SET_STATUS_LABELS,
  DETAIL_SET_TONE_LABELS,
  getDetailSetDisplayCopy,
} from './display';

type DetailSetPromptSource = 'manual' | 'ai';
type DetailSetGridLayout = '2x3' | '3x3';

interface DetailSetState {
  platform: DetailSetPlatform;
  globalPrompt: string;
  promptSource: DetailSetPromptSource;
  gridLayout: DetailSetGridLayout;
  status: 'idle' | 'analyzing' | 'planning' | 'generating' | 'completed' | 'error';
  error: string;
  generatedItems: DetailSetGeneratedItem[];
}

interface DetailSetWorkspaceProps {
  visible: boolean;
  detailSet: DetailSetState;
  detailSetProductImages: UploadedImageAsset[];
  detailSetProductInputRef: React.RefObject<HTMLInputElement | null>;
  detailSetPlanPreview: DetailSetPlanItem[];
  detailSetStepIndex: number;
  isAnyDetailSetItemGenerating: boolean;
  isGeneratingGlobalPrompt: boolean;
  detailItemPendingActions: Record<string, 'generate' | 'regenerate' | 'local_edit' | 'verifying'>;
  onDetailSetProductImageUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onDetailSetProductFilesDrop: (files: File[]) => void;
  onRemoveDetailSetProductImage: (index?: number) => void;
  onPlatformChange: (platform: DetailSetPlatform) => void;
  onGlobalPromptChange: (value: string) => void;
  onPromptSourceChange: (source: DetailSetPromptSource) => void;
  onGridLayoutChange: (layout: DetailSetGridLayout) => void;
  onGenerateGlobalPrompt: () => void;
  onGenerateDetailSet: () => void;
  onDetailSetItemAspectRatioChange: (itemId: string, aspectRatio: string) => void;
  onDetailSetItemAdjustmentChange: (itemId: string, adjustmentPrompt: string) => void;
  onRegenerateDetailSetItem: (itemId: string) => void;
  onEditDetailSetItemLocally: (itemId: string) => void;
  onDownloadImage: (url: string) => void;
  onOpenImage: (url: string) => void;
}

export function DetailSetWorkspace({
  visible,
  detailSet,
  detailSetProductImages,
  detailSetProductInputRef,
  detailSetPlanPreview,
  detailSetStepIndex,
  isAnyDetailSetItemGenerating,
  isGeneratingGlobalPrompt,
  detailItemPendingActions,
  onDetailSetProductImageUpload,
  onDetailSetProductFilesDrop,
  onRemoveDetailSetProductImage,
  onPlatformChange,
  onGlobalPromptChange,
  onPromptSourceChange,
  onGridLayoutChange,
  onGenerateGlobalPrompt,
  onGenerateDetailSet,
  onDetailSetItemAspectRatioChange,
  onDetailSetItemAdjustmentChange,
  onRegenerateDetailSetItem,
  onEditDetailSetItemLocally,
  onDownloadImage,
  onOpenImage,
}: DetailSetWorkspaceProps) {
  const [isProductDropActive, setIsProductDropActive] = React.useState(false);
  const generatedItemMap = React.useMemo(
    () => new Map(detailSet.generatedItems.map(item => [item.id, item])),
    [detailSet.generatedItems],
  );

  const getDetailWorkspaceStatusText = () => {
    if (detailSet.status === 'analyzing') {
      return '正在分析产品图和平台信息，请稍候。';
    }

    if (detailSet.status === 'planning') {
      return '正在整理画面规划和尺寸方案，请稍候。';
    }

    if (detailSet.status === 'generating') {
      return '正在批量生成详情图组，已完成的卡片会逐步显示。';
    }

    if (isAnyDetailSetItemGenerating) {
      return '当前有单张详情图正在处理，请等待这张卡片完成。';
    }

    if (detailSet.generatedItems.length > 0) {
      return '你可以继续调整单张尺寸、重新生成，或按补充说明做局部修改。';
    }

    return '系统会按平台自动规划详情图结构。你也可以先调整宫格展示方式，再开始生成。';
  };

  const getItemPendingActionLabel = (action?: 'generate' | 'regenerate' | 'local_edit' | 'verifying') => {
    if (action === 'regenerate') return '正在重新生成...';
    if (action === 'local_edit') return '正在按补充说明修改...';
    if (action === 'verifying') return '正在校验生成结果...';
    return '正在生成...';
  };

  const handleProductDragOver = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
    setIsProductDropActive(true);
  };

  const handleProductDragLeave = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) {
      return;
    }
    setIsProductDropActive(false);
  };

  const handleProductDrop = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsProductDropActive(false);
    const files = Array.from(event.dataTransfer.files || []) as File[];
    onDetailSetProductFilesDrop(files);
  };

  const gridClassName =
    detailSet.gridLayout === '3x3'
      ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4'
      : 'grid grid-cols-1 lg:grid-cols-2 gap-4';
  const actionButtonsClass =
    detailSet.gridLayout === '3x3'
      ? 'grid grid-cols-1 gap-2'
      : 'grid grid-cols-1 gap-3 sm:grid-cols-3';

  const placeholderCount = detailSet.gridLayout === '3x3' ? Math.max(0, 9 - detailSetPlanPreview.length) : 0;
  const previewCells: Array<
    | { kind: 'item'; item: DetailSetPlanItem }
    | { kind: 'placeholder'; key: string }
  > = [
    ...detailSetPlanPreview.map(item => ({ kind: 'item' as const, item })),
    ...Array.from({ length: placeholderCount }, (_, index) => ({
      kind: 'placeholder' as const,
      key: `placeholder-${index + 1}`,
    })),
  ];

  return (
    <div id="detail-set-workspace" className={visible ? 'space-y-10' : 'hidden'}>
      {detailSet.error && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/20 bg-[rgba(127,29,29,0.42)] px-5 py-4 text-red-100 shadow-sm backdrop-blur-sm">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-300" />
          <p className="text-sm font-medium">{detailSet.error}</p>
        </div>
      )}

      <section className="vx-panel rounded-[2rem] p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="vx-chip inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold shadow-sm">
              <LayoutTemplate className="h-4 w-4 text-[var(--vx-text-muted)]" />
              详情图工作区
            </div>
            <h2 className="mt-5 text-4xl font-black tracking-tight text-[var(--vx-text)]">一键生成详情图组</h2>
            <p className="mt-3 text-base leading-7 text-[var(--vx-text-soft)]">
              上传产品图、选择平台后，VXStudio 会先分析产品，再生成可直接使用的详情图方案。
            </p>
          </div>

          <div className="vx-subpanel grid grid-cols-5 gap-2 rounded-[1.5rem] p-3 text-center text-xs font-semibold text-[var(--vx-text-soft)] shadow-sm">
            {['上传', '分析', '规划', '生成', '完成'].map((label, index) => {
              const step = index + 1;
              const active = detailSetStepIndex >= step;
              const current = detailSetStepIndex === step;

              return (
                <div key={label} className="flex flex-col items-center gap-2">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs ${
                      active
                        ? current
                          ? 'border-[rgba(124,92,255,0.6)] bg-[linear-gradient(135deg,rgba(124,92,255,0.92),rgba(76,195,255,0.82))] text-white'
                          : 'border-emerald-400/30 bg-[rgba(22,163,74,0.18)] text-emerald-200'
                        : 'border-white/10 bg-white/6 text-[var(--vx-text-muted)]'
                    }`}
                  >
                    {step}
                  </div>
                  <span>{label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[420px_minmax(0,1fr)] xl:items-start">
        <section className="vx-panel space-y-6 rounded-[2rem] p-8 xl:self-start">
          <div>
            <h3 className="text-xl font-bold tracking-tight text-[var(--vx-text)]">工作区设置</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--vx-text-soft)]">
              先上传产品图，再选择平台和全局说明，系统会自动生成详情图规划。
            </p>
          </div>

          <div className="space-y-3">
            <label className="vx-field-label block text-sm font-bold">1. 产品图（支持多张）</label>
            {detailSetProductImages.length === 0 ? (
              <button
                type="button"
                onClick={() => detailSetProductInputRef.current?.click()}
                onDragOver={handleProductDragOver}
                onDragLeave={handleProductDragLeave}
                onDrop={handleProductDrop}
                className={`vx-dropzone w-full cursor-pointer rounded-[1.75rem] p-8 text-center transition-all ${
                  isProductDropActive
                    ? 'vx-dropzone-active'
                    : ''
                }`}
              >
                <div
                  className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full ${
                    isProductDropActive ? 'bg-[rgba(124,92,255,0.24)]' : 'bg-white/8'
                  }`}
                >
                  <Upload className={`h-7 w-7 ${isProductDropActive ? 'text-[var(--vx-brand-2)]' : 'text-[var(--vx-text-soft)]'}`} />
                </div>
                <p className="text-base font-bold text-[var(--vx-text)]">点击或拖拽上传产品图</p>
                <p className="mt-1 text-sm text-[var(--vx-text-soft)]">支持一次上传多张，第 1 张作为主图，其余作为补充视角。</p>
              </button>
            ) : (
              <div className="space-y-3">
                <div className="vx-subpanel rounded-2xl p-4 text-xs leading-6 text-[var(--vx-text-soft)]">
                  已上传 {detailSetProductImages.length} 张产品图，第 1 张作为主图。
                </div>

                <div
                  className="relative"
                  onDragOver={handleProductDragOver}
                  onDragLeave={handleProductDragLeave}
                  onDrop={handleProductDrop}
                >
                  <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 transition-all ${isProductDropActive ? 'scale-[0.99]' : ''}`}>
                    {detailSetProductImages.map((image, index) => (
                      <div
                        key={`${image.file.name}-${index}`}
                        className="group relative aspect-square overflow-hidden rounded-[1.25rem] border border-white/10 bg-[rgba(8,11,18,0.7)]"
                      >
                        <button
                          type="button"
                          onClick={() => onOpenImage(image.dataUrl)}
                          className="h-full w-full cursor-zoom-in"
                          title="点击查看大图"
                        >
                          <img
                            src={image.dataUrl}
                            alt={`Detail set product ${index + 1}`}
                            className="h-full w-full object-contain p-4 transition-transform duration-200 group-hover:scale-[1.04]"
                          />
                        </button>
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/25 group-hover:opacity-100">
                          <span className="rounded-full border border-white/10 bg-black/55 p-2 text-white shadow-sm">
                            <Maximize className="h-4 w-4" />
                          </span>
                        </div>
                        <div className="absolute bottom-3 left-3 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-semibold text-white">
                          {index === 0 ? '主图' : `补图 ${index}`}
                        </div>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onRemoveDetailSetProductImage(index);
                          }}
                          className="absolute right-3 top-3 rounded-full border border-white/10 bg-black/55 p-2 text-white/70 shadow-sm transition-colors hover:bg-[rgba(239,68,68,0.18)] hover:text-white"
                          title="移除这张图"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={() => detailSetProductInputRef.current?.click()}
                      className={`vx-dropzone flex aspect-square cursor-pointer flex-col items-center justify-center rounded-[1.25rem] transition-all ${
                        isProductDropActive
                          ? 'vx-dropzone-active text-[var(--vx-brand-2)]'
                          : 'text-[var(--vx-text-soft)] hover:text-[var(--vx-text)]'
                      }`}
                    >
                      <Plus className="mb-2 h-6 w-6" />
                      <span className="text-sm font-semibold">继续添加</span>
                    </button>
                  </div>

                  {isProductDropActive && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[1.5rem] border border-[rgba(124,92,255,0.48)] bg-[rgba(124,92,255,0.16)] text-sm font-semibold text-white backdrop-blur-[1px]">
                      松开以上传更多产品图
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => onRemoveDetailSetProductImage()}
                  className="vx-button-secondary flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition-all"
                >
                  <Trash2 className="h-4 w-4" />
                  清空全部产品图
                </button>
              </div>
            )}

            <input
              type="file"
              ref={detailSetProductInputRef}
              onChange={onDetailSetProductImageUpload}
              accept="image/*"
              multiple
              className="hidden"
            />
          </div>

          <SelectField
            label="2. 平台"
            value={detailSet.platform}
            onChange={value => onPlatformChange(value as DetailSetPlatform)}
            options={DETAIL_SET_PLATFORM_OPTIONS}
            icon={Store}
          />

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
              <label className="vx-field-label block text-sm font-bold">3. 全局补充说明（可选）</label>
              <div className="vx-toggle-group inline-flex rounded-xl p-1 shadow-sm">
                <button
                  type="button"
                  onClick={() => onPromptSourceChange('manual')}
                  className={`vx-toggle-button rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                    detailSet.promptSource === 'manual'
                      ? 'vx-toggle-button-active'
                      : ''
                  }`}
                >
                  手动填写
                </button>
                <button
                  type="button"
                  onClick={() => onPromptSourceChange('ai')}
                  className={`vx-toggle-button rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                    detailSet.promptSource === 'ai'
                      ? 'vx-toggle-button-active'
                      : ''
                  }`}
                >
                  AI 写提示词
                </button>
              </div>
            </div>

            <textarea
              value={detailSet.globalPrompt}
              onChange={event => onGlobalPromptChange(event.target.value)}
              rows={4}
              className="vx-input w-full resize-none rounded-2xl px-4 py-3 text-sm shadow-sm transition-all"
              placeholder="例如：整体风格偏温暖高级，希望更有家居氛围，减少复杂道具，顶部留白更多等。"
            />

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs leading-5 text-[var(--vx-text-soft)]">
                {detailSet.promptSource === 'ai'
                  ? '根据已上传产品图和当前平台，自动写一段可直接用于详情图组的全局补充说明。'
                  : '你可以手动补充整体风格、留白、场景、构图或平台偏好要求。'}
              </p>

              {detailSet.promptSource === 'ai' && (
                <button
                  type="button"
                  onClick={onGenerateGlobalPrompt}
                  disabled={detailSetProductImages.length === 0 || isGeneratingGlobalPrompt || detailSet.status === 'generating' || isAnyDetailSetItemGenerating}
                  className="vx-button-secondary inline-flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all disabled:cursor-not-allowed"
                >
                  {isGeneratingGlobalPrompt ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      正在生成提示词...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      AI 写全局提示词
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          <button
            onClick={onGenerateDetailSet}
            disabled={
              detailSetProductImages.length === 0 ||
              detailSet.status === 'analyzing' ||
              detailSet.status === 'planning' ||
              detailSet.status === 'generating' ||
              isAnyDetailSetItemGenerating ||
              isGeneratingGlobalPrompt
            }
            className="vx-button-primary flex w-full cursor-pointer items-center justify-center gap-3 rounded-2xl px-6 py-4 text-lg font-bold transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed"
          >
            {detailSet.status === 'analyzing' && (
              <>
                <Loader2 className="h-6 w-6 animate-spin" />
                正在分析产品...
              </>
            )}
            {detailSet.status === 'planning' && (
              <>
                <Loader2 className="h-6 w-6 animate-spin" />
                正在生成方案...
              </>
            )}
            {detailSet.status === 'generating' && (
              <>
                <Loader2 className="h-6 w-6 animate-spin" />
                正在生成详情图组...
              </>
            )}
            {detailSet.status !== 'analyzing' &&
              detailSet.status !== 'planning' &&
              detailSet.status !== 'generating' &&
              isAnyDetailSetItemGenerating && (
                <>
                  <Loader2 className="h-6 w-6 animate-spin" />
                  正在处理单张图片...
                </>
              )}
            {detailSet.status !== 'analyzing' &&
              detailSet.status !== 'planning' &&
              detailSet.status !== 'generating' &&
              !isAnyDetailSetItemGenerating && (
                <>
                  <Sparkles className="h-6 w-6" />
                  生成详情图组
                </>
              )}
          </button>
        </section>

        <section className="space-y-8">
          <div className="vx-panel rounded-[2rem] p-8">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold tracking-tight text-[var(--vx-text)]">自动镜头规划</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--vx-text-soft)]">{getDetailWorkspaceStatusText()}</p>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3">
                <div className="vx-toggle-group inline-flex rounded-xl p-1 shadow-sm">
                  <button
                    type="button"
                    onClick={() => onGridLayoutChange('2x3')}
                    className={`vx-toggle-button rounded-lg px-3 py-2 text-xs font-semibold transition-all cursor-pointer ${
                      detailSet.gridLayout === '2x3'
                        ? 'vx-toggle-button-active'
                        : ''
                    }`}
                  >
                    2×3 六宫格
                  </button>
                  <button
                    type="button"
                    onClick={() => onGridLayoutChange('3x3')}
                    className={`vx-toggle-button rounded-lg px-3 py-2 text-xs font-semibold transition-all cursor-pointer ${
                      detailSet.gridLayout === '3x3'
                        ? 'vx-toggle-button-active'
                        : ''
                    }`}
                  >
                    3×3 九宫格
                  </button>
                </div>

                {detailSet.generatedItems.some(item => item.generatedImage) && (
                  <button
                    onClick={() => {
                      detailSet.generatedItems.forEach(item => {
                        if (item.generatedImage) {
                          onDownloadImage(item.generatedImage);
                        }
                      });
                    }}
                    className="vx-button-success flex cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition-all"
                  >
                    <Download className="h-4 w-4" />
                    全部下载
                  </button>
                )}

                <div className="vx-chip rounded-xl px-3 py-2 text-xs font-semibold shadow-sm">
                  {detailSetPlanPreview.length} 张计划图
                </div>
              </div>
            </div>

            <div className={gridClassName}>
              {previewCells.map(cell => {
                if (cell.kind === 'placeholder') {
                  return (
                    <div
                      key={cell.key}
                      className="vx-empty-state flex min-h-[320px] items-center justify-center rounded-[1.5rem] p-5 text-sm font-medium"
                    >
                      预留画面
                    </div>
                  );
                }

                const item = cell.item;
                const resolvedItem = generatedItemMap.get(item.id);
                const localizedCopy = getDetailSetDisplayCopy(resolvedItem ?? item);
                const pendingAction = detailItemPendingActions[item.id];
                const itemStatus = resolvedItem?.status ?? 'pending';
                const isGenerating = itemStatus === 'generating' || pendingAction === 'verifying';
                const pendingLabel = getItemPendingActionLabel(pendingAction);

                return (
                  <div key={item.id} className="vx-panel-soft space-y-4 rounded-[1.5rem] p-5 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold tracking-[0.18em] text-[var(--vx-text-muted)]">画面 {item.slot}</p>
                        <h4 className="mt-1 text-base font-bold text-[var(--vx-text)]">{localizedCopy.title}</h4>
                      </div>

                      {resolvedItem && (
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            itemStatus === 'success'
                              ? 'bg-emerald-50 text-emerald-700'
                              : itemStatus === 'error'
                                ? 'vx-status-danger'
                                : isGenerating
                                  ? 'vx-status-warning'
                                  : 'vx-status-idle'
                          }`}
                        >
                          {isGenerating
                            ? pendingLabel.replace('正在', '').replace('...', '')
                            : DETAIL_SET_STATUS_LABELS[itemStatus]}
                        </span>
                      )}
                    </div>

                    <p className="text-sm leading-6 text-[var(--vx-text-soft)]">{localizedCopy.description}</p>

                    {resolvedItem && (
                      <div className="overflow-hidden rounded-[1.35rem] border border-white/8 bg-[rgba(8,11,18,0.64)] shadow-sm">
                        <div className="vx-media-surface relative flex aspect-[4/3] items-center justify-center overflow-hidden">
                          {resolvedItem.generatedImage ? (
                            <>
                              <img
                                src={resolvedItem.generatedImage}
                                alt={localizedCopy.title}
                                className={`h-full w-full object-contain transition-all duration-500 ${
                                  isGenerating ? 'scale-[0.98] opacity-60 blur-sm' : 'cursor-zoom-in'
                                }`}
                                onClick={() => !isGenerating && onOpenImage(resolvedItem.generatedImage!)}
                              />
                              {isGenerating && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-[rgba(7,10,17,0.7)] backdrop-blur-sm">
                                  <Loader2 className="mb-3 h-10 w-10 animate-spin text-[var(--vx-brand-2)]" />
                                  <span className="text-sm font-semibold text-white">{pendingLabel}</span>
                                </div>
                              )}
                            </>
                          ) : isGenerating ? (
                            <div className="flex flex-col items-center text-[var(--vx-text-soft)]">
                              <Loader2 className="mb-3 h-10 w-10 animate-spin" />
                              <span className="text-sm font-semibold">{pendingLabel}</span>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center px-8 text-center text-[var(--vx-text-muted)]">
                              <ImageIcon className="mb-3 h-10 w-10 opacity-50" />
                              <span className="text-sm font-semibold">等待结果</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <SelectField
                      label="画面尺寸"
                      value={resolvedItem?.aspectRatio ?? item.aspectRatio}
                      onChange={value => onDetailSetItemAspectRatioChange(item.id, String(value))}
                      options={DETAIL_SET_ASPECT_RATIO_OPTIONS}
                      allowCustomInput
                      icon={LayoutTemplate}
                    />

                    <div className="flex flex-wrap gap-2">
                      <span className="vx-chip rounded-full px-3 py-1 text-xs font-semibold">
                        {DETAIL_SET_IMAGE_TYPE_LABELS[item.imageType]}
                      </span>
                      <span className="vx-chip rounded-full px-3 py-1 text-xs font-semibold">
                        {DETAIL_SET_MODE_LABELS[item.mode]}
                      </span>
                      <span className="vx-chip rounded-full px-3 py-1 text-xs font-semibold">
                        {DETAIL_SET_TONE_LABELS[item.commercialTone]}
                      </span>
                    </div>

                    {resolvedItem && (
                      <>
                        {resolvedItem.error && (
                          <p className="rounded-xl bg-[rgba(127,29,29,0.42)] px-3 py-2 text-xs font-medium text-red-100">
                            {resolvedItem.error}
                          </p>
                        )}

                        <div>
                          <label className="vx-field-label mb-2 block text-sm font-bold">单图补充说明</label>
                          <textarea
                            value={resolvedItem.adjustmentPrompt}
                            onChange={event => onDetailSetItemAdjustmentChange(item.id, event.target.value)}
                            placeholder="只对这张图补充说明，例如：产品再放大一点、背景更简洁、增加顶部留白。"
                            disabled={isGenerating}
                            rows={4}
                            className="vx-input w-full resize-none rounded-2xl px-4 py-3 text-sm shadow-sm transition-all disabled:cursor-not-allowed disabled:opacity-60"
                          />
                          <p className="mt-2 text-xs leading-5 text-[var(--vx-text-soft)]">
                            “重新生成”会整张重做；“按补充说明修改”只调整当前这一张。
                          </p>
                        </div>

                        <div className={actionButtonsClass}>
                          <button
                            onClick={() => onRegenerateDetailSetItem(item.id)}
                            disabled={isGenerating}
                            className="vx-button-secondary flex min-h-[52px] cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold leading-tight transition-all disabled:cursor-not-allowed"
                          >
                            <RefreshCw className={`h-4 w-4 ${pendingAction === 'regenerate' ? 'animate-spin' : ''}`} />
                            {pendingAction === 'regenerate' ? '正在重生' : '重新生成'}
                          </button>
                          <button
                            onClick={() => onEditDetailSetItemLocally(item.id)}
                            disabled={!resolvedItem.generatedImage || isGenerating}
                            className="vx-button-primary flex min-h-[52px] cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold leading-tight transition-all disabled:cursor-not-allowed"
                          >
                            <Sparkles className={`h-4 w-4 ${pendingAction === 'local_edit' ? 'animate-pulse' : ''}`} />
                            {pendingAction === 'local_edit' ? '正在修改' : '按补充说明修改'}
                          </button>
                          <button
                            onClick={() => resolvedItem.generatedImage && onDownloadImage(resolvedItem.generatedImage)}
                            disabled={!resolvedItem.generatedImage || isGenerating}
                            className="vx-button-success flex min-h-[52px] cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold leading-tight transition-all disabled:cursor-not-allowed"
                          >
                            <Download className="h-4 w-4" />
                            下载图片
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
