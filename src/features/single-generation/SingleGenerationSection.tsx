import React from 'react';
import {
  AlertCircle,
  Download,
  Image as ImageIcon,
  Layers,
  Loader2,
  Maximize,
  Palette,
  Play,
  RefreshCw,
  Settings2,
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
}

export function SingleGenerationSection({
  singleGen,
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
}: SingleGenerationSectionProps) {
  if (!productImagePresent) {
    return null;
  }

  return (
    <div className="space-y-4">
      {showError && (
        <div className="bg-red-50/90 backdrop-blur-sm border border-red-200/80 text-red-700 px-5 py-4 rounded-2xl flex items-start gap-3 shadow-sm">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-500" />
          <p className="text-sm font-medium">{singleGen.error}</p>
        </div>
      )}

      <div className="bg-white/80 backdrop-blur-2xl p-8 rounded-[2rem] shadow-[0_20px_60px_rgba(0,0,0,0.03)] border border-white">
        <h2 className="text-2xl font-bold mb-8 flex items-center gap-3 tracking-tight text-slate-900">
          <div className="p-2 bg-slate-100 rounded-xl text-slate-700">
            <ImageIcon className="w-6 h-6" />
          </div>
          Single Generation
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="flex flex-col gap-6">
            <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-100 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <SelectField
                  label="宽高比"
                  value={singleGen.size}
                  onChange={val => setSingleGen(prev => ({ ...prev, size: val }))}
                  options={ASPECT_RATIO_OPTIONS}
                  icon={Maximize}
                />

                <SelectField
                  label="数量"
                  value={singleGen.count}
                  onChange={val => setSingleGen(prev => ({ ...prev, count: parseInt(String(val), 10) }))}
                  options={[
                    { label: '1 张图片', value: 1 },
                    { label: '2 张图片', value: 2 },
                    { label: '3 张图片', value: 3 },
                    { label: '4 张图片', value: 4 },
                    { label: '5 张图片', value: 5 },
                    { label: '6 张图片', value: 6 },
                    { label: '7 张图片', value: 7 },
                    { label: '8 张图片', value: 8 },
                  ]}
                  icon={Layers}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <SelectField
                  label="生成方式"
                  value={singleGen.mode}
                  onChange={val => setSingleGen(prev => ({ ...prev, mode: val as any }))}
                  options={MODE_OPTIONS}
                  icon={Zap}
                />

                <SelectField
                  label="图片类型"
                  value={singleGen.imageType}
                  onChange={val => setSingleGen(prev => ({ ...prev, imageType: val as any }))}
                  options={IMAGE_TYPE_OPTIONS}
                  icon={ImageIcon}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <SelectField
                  label="风格调性"
                  value={singleGen.commercialTone}
                  onChange={val => setSingleGen(prev => ({ ...prev, commercialTone: val as any }))}
                  options={COMMERCIAL_TONE_OPTIONS}
                  icon={Palette}
                />

                <SelectField
                  label="场景控制"
                  value={singleGen.sceneStrictness}
                  onChange={val => setSingleGen(prev => ({ ...prev, sceneStrictness: val as any }))}
                  options={SCENE_STRICTNESS_OPTIONS}
                  icon={Settings2}
                />
              </div>

              <div>
                <label className="text-sm font-bold text-slate-700 mb-2 block">图片文案</label>
                <textarea
                  value={singleGen.copyText}
                  onChange={e => setSingleGen(prev => ({ ...prev, copyText: e.target.value }))}
                  className="w-full bg-white border border-slate-200 text-slate-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-slate-300 focus:border-slate-300 outline-none transition-all resize-none placeholder:text-slate-400 shadow-sm"
                  rows={3}
                  placeholder="输入希望显示在图片上的文字，系统会自动保留原始语言。"
                />
              </div>

              <div>
                <label className="text-sm font-bold text-slate-700 mb-2 block">补充说明（可选）</label>
                <textarea
                  value={singleGen.prompt}
                  onChange={e => setSingleGen(prev => ({ ...prev, prompt: e.target.value }))}
                  className="w-full bg-white border border-slate-200 text-slate-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-slate-300 focus:border-slate-300 outline-none transition-all resize-none placeholder:text-slate-400 shadow-sm"
                  rows={4}
                  placeholder="输入构图、风格或其他补充说明"
                />
              </div>
            </div>

            <button
              onClick={onGenerate}
              disabled={singleGen.status === 'generating' || singleGen.regeneratingIndices.length > 0 || !productImagePresent}
              className="w-full py-4 px-6 bg-[#1d1d1f] hover:bg-[#000000] disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white rounded-2xl font-bold text-lg flex items-center justify-center gap-3 transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
            >
              {singleGen.status === 'generating' ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Play className="w-6 h-6 fill-current" />
                  {singleGen.count > 1 ? `Generate ${singleGen.count} Images` : 'Generate Image'}
                </>
              )}
            </button>
            <p className="text-sm text-slate-500 leading-6">
              单图模式下，未提取商品指纹时也可以直接生成，系统会优先按照你上传的图片和补充说明来处理；如果已经提取过指纹，系统才会额外做保真校验。
            </p>
          </div>

          <div className="border border-slate-200/80 rounded-[2rem] overflow-hidden flex flex-col bg-white shadow-sm">
            <div
              className={`bg-slate-50/50 relative flex items-center justify-center overflow-hidden p-4 ${singleGen.generatedImages.length > 0 ? 'grid gap-4' : 'aspect-square'} ${singleGen.generatedImages.length > 4 ? 'grid-cols-3 lg:grid-cols-4' : singleGen.generatedImages.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}
            >
              {singleGen.status === 'idle' && singleGen.generatedImages.length === 0 && (
                <div className="text-slate-400 flex flex-col items-center col-span-full">
                  <ImageIcon className="w-12 h-12 mb-4 opacity-50" />
                  <span className="text-base font-medium">待生成</span>
                </div>
              )}
              {singleGen.generatedImages.map((imgObj, idx) => {
                const isRegenerating = isSingleImageRegenerating(idx);
                const disableNewRetry = !isRegenerating && hasReachedSingleImageRegenerationLimit;

                return (
                  <div key={idx} className="rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-white group">
                    <div className="relative aspect-square overflow-hidden border-b border-slate-100">
                      <img
                        src={imgObj.url}
                        alt={`Result ${idx + 1}`}
                        className={`w-full h-full object-contain transition-transform duration-700 ${isRegenerating ? 'opacity-50 blur-sm' : 'group-hover:scale-105 cursor-zoom-in'}`}
                        onClick={() => !isRegenerating && onOpenImage(imgObj.url)}
                      />

                      {isRegenerating && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/40 backdrop-blur-sm z-10">
                          <Loader2 className="w-8 h-8 animate-spin text-slate-800 mb-2" />
                          <span className="text-sm font-bold text-slate-800">重新生成中...</span>
                        </div>
                      )}

                      {!isRegenerating && (
                        <div className="absolute bottom-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all z-20">
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              onRegenerateSingleImage(idx);
                            }}
                            disabled={disableNewRetry}
                            className="p-2 bg-white/90 backdrop-blur rounded-lg shadow-sm text-slate-700 hover:text-indigo-600 hover:bg-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            title="重新生成这张图"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </button>
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              onDownloadImage(imgObj.url);
                            }}
                            className="p-2 bg-white/90 backdrop-blur rounded-lg shadow-sm text-slate-700 hover:text-emerald-600 hover:bg-white transition-all"
                            title="Download"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="p-3 space-y-2">
                      <label className="block text-xs font-bold text-slate-600">单图补充说明</label>
                      <textarea
                        value={imgObj.adjustmentPrompt}
                        onChange={e => onSingleImageAdjustmentChange(idx, e.target.value)}
                        onClick={e => e.stopPropagation()}
                        placeholder="只针对这张图输入局部修改要求，例如：人物往后一点、顶部留白更多一些，或产品略微向右移动。"
                        disabled={isRegenerating}
                        className="w-full min-h-[88px] rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition-all focus:border-slate-300 focus:bg-white focus:ring-2 focus:ring-slate-100 resize-y disabled:opacity-60 disabled:cursor-not-allowed"
                      />
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs leading-5 text-slate-500">
                          这里只会局部修改当前这张结果图，右上角刷新按钮仍然会整张重新生成。
                        </p>
                        <button
                          onClick={() => onEditSingleImageLocally(idx)}
                          disabled={isRegenerating || disableNewRetry}
                          className="shrink-0 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isRegenerating ? 'animate-spin' : ''}`} />
                          按这条说明局部修改
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {singleGen.status === 'generating' && (
                <div className="text-slate-800 flex flex-col items-center justify-center p-8 col-span-full">
                  <Loader2 className="w-12 h-12 mb-4 animate-spin text-slate-400" />
                  <span className="text-base font-bold">正在生成 {singleGen.count} 张图片...</span>
                </div>
              )}
            </div>

            {singleGen.generatedImages.length > 0 && singleGen.status !== 'generating' && (
              <div className="p-6 border-t border-slate-100 bg-white flex gap-3">
                <button
                  onClick={onGenerate}
                  disabled={singleGen.regeneratingIndices.length > 0}
                  className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-base font-bold flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer hover:shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshCw className={`w-5 h-5 ${singleGen.regeneratingIndices.length > 0 ? 'animate-spin' : ''}`} />
                  {singleGen.regeneratingIndices.length > 0 ? 'Regenerating...' : 'Regenerate All'}
                </button>
                <button
                  onClick={() => {
                    singleGen.generatedImages.forEach(imgObj => {
                      onDownloadImage(imgObj.url);
                    });
                  }}
                  className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-base font-bold flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer hover:shadow-md active:scale-95"
                >
                  <Download className="w-5 h-5" />
                  Download All
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
