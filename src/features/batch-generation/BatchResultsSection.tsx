import React from 'react';
import { Download, Eye, ExternalLink, Image as ImageIcon, Maximize, RefreshCw, Wand2 } from 'lucide-react';
import { ExcelRow } from '../../types';
import { ASPECT_RATIO_OPTIONS } from '../../constants';
import { SelectField } from '../../components/SelectField';

interface BatchResultsSectionProps {
  rows: ExcelRow[];
  productImagePresent: boolean;
  rowPendingActions: Record<string, 'generate' | 'local_edit' | 'verifying'>;
  onRegenerateRow: (rowId: string, rowData?: ExcelRow) => void;
  onEditRowLocally: (rowId: string, rowData?: ExcelRow) => void;
  onRowChange: (id: string, field: keyof ExcelRow, value: string) => void;
  onDownloadImage: (url: string) => void;
  onOpenImage: (url: string) => void;
}

const getReferenceDomainSummary = (value: string) => {
  try {
    const hostname = new URL(value).hostname.replace(/^www\./i, '');
    return hostname || '外部参考图';
  } catch {
    return '外部参考图';
  }
};

export function BatchResultsSection({
  rows,
  productImagePresent,
  rowPendingActions,
  onRegenerateRow,
  onEditRowLocally,
  onRowChange,
  onDownloadImage,
  onOpenImage,
}: BatchResultsSectionProps) {
  if (rows.length === 0) {
    return null;
  }

  const getPendingActionLabel = (action?: 'generate' | 'local_edit' | 'verifying') => {
    if (action === 'local_edit') {
      return '正在按补充说明修改...';
    }

    return '正在生成图片...';
  };

  return (
    <section
      id="studio-results"
      className="vx-panel rounded-[2rem] p-7"
    >
      <div className="mb-6">
        <h3 className="text-2xl font-black tracking-tight text-[var(--vx-text)]">批量结果</h3>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {rows.map(row => {
          const pendingAction = rowPendingActions[row.id];
          const rowBusy = row.status === 'generating';
          const pendingLabel = getPendingActionLabel(pendingAction);
          const hasImage = Boolean(row.generatedImage);

          return (
            <article
              key={row.id}
              className="group vx-panel-soft overflow-hidden rounded-[1.75rem] transition-all hover:-translate-y-0.5 hover:border-white/14 hover:shadow-[0_20px_46px_rgba(0,0,0,0.34)]"
            >
              <div className="vx-media-surface relative aspect-[4/3] overflow-hidden border-b border-white/8">
                {row.status === 'pending' && !hasImage && (
                  <div className="flex h-full flex-col items-center justify-center text-[var(--vx-text-muted)]">
                    <ImageIcon className="mb-4 h-10 w-10 opacity-50" />
                    <span className="text-sm font-medium">等待生成</span>
                  </div>
                )}

                {row.status === 'error' && !hasImage && (
                  <div className="flex h-full flex-col items-center justify-center px-8 text-center text-red-200">
                    <ImageIcon className="mb-3 h-10 w-10 opacity-40" />
                    <p className="rounded-2xl bg-[rgba(127,29,29,0.42)] px-4 py-3 text-sm leading-6">{row.error}</p>
                  </div>
                )}

                {hasImage && (
                  <img
                    src={row.generatedImage}
                    alt={`第 ${row.rowNumber} 行结果图`}
                    className={`h-full w-full object-cover transition-all duration-500 ${
                      rowBusy ? 'scale-[1.02] opacity-50 blur-sm' : 'cursor-zoom-in group-hover:scale-105'
                    }`}
                    onClick={() => !rowBusy && onOpenImage(row.generatedImage!)}
                  />
                )}

                {hasImage && !rowBusy && (
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/55 via-black/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                )}

                {hasImage && !rowBusy && (
                  <div className="absolute bottom-3 right-3 flex items-center gap-2 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={event => {
                        event.stopPropagation();
                        onOpenImage(row.generatedImage!);
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
                        onEditRowLocally(row.id, row);
                      }}
                      disabled={!row.generatedImage || !(row.adjustmentPrompt || '').trim()}
                      className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-black/55 text-white/80 shadow-md transition hover:bg-[rgba(124,92,255,0.26)] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                      title="局部编辑"
                    >
                      <Wand2 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={event => {
                        event.stopPropagation();
                        onRegenerateRow(row.id, row);
                      }}
                      disabled={!productImagePresent}
                      className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-black/55 text-white/80 shadow-md transition hover:bg-[rgba(124,92,255,0.26)] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                      title="重新生成"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={event => {
                        event.stopPropagation();
                        onDownloadImage(row.generatedImage!);
                      }}
                      className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-black/55 text-white/80 shadow-md transition hover:bg-[rgba(22,163,74,0.22)] hover:text-white"
                      title="下载图片"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                  </div>
                )}

                {rowBusy && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-[rgba(7,10,17,0.7)] backdrop-blur-sm text-white">
                    <RefreshCw className="mb-3 h-9 w-9 animate-spin" />
                    <span className="text-sm font-semibold">{pendingLabel}</span>
                  </div>
                )}
              </div>

              <div className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-base font-bold text-[var(--vx-text)]">
                      第 {row.rowNumber} 行：{row.productTitle || '未命名行'}
                    </h4>
                    <p className="mt-1 text-sm text-[var(--vx-text-soft)]">{row.refUrl ? '已关联参考图' : '未提供参考图'}</p>
                    {row.refUrl && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <a
                          href={row.refUrl}
                          target="_blank"
                          rel="noreferrer"
                          title={row.refUrl}
                          onClick={event => event.stopPropagation()}
                          className="vx-button-secondary inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition"
                        >
                          <span>查看参考图</span>
                          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                        </a>
                        <span className="max-w-[14rem] truncate text-xs text-[var(--vx-text-muted)]">
                          {getReferenceDomainSummary(row.refUrl)}
                        </span>
                      </div>
                    )}
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      rowBusy
                        ? 'vx-status-warning'
                        : row.status === 'error'
                          ? 'vx-status-danger'
                          : hasImage
                            ? 'vx-status-success'
                            : 'vx-status-idle'
                    }`}
                  >
                    {rowBusy ? pendingLabel.replace('正在', '').replace('...', '') : row.status === 'error' ? '失败' : hasImage ? '已完成' : '待生成'}
                  </span>
                </div>

                <div className="vx-subpanel rounded-[1.5rem] p-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <SelectField
                      label="尺寸"
                      value={row.size}
                      onChange={val => onRowChange(row.id, 'size', val)}
                      options={ASPECT_RATIO_OPTIONS}
                      allowCustomInput
                      icon={Maximize}
                    />

                    <div>
                      <label className="vx-field-label mb-2 block text-sm font-bold">图片文案（可选）</label>
                      <textarea
                        value={row.copyText}
                        onChange={event => onRowChange(row.id, 'copyText', event.target.value)}
                        rows={3}
                        placeholder="输入这张图需要展示的标题或卖点文案。"
                        className="vx-input w-full rounded-2xl px-4 py-3 text-sm shadow-sm transition"
                      />
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="vx-field-label mb-2 block text-sm font-bold">场景补充说明（可选）</label>
                      <textarea
                        value={row.customPrompt || ''}
                        onChange={event => onRowChange(row.id, 'customPrompt', event.target.value)}
                        rows={3}
                        placeholder="例如：场景更高级、光线更柔和、减少杂物。"
                        className="vx-input w-full rounded-2xl px-4 py-3 text-sm shadow-sm transition"
                      />
                    </div>

                    <div>
                      <label className="vx-field-label mb-2 block text-sm font-bold">局部补充说明</label>
                      <textarea
                        value={row.adjustmentPrompt || ''}
                        onChange={event => onRowChange(row.id, 'adjustmentPrompt', event.target.value)}
                        rows={3}
                        placeholder="例如：保持产品不变，只调整当前图里的角度、动作或道具位置。"
                        className="vx-input w-full rounded-2xl px-4 py-3 text-sm shadow-sm transition"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => onRegenerateRow(row.id, row)}
                    disabled={rowBusy || !productImagePresent}
                    className="vx-button-secondary inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RefreshCw className={`h-4 w-4 ${pendingAction === 'generate' ? 'animate-spin' : ''}`} />
                    {pendingAction === 'generate' ? '正在重新生成' : '重新生成'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onEditRowLocally(row.id, row)}
                    disabled={rowBusy || !productImagePresent || !row.generatedImage || !(row.adjustmentPrompt || '').trim()}
                    className="vx-button-primary inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed"
                  >
                    <Wand2 className={`h-4 w-4 ${pendingAction === 'local_edit' ? 'animate-pulse' : ''}`} />
                    {pendingAction === 'local_edit' ? '正在修改' : '局部编辑'}
                  </button>
                  <button
                    type="button"
                    onClick={() => row.generatedImage && onDownloadImage(row.generatedImage)}
                    disabled={!row.generatedImage || rowBusy}
                    className="vx-button-success inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed"
                  >
                    <Download className="h-4 w-4" />
                    下载
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
