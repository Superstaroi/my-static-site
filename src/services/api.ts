export interface ApiErrorShape {
  code: string;
  message: string;
  detail?: unknown;
  details?: unknown;
}

export interface ApiRequestOptions extends RequestInit {
  signal?: AbortSignal;
}

const FRONT_AUTH_INVALID_EVENT = 'vxstudio:front-auth-invalid';
const ADMIN_AUTH_INVALID_EVENT = 'vxstudio:admin-auth-invalid';

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, payload: ApiErrorShape) {
    super(payload.message);
    this.status = status;
    this.code = payload.code;
    this.details = payload.detail ?? payload.details;
  }
}

const extractApiErrorPayload = (payload: unknown): ApiErrorShape => {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;

    if (record.success === false && typeof record.code === 'string' && typeof record.message === 'string') {
      return {
        code: record.code,
        message: record.message,
        detail: record.detail,
      };
    }

    if (record.error && typeof record.error === 'object') {
      const nested = record.error as Record<string, unknown>;
      if (typeof nested.code === 'string' && typeof nested.message === 'string') {
        return {
          code: nested.code,
          message: nested.message,
          detail: nested.detail ?? nested.details,
        };
      }
    }
  }

  return {
    code: 'HTTP_ERROR',
    message: typeof payload === 'string' ? payload : '请求失败，请稍后重试。',
  };
};

const parseResponse = async <T>(response: Response): Promise<T> => {
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text().catch(() => null);

  if (!response.ok) {
    throw new ApiError(response.status, extractApiErrorPayload(payload));
  }

  return payload as T;
};

const normalizeNetworkError = (error: unknown) => {
  const rawMessage = error instanceof Error ? error.message : String(error || '');
  const normalized = rawMessage.replace(/\s+/g, ' ').trim();
  const upper = normalized.toUpperCase();

  if (upper.includes('ABORT') || upper.includes('TIMEOUT')) {
    return new ApiError(504, {
      code: 'REQUEST_TIMEOUT',
      message: '请求超时，请稍后重试。',
      detail: { rawMessage: normalized },
    });
  }

  if (
    upper.includes('FETCH FAILED')
    || upper.includes('FAILED TO FETCH')
    || upper.includes('NETWORKERROR')
    || upper.includes('LOAD FAILED')
  ) {
    return new ApiError(503, {
      code: 'NETWORK_ERROR',
      message: '服务连接失败，请确认前后端已启动后重试。',
      detail: { rawMessage: normalized },
    });
  }

  return error;
};

const dispatchBrowserEvent = (eventName: string) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(eventName));
};

type AuthScope = 'front' | 'admin' | null;

const isIgnoredUnauthorizedPath = (path: string) =>
  path === '/api/auth/front/login'
  || path === '/api/auth/front/logout'
  || path === '/api/auth/admin/login'
  || path === '/api/auth/admin/logout';

const resolveAuthScope = (path: string): AuthScope => {
  if (path.startsWith('/api/admin/') || path.startsWith('/api/auth/admin/')) {
    return 'admin';
  }

  if (
    path.startsWith('/api/user/')
    || path === '/api/user'
    || path.startsWith('/api/generate/')
    || path.startsWith('/api/analyze/')
    || path.startsWith('/api/auth/front/')
  ) {
    return 'front';
  }

  return null;
};

const handleUnauthorizedByScope = (scope: AuthScope) => {
  if (typeof window === 'undefined' || !scope) {
    return;
  }

  const currentPath = window.location.pathname;
  const onAdminRoute = currentPath.startsWith('/admin');

  if (scope === 'front') {
    dispatchBrowserEvent(FRONT_AUTH_INVALID_EVENT);
    if (!onAdminRoute && currentPath !== '/login') {
      window.location.replace('/login');
    }
    return;
  }

  dispatchBrowserEvent(ADMIN_AUTH_INVALID_EVENT);
  if (onAdminRoute && currentPath !== '/admin/login') {
    window.location.replace('/admin/login');
  }
};

