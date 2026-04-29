import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Database,
  Loader2,
  LogOut,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import { useAdminAuth } from '../auth/AdminAuthContext';
import {
  AdminUserRow,
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  ApiError,
  SystemConfigResponse,
  UsageLogRow,
} from '../services/api';

interface UsageLogResponse {
  items: UsageLogRow[];
  total: number;
}

type AdminSection = 'dashboard' | 'accounts' | 'users' | 'logs';

type UserDraft = {
  username: string;
  displayName: string;
  role: 'admin' | 'user';
  isActive: boolean;
  dailyLimit: number;
};

type AdminNoticeTone = 'success' | 'error' | 'info';

type AdminNotice = {
  id: number;
  tone: AdminNoticeTone;
  title: string;
  description?: string;
};

interface UsageSummaryItem {
  user_id: number;
  username: string;
  display_name?: string;
  total_used: number;
}

interface UsageSummaryResponse {
  days: number;
  items: UsageSummaryItem[];
}

const usageRangeOptions = [
  { value: 7, label: '近7天' },
  { value: 30, label: '近1个月' },
  { value: 90, label: '近3个月' },
] as const;

const chartColors = [
  '#7c3aed',
  '#0f766e',
  '#2563eb',
  '#f97316',
  '#dc2626',
  '#16a34a',
  '#0891b2',
  '#ca8a04',
  '#db2777',
  '#4f46e5',
  '#65a30d',
  '#be123c',
  '#0284c7',
  '#c2410c',
  '#0d9488',
  '#a21caf',
  '#1d4ed8',
  '#15803d',
];

const getChartColor = (index: number) => {
  if (index < chartColors.length) {
    return chartColors[index];
  }

  const hue = Math.round((index * 137.508 + 29) % 360);
  const saturation = 68 + (index % 3) * 6;
  const lightness = 38 + ((index * 7) % 12);
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
};

const actionTypeLabelMap: Record<string, string> = {
  generate_image: '图片生成',
  edit_image: '局部编辑',
  analyze_fingerprint: '提取特征',
  update_fingerprint: '更新指纹',
  analyze_identity: '身份识别',
  analyze_verify: '结果校验',
  normalize_copy: '文案整理',
  resolve_image_url: '远程参考图',
};

const sections: Array<{
  key: AdminSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: 'dashboard', label: '控制台', icon: Database },
  { key: 'accounts', label: '账号管理', icon: UserCog },
  { key: 'users', label: '用户管理', icon: Users },
  { key: 'logs', label: '使用日志', icon: BarChart3 },
];

