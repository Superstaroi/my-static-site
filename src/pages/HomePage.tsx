import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Building2,
  ChevronRight,
  FileText,
  Heart,
  House,
  ImagePlus,
  Layers3,
  LucideIcon,
  Sparkles,
  Star,
  UserRound,
  Video,
  Wand2,
} from 'lucide-react';

export type QuickStartEntry = 'single' | 'batch' | 'detail' | 'text-to-image' | 'ai-video';
export type HomeCategory = '高级家居' | '欧洲街景' | '时尚人像' | '居家美景';
type HomeFilterCategory = 'All' | HomeCategory;

export interface HomeMediaItem {
  id: string;
  src: string;
  title: string;
  source: string;
  category: HomeCategory;
  objectPosition?: string;
}

interface HomePageProps {
  onNavigateEntry: (entry: QuickStartEntry) => void;
  items: HomeMediaItem[];
  favoriteIds: string[];
  onToggleFavorite: (itemId: string) => void;
  onPreviewItem: (item: HomeMediaItem) => void;
}

interface FavoritesPageProps {
  onBackHome: () => void;
  items: HomeMediaItem[];
  favoriteIds: string[];
  onToggleFavorite: (itemId: string) => void;
  onPreviewItem: (item: HomeMediaItem) => void;
}

const heroImage = '/home/hero-neon-2.jpg';

const quickStartCardCopy: Partial<Record<QuickStartEntry, { title: string; description: string }>> = {
  single: {
    title: '单图生成',
    description: '快速生成一张高质量创意图像',
  },
  batch: {
    title: '批量生成',
    description: '批量生成多张图片，提高出图效率',
  },
  detail: {
    title: '详情图生成',
    description: '生成多角度、多场景的详情图组',
  },
};

const categoryTags: Array<{ label: HomeFilterCategory; icon: LucideIcon }> = [
  { label: 'All', icon: Sparkles },
  { label: '高级家居', icon: House },
  { label: '欧洲街景', icon: Building2 },
  { label: '时尚人像', icon: UserRound },
  { label: '居家美景', icon: Star },
];

const quickStartCards: Array<{
  key: QuickStartEntry;
  title: string;
  description: string;
  icon: LucideIcon;
  accent: string;
}> = [
  {
    key: 'single',
    title: '单图生成',
    description: '快速生成一张高质量创意图',
    icon: ImagePlus,
    accent: 'from-violet-500/28 to-fuchsia-400/10 text-violet-200',
  },
  {
    key: 'batch',
    title: '批量生成',
    description: '批量生成多张图片',
    icon: Wand2,
    accent: 'from-fuchsia-500/24 to-violet-400/10 text-fuchsia-200',
  },
  {
    key: 'detail',
    title: '详情图生成',
    description: '生成多角度、多场景详情图',
    icon: Layers3,
    accent: 'from-cyan-500/24 to-sky-400/10 text-cyan-200',
  },
  {
    key: 'text-to-image',
    title: '文生图',
    description: '文本输入生图模块',
    icon: FileText,
    accent: 'from-emerald-500/24 to-cyan-400/10 text-emerald-200',
  },
  {
    key: 'ai-video',
    title: 'AI 视频',
    description: '视频创作占位入口',
    icon: Video,
    accent: 'from-amber-500/24 to-orange-400/10 text-amber-200',
  },
];

const luxuryTitles = [
  'Sunlit Lounge',
  'Modern Softscape',
  'Ivory Atrium',
  'Quiet Residence',
  'Grand Hearth',
  'Window Retreat',
  'Nordic Salon',
  'Marble Kitchen',
  'Warm Loft',
  'Linen Living',
  'Gallery Suite',
  'Airy Corner',
  'Sculpted Dining',
  'Terrace Glow',
  'Oak Residence',
  'Atelier Lounge',
  'Luxe Calm',
  'Stone Hearth',
  'Bright Parlor',
  'Natural Oak',
  'Daylight Hall',
  'Minimal Villa',
  'Soft Contrast',
  'Skyline Living',
  'Refined Interior',
];

