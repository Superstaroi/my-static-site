import React from 'react';
import { Sparkles } from 'lucide-react';

interface PlaceholderPageProps {
  title: string;
  description?: string;
}

export const PlaceholderPage: React.FC<PlaceholderPageProps> = ({
  title,
  description = '当前内容暂未开放，后续会在这里补充。',
}) => (
  <section className="space-y-8">
    <div className="space-y-2">
      <h1 className="text-[34px] font-black tracking-tight text-white sm:text-[40px]">{title}</h1>
      <p className="text-[15px] leading-7 text-[var(--vx-text-soft)]">
        这个入口已经可以正常进入，内容暂时留作后续扩展。
      </p>
    </div>

    <div className="vx-panel flex min-h-[360px] items-center justify-center rounded-[2rem] px-8 py-12">
      <div className="max-w-lg space-y-5 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/5">
          <Sparkles className="h-8 w-8 text-white/80" />
        </div>
        <div className="space-y-3">
          <h2 className="text-[28px] font-black text-white">内容暂无</h2>
          <p className="text-sm leading-7 text-[var(--vx-text-soft)]">{description}</p>
        </div>
      </div>
    </div>
  </section>
);