const formatDateTime = (value?: string | null) => {
  if (!value) {
    return '--';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('zh-CN', {
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
};

const truncate = (value?: string | null, maxLength = 80) => {
  if (!value) {
    return '-';
  }

  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}...`;
};

const parseUsageLogPayload = (payload: unknown): Record<string, unknown> | null => {
  if (!payload) {
    return null;
  }

  if (typeof payload === 'string') {
    try {
      const parsed = JSON.parse(payload);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    } catch {
      return null;
    }
  }

  return typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : null;
};

const getUsageLogImageSizeLabel = (log: UsageLogRow) => {
  if (log.action_type !== 'generate_image' && log.action_type !== 'edit_image') {
    return '-';
  }

  const payload = parseUsageLogPayload(log.request_payload_json);
  const normalized = String(payload?.imageSize || '').trim().toUpperCase();
  return /^(1K|2K|4K)$/.test(normalized) ? normalized : '-';
};

const polarToCartesian = (cx: number, cy: number, radius: number, angleInDegrees: number) => {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;

  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians),
  };
};

const describeArc = (cx: number, cy: number, radius: number, startAngle: number, endAngle: number) => {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y} Z`;
};

const buttonBaseClass =
  'inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60';

const secondaryButtonClass = `${buttonBaseClass} border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50`;
const primaryButtonClass = `${buttonBaseClass} bg-slate-900 text-white hover:bg-slate-800`;

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100';

const selectClass = `${inputClass} cursor-pointer`;
const compactInputClass =
  'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100';
const compactSelectClass = `${compactInputClass} cursor-pointer`;
const compactButtonClass =
  'inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60';
const compactSecondaryButtonClass = `${compactButtonClass} border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50`;
const compactPrimaryButtonClass = `${compactButtonClass} bg-slate-900 text-white hover:bg-slate-800`;
const compactDangerButtonClass = `${compactButtonClass} border border-red-200 bg-white text-red-700 hover:bg-red-50`;

const noticeToneClassMap: Record<AdminNoticeTone, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  error: 'border-red-200 bg-red-50 text-red-900',
  info: 'border-slate-200 bg-white text-slate-900',
};

export const AdminPage: React.FC = () => {
  const { adminUser, logout } = useAdminAuth();
  const skipNextLogsReloadRef = useRef(true);
  const noticeIdRef = useRef(0);
  const noticeTimeoutsRef = useRef<Record<number, number>>({});
  const [activeSection, setActiveSection] = useState<AdminSection>('dashboard');
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [logs, setLogs] = useState<UsageLogRow[]>([]);
  const [systemConfig, setSystemConfig] = useState<SystemConfigResponse | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);
  const [actionType, setActionType] = useState('');
  const [successFilter, setSuccessFilter] = useState<'all' | 'success' | 'failure'>('all');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [search, setSearch] = useState('');
  const [usageRangeDays, setUsageRangeDays] = useState<7 | 30 | 90>(7);
  const [usageSummary, setUsageSummary] = useState<UsageSummaryItem[]>([]);
  const [loadingUsageSummary, setLoadingUsageSummary] = useState(false);
  const [hoveredPieUserId, setHoveredPieUserId] = useState<number | null>(null);
  const [hoveredBarUserId, setHoveredBarUserId] = useState<number | null>(null);
  const [notices, setNotices] = useState<AdminNotice[]>([]);
  const [newUser, setNewUser] = useState({
    username: '',
    display_name: '',
    password: '',
    daily_limit: 50,
    role: 'user' as 'admin' | 'user',
    is_active: true,
  });
  const [userDrafts, setUserDrafts] = useState<Record<number, UserDraft>>({});
  const [passwordDrafts, setPasswordDrafts] = useState<Record<number, string>>({});
  const [quotaDrafts, setQuotaDrafts] = useState<Record<number, string>>({});

  const dismissNotice = (noticeId: number) => {
    const timer = noticeTimeoutsRef.current[noticeId];
    if (timer) {
      window.clearTimeout(timer);
      delete noticeTimeoutsRef.current[noticeId];
    }
    setNotices(prev => prev.filter(notice => notice.id !== noticeId));
  };

  const pushNotice = (tone: AdminNoticeTone, title: string, description?: string) => {
    const nextId = noticeIdRef.current + 1;
    noticeIdRef.current = nextId;

    setNotices(prev => [...prev, { id: nextId, tone, title, description }]);
    noticeTimeoutsRef.current[nextId] = window.setTimeout(() => {
      dismissNotice(nextId);
    }, 3200);
  };

  const handleApiError = (
    err: unknown,
    fallback: string,
    options?: {
      keepBanner?: boolean;
      noticeTitle?: string;
    },
  ) => {
    const message = err instanceof ApiError ? err.message : fallback;

    if (options?.keepBanner) {
      setError(message);
    }

    pushNotice('error', options?.noticeTitle || '操作失败', message);
  };

  const syncDrafts = (items: AdminUserRow[]) => {
    const next: Record<number, UserDraft> = {};
    const nextQuotaDrafts: Record<number, string> = {};
    items.forEach(user => {
      next[user.id] = {
        username: user.username,
        displayName: user.display_name || '',
        role: user.role,
        isActive: user.is_active,
        dailyLimit: user.daily_limit,
      };
      nextQuotaDrafts[user.id] = String(user.bonus_quota ?? 0);
    });
    setUserDrafts(next);
    setQuotaDrafts(nextQuotaDrafts);
  };

  const loadUsersAndSystem = async () => {
    const [usersResponse, systemResponse] = await Promise.all([
      apiGet<{ items: AdminUserRow[] }>('/api/admin/users'),
      apiGet<SystemConfigResponse>('/api/admin/system/config'),
    ]);

    setUsers(usersResponse.items);
    syncDrafts(usersResponse.items);
    setSystemConfig(systemResponse);
  };

  const loadLogs = async (targetPage = page) => {
    setLoadingLogs(true);
    try {
      const params = new URLSearchParams({
        page: String(targetPage),
        pageSize: '20',
      });

      if (actionType) params.set('actionType', actionType);
      if (successFilter !== 'all') params.set('success', successFilter === 'success' ? 'true' : 'false');
      if (selectedUserId) params.set('userId', selectedUserId);

      const response = await apiGet<UsageLogResponse>(`/api/admin/usage-logs?${params.toString()}`);
      setLogs(response.items);
      setTotalLogs(response.total);
      return true;
    } catch (err) {
      handleApiError(err, '日志加载失败，请稍后重试。', { noticeTitle: '日志加载失败' });
      setLogs([]);
      setTotalLogs(0);
      return false;
    } finally {
      setLoadingLogs(false);
    }
  };

  const loadUsageSummary = async (days = usageRangeDays) => {
    setLoadingUsageSummary(true);
    try {
      const response = await apiGet<UsageSummaryResponse>(`/api/admin/usage-summary?days=${days}`);
      setUsageSummary(response.items);
      return true;
    } catch (err) {
      handleApiError(err, '统计图数据加载失败，请稍后重试。', { noticeTitle: '统计图加载失败' });
      setUsageSummary([]);
      return false;
    } finally {
      setLoadingUsageSummary(false);
    }
  };

  const refreshAll = async (targetPage = page, options?: { announce?: boolean }) => {
    setError('');
    setBootstrapping(true);
    try {
      const [, logsLoaded, usageLoaded] = await Promise.all([
        loadUsersAndSystem(),
        loadLogs(targetPage),
        activeSection === 'dashboard' ? loadUsageSummary(usageRangeDays) : Promise.resolve(true),
      ]);
      skipNextLogsReloadRef.current = true;
      if (options?.announce && logsLoaded && usageLoaded) {
        pushNotice('success', '后台数据已刷新');
      }
    } catch (err) {
      handleApiError(err, '后台数据加载失败，请稍后重试。', {
        keepBanner: true,
        noticeTitle: '后台数据加载失败',
      });
    } finally {
      setBootstrapping(false);
    }
  };

  useEffect(() => {
    void refreshAll(1);
  }, []);

  useEffect(() => {
    if (bootstrapping) {
      return;
    }

    if (skipNextLogsReloadRef.current) {
      skipNextLogsReloadRef.current = false;
      return;
    }

    void loadLogs(page);
  }, [actionType, selectedUserId, successFilter, page]);

  useEffect(() => {
    if (bootstrapping || activeSection !== 'dashboard') {
      return;
    }

    void loadUsageSummary(usageRangeDays);
  }, [activeSection, usageRangeDays]);

  useEffect(
    () => () => {
      Object.values(noticeTimeoutsRef.current).forEach(timer => window.clearTimeout(Number(timer)));
    },
    [],
  );

  const metrics = useMemo(
    () => ({
      totalUsers: users.length,
      activeUsers: users.filter(user => user.is_active).length,
      todayUsed: users.reduce((sum, user) => sum + user.today_used, 0),
      todayRemaining: users.reduce((sum, user) => sum + user.remaining, 0),
    }),
    [users],
  );

  const filteredUsers = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) {
      return users;
    }

    return users.filter(user =>
      user.username.toLowerCase().includes(keyword)
        || String(user.display_name || '').toLowerCase().includes(keyword)
        || user.role.toLowerCase().includes(keyword),
    );
  }, [search, users]);

  const accountSnapshots = useMemo(
    () =>
      users.map(user => ({
        id: user.id,
        username: user.username,
        displayName: user.display_name || '',
        dailyLimit: user.daily_limit,
      })),
    [users],
  );

  const usageColorMap = useMemo(() => {
    const map = new Map<number, string>();
    users.forEach((user, index) => {
      map.set(user.id, getChartColor(index));
    });
    return map;
  }, [users]);

  const todayUsageChart = useMemo(() => {
    const source = users
      .filter(user => user.today_used > 0)
      .map(user => ({
        userId: user.id,
        username: user.display_name || user.username,
        value: user.today_used,
        color: usageColorMap.get(user.id) || getChartColor(0),
      }));

    const total = source.reduce((sum, item) => sum + item.value, 0);
    let currentAngle = 0;

    return {
      total,
      items: source.map(item => {
        const sweep = total > 0 ? (item.value / total) * 360 : 0;
        const startAngle = currentAngle;
        const endAngle = currentAngle + sweep;
        currentAngle = endAngle;

        return {
          ...item,
          percentage: total > 0 ? (item.value / total) * 100 : 0,
          path: describeArc(110, 110, 86, startAngle, endAngle),
        };
      }),
    };
  }, [users, usageColorMap]);

  const hoveredPieItem = useMemo(
    () => todayUsageChart.items.find(item => item.userId === hoveredPieUserId) || null,
    [hoveredPieUserId, todayUsageChart],
  );

  const rangeUsageChart = useMemo(() => {
    const items = usageSummary.map((item, index) => ({
      userId: item.user_id,
      username: item.display_name || item.username,
      value: item.total_used,
      color: usageColorMap.get(item.user_id) || getChartColor(index),
    }));

    const max = Math.max(...items.map(item => item.value), 1);

    return {
      max,
      items,
    };
  }, [usageSummary, usageColorMap]);

  const hoveredBarItem = useMemo(
    () => rangeUsageChart.items.find(item => item.userId === hoveredBarUserId) || rangeUsageChart.items[0] || null,
    [hoveredBarUserId, rangeUsageChart],
  );

  const totalPages = Math.max(1, Math.ceil(totalLogs / 20));
  const actionTypes = useMemo(
    () => Array.from(new Set([...Object.keys(actionTypeLabelMap), ...logs.map(log => log.action_type)])),
    [logs],
  );

  const recentLogs = useMemo(() => logs.slice(0, 6), [logs]);

  const modelRows = useMemo(() => {
    const models = systemConfig?.models;
    return [
      { title: '图片生成模型', provider: 'Gemini', label: models?.imageGeneration?.label || '未配置', id: models?.imageGeneration?.id || '--' },
      { title: '图片校验模型', provider: 'Gemini', label: models?.imageVerification?.label || '未配置', id: models?.imageVerification?.id || '--' },
      { title: '指纹分析模型', provider: 'OpenAI', label: models?.fingerprintAnalysis?.label || '未配置', id: models?.fingerprintAnalysis?.id || '--' },
      { title: '身份识别模型', provider: 'OpenAI', label: models?.identityRecognition?.label || '未配置', id: models?.identityRecognition?.id || '--' },
    ];
  }, [systemConfig]);

  const patchDraft = (userId: number, patch: Partial<UserDraft>) => {
    setUserDrafts(prev => ({
      ...prev,
      [userId]: {
        username: prev[userId]?.username ?? '',
        displayName: prev[userId]?.displayName ?? '',
        role: prev[userId]?.role ?? 'user',
        isActive: prev[userId]?.isActive ?? true,
        dailyLimit: prev[userId]?.dailyLimit ?? 50,
        ...patch,
      },
    }));
  };

  const handleCreateUser = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiPost('/api/admin/users', newUser);
      setNewUser({ username: '', display_name: '', password: '', daily_limit: 50, role: 'user', is_active: true });
      await loadUsersAndSystem();
      setActiveSection('accounts');
      pushNotice('success', '新增用户成功', `账号 ${newUser.username.trim()} 已创建。`);
    } catch (err) {
      handleApiError(err, '创建用户失败，请稍后重试。', { noticeTitle: '新增用户失败' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveUser = async (userId: number) => {
    const draft = userDrafts[userId];
    if (!draft) {
      return;
    }

    const nextPassword = passwordDrafts[userId]?.trim();
    const nextQuotaTargetDraft = quotaDrafts[userId]?.trim() ?? '';
    const nextQuotaTarget = Number(nextQuotaTargetDraft);
    const shouldUpdateQuotaTarget =
      nextQuotaTargetDraft !== '' &&
      Number.isFinite(nextQuotaTarget) &&
      Math.floor(nextQuotaTarget) === nextQuotaTarget &&
      nextQuotaTarget >= 0;

    setSaving(true);
    setError('');
    try {
      await apiPatch(`/api/admin/users/${userId}`, {
        username: draft.username.trim(),
        display_name: draft.displayName.trim(),
        role: draft.role,
        is_active: draft.isActive,
        daily_limit: draft.dailyLimit,
      });
      if (nextPassword) {
        await apiPost(`/api/admin/users/${userId}/reset-password`, { password: nextPassword });
      }
      if (shouldUpdateQuotaTarget) {
        await apiPost(`/api/admin/users/${userId}/add-quota`, { target: nextQuotaTarget });
      }
      setPasswordDrafts(prev => ({ ...prev, [userId]: '' }));
      await loadUsersAndSystem();
      setPage(1);
      await loadLogs(1);
      pushNotice('success', '用户信息已保存', `账号 ${draft.username.trim() || userId} 的配置已更新。`);
    } catch (err) {
      handleApiError(err, '保存用户失败，请稍后重试。', { noticeTitle: '保存用户失败' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async (userId: number, username: string) => {
    if (!window.confirm(`确认删除账号 ${username} 吗？`)) {
      return;
    }

    setSaving(true);
    setError('');
    try {
      await apiDelete(`/api/admin/users/${userId}`);
      await loadUsersAndSystem();
      pushNotice('success', '删除用户成功', `账号 ${username} 已删除。`);
    } catch (err) {
      handleApiError(err, '删除账号失败，请稍后重试。', { noticeTitle: '删除用户失败' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f6fb] text-slate-900">
      <div className="w-full px-3 py-3 xl:px-4">
        <div className="grid gap-4 xl:grid-cols-[282px_minmax(0,1fr)]">
          <aside className="flex min-h-[calc(100vh-24px)] flex-col rounded-[2rem] bg-[#111827] px-5 py-6 text-white shadow-[0_24px_60px_rgba(15,23,42,0.2)]">
            <div className="border-b border-white/10 pb-6">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-900 shadow-md">
                  <img src="/favicon.svg" alt="VXStudio" className="h-8 w-8 rounded-lg" />
                </div>
                <div>
                  <p className="text-xl font-semibold">VXStudio</p>
                  <p className="text-xs text-slate-300">管理后台</p>
                </div>
              </div>
            </div>

            <div className="mt-8">
              <p className="mb-3 px-3 text-xs font-medium tracking-[0.2em] text-slate-400">核心功能</p>
              <div className="space-y-2">
                {sections.map(section => {
                  const Icon = section.icon;
                  const active = activeSection === section.key;

                  return (
                    <button
                      key={section.key}
                      type="button"
                      onClick={() => setActiveSection(section.key)}
                      className={`flex w-full cursor-pointer items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-medium transition ${
                        active
                          ? 'bg-violet-600 text-white shadow-[0_16px_35px_rgba(124,58,237,0.35)]'
                          : 'text-slate-200 hover:bg-white/8'
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-3 whitespace-nowrap">
                        <Icon className="h-4 w-4" />
                        {section.label}
                      </span>
                      <ChevronRight className={`h-4 w-4 transition ${active ? 'opacity-100' : 'opacity-40'}`} />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-auto rounded-[1.75rem] border border-white/10 bg-white/6 p-4">
              <p className="text-xs text-slate-400">当前管理员</p>
              <p className="mt-2 text-base font-semibold text-white">{adminUser?.username || 'admin'}</p>
              <p className="mt-1 text-xs text-slate-400">role=admin</p>
            </div>
          </aside>

          <main className="min-w-0 rounded-[2rem] border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.06)]">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 px-6 py-6 lg:px-8">
              <div>
                <h1 className="text-3xl font-bold text-slate-950">VXStudio 后台管理系统</h1>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPage(1);
                    void refreshAll(1, { announce: true });
                  }}
                  className={secondaryButtonClass}
                >
                  <RefreshCw className="h-4 w-4" />
                  刷新数据
                </button>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className={secondaryButtonClass}
                >
                  <LogOut className="h-4 w-4" />
                  退出后台
                </button>
              </div>
            </div>

            <div className="space-y-6 px-6 py-6 lg:px-8 lg:py-8">
              {error && (
                <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {activeSection === 'dashboard' && (
                <div className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {[
                      { label: '用户数量', value: metrics.totalUsers, icon: Users, accent: 'bg-amber-50 text-amber-600' },
                      { label: '启用用户', value: metrics.activeUsers, icon: CheckCircle2, accent: 'bg-emerald-50 text-emerald-600' },
                      { label: '今日使用', value: metrics.todayUsed, icon: Sparkles, accent: 'bg-sky-50 text-sky-600' },
                      { label: '今日剩余', value: metrics.todayRemaining, icon: Clock3, accent: 'bg-violet-50 text-violet-600' },
                    ].map(card => {
                      const Icon = card.icon;
                      return (
                        <div
                          key={card.label}
                          className="rounded-[1.8rem] border border-slate-200 bg-white px-5 py-5 shadow-[0_18px_45px_rgba(15,23,42,0.05)]"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${card.accent}`}>
                              <Icon className="h-5 w-5" />
                            </div>
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
                              统计
                            </span>
                          </div>
                          <p className="mt-6 text-sm text-slate-500">{card.label}</p>
                          <p className="mt-3 text-4xl font-bold tracking-tight text-slate-950">
                            {bootstrapping ? '--' : card.value}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  <div className="grid gap-6 xl:grid-cols-2">
                    <section className="min-h-[460px] rounded-[1.8rem] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
                      <div className="mb-5 flex items-center justify-between gap-3">
                        <div>
                          <h2 className="text-xl font-semibold text-slate-950">当日使用占比</h2>
                        </div>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
                          今日统计
                        </span>
                      </div>

                      {todayUsageChart.total <= 0 ? (
                        <div className="rounded-[1.4rem] border border-dashed border-slate-200 px-4 py-16 text-center text-sm text-slate-500">
                          今天还没有账号产生使用记录
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="relative mx-auto flex w-full max-w-[220px] items-center justify-center">
                            {hoveredPieItem && (
                              <div className="pointer-events-none absolute -top-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-white shadow-lg">
                                {hoveredPieItem.username} · {hoveredPieItem.value} 次
                              </div>
                            )}
                            <svg
                              viewBox="0 0 220 220"
                              className="h-[220px] w-[220px]"
                              onMouseLeave={() => setHoveredPieUserId(null)}
                            >
                              {todayUsageChart.items.map(item => (
                                item.percentage >= 100 ? (
                                  <circle
                                    key={item.userId}
                                    cx="110"
                                    cy="110"
                                    r="86"
                                    fill={item.color}
                                    className="cursor-pointer transition-opacity hover:opacity-90"
                                    onMouseEnter={() => setHoveredPieUserId(item.userId)}
                                  >
                                    <title>{`${item.username}：${item.value} 次`}</title>
                                  </circle>
                                ) : (
                                  <path
                                    key={item.userId}
                                    d={item.path}
                                    fill={item.color}
                                    className="cursor-pointer transition-opacity hover:opacity-90"
                                    onMouseEnter={() => setHoveredPieUserId(item.userId)}
                                  >
                                    <title>{`${item.username}：${item.value} 次`}</title>
                                  </path>
                                )
                              ))}
                              <circle cx="110" cy="110" r="46" fill="white" />
                              <text x="110" y="102" textAnchor="middle" className="fill-slate-500 text-[12px] font-medium">
                                今日总使用
                              </text>
                              <text x="110" y="126" textAnchor="middle" className="fill-slate-950 text-[24px] font-bold">
                                {todayUsageChart.total}
                              </text>
                            </svg>
                          </div>

                          <div className="space-y-2">
                            {todayUsageChart.items.map(item => (
                              <div
                                key={item.userId}
                                className="flex items-center justify-between gap-3 rounded-xl px-2 py-2"
                              >
                                <span className="inline-flex min-w-0 items-center gap-2 truncate text-sm text-slate-700">
                                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                                  {item.username}
                                </span>
                                <span className="shrink-0 text-sm font-medium text-slate-900">
                                  {item.value} 次 / {item.percentage.toFixed(1)}%
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </section>

                    <section className="min-h-[460px] rounded-[1.8rem] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
                      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h2 className="text-xl font-semibold text-slate-950">用户使用统计</h2>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {usageRangeOptions.map(option => (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => setUsageRangeDays(option.value)}
                              className={`inline-flex cursor-pointer items-center justify-center rounded-full px-3 py-1.5 text-xs font-medium transition ${
                                usageRangeDays === option.value
                                  ? 'bg-slate-900 text-white'
                                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {loadingUsageSummary ? (
                        <div className="flex items-center justify-center rounded-[1.4rem] border border-dashed border-slate-200 px-4 py-16 text-sm text-slate-500">
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          正在加载统计图...
                        </div>
                      ) : rangeUsageChart.items.every(item => item.value <= 0) ? (
                        <div className="rounded-[1.4rem] border border-dashed border-slate-200 px-4 py-16 text-center text-sm text-slate-500">
                          当前所选周期内还没有用户使用记录
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                            {hoveredBarItem ? (
                              <div className="flex items-center justify-between gap-3">
                                <span className="inline-flex min-w-0 items-center gap-2 truncate font-medium text-slate-900">
                                  <span
                                    className="h-2.5 w-2.5 rounded-full"
                                    style={{ backgroundColor: hoveredBarItem.color }}
                                  />
                                  {hoveredBarItem.username}
                                </span>
                                <span className="shrink-0">{hoveredBarItem.value} 次</span>
                              </div>
                            ) : (
                              <span>将鼠标放到统计条上即可查看该用户在当前周期的使用次数。</span>
                            )}
                          </div>

                          <div className="max-h-[320px] space-y-4 overflow-y-auto pr-1">
                            {rangeUsageChart.items.map(item => (
                              <div
                                key={item.userId}
                                className="cursor-pointer space-y-2"
                                onMouseEnter={() => setHoveredBarUserId(item.userId)}
                              >
                                <div className="flex items-center justify-between gap-3 text-sm">
                                  <span className="inline-flex min-w-0 items-center gap-2 truncate text-slate-700">
                                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                                    {item.username}
                                  </span>
                                  <span className="shrink-0 font-medium text-slate-900">{item.value} 次</span>
                                </div>
                                <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                                  <div
                                    className="h-full rounded-full transition-[width]"
                                    style={{
                                      width: `${Math.max((item.value / rangeUsageChart.max) * 100, item.value > 0 ? 8 : 0)}%`,
                                      backgroundColor: item.color,
                                    }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </section>
                  </div>

                  <div className="grid gap-6 2xl:grid-cols-[1.02fr_0.98fr]">
                    <section className="rounded-[1.8rem] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
                      <div className="mb-5 flex items-center justify-between">
                        <div>
                          <h2 className="text-xl font-semibold text-slate-950">模型信息</h2>
                        </div>
                        <div className="rounded-2xl bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">已配置模型</div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        {modelRows.map(model => (
                          <div key={model.title} className="rounded-[1.4rem] border border-slate-200 bg-slate-50 px-4 py-4">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-semibold text-slate-900">{model.title}</p>
                              <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-500">
                                {model.provider}
                              </span>
                            </div>
                            <p className="mt-4 text-base font-semibold text-slate-900">{model.label}</p>
                            <p className="mt-1 text-xs text-slate-500">model id：{model.id}</p>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="rounded-[1.8rem] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
                      <div className="mb-5 flex items-center justify-between">
                        <div>
                          <h2 className="text-xl font-semibold text-slate-950">最近日志</h2>
                        </div>
                        {loadingLogs && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
                      </div>

                      <div className="space-y-3">
                        {!loadingLogs && recentLogs.length === 0 && (
                          <div className="rounded-[1.4rem] border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
                            暂无日志
                          </div>
                        )}

                        {recentLogs.map(log => (
                          <div
                            key={log.id}
                            className={`rounded-[1.4rem] border px-4 py-4 ${
                              log.success ? 'border-slate-200 bg-slate-50' : 'border-red-200 bg-red-50'
                            }`}
                          >
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                              <span className="text-slate-500">{formatDateTime(log.created_at)}</span>
                              <span className="font-medium text-slate-900">{log.display_name || log.username}</span>
                              <span className="text-slate-700">{actionTypeLabelMap[log.action_type] || log.action_type}</span>
                              <span className={log.success ? 'text-emerald-600' : 'text-red-700'}>
                                {log.success ? '成功' : '失败'}
                              </span>
                            </div>
                            {!log.success ? (
                              <p className="mt-3 text-xs text-red-700">失败摘要：{truncate(log.error_message, 88)}</p>
                            ) : (
                              <p className="mt-3 text-xs text-slate-500">已完成本次操作。</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>
                </div>
              )}

              {activeSection === 'accounts' && (
                <div className="grid gap-6 xl:grid-cols-[minmax(0,460px)_minmax(0,420px)] xl:justify-start">
                  <form
                    onSubmit={handleCreateUser}
                    className="space-y-5 rounded-[1.8rem] border border-slate-200 bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.05)]"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-xl font-semibold text-slate-950">新增账号</h2>
                        <p className="mt-1 text-sm text-slate-500">在这里创建新的普通用户或管理员账号。</p>
                      </div>
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
                        <UserCog className="h-5 w-5" />
                      </div>
                    </div>

                    <div className="grid gap-4">
                      <input
                        value={newUser.username}
                        onChange={event => setNewUser(prev => ({ ...prev, username: event.target.value }))}
                        placeholder="用户名"
                        className={inputClass}
                      />
                      <input
                        value={newUser.display_name}
                        onChange={event => setNewUser(prev => ({ ...prev, display_name: event.target.value }))}
                        placeholder="姓名"
                        className={inputClass}
                      />
                      <input
                        type="password"
                        value={newUser.password}
                        onChange={event => setNewUser(prev => ({ ...prev, password: event.target.value }))}
                        placeholder="密码"
                        className={inputClass}
                      />

                      <div className="grid gap-4 md:grid-cols-2">
                        <input
                          type="number"
                          min={1}
                          value={newUser.daily_limit}
                          onChange={event => setNewUser(prev => ({ ...prev, daily_limit: Number(event.target.value) || 0 }))}
                          placeholder="每日额度"
                          className={inputClass}
                        />
                        <select
                          value={newUser.role}
                          onChange={event => setNewUser(prev => ({ ...prev, role: event.target.value as 'admin' | 'user' }))}
                          className={selectClass}
                        >
                          <option value="user">普通用户</option>
                          <option value="admin">管理员</option>
                        </select>
                      </div>

                      <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={newUser.is_active}
                          onChange={event => setNewUser(prev => ({ ...prev, is_active: event.target.checked }))}
                          className="cursor-pointer"
                        />
                        创建后立即启用
                      </label>
                    </div>

                    <button type="submit" disabled={saving} className={`${primaryButtonClass} w-full`}>
                      创建账号
                    </button>
                  </form>

                  <section className="rounded-[1.8rem] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.05)] xl:max-w-[420px]">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h2 className="text-xl font-semibold text-slate-950">当前账号</h2>
                        <p className="mt-1 text-sm text-slate-500">这里列出当前所有账号名称和每日次数。</p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
                        共 {accountSnapshots.length} 个账号
                      </span>
                    </div>

                    <div className="mt-5 space-y-3">
                      {accountSnapshots.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
                          暂无账号
                        </div>
                      ) : (
                        accountSnapshots.map(account => (
                          <div
                            key={account.id}
                            className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                          >
                            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{account.username}</p>
                            <p className="min-w-0 flex-1 truncate text-sm text-slate-500">{account.displayName || '-'}</p>
                            <span className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                              {account.dailyLimit} 次/天
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </section>
                </div>
              )}

              {activeSection === 'users' && (
                  <section className="space-y-4 rounded-[1.8rem] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-semibold text-slate-950">用户列表</h2>
                    </div>

                      <label className="relative block w-full max-w-xs">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          value={search}
                          onChange={event => setSearch(event.target.value)}
                          placeholder="搜索用户名或角色"
                          className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm text-slate-800 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                        />
                      </label>
                    </div>

                    <div className="overflow-x-auto rounded-[1.5rem] border border-slate-200 bg-slate-50/30">
                      <table className="min-w-[1400px] table-fixed divide-y divide-slate-200 text-sm">
                        <thead className="sticky top-0 z-10 bg-slate-50 text-left text-slate-500">
                          <tr>
                            <th className="w-[154px] px-2.5 py-3 font-medium">用户名</th>
                            <th className="w-[130px] px-2.5 py-3 font-medium">姓名</th>
                            <th className="w-[116px] px-2.5 py-3 font-medium">角色</th>
                            <th className="w-[112px] px-2.5 py-3 font-medium">启用</th>
                            <th className="w-[96px] px-2.5 py-3 font-medium">每日额度</th>
                            <th className="w-[72px] px-2.5 py-3 font-medium">今日已用</th>
                            <th className="w-[80px] px-2.5 py-3 font-medium">今日剩余</th>
                            <th className="w-[174px] px-2.5 py-3 font-medium">新密码</th>
                            <th className="w-[132px] px-3 py-3 font-medium">今日额外次数</th>
                            <th className="w-[96px] px-3 py-3 font-medium">保存</th>
                            <th className="w-[96px] px-3 py-3 font-medium">删除</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {bootstrapping && filteredUsers.length === 0 && (
                            <tr>
                              <td colSpan={11} className="px-4 py-10 text-center text-slate-500">
                                正在加载用户数据...
                              </td>
                            </tr>
                          )}

                          {!bootstrapping && filteredUsers.length === 0 && (
                            <tr>
                              <td colSpan={11} className="px-4 py-10 text-center text-slate-500">
                                没有匹配的用户
                              </td>
                            </tr>
                          )}

                          {filteredUsers.map(user => {
                            const draft = userDrafts[user.id];
                            const activeState = draft?.isActive ?? user.is_active;

                            return (
                              <tr key={user.id} className="transition-colors hover:bg-slate-50/80">
                                <td className="px-2 py-2.5 align-middle">
                                  <input
                                    value={draft?.username ?? user.username}
                                    onChange={event => patchDraft(user.id, { username: event.target.value })}
                                    className={compactInputClass}
                                  />
                                </td>
                                <td className="px-2 py-2.5 align-middle">
                                  <input
                                    value={draft?.displayName ?? user.display_name ?? ''}
                                    onChange={event => patchDraft(user.id, { displayName: event.target.value })}
                                    className={compactInputClass}
                                  />
                                </td>
                                <td className="px-2 py-2.5 align-middle">
                                  <select
                                    value={draft?.role ?? user.role}
                                    onChange={event => patchDraft(user.id, { role: event.target.value as 'admin' | 'user' })}
                                    className={`${compactSelectClass} whitespace-nowrap`}
                                  >
                                    <option value="user">普通用户</option>
                                    <option value="admin">管理员</option>
                                  </select>
                                </td>
                                <td className="px-2 py-2.5 align-middle">
                                  <label className="flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm text-slate-700">
                                    <input
                                      type="checkbox"
                                      checked={activeState}
                                      onChange={event => patchDraft(user.id, { isActive: event.target.checked })}
                                      className="cursor-pointer"
                                    />
                                    {activeState ? '启用中' : '已禁用'}
                                  </label>
                                </td>
                                <td className="px-2 py-2.5 align-middle">
                                  <input
                                    type="number"
                                    min={1}
                                    value={draft?.dailyLimit ?? user.daily_limit}
                                    onChange={event => patchDraft(user.id, { dailyLimit: Number(event.target.value) || 0 })}
                                    className={compactInputClass}
                                  />
                                </td>
                                <td className="px-2 py-2.5 text-center align-middle text-slate-700">{user.today_used}</td>
                                <td className="px-2 py-2.5 text-center align-middle font-semibold text-slate-950">{user.remaining}</td>
                                <td className="px-2 py-2.5 align-middle">
                                  <input
                                    type="password"
                                    value={passwordDrafts[user.id] || ''}
                                    onChange={event => setPasswordDrafts(prev => ({ ...prev, [user.id]: event.target.value }))}
                                    placeholder="输入新密码"
                                    className={compactInputClass}
                                  />
                                </td>
                                <td className="px-3 py-2.5 align-middle">
                                  <input
                                    type="number"
                                    min={1}
                                    value={quotaDrafts[user.id] || ''}
                                    onChange={event => setQuotaDrafts(prev => ({ ...prev, [user.id]: event.target.value }))}
                                    placeholder="输入目标值"
                                    className={compactInputClass}
                                  />
                                </td>
                                <td className="px-3 py-2.5 align-middle">
                                  <button
                                    type="button"
                                    onClick={() => void handleSaveUser(user.id)}
                                    disabled={saving}
                                    className={`${compactPrimaryButtonClass} w-full`}
                                  >
                                    <CheckCircle2 className="h-4 w-4" />
                                    保存
                                  </button>
                                </td>
                                <td className="px-3 py-2.5 align-middle">
                                  <button
                                    type="button"
                                    onClick={() => void handleDeleteUser(user.id, user.username)}
                                    disabled={saving}
                                    className={`${compactDangerButtonClass} w-full`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    删除
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>
              )}

              {activeSection === 'logs' && (
                <section className="space-y-4 rounded-[1.8rem] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-semibold text-slate-950">使用日志</h2>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        void (async () => {
                          const ok = await loadLogs(page);
                          if (ok) {
                            pushNotice('success', '日志已刷新');
                          }
                        })()
                      }
                      className={secondaryButtonClass}
                    >
                      <RefreshCw className="h-4 w-4" />
                      刷新日志
                    </button>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-4">
                    <select
                      value={selectedUserId}
                      onChange={event => {
                        setSelectedUserId(event.target.value);
                        setPage(1);
                      }}
                      className={selectClass}
                    >
                      <option value="">全部用户</option>
                      {users.map(user => (
                        <option key={user.id} value={String(user.id)}>
                          {user.username}
                        </option>
                      ))}
                    </select>

                    <select
                      value={actionType}
                      onChange={event => {
                        setActionType(event.target.value);
                        setPage(1);
                      }}
                      className={selectClass}
                    >
                      <option value="">全部动作</option>
                      {actionTypes.map(type => (
                        <option key={type} value={type}>
                          {actionTypeLabelMap[type] || type}
                        </option>
                      ))}
                    </select>

                    <select
                      value={successFilter}
                      onChange={event => {
                        setSuccessFilter(event.target.value as 'all' | 'success' | 'failure');
                        setPage(1);
                      }}
                      className={selectClass}
                    >
                      <option value="all">全部结果</option>
                      <option value="success">仅成功</option>
                      <option value="failure">仅失败</option>
                    </select>

                    <div className="flex items-center justify-end rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-500">
                      共 {totalLogs} 条日志
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-[1.5rem] border border-slate-200">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-slate-50 text-left text-slate-500">
                        <tr>
                          <th className="px-4 py-3 font-medium">时间</th>
                          <th className="px-4 py-3 font-medium">姓名</th>
                          <th className="px-4 py-3 font-medium">动作</th>
                          <th className="px-4 py-3 font-medium">状态</th>
                          <th className="px-4 py-3 font-medium">规格</th>
                          <th className="px-4 py-3 font-medium">次数</th>
                          <th className="px-4 py-3 font-medium">错误摘要</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {loadingLogs && logs.length === 0 && (
                          <tr>
                            <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                              正在加载日志...
                            </td>
                          </tr>
                        )}

                        {!loadingLogs && logs.length === 0 && (
                          <tr>
                            <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                              暂无日志
                            </td>
                          </tr>
                        )}

                        {logs.map(log => (
                          <tr key={log.id} className={log.success ? 'bg-white' : 'bg-red-50/60'}>
                            <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDateTime(log.created_at)}</td>
                            <td className="px-4 py-3 font-medium text-slate-800">{log.display_name || log.username}</td>
                            <td className="px-4 py-3 text-slate-700">{actionTypeLabelMap[log.action_type] || log.action_type}</td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                  log.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                                }`}
                              >
                                {log.success ? '成功' : '失败'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-700">{getUsageLogImageSizeLabel(log)}</td>
                            <td className="px-4 py-3 text-slate-700">{log.quota_cost}</td>
                            <td className={`px-4 py-3 ${log.success ? 'text-slate-500' : 'text-red-700'}`}>
                              {log.success ? '-' : truncate(log.error_message, 180)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-slate-500">
                      第 {page} / {totalPages} 页
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setPage(prev => Math.max(1, prev - 1))}
                        disabled={page <= 1}
                        className={secondaryButtonClass}
                      >
                        上一页
                      </button>
                      <button
                        type="button"
                        onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={page >= totalPages}
                        className={secondaryButtonClass}
                      >
                        下一页
                      </button>
                    </div>
                  </div>
                </section>
              )}
            </div>
          </main>
        </div>
      </div>

      <div className="pointer-events-none fixed right-6 top-6 z-50 flex w-full max-w-sm flex-col gap-3">
        {saving && (
          <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在提交变更...
          </div>
        )}

        {notices.map(notice => (
          <div
            key={notice.id}
            className={`pointer-events-auto rounded-2xl border px-4 py-3 shadow-[0_18px_40px_rgba(15,23,42,0.12)] ${noticeToneClassMap[notice.tone]}`}
          >
            <div className="flex items-start gap-3">
              <div className="pt-0.5">
                {notice.tone === 'success' ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                ) : notice.tone === 'error' ? (
                  <AlertCircle className="h-5 w-5 text-red-600" />
                ) : (
                  <Sparkles className="h-5 w-5 text-slate-600" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{notice.title}</p>
                {notice.description && <p className="mt-1 text-sm opacity-80">{notice.description}</p>}
              </div>

              <button
                type="button"
                onClick={() => dismissNotice(notice.id)}
                className="pointer-events-auto inline-flex cursor-pointer items-center justify-center rounded-full p-1 text-slate-400 transition hover:bg-black/5 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
