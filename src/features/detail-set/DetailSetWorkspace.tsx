import React from 'react';
import {
  AlertCircle,
  Download,
  Image as ImageIcon,
  LayoutTemplate,
  Loader2,
  RefreshCw,
  Sparkles,
  Store,
  Trash2,
  Upload,
} from 'lucide-react';
import { DetailSetPlanItem, DETAIL_SET_PLATFORM_OPTIONS } from '../../detailSetTemplates';
import { DetailSetPlatform } from '../../types';
import { SelectField } from '../../components/SelectField';
import { DetailSetGeneratedItem, UploadedImageAsset } from '../shared/models';
import {
  DETAIL_SET_IMAGE_TYPE_LABELS,
  DETAIL_SET_MODE_LABELS,
  DETAIL_SET_STATUS_LABELS,
  DETAIL_SET_TONE_LABELS,
  getDetailSetDisplayCopy,
} from './display';

interface DetailSetState {
  platform: DetailSetPlatform;
  globalPrompt: string;
  status: 'idle' | 'analyzing' | 'planning' | 'generating' | 'completed' | 'error';
  error: string;
  generatedItems: DetailSetGeneratedItem[];
}

interface DetailSetWorkspaceProps {
  visible: boolean;
  detailSet: DetailSetState;
  detailSetProductImage: UploadedImageAsset | null;
  detailSetProductInputRef: React.RefObject<HTMLInputElement | null>;
  detailSetPlanPreview: DetailSetPlanItem[];
  detailSetStepIndex: number;
  isAnyDetailSetItemGenerating: boolean;
  onDetailSetProductImageUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveDetailSetProductImage: () => void;
  onPlatformChange: (platform: DetailSetPlatform) => void;
  onGlobalPromptChange: (value: string) => void;
  onGenerateDetailSet: () => void;
  onDetailSetItemAdjustmentChange: (itemId: string, adjustmentPrompt: string) => void;
  onRegenerateDetailSetItem: (itemId: string) => void;
  onEditDetailSetItemLocally: (itemId: string) => void;
  onDownloadImage: (url: string) => void;
  onOpenImage: (url: string) => void;
}