const streetTitles = [
  'Stone Quarter',
  'Old Town Walk',
  'Cafe Passage',
  'Window Arcade',
  'Morning Facade',
  'River Street',
  'Lantern Lane',
  'Courtyard Route',
  'Brick Alley',
  'Market Row',
  'Terrace Corner',
  'Historic Frontage',
  'City Passage',
  'Copper Street',
  'Blue Shutter Way',
  'Corner Bistro',
  'Arcade House',
  'Archway Lane',
  'Old Square',
  'Townhouse View',
  'Cobble Morning',
  'Facade Light',
  'Plaza Turn',
  'Gallery Alley',
  'Narrow Street',
];

const fashionTitles = [
  'Editorial Line',
  'Studio Glance',
  'Soft Portrait',
  'City Muse',
  'Modern Profile',
  'Tailored Look',
  'Quiet Attitude',
  'Clean Silhouette',
  'Runway Light',
  'Camera Moment',
  'Weekend Edit',
  'Street Poise',
  'Neutral Tone',
  'Sharp Focus',
  'Linen Mood',
  'Soft Frame',
  'Metro Style',
  'Calm Gaze',
  'Urban Edit',
  'Leather Note',
  'Minimal Set',
  'Golden Hour Look',
  'White Shirt Edit',
  'Tailored Mood',
  'Polished Scene',
];

const cozyTitles = [
  'Cozy Nook',
  'Soft Daylight',
  'Calm Corner',
  'Candle Evening',
  'Window Seat',
  'Knit Texture',
  'Quiet Table',
  'Home Ritual',
  'Warm Morning',
  'Layered Comfort',
  'Gentle Glow',
  'Reading Spot',
  'Natural Calm',
  'Still Life',
  'Tea Moment',
  'Rested Space',
  'Linen Mood',
  'Warm Shelf',
  'Fireside Note',
  'Weekend Nest',
  'Light Corner',
  'Serene Home',
  'Relaxed Detail',
  'Candle Corner',
  'Soft Comfort',
];

const buildItems = (
  prefix: string,
  titles: string[],
  category: HomeCategory,
  source: string,
  objectPosition: string
) =>
  titles.map((title, index) => ({
    id: `${prefix}-${String(index + 1).padStart(2, '0')}`,
    src: `/home/${prefix}-${String(index + 1).padStart(2, '0')}.jpg`,
    title,
    source,
    category,
    objectPosition,
  }));

const galleryItems: HomeMediaItem[] = [
  ...buildItems(
    'luxury',
    luxuryTitles,
    '高级家居',
    'https://unsplash.com/s/photos/luxury-home-interior',
    'center center'
  ),
  ...buildItems(
    'street',
    streetTitles,
    '欧洲街景',
    'https://unsplash.com/s/photos/european-street',
    'center center'
  ),
  ...buildItems(
    'fashion',
    fashionTitles,
    '时尚人像',
    'https://unsplash.com/s/photos/fashion-portrait-editorial',
    'center top'
  ),
  ...buildItems(
    'cozy',
    cozyTitles,
    '居家美景',
    'https://unsplash.com/s/photos/cozy-home-decor',
    'center center'
  ),
];

export const homeMediaItems = galleryItems;

