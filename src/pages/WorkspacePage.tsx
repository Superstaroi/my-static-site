import React from 'react';
import { Bell, ChevronDown, LogOut, UserCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import App from '../App';
import { useAuth } from '../auth/AuthContext';

const formatResetAt = (value?: string | null) => {
  if (!value) {
    return '--';
  }

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

interface WorkspacePageProps {
  entryMode:
    | 'home'
    | 'favorites'
    | 'single'
    | 'batch'
    | 'detail'
    | 'history'
    | 'uploads'
    | 'prompts'
    | 'styles'
    | 'text-to-image'
    | 'ai-video';
}

export const WorkspacePage: React.FC<WorkspacePageProps> = ({ entryMode }) => {
  const navigate = useNavigate();
  const { user, quota, logout } = useAuth();

  const totalAvailable = quota ? quota.dailyLimit + quota.bonusQuota : 0;
  const progressPercent =
    totalAvailable > 0
      ? Math.max(0, Math.min(100, Math.round(((quota?.remaining ?? 0) / totalAvailable) * 100)))
      : 0;
  const roleLabel = user?.role === 'admin' ? '管理员' : '普通用户';
  const quotaResetAtLabel = formatResetAt(quota?.resetAt);
  const avatarInitials = (user?.username || 'VX')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(segment => segment.charAt(0).toUpperCase())
    .join('') || 'VX';

  const handleNavigateEntry = (
    nextEntryMode:
      | 'home'
      | 'favorites'
      | 'single'
      | 'batch'
      | 'detail'
      | 'history'
      | 'uploads'
      | 'prompts'
      | 'styles'
      | 'text-to-image'
      | 'ai-video'
  ) => {
    const pathMap = {
      home: '/workspace/home',
      favorites: '/workspace/favorites',
      single: '/workspace/single',
      batch: '/workspace/batch',
      detail: '/workspace/detail-set',
      history: '/workspace/history',
      uploads: '/workspace/uploads',
      prompts: '/workspace/prompts',
      styles: '/workspace/styles',
      'text-to-image': '/workspace/text-to-image',
      'ai-video': '/workspace/ai-video',
    } as const;

    navigate(pathMap[nextEntryMode]);
  };

  return (
    <App
      entryMode={entryMode}
      onNavigateEntry={handleNavigateEntry}
      workspaceHeaderActions={
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            className="vx-button-secondary inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-white/10 px-0 transition"
            aria-label="通知"
            title="通知"
          >
            <Bell className="h-[18px] w-[18px]" />
          </button>
          <div
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-[linear-gradient(135deg,rgba(124,92,255,0.34),rgba(76,195,255,0.18))] text-[13px] font-black text-white shadow-[0_8px_22px_rgba(40,48,120,0.22)]"
            aria-label="当前用户头像"
            title={user?.username || '当前用户'}
          >
            {avatarInitials}
          </div>
          <button
            onClick={() => void logout()}
            className="vx-button-secondary inline-flex h-10 min-w-[116px] cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-medium transition disabled:cursor-not-allowed"
          >
            <LogOut className="h-4 w-4" />
            退出登录
          </button>
        </div>
      }
      workspaceSidebarFooter={
        <div className="space-y-2.5">
          <div className="rounded-[1.3rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-3.5 shadow-[0_16px_30px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.03)]">
            <p className="text-[10px] font-medium tracking-[0.06em] text-white/45">今日剩余次数</p>
            <div className="mt-2 flex items-end gap-1.5">
              <span className="text-[1.7rem] font-black leading-none text-white">
                {quota?.remaining ?? '--'}
              </span>
              <span className="pb-0.5 text-xs font-medium text-white/40">/ {totalAvailable || '--'}</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/8">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-400 via-violet-400 to-indigo-500 transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="mt-3 text-[11px] text-white/55">重置时间: {quotaResetAtLabel}</p>
          </div>

          <div className="flex items-center gap-3 rounded-[1.3rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] px-3.5 py-3 shadow-[0_16px_30px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.03)]">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/8 text-white/45">
              <UserCircle2 className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{user?.username || '当前用户'}</p>
              <p className="mt-0.5 text-[11px] text-white/50">{roleLabel}</p>
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 text-white/40" />
          </div>
        </div>
      }
    />
  );
};
