import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost, AuthSessionResponse, AuthUser, UserQuota } from '../services/api';

interface AuthContextValue {
  user: AuthUser | null;
  quota: UserQuota | null;
  isInitializing: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (username: string, password: string, remember: boolean) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
  refreshQuota: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [quota, setQuota] = useState<UserQuota | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  const refreshAuth = useCallback(async () => {
    try {
      const session = await apiGet<AuthSessionResponse>('/api/auth/front/me');
      setUser(session.user);
      setQuota(session.quota);
    } catch {
      setUser(null);
      setQuota(null);
    }
  }, []);

  const refreshQuota = useCallback(async () => {
    try {
      const nextQuota = await apiGet<UserQuota>('/api/user/quota');
      setQuota(nextQuota);
    } catch {
      setQuota(null);
    }
  }, []);

  const login = useCallback(async (username: string, password: string, remember: boolean) => {
    const session = await apiPost<AuthSessionResponse>('/api/auth/front/login', { username, password, remember });
    setUser(session.user);
    setQuota(session.quota);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiPost('/api/auth/front/logout');
    } finally {
      setUser(null);
      setQuota(null);
    }
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        await refreshAuth();
      } finally {
        setIsInitializing(false);
      }
    };

    void bootstrap();
  }, [refreshAuth]);

  useEffect(() => {
    const handleQuotaUpdated = () => {
      void refreshQuota();
    };

    const handleAuthChanged = () => {
      void refreshAuth();
    };

    const handleFrontAuthInvalid = () => {
      setUser(null);
      setQuota(null);
      setIsInitializing(false);
    };

    window.addEventListener('vxstudio:quota-updated', handleQuotaUpdated as EventListener);
    window.addEventListener('vxstudio:auth-changed', handleAuthChanged as EventListener);
    window.addEventListener('vxstudio:front-auth-invalid', handleFrontAuthInvalid as EventListener);

    return () => {
      window.removeEventListener('vxstudio:quota-updated', handleQuotaUpdated as EventListener);
      window.removeEventListener('vxstudio:auth-changed', handleAuthChanged as EventListener);
      window.removeEventListener('vxstudio:front-auth-invalid', handleFrontAuthInvalid as EventListener);
    };
  }, [refreshAuth, refreshQuota]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    quota,
    isInitializing,
    isAuthenticated: Boolean(user),
    isAdmin: user?.role === 'admin',
    login,
    logout,
    refreshAuth,
    refreshQuota,
  }), [isInitializing, login, logout, quota, refreshAuth, refreshQuota, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
};
