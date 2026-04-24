import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AdminSessionResponse, apiGet, apiPost, AuthUser } from '../services/api';

interface AdminAuthContextValue {
  adminUser: AuthUser | null;
  isInitializing: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string, remember: boolean) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export const AdminAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [adminUser, setAdminUser] = useState<AuthUser | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  const refreshAuth = useCallback(async () => {
    try {
      const session = await apiGet<AdminSessionResponse>('/api/auth/admin/me');
      setAdminUser(session.user);
    } catch {
      setAdminUser(null);
    }
  }, []);

  const login = useCallback(async (username: string, password: string, remember: boolean) => {
    const session = await apiPost<AdminSessionResponse>('/api/auth/admin/login', { username, password, remember });
    setAdminUser(session.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiPost('/api/auth/admin/logout');
    } finally {
      setAdminUser(null);
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
    const handleAuthChanged = () => {
      void refreshAuth();
    };

    const handleAdminAuthInvalid = () => {
      setAdminUser(null);
      setIsInitializing(false);
    };

    window.addEventListener('vxstudio:admin-auth-changed', handleAuthChanged as EventListener);
    window.addEventListener('vxstudio:admin-auth-invalid', handleAdminAuthInvalid as EventListener);

    return () => {
      window.removeEventListener('vxstudio:admin-auth-changed', handleAuthChanged as EventListener);
      window.removeEventListener('vxstudio:admin-auth-invalid', handleAdminAuthInvalid as EventListener);
    };
  }, [refreshAuth]);

  const value = useMemo<AdminAuthContextValue>(() => ({
    adminUser,
    isInitializing,
    isAuthenticated: Boolean(adminUser),
    login,
    logout,
    refreshAuth,
  }), [adminUser, isInitializing, login, logout, refreshAuth]);

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
};

export const useAdminAuth = () => {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error('useAdminAuth must be used within AdminAuthProvider');
  }

  return context;
};
