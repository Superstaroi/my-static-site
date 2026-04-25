import React, { useEffect, useMemo, useState } from 'react';
import { Clock3, Download, Image as ImageIcon, RefreshCw, Trash2, X } from 'lucide-react';
import { apiDelete, apiGet, GenerationHistoryItem } from '../services/api';

interface GenerationHistoryMutationResponse {
  success: boolean;
  deleted?: number;
}

const formatCreatedAt = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '--';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const getSourceLabel = (sourceType: string | null) => {
  switch (sourceType) {
    case 'single':
      return '单图生成';
    case 'batch':
      return '批量生成';
    case 'detail':
      return '详情图生成';
    default:
      return '生成图片';
  }
};

const getHistoryPreviewImageUrl = (item: GenerationHistoryItem) => String(item.previewUrl || '').trim();

const getHistoryDownloadImageUrl = (item: GenerationHistoryItem) =>
  String(item.originalUrl || item.previewUrl || '').trim();

const getImageExtension = (url: string): string => {
  if (url.startsWith('data:image/')) {
    const mimePart = url.slice('data:image/'.length).split(';')[0].toLowerCase();
    if (mimePart === 'jpeg') {
      return 'jpg';
    }
    if (mimePart === 'svg+xml') {
      return 'svg';
    }
    return mimePart || 'png';
  }

  const cleanUrl = url.split('?')[0].split('#')[0];
  const match = cleanUrl.match(/\.([a-zA-Z0-9]+)$/);
  if (!match) {
    return 'png';
  }

  const ext = match[1].toLowerCase();
  return ext === 'jpeg' ? 'jpg' : ext;
};

const createHistoryDownloadName = (item: GenerationHistoryItem, imageUrl: string) => {
  const timestamp = item.createdAt
    ? item.createdAt.replace(/[^0-9]/g, '').slice(0, 14)
    : `${Date.now()}`;
  const source = (item.sourceType || 'history').toLowerCase();
  const extension = getImageExtension(imageUrl);
  return `vxstudio-${source}-${timestamp || Date.now()}.${extension}`;
};

