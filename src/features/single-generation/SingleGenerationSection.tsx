import React from 'react';
import {
  AlertCircle,
  Download,
  Eye,
  Image as ImageIcon,
  Layers,
  Loader2,
  Maximize,
  Palette,
  Play,
  RefreshCw,
  Settings2,
  Wand2,
  Zap,
} from 'lucide-react';
import {
  ASPECT_RATIO_OPTIONS,
  COMMERCIAL_TONE_OPTIONS,
  IMAGE_TYPE_OPTIONS,
  MODE_OPTIONS,
  SCENE_STRICTNESS_OPTIONS,
} from '../../constants';
import { SelectField } from '../../components/SelectField';
import { SingleGenerationState } from '../shared/models';

interface SingleGenerationSectionProps {
  singleGen: SingleGenerationState;
  singleGeneratePhase: 'idle' | 'preparing' | 'generating' | 'verifying';
  productImagePresent: boolean;
  showError: boolean;
  setSingleGen: React.Dispatch<React.SetStateAction<SingleGenerationState>>;
  hasReachedSingleImageRegenerationLimit: boolean;
  isSingleImageRegenerating: (index: number) => boolean;
  onGenerate: () => void;
  onRegenerateSingleImage: (index: number) => void;
  onSingleImageAdjustmentChange: (index: number, adjustmentPrompt: string) => void;
  onEditSingleImageLocally: (index: number) => void;
  onDownloadImage: (url: string) => void;
  onOpenImage: (url: string) => void;
  imageSize?: string;
  setImageSize?: (value: string) => void;
  layout?: 'full' | 'results-only' | 'settings-only';
}

const IMAGE_SIZE_OPTIONS = [
  { label: '1K（标准）', value: '1K' },
  { label: '2K（高清）', value: '2K' },
  { label: '4K（超清）', value: '4K' },
];