const MediaWall = ({
  items,
  favoriteIds,
  onToggleFavorite,
  onPreviewItem,
  emptyTitle,
}: {
  items: HomeMediaItem[];
  favoriteIds: string[];
  onToggleFavorite: (itemId: string) => void;
  onPreviewItem: (item: HomeMediaItem) => void;
  emptyTitle?: string;
}) => {
  if (!items.length) {
    return (
      <div className="vx-empty-state flex min-h-[240px] items-center justify-center rounded-[1.75rem] px-8 py-12 text-center">
        <div className="space-y-3">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/5">
            <Sparkles className="h-6 w-6 text-white/70" />
          </div>
          <div className="text-xl font-semibold text-[var(--vx-text)]">{emptyTitle ?? '暂无素材'}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-5">
      {items.map(item => {
        const isFavorite = favoriteIds.includes(item.id);

        return (
          <article
            key={item.id}
            className="group vx-panel-soft overflow-hidden rounded-[1.7rem] border border-white/8 transition-all duration-300 hover:-translate-y-1 hover:border-white/14 hover:shadow-[0_18px_40px_rgba(0,0,0,0.18)]"
          >
            <button
              type="button"
              onClick={() => onPreviewItem(item)}
              className="block w-full overflow-hidden bg-[rgba(9,12,18,0.85)]"
            >
              <img
                src={item.src}
                alt={item.title}
                loading="lazy"
                className="aspect-[4/5] w-full object-cover transition duration-500 group-hover:scale-[1.02]"
                style={{ objectPosition: item.objectPosition ?? 'center center' }}
              />
            </button>

            <div className="flex items-center justify-between gap-3 px-4 pb-4 pt-3">
              <div className="min-w-0">
                <div className="truncate text-[15px] font-semibold text-white">{item.title}</div>
                <div className="mt-1 text-[12px] text-[var(--vx-text-muted)]">{item.category}</div>
              </div>

              <button
                type="button"
                onClick={() => onToggleFavorite(item.id)}
                className={`shrink-0 rounded-full border p-2 transition-all ${
                  isFavorite
                    ? 'border-[rgba(124,92,255,0.34)] bg-[rgba(124,92,255,0.18)] text-white'
                    : 'border-white/10 bg-white/5 text-white/72 hover:border-white/18 hover:bg-white/8 hover:text-white'
                }`}
                aria-label={isFavorite ? '取消收藏' : '加入收藏'}
              >
                <Heart className={`h-4 w-4 ${isFavorite ? 'fill-current' : ''}`} />
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
};

export function HomePage({
  onNavigateEntry,
  items,
  favoriteIds,
  onToggleFavorite,
  onPreviewItem,
}: HomePageProps) {
  const galleryRef = useRef<HTMLDivElement | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<HomeFilterCategory>('All');

  const filteredItems = useMemo(() => {
    if (selectedCategory === 'All') {
      return items;
    }

    return items.filter(item => item.category === selectedCategory);
  }, [items, selectedCategory]);

  const scrollToGallery = () => {
    galleryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <section id="home-workspace" className="space-y-7">
      <div className="space-y-2">
        <h1 className="text-[30px] font-black tracking-tight text-white sm:text-[38px]">
          创作，发现无限可能 <span className="text-[#f6c546]">✨</span>
        </h1>
        <p className="text-[15px] leading-7 text-[var(--vx-text-soft)]">
          探索灵感、生成图像、创作属于你的视觉作品
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.64fr)_minmax(0,0.96fr)]">
        <div className="vx-panel relative overflow-hidden rounded-[1.9rem] p-7">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(124,92,255,0.18),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(76,195,255,0.12),transparent_34%)]" />
          <div className="relative grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[13px] font-semibold text-white/80">
                <Sparkles className="h-4 w-4 text-cyan-300" />
                AI VXStudio
              </div>

              <div className="space-y-3">
                <h2 className="max-w-xl text-[30px] font-black leading-[1.12] tracking-tight text-white sm:text-[38px]">
                  释放你的想象力
                </h2>
                <p className="max-w-xl text-[15px] leading-7 text-[var(--vx-text-soft)]">
                  使用 AI 创造令人惊叹的视觉作品
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => onNavigateEntry('single')}
                  className="vx-button-primary inline-flex items-center gap-2 rounded-2xl px-6 py-3 text-[15px] font-bold"
                >
                  开始创作
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={scrollToGallery}
                  className="vx-button-secondary inline-flex items-center gap-2 rounded-2xl px-6 py-3 text-[15px] font-bold"
                >
                  探索作品
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="overflow-hidden rounded-[1.65rem] border border-white/10 bg-[rgba(9,12,18,0.92)]">
              <img
                src={heroImage}
                alt="Cyberpunk city street"
                className="aspect-[4/3] w-full object-cover"
              />
            </div>
          </div>
        </div>

        <aside className="vx-panel rounded-[1.9rem] p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="vx-icon-surface rounded-2xl p-3">
              <Wand2 className="h-5 w-5" />
            </div>
            <h3 className="text-[18px] font-black text-white">快速开始</h3>
          </div>

          <div className="grid grid-cols-3 items-stretch gap-4">
            {quickStartCards.slice(0, 3).map(card => {
              const Icon = card.icon;
              const copy = quickStartCardCopy[card.key] || {
                title: card.title,
                description: card.description,
              };

              return (
                <button
                  key={card.key}
                  type="button"
                  onClick={() => onNavigateEntry(card.key)}
                  className="group flex min-h-[196px] flex-col rounded-[1.55rem] border border-white/8 bg-[rgba(10,13,20,0.76)] px-5 py-[18px] text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-all duration-300 hover:-translate-y-1 hover:border-white/14 hover:bg-[rgba(13,17,26,0.88)]"
                >
                  <div
                    className={`mb-5 inline-flex h-12 w-12 items-center justify-center rounded-[1rem] bg-gradient-to-br ${card.accent}`}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                  </div>
                  <div className="flex flex-1 flex-col">
                    <h4 className="text-[15px] font-black leading-6 text-white">{copy.title}</h4>
                    <p className="mt-3 min-h-[64px] text-[13px] leading-[1.65] text-[var(--vx-text-soft)]">
                      {copy.description}
                    </p>
                  </div>
                  <div className="mt-auto inline-flex items-center gap-1.5 pt-4 text-[13px] font-semibold text-[#5dc9ff]">
                    立即进入
                    <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1" />
                  </div>
                </button>
              );
            })}
          </div>
        </aside>
      </div>

      <div className="flex flex-wrap gap-3">
        {categoryTags.map(tag => {
          const Icon = tag.icon;
          const isActive = selectedCategory === tag.label;

          return (
            <button
              key={tag.label}
              type="button"
              onClick={() => setSelectedCategory(tag.label)}
              className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-[14px] font-semibold transition-all ${
                isActive
                  ? 'border-transparent bg-[linear-gradient(135deg,#6f55ff,#7c5cff_52%,#4cc3ff)] text-white shadow-[0_14px_30px_rgba(92,76,255,0.24)]'
                  : 'border-white/10 bg-white/[0.045] text-[var(--vx-text-soft)] hover:border-white/16 hover:bg-white/[0.07] hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tag.label}
            </button>
          );
        })}
      </div>

      <div id="featured-works" ref={galleryRef} className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <h2 className="text-[18px] font-black text-white sm:text-[20px]">精选作品</h2>
            <ChevronRight className="h-4 w-4 text-[var(--vx-text-muted)]" />
          </div>

          {selectedCategory !== 'All' && (
            <button
              type="button"
              onClick={() => setSelectedCategory('All')}
              className="vx-button-secondary inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-[13px] font-semibold"
            >
              查看全部
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <MediaWall
          items={filteredItems}
          favoriteIds={favoriteIds}
          onToggleFavorite={onToggleFavorite}
          onPreviewItem={onPreviewItem}
          emptyTitle="当前类目下暂无素材"
        />
      </div>
    </section>
  );
}

export function FavoritesPage({
  onBackHome,
  items,
  favoriteIds,
  onToggleFavorite,
  onPreviewItem,
}: FavoritesPageProps) {
  const favoriteItems = useMemo(
    () => items.filter(item => favoriteIds.includes(item.id)),
    [favoriteIds, items]
  );

  return (
    <section className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[34px] font-black tracking-tight text-white sm:text-[40px]">我的收藏</h1>
        </div>

        <button
          type="button"
          onClick={onBackHome}
          className="vx-button-primary inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-[15px] font-bold"
        >
          返回 Home
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      {!favoriteItems.length ? (
        <div className="vx-panel flex min-h-[240px] items-center justify-center rounded-[2rem] px-8 py-12">
          <div className="space-y-5 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/5">
              <Heart className="h-8 w-8 text-white/80" />
            </div>
            <h2 className="text-[28px] font-black text-white">暂无收藏</h2>
            <button
              type="button"
              onClick={onBackHome}
              className="vx-button-secondary inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-[14px] font-semibold"
            >
              返回 Home
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        <MediaWall
          items={favoriteItems}
          favoriteIds={favoriteIds}
          onToggleFavorite={onToggleFavorite}
          onPreviewItem={onPreviewItem}
        />
      )}
    </section>
  );
}
