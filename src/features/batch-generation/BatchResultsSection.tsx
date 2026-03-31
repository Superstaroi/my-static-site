import React from 'react';
import { Download, Image as ImageIcon, Maximize, RefreshCw } from 'lucide-react';
import { ExcelRow } from '../../types';
import { ASPECT_RATIO_OPTIONS } from '../../constants';
import { SelectField } from '../../components/SelectField';

interface BatchResultsSectionProps {
  rows: ExcelRow[];
  productImagePresent: boolean;
  onRegenerateRow: (rowId: string, rowData?: ExcelRow) => void;
  onRowChange: (id: string, field: keyof ExcelRow, value: string) => void;
  onDownloadImage: (url: string) => void;
  onOpenImage: (url: string) => void;
}

export function BatchResultsSection({
  rows,
  productImagePresent,
  onRegenerateRow,
  onRowChange,
  onDownloadImage,
  onOpenImage,
}: BatchResultsSectionProps) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="bg-white/80 backdrop-blur-2xl p-8 rounded-[2rem] shadow-[0_20px_60px_rgba(0,0,0,0.03)] border border-white">
      <h2 className="text-2xl font-bold mb-8 flex items-center gap-3 tracking-tight text-slate-900">
        <div className="p-2 bg-slate-100 rounded-xl text-slate-700">
          <ImageIcon className="w-6 h-6" />
        </div>
        生成结果
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
        {rows.map(row => (
          <div
            key={row.id}
            className="border border-slate-200/80 rounded-[2rem] overflow-hidden flex flex-col bg-white shadow-sm hover:shadow-[0_10px_40px_rgba(0,0,0,0.06)] transition-all duration-300 group"
          >
            <div className="aspect-square bg-slate-50/50 relative flex items-center justify-center border-b border-slate-100 overflow-hidden">
              {row.status === 'pending' && (
                <div className="text-slate-400 flex flex-col items-center">
                  <ImageIcon className="w-10 h-10 mb-3 opacity-50" />
                  <span className="text-sm font-medium">Pending</span>
                </div>
              )}
              {row.status === 'generating' && (
                <div className="text-slate-800 flex flex-col items-center">
                  <RefreshCw className="w-10 h-10 mb-3 animate-spin text-slate-400" />
                  <span className="text-sm font-bold">Generating...</span>
                </div>
              )}
              {row.status === 'error' && (
                <div className="text-red-500 flex flex-col items-center p-6 text-center">
                  <span className="text-xs mt-2 text-red-500/80 line-clamp-3 bg-red-50 p-2 rounded-lg">
                    {row.error}
                  </span>
                </div>
              )}
              {(row.status === 'success' || row.status === 'needs_review' || row.status === 'generated') && row.generatedImage && (
                <img
                  src={row.generatedImage}
                  alt={`Result for row ${row.rowNumber}`}
                  className="w-full h-full object-contain transition-transform duration-700 group-hover:scale-105 cursor-zoom-in"
                  onClick={() => onOpenImage(row.generatedImage!)}
                />
              )}
            </div>

            <div className="p-6 flex-1 flex flex-col">
              <div className="flex items-start justify-between mb-4">
                <h3 className="text-base font-bold text-slate-800 line-clamp-1" title={row.productTitle}>
                  第 {row.rowNumber} 行：{row.productTitle || '未命名'}
                </h3>
              </div>

              <div className="text-sm text-slate-600 space-y-3 mb-6 flex-1 bg-slate-50/50 p-5 rounded-2xl border border-slate-100">
                <SelectField
                  label="宽高比"
                  value={row.size}
                  onChange={val => onRowChange(row.id, 'size', val)}
                  options={ASPECT_RATIO_OPTIONS}
                  icon={Maximize}
                />

                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">
                    图片文案（可选）
                  </label>
                  <textarea
                    value={row.copyText}
                    onChange={e => onRowChange(row.id, 'copyText', e.target.value)}
                    className="w-full bg-white border border-slate-200 text-slate-800 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-slate-300 focus:border-slate-300 outline-none transition-all resize-none placeholder:text-slate-400 shadow-sm"
                    rows={2}
                    placeholder="输入希望显示在图片上的文字"
                  />
                </div>

                <div className="pt-2">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">参考图：</span>{' '}
                  {row.refUrl ? (
                    <a
                      href={row.refUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-slate-700 hover:text-black hover:underline font-medium text-sm"
                    >
                      查看链接
                    </a>
                  ) : (
                    <span className="text-sm text-slate-400">无</span>
                  )}
                </div>

                <div className="pt-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                    场景补充说明（可选）
                  </label>
                  <textarea
                    value={row.customPrompt || ''}
                    onChange={e => onRowChange(row.id, 'customPrompt', e.target.value)}
                    className="w-full bg-white border border-slate-200 text-slate-800 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-slate-300 focus:border-slate-300 outline-none transition-all resize-none placeholder:text-slate-400 shadow-sm"
                    rows={2}
                    placeholder="例如：改善光线、减少杂物，或切换到更高级的场景"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => onRegenerateRow(row.id, row)}
                  disabled={row.status === 'generating' || !productImagePresent}
                  className="flex-1 py-3 px-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm hover:shadow active:scale-95"
                  title="Retry generation"
                  style={{ cursor: row.status === 'generating' || !productImagePresent ? 'not-allowed' : 'pointer' }}
                >
                  <RefreshCw className={`w-4 h-4 ${row.status === 'generating' ? 'animate-spin' : ''}`} />
                  Retry
                </button>
                <button
                  onClick={() => row.generatedImage && onDownloadImage(row.generatedImage)}
                  disabled={!row.generatedImage || row.status === 'generating'}
                  className="flex-[2] py-3 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer hover:shadow-md active:scale-95"
                  style={{ cursor: !row.generatedImage || row.status === 'generating' ? 'not-allowed' : 'pointer' }}
                >
                  <Download className="w-4 h-4" />
                  Download
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