export const apiRequest = async <T>(path: string, init: ApiRequestOptions = {}): Promise<T> => {
  const { headers, ...restInit } = init;

  try {
    const response = await fetch(path, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(headers || {}),
      },
      ...restInit,
    });

    const payload = await parseResponse<T>(response);

    if (path.startsWith('/api/generate/') || path.startsWith('/api/analyze/')) {
      dispatchBrowserEvent('vxstudio:quota-updated');
    }

    if (path === '/api/auth/front/login' || path === '/api/auth/front/logout') {
      dispatchBrowserEvent('vxstudio:auth-changed');
    }

    if (path === '/api/auth/admin/login' || path === '/api/auth/admin/logout') {
      dispatchBrowserEvent('vxstudio:admin-auth-changed');
    }

    return payload;
  } catch (error) {
    const normalizedError = normalizeNetworkError(error);

    if (
      normalizedError instanceof ApiError
      && normalizedError.status === 401
      && !isIgnoredUnauthorizedPath(path)
    ) {
      handleUnauthorizedByScope(resolveAuthScope(path));
    }

    throw normalizedError;
  }
};

export const apiGet = <T>(path: string, init?: ApiRequestOptions) => apiRequest<T>(path, init);

export const apiPost = <T>(path: string, body?: unknown, init: ApiRequestOptions = {}) =>
  apiRequest<T>(path, {
    ...init,
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  });

export const apiPatch = <T>(path: string, body?: unknown, init: ApiRequestOptions = {}) =>
  apiRequest<T>(path, {
    ...init,
    method: 'PATCH',
    body: body === undefined ? undefined : JSON.stringify(body),
  });

export const apiDelete = <T>(path: string, init: ApiRequestOptions = {}) =>
  apiRequest<T>(path, {
    ...init,
    method: 'DELETE',
  });

export interface AuthUser {
  id: number;
  username: string;
  role: 'admin' | 'user';
  is_active: boolean;
}

export interface UserQuota {
  dailyLimit: number;
  todayUsed: number;
  bonusQuota: number;
  remaining: number;
  resetAt: string;
}

export interface AuthSessionResponse {
  user: AuthUser;
  quota: UserQuota;
}

export interface AdminSessionResponse {
  user: AuthUser;
}

export interface ModelStatus {
  id: string | null;
  label: string;
  configured: boolean;
  provider: 'gemini' | 'openai';
}

export interface SystemConfigResponse {
  geminiConfigured: boolean;
  openaiConfigured: boolean;
  imageGenerationModel: ModelStatus;
  imageVerificationModel: ModelStatus;
  fingerprintAnalysisModel: ModelStatus;
  identityAnalysisModel: ModelStatus;
  models: {
    imageGeneration: ModelStatus;
    imageVerification: ModelStatus;
    fingerprintAnalysis: ModelStatus;
    identityRecognition: ModelStatus;
  };
}

export interface ImageGenerationModelOption {
  key: 'image2' | 'banana2' | 'bananapro';
  label: string;
  provider: 'openai' | 'gemini';
  providerLabel: string;
  description: string;
  modelId: string;
  configured: boolean;
}

export interface AdminSettingsResponse {
  imageGenerationModel: ImageGenerationModelOption['key'];
  modelUsageConsoleLogEnabled: boolean;
  availableImageModels: ImageGenerationModelOption[];
}

export interface AdminUserRow {
  id: number;
  username: string;
  display_name: string;
  role: 'admin' | 'user';
  is_active: boolean;
  daily_limit: number;
  today_used: number;
  bonus_quota: number;
  remaining: number;
  created_at: string;
  updated_at: string;
  resetAt: string;
}

export interface UsageLogRow {
  id: number;
  user_id: number;
  username: string;
  display_name?: string;
  action_type: string;
  success: boolean;
  quota_cost: number;
  error_message: string | null;
  request_payload_json: unknown;
  response_summary_json: unknown;
  created_at: string;
  updated_at: string;
}

export type GenerationHistorySourceType = 'single' | 'batch' | 'detail' | 'unknown';

export interface GenerationHistoryItem {
  id: number;
  previewUrl: string;
  originalUrl?: string;
  sourceType: string | null;
  createdAt: string;
}