export const GenerationHistoryPage: React.FC = () => {
  const [items, setItems] = useState<GenerationHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [previewingItem, setPreviewingItem] = useState<GenerationHistoryItem | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<number | null>(null);
  const [isClearingAll, setIsClearingAll] = useState(false);

  const loadHistory = async () => {
    setIsLoading(true);
    setError('');

    try {
      const records = await apiGet<GenerationHistoryItem[]>('/api/user/generation-history');
      setItems(Array.isArray(records) ? records : []);
    } catch (err: any) {
      setError(err?.message || '生成记录加载失败，请稍后重试。');
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadHistory();
  }, []);

  const handleOpenPreview = (item: GenerationHistoryItem) => {
    const imageUrl = getHistoryPreviewImageUrl(item);
    if (!imageUrl) {
      setError('当前记录缺少可查看的图片数据。');
      return;
    }

    setPreviewingItem(item);
  };

  const handleDownloadItem = (item: GenerationHistoryItem) => {
    const imageUrl = getHistoryDownloadImageUrl(item);
    if (!imageUrl) {
      setError('当前记录缺少可下载的图片数据。');
      return;
    }

    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = createHistoryDownloadName(item, imageUrl);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDeleteItem = async (item: GenerationHistoryItem) => {
    if (deletingItemId === item.id || isClearingAll) {
      return;
    }

    const confirmed = window.confirm('确定删除这条生成记录吗？');
    if (!confirmed) {
      return;
    }

    setDeletingItemId(item.id);
    setError('');

    try {
      await apiDelete<GenerationHistoryMutationResponse>(`/api/user/generation-history/${item.id}`);
      setItems(prev => prev.filter(entry => entry.id !== item.id));
      setPreviewingItem(current => (current?.id === item.id ? null : current));
    } catch (err: any) {
      setError(err?.message || '删除生成记录失败，请稍后重试。');
    } finally {
      setDeletingItemId(null);
    }
  };

  const handleClearAll = async () => {
    if (!items.length || isClearingAll || deletingItemId !== null) {
      return;
    }

    const confirmed = window.confirm('确定清空当前账号的全部生成记录吗？');
    if (!confirmed) {
      return;
    }

    setIsClearingAll(true);
    setError('');

    try {
      await apiDelete<GenerationHistoryMutationResponse>('/api/user/generation-history');
      setItems([]);
      setPreviewingItem(null);
    } catch (err: any) {
      setError(err?.message || '清空生成记录失败，请稍后重试。');
    } finally {
      setIsClearingAll(false);
    }
  };

  const summaryText = useMemo(() => {
    if (!items.length) {
      return '当前账号还没有生成记录。';
    }

    return `当前账号最近保留了 ${items.length} 张生成图片。`;
  }, [items]);

  return (
    <>
      <section className="space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-[34px] font-black tracking-tight text-white sm:text-[40px]">我的生成记录</h1>
            <p className="text-[15px] leading-7 text-[var(--vx-text-soft)]">
              {summaryText}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {items.length > 0 ? (
              <button
                type="button"
                onClick={() => void handleClearAll()}
                disabled={isLoading || isClearingAll || deletingItemId !== null}
                className="vx-button-secondary inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-[14px] font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Trash2 className={`h-4 w-4 ${isClearingAll ? 'animate-pulse' : ''}`} />
                一键清空
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => void loadHistory()}
              disabled={isClearingAll}
              className="vx-button-secondary inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-[14px] font-semibold disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              刷新记录
            </button>
          </div>
        </div>

        {error ? (
          <div className="flex items-start gap-3 rounded-2xl border border-red-500/20 bg-[rgba(127,29,29,0.42)] px-5 py-4 text-red-100 shadow-[0_12px_30px_rgba(127,29,29,0.18)] backdrop-blur-sm">
            <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-red-300" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        ) : null}

        {isLoading ? (
          <div className="vx-panel flex min-h-[320px] items-center justify-center rounded-[2rem] px-8 py-12">
            <div className="space-y-4 text-center">
              <RefreshCw className="mx-auto h-8 w-8 animate-spin text-white/70" />
              <p className="text-base font-medium text-white/80">正在加载生成记录...</p>
            </div>
          </div>
        ) : items.length === 0 ? (
          <div className="vx-panel flex min-h-[320px] items-center justify-center rounded-[2rem] px-8 py-12">
            <div className="space-y-5 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/5">
                <ImageIcon className="h-8 w-8 text-white/80" />
              </div>
              <div className="space-y-2">
                <h2 className="text-[28px] font-black text-white">暂无生成记录</h2>
                <p className="text-sm text-[var(--vx-text-soft)]">开始生成图片后，这里会自动展示当前账号最近 20 张图片。</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {items.map(item => {
              const isDeleting = deletingItemId === item.id;
              const imageUrl = getHistoryPreviewImageUrl(item);

              return (
                <article
                  key={item.id}
                  className="vx-panel-soft overflow-hidden rounded-[1.7rem] border border-white/8 transition-all duration-300 hover:-translate-y-1 hover:border-white/14 hover:shadow-[0_18px_40px_rgba(0,0,0,0.18)]"
                >
                  <button
                    type="button"
                    onClick={() => handleOpenPreview(item)}
                    className="block w-full overflow-hidden bg-[rgba(9,12,18,0.85)] text-left"
                  >
                    <img
                      src={imageUrl}
                      alt={getSourceLabel(item.sourceType)}
                      loading="lazy"
                      className="aspect-square w-full object-cover transition duration-500 hover:scale-[1.02]"
                    />
                  </button>

                  <div className="space-y-3 px-4 pb-4 pt-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => handleOpenPreview(item)}
                          className="truncate text-left text-[15px] font-semibold text-white"
                        >
                          {getSourceLabel(item.sourceType)}
                        </button>
                        <div className="mt-1 flex items-center gap-1.5 text-[12px] text-[var(--vx-text-muted)]">
                          <Clock3 className="h-3.5 w-3.5" />
                          {formatCreatedAt(item.createdAt)}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenPreview(item)}
                          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 transition hover:border-white/18 hover:bg-white/10 hover:text-white"
                          aria-label="查看图片"
                          title="查看图片"
                        >
                          <ImageIcon className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadItem(item)}
                          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 transition hover:border-white/18 hover:bg-white/10 hover:text-white"
                          aria-label="下载图片"
                          title="下载图片"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteItem(item)}
                          disabled={isDeleting || isClearingAll}
                          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 transition hover:border-white/18 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                          aria-label="删除记录"
                          title="删除记录"
                        >
                          <Trash2 className={`h-4 w-4 ${isDeleting ? 'animate-pulse' : ''}`} />
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {previewingItem ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setPreviewingItem(null)}
        >
          <div
            className="relative w-full max-w-6xl overflow-hidden rounded-[2rem] border border-white/10 bg-[rgba(8,11,18,0.96)] p-3 shadow-[0_30px_80px_rgba(0,0,0,0.52)]"
            onClick={(event) => event.stopPropagation()}
          >
            <img
              src={getHistoryPreviewImageUrl(previewingItem)}
              alt={getSourceLabel(previewingItem.sourceType)}
              className="max-h-[82vh] w-full rounded-[1.4rem] bg-black object-contain"
            />

            <div className="absolute right-5 top-5 flex items-center gap-2">
              <button
                className="rounded-full border border-white/10 bg-black/55 p-2 text-white/80 transition-colors hover:bg-black/80 hover:text-white"
                onClick={() => handleDownloadItem(previewingItem)}
                type="button"
                title="下载图片"
              >
                <Download className="h-5 w-5" />
              </button>
              <button
                className="rounded-full border border-white/10 bg-black/55 p-2 text-white/80 transition-colors hover:bg-black/80 hover:text-white"
                onClick={() => setPreviewingItem(null)}
                type="button"
                title="关闭预览"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};