export function SingleGenerationSection({
  singleGen,
  singleGeneratePhase,
  productImagePresent,
  showError,
  setSingleGen,
  hasReachedSingleImageRegenerationLimit,
  isSingleImageRegenerating,
  onGenerate,
  onRegenerateSingleImage,
  onSingleImageAdjustmentChange,
  onEditSingleImageLocally,
  onDownloadImage,
  onOpenImage,
  imageSize = '1K',
  setImageSize,
  layout = 'full',
}: SingleGenerationSectionProps) {
  const showControls = layout === 'full' || layout === 'settings-only';
  const showResults = layout === 'full' || layout === 'results-only';

  const getGenerateButtonLabel = () => {
    if (singleGeneratePhase === 'preparing') return '正在准备参数...';
    if (singleGeneratePhase === 'generating') return `正在生成 ${singleGen.count} 张图片...`;
    if (singleGeneratePhase === 'verifying') return '正在校验生成结果...';
    return singleGen.count > 1 ? `生成 ${singleGen.count} 张图片` : '生成图片';
  };

  const renderResultsGrid = () => (
    <div
      className={`relative grid gap-5 ${
        singleGen.generatedImages.length > 4
          ? 'grid-cols-2 xl:grid-cols-4'
          : singleGen.generatedImages.length > 1
            ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
            : 'grid-cols-1'
      }`}
    >
      {singleGen.status === 'idle' && singleGen.generatedImages.length === 0 && (
        <div className="vx-empty-state col-span-full flex min-h-[240px] flex-col items-center justify-center rounded-[1.75rem]">
          <ImageIcon className="mb-4 h-10 w-10 opacity-50" />
          <span className="text-sm font-medium">生成结果会显示在这里</span>
        </div>
      )}

      {singleGen.generatedImages.map((imgObj, idx) => {
        const isRegenerating = isSingleImageRegenerating(idx);
        const disableNewRetry = !isRegenerating && hasReachedSingleImageRegenerationLimit;
        const operationKind = singleGen.regenerationKinds[idx] || 'regenerate';
        const operationLabel = operationKind === 'local_edit' ? '正在按补充说明修改...' : '正在重新生成...';

        return (
          <div
            key={imgObj.id || idx}
            className="group vx-panel-soft overflow-hidden rounded-[1.75rem] transition-all hover:-translate-y-0.5 hover:border-white/14 hover:shadow-[0_20px_46px_rgba(0,0,0,0.34)]"
          >
            <div className="vx-media-surface relative aspect-[4/5] overflow-hidden">
              <img
                src={imgObj.url}
                alt={`生成结果 ${idx + 1}`}
                className={`h-full w-full object-cover transition-all duration-500 ${
                  isRegenerating ? 'scale-[1.02] opacity-50 blur-sm' : 'cursor-zoom-in group-hover:scale-105'
                }`}
                onClick={() => !isRegenerating && onOpenImage(imgObj.url)}
              />

              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/55 via-black/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

              {!isRegenerating && (
                <div className="absolute bottom-3 right-3 flex items-center gap-2 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={event => {
                      event.stopPropagation();
                      onOpenImage(imgObj.url);
                    }}
                    className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-black/55 text-white/80 shadow-md transition hover:bg-black/70 hover:text-white"
                    title="查看大图"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={event => {
                      event.stopPropagation();
                      onEditSingleImageLocally(idx);
                    }}
                    disabled={disableNewRetry || !imgObj.adjustmentPrompt.trim()}
                    className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-black/55 text-white/80 shadow-md transition hover:bg-[rgba(124,92,255,0.26)] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    title="局部编辑"
                  >
                    <Wand2 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={event => {
                      event.stopPropagation();
                      onRegenerateSingleImage(idx);
                    }}
                    disabled={disableNewRetry}
                    className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-black/55 text-white/80 shadow-md transition hover:bg-[rgba(124,92,255,0.26)] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    title="重新生成"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={event => {
                      event.stopPropagation();
                      onDownloadImage(imgObj.url);
                    }}
                    className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-black/55 text-white/80 shadow-md transition hover:bg-[rgba(22,163,74,0.22)] hover:text-white"
                    title="下载图片"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                </div>
              )}

              {isRegenerating && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-[rgba(7,10,17,0.7)] backdrop-blur-sm text-white">
                  <Loader2 className="mb-3 h-9 w-9 animate-spin" />
                  <span className="text-sm font-semibold">{operationLabel}</span>
                </div>
              )}
            </div>

            <div className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-[var(--vx-text)]">图片 {idx + 1}</p>
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    isRegenerating ? 'vx-status-warning' : 'vx-status-idle'
                  }`}
                >
                  {isRegenerating ? operationLabel.replace('正在', '').replace('...', '') : '可操作'}
                </span>
              </div>

              <textarea
                value={imgObj.adjustmentPrompt}
                onChange={event => onSingleImageAdjustmentChange(idx, event.target.value)}
                placeholder="例如：顶部留白更多、产品向右移动。"
                disabled={isRegenerating}
                rows={3}
                className="vx-input w-full resize-none rounded-2xl px-4 py-3 text-sm shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60"
              />

              <div className="space-y-2">
                <p className="text-xs leading-5 text-[var(--vx-text-soft)] [word-break:break-word]">
                  仅修改当前图，不影响整组参数。
                </p>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => onEditSingleImageLocally(idx)}
                    disabled={isRegenerating || disableNewRetry || !imgObj.adjustmentPrompt.trim()}
                    className="vx-button-secondary inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Wand2 className="h-3.5 w-3.5" />
                    局部编辑
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {singleGen.status === 'generating' && (
        <div className="vx-panel-soft col-span-full flex min-h-[240px] flex-col items-center justify-center rounded-[1.75rem] text-[var(--vx-text)]">
          <Loader2 className="mb-4 h-10 w-10 animate-spin text-[var(--vx-brand-2)]" />
          <span className="text-sm font-semibold">{getGenerateButtonLabel()}</span>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-5" id={showResults ? 'studio-results' : undefined}>
      {showError && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/20 bg-[rgba(127,29,29,0.42)] px-5 py-4 text-red-100 shadow-sm">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-300" />
          <p className="text-sm font-medium">{singleGen.error}</p>
        </div>
      )}

      {showControls && (
        <section
          id="studio-settings"
          className="vx-panel rounded-[2rem] p-7"
        >
          <div className="mb-6">
            <h3 className="text-2xl font-black tracking-tight text-[var(--vx-text)]">设置参数</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--vx-text-soft)]">
              调整尺寸、图片类型、风格和补充说明后，一键生成当前产品图。
            </p>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <SelectField
                label="图片尺寸"
                value={singleGen.size}
                onChange={val => setSingleGen(prev => ({ ...prev, size: val }))}
                options={ASPECT_RATIO_OPTIONS}
                allowCustomInput
                icon={Maximize}
              />
              <SelectField
                label="输出分辨率"
                value={imageSize}
                onChange={val => setImageSize?.(String(val))}
                options={IMAGE_SIZE_OPTIONS}
                icon={Layers}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <SelectField
                label="生成数量"
                value={singleGen.count}
                onChange={val => setSingleGen(prev => ({ ...prev, count: parseInt(String(val), 10) }))}
                options={[
                  { label: '1 张', value: 1 },
                  { label: '2 张', value: 2 },
                  { label: '3 张', value: 3 },
                  { label: '4 张', value: 4 },
                  { label: '5 张', value: 5 },
                  { label: '6 张', value: 6 },
                  { label: '7 张', value: 7 },
                  { label: '8 张', value: 8 },
                ]}
                icon={ImageIcon}
              />
              <SelectField
                label="生成方式"
                value={singleGen.mode}
                onChange={val => setSingleGen(prev => ({ ...prev, mode: val as any }))}
                options={MODE_OPTIONS}
                icon={Zap}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <SelectField
                label="图片类型"
                value={singleGen.imageType}
                onChange={val => setSingleGen(prev => ({ ...prev, imageType: val as any }))}
                options={IMAGE_TYPE_OPTIONS}
                icon={ImageIcon}
              />
              <div id="studio-style-section">
                <SelectField
                  label="风格选择"
                  value={singleGen.commercialTone}
                  onChange={val => setSingleGen(prev => ({ ...prev, commercialTone: val as any }))}
                  options={COMMERCIAL_TONE_OPTIONS}
                  icon={Palette}
                />
              </div>
            </div>

            <SelectField
              label="场景控制"
              value={singleGen.sceneStrictness}
              onChange={val => setSingleGen(prev => ({ ...prev, sceneStrictness: val as any }))}
              options={SCENE_STRICTNESS_OPTIONS}
              icon={Settings2}
            />

            <div>
              <label className="vx-field-label mb-2 block text-sm font-bold">图片文案（可选）</label>
              <textarea
                value={singleGen.copyText}
                onChange={event => setSingleGen(prev => ({ ...prev, copyText: event.target.value }))}
                rows={3}
                placeholder="输入需要渲染到图片里的标题、卖点或价格文案。"
                className="vx-input w-full rounded-2xl px-4 py-3 text-sm shadow-sm transition"
              />
            </div>

            <div id="studio-prompt-section">
              <label className="vx-field-label mb-2 block text-sm font-bold">补充说明（可选）</label>
              <textarea
                value={singleGen.prompt}
                onChange={event => setSingleGen(prev => ({ ...prev, prompt: event.target.value }))}
                rows={4}
                placeholder="输入构图、氛围、光线、镜头感，或你希望额外强调的要求。"
                className="vx-input w-full rounded-2xl px-4 py-3 text-sm shadow-sm transition"
              />
            </div>

            <button
              type="button"
              onClick={onGenerate}
              disabled={
                singleGen.status === 'generating' ||
                singleGeneratePhase === 'verifying' ||
                singleGen.regeneratingIndices.length > 0 ||
                !productImagePresent
              }
              className="vx-button-primary inline-flex h-12 w-full cursor-pointer items-center justify-center gap-3 rounded-2xl px-5 text-base font-bold transition disabled:cursor-not-allowed"
            >
              {singleGen.status === 'generating' || singleGeneratePhase === 'verifying' ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  {getGenerateButtonLabel()}
                </>
              ) : (
                <>
                  <Play className="h-5 w-5 fill-current" />
                  {getGenerateButtonLabel()}
                </>
              )}
            </button>
          </div>
        </section>
      )}

      {showResults && (
        <section className="vx-panel rounded-[2rem] p-7">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-2xl font-black tracking-tight text-[var(--vx-text)]">生成结果</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--vx-text-soft)]">每张图片都支持查看大图、局部编辑、重新生成和下载。</p>
            </div>
          </div>
          {renderResultsGrid()}
        </section>
      )}
    </div>
  );
}