export function DetailSetWorkspace({
  visible,
  detailSet,
  detailSetProductImage,
  detailSetProductInputRef,
  detailSetPlanPreview,
  detailSetStepIndex,
  isAnyDetailSetItemGenerating,
  onDetailSetProductImageUpload,
  onRemoveDetailSetProductImage,
  onPlatformChange,
  onGlobalPromptChange,
  onGenerateDetailSet,
  onDetailSetItemAdjustmentChange,
  onRegenerateDetailSetItem,
  onEditDetailSetItemLocally,
  onDownloadImage,
  onOpenImage,
}: DetailSetWorkspaceProps) {
  return (
    <div id="detail-set-workspace" className={visible ? 'space-y-10' : 'hidden'}>
      {detailSet.error && (
        <div className="bg-red-50/90 backdrop-blur-sm border border-red-200/80 text-red-700 px-5 py-4 rounded-2xl flex items-start gap-3 shadow-sm">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-500" />
          <p className="text-sm font-medium">{detailSet.error}</p>
        </div>
      )}

      <section className="bg-white/80 backdrop-blur-2xl p-8 rounded-[2rem] shadow-[0_20px_60px_rgba(0,0,0,0.03)] border border-white">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm">
              <LayoutTemplate className="w-4 h-4 text-slate-500" />
              详情图工作台
            </div>
            <h2 className="mt-5 text-4xl font-black tracking-tight text-slate-900">一键生成详情图组</h2>
            <p className="mt-3 text-base leading-7 text-slate-600">
              上传一张产品图，选择平台后，VXStudio 会先自动分析产品，再生成可直接使用的详情图组。
            </p>
          </div>

          <div className="grid grid-cols-5 gap-2 rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-3 text-center text-xs font-semibold text-slate-500 shadow-sm">
            {['上传', '分析', '规划', '生成', '完成'].map((label, idx) => {
              const step = idx + 1;
              const active = detailSetStepIndex >= step;
              const current = detailSetStepIndex === step;
              return (
                <div key={label} className="flex flex-col items-center gap-2">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs ${
                      active
                        ? current
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-slate-200 bg-white text-slate-400'
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

      <div className="grid grid-cols-1 xl:grid-cols-[420px_minmax(0,1fr)] gap-8">
        <section className="bg-white/80 backdrop-blur-2xl p-8 rounded-[2rem] shadow-[0_20px_60px_rgba(0,0,0,0.03)] border border-white space-y-6">
          <div>
            <h3 className="text-xl font-bold tracking-tight text-slate-900">工作区设置</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">根据上传产品做产品指纹分析。</p>
          </div>

          <div className="space-y-3">
            <label className="text-sm font-bold text-slate-700 block">1. 产品图</label>
            {!detailSetProductImage ? (
              <button
                type="button"
                onClick={() => detailSetProductInputRef.current?.click()}
                className="w-full border-2 border-dashed border-slate-200 rounded-[1.75rem] p-8 text-center hover:bg-slate-50/80 hover:border-slate-400 transition-all cursor-pointer"
              >
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
                  <Upload className="w-7 h-7 text-slate-500" />
                </div>
                <p className="text-base font-bold text-slate-800">上传产品图</p>
                <p className="mt-1 text-sm text-slate-500">支持 PNG 或 JPG，仅用于当前详情图工作区。</p>
              </button>
            ) : (
              <div className="relative rounded-[1.75rem] border border-slate-200 bg-slate-50 aspect-square overflow-hidden group">
                <img src={detailSetProductImage.dataUrl} alt="Detail set product" className="h-full w-full object-contain p-5" />
                <button
                  type="button"
                  onClick={onRemoveDetailSetProductImage}
                  className="absolute top-4 right-4 rounded-full bg-white/90 p-2 text-slate-500 shadow-sm transition-colors hover:bg-red-50 hover:text-red-500"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
            <input
              type="file"
              ref={detailSetProductInputRef}
              onChange={onDetailSetProductImageUpload}
              accept="image/*"
              className="hidden"
            />
          </div>

          <SelectField
            label="2. 平台"
            value={detailSet.platform}
            onChange={val => onPlatformChange(val as DetailSetPlatform)}
            options={DETAIL_SET_PLATFORM_OPTIONS}
            icon={Store}
          />

          <div>
            <label className="text-sm font-bold text-slate-700 mb-2 block">3. 全局补充说明（可选）</label>
            <textarea
              value={detailSet.globalPrompt}
              onChange={e => onGlobalPromptChange(e.target.value)}
              rows={4}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm outline-none transition-all focus:border-slate-300 focus:ring-2 focus:ring-slate-100 resize-none"
              placeholder="例如：整体风格偏温暖高级，使用客厅场景，避免复杂道具。"
            />
          </div>

          <button
            onClick={onGenerateDetailSet}
            disabled={!detailSetProductImage || detailSet.status === 'analyzing' || detailSet.status === 'planning' || detailSet.status === 'generating' || isAnyDetailSetItemGenerating}
            className="w-full py-4 px-6 bg-[#1d1d1f] hover:bg-[#000000] disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white rounded-2xl font-bold text-lg flex items-center justify-center gap-3 transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
          >
            {detailSet.status === 'analyzing' && (
              <>
                <Loader2 className="w-6 h-6 animate-spin" />
                正在分析产品...
              </>
            )}
            {detailSet.status === 'planning' && (
              <>
                <Loader2 className="w-6 h-6 animate-spin" />
                正在生成方案...
              </>
            )}
            {detailSet.status === 'generating' && (
              <>
                <Loader2 className="w-6 h-6 animate-spin" />
                正在生成详情图组...
              </>
            )}
            {detailSet.status !== 'analyzing' && detailSet.status !== 'planning' && detailSet.status !== 'generating' && isAnyDetailSetItemGenerating && (
              <>
                <Loader2 className="w-6 h-6 animate-spin" />
                正在处理单张图片...
              </>
            )}
            {detailSet.status !== 'analyzing' && detailSet.status !== 'planning' && detailSet.status !== 'generating' && !isAnyDetailSetItemGenerating && (
              <>
                <Sparkles className="w-6 h-6" />
                生成详情图组
              </>
            )}
          </button>
        </section>

        <section className="space-y-8">
          <div className="bg-white/80 backdrop-blur-2xl p-8 rounded-[2rem] shadow-[0_20px_60px_rgba(0,0,0,0.03)] border border-white">
            <div className="flex items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="text-xl font-bold tracking-tight text-slate-900">自动镜头规划</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  方案会随所选平台变化，完成产品指纹分析后会更精准。
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm">
                {detailSetPlanPreview.length} 张计划图
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {detailSetPlanPreview.map(item => {
                const localizedCopy = getDetailSetDisplayCopy(item);

                return (
                  <div key={item.id} className="rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-5 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold tracking-[0.18em] text-slate-400">画面 {item.slot}</p>
                        <h4 className="mt-1 text-base font-bold text-slate-900">{localizedCopy.title}</h4>
                      </div>
                      <div className="rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 border border-slate-200">
                        {item.aspectRatio}
                      </div>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-600">{localizedCopy.description}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 border border-slate-200">{DETAIL_SET_IMAGE_TYPE_LABELS[item.imageType]}</span>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 border border-slate-200">{DETAIL_SET_MODE_LABELS[item.mode]}</span>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 border border-slate-200">{DETAIL_SET_TONE_LABELS[item.commercialTone]}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-2xl p-8 rounded-[2rem] shadow-[0_20px_60px_rgba(0,0,0,0.03)] border border-white">
            <div className="flex items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="text-xl font-bold tracking-tight text-slate-900">已生成详情图组</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  已生成的图片支持单张 Download，也可以 Download All。
                </p>
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
                  className="py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer hover:shadow-md active:scale-95"
                >
                  <Download className="w-4 h-4" />
                  Download All
                </button>
              )}
            </div>

            {detailSet.generatedItems.length === 0 ? (
              <div className="rounded-[1.75rem] border border-dashed border-slate-200 bg-slate-50/60 p-12 text-center text-slate-400">
                <LayoutTemplate className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p className="text-base font-semibold">生成后的详情图会显示在这里。</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {detailSet.generatedItems.map(item => {
                  const localizedCopy = getDetailSetDisplayCopy(item);
                  const isGenerating = item.status === 'generating';

                  return (
                    <div key={item.id} className="rounded-[1.5rem] border border-slate-200 bg-white overflow-hidden shadow-sm">
                      <div className="relative aspect-[3/4] bg-slate-50 flex items-center justify-center overflow-hidden">
                        {item.generatedImage ? (
                          <>
                            <img
                              src={item.generatedImage}
                              alt={localizedCopy.title}
                              className={`w-full h-full object-contain transition-all duration-500 ${isGenerating ? 'scale-[0.98] opacity-60 blur-sm' : 'cursor-zoom-in'}`}
                              onClick={() => !isGenerating && onOpenImage(item.generatedImage!)}
                            />
                            {isGenerating && (
                              <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/35 backdrop-blur-sm">
                                <Loader2 className="w-10 h-10 animate-spin mb-3 text-slate-700" />
                                <span className="text-sm font-semibold text-slate-700">生成中...</span>
                              </div>
                            )}
                          </>
                        ) : isGenerating ? (
                          <div className="flex flex-col items-center text-slate-500">
                            <Loader2 className="w-10 h-10 animate-spin mb-3" />
                            <span className="text-sm font-semibold">生成中...</span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center px-8 text-center text-slate-400">
                            <ImageIcon className="w-10 h-10 mb-3 opacity-50" />
                            <span className="text-sm font-semibold">等待结果</span>
                          </div>
                        )}
                      </div>
                      <div className="p-5">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold tracking-[0.18em] text-slate-400">画面 {item.slot}</p>
                            <h4 className="mt-1 text-base font-bold text-slate-900">{localizedCopy.title}</h4>
                          </div>
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            item.status === 'success'
                              ? 'bg-emerald-50 text-emerald-700'
                              : item.status === 'error'
                                ? 'bg-red-50 text-red-700'
                                : item.status === 'generating'
                                  ? 'bg-amber-50 text-amber-700'
                                  : 'bg-slate-100 text-slate-500'
                          }`}>
                            {DETAIL_SET_STATUS_LABELS[item.status]}
                          </span>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-slate-600">{localizedCopy.description}</p>
                        {item.error && (
                          <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
                            {item.error}
                          </p>
                        )}
                        <div className="mt-4 space-y-3">
                          <div>
                            <label className="text-sm font-bold text-slate-700 mb-2 block">单图补充说明</label>
                            <textarea
                              value={item.adjustmentPrompt}
                              onChange={e => onDetailSetItemAdjustmentChange(item.id, e.target.value)}
                              placeholder="只对这张图补充说明，例如：把产品再放大一点、背景更简洁、增加顶部留白。"
                              disabled={isGenerating}
                              rows={4}
                              className="w-full rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-800 shadow-sm outline-none transition-all focus:border-slate-300 focus:bg-white focus:ring-2 focus:ring-slate-100 resize-none disabled:opacity-60 disabled:cursor-not-allowed"
                            />
                            <p className="mt-2 text-xs leading-5 text-slate-500">
                              “重新生成”会重新生成这一张；“按补充说明修改”只局部调整当前结果。
                            </p>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <button
                              onClick={() => onRegenerateDetailSetItem(item.id)}
                              disabled={isGenerating}
                              className="py-3 px-4 bg-slate-100 hover:bg-slate-200 disabled:bg-slate-100 disabled:text-slate-400 text-slate-700 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer hover:shadow-md active:scale-95 disabled:cursor-not-allowed"
                            >
                              <RefreshCw className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
                              重新生成
                            </button>
                            <button
                              onClick={() => onEditDetailSetItemLocally(item.id)}
                              disabled={!item.generatedImage || isGenerating}
                              className="py-3 px-4 bg-slate-900 hover:bg-black disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer hover:shadow-md active:scale-95 disabled:cursor-not-allowed"
                            >
                              <Sparkles className="w-4 h-4" />
                              按补充说明修改
                            </button>
                            <button
                              onClick={() => item.generatedImage && onDownloadImage(item.generatedImage)}
                              disabled={!item.generatedImage || isGenerating}
                              className="py-3 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer hover:shadow-md active:scale-95 disabled:cursor-not-allowed"
                            >
                              <Download className="w-4 h-4" />
                              Download
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
