import React from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AdminAuthProvider, useAdminAuth } from '../auth/AdminAuthContext';
import { AuthProvider, useAuth } from '../auth/AuthContext';
import { AdminLoginPage } from '../pages/AdminLoginPage';
import { AdminPage } from '../pages/AdminPage';
import { LoginPage } from '../pages/LoginPage';
import { WorkspacePage } from '../pages/WorkspacePage';

const LoadingScreen = () => (
  <div className="flex min-h-screen items-center justify-center text-slate-500">正在加载...</div>
);

const FrontAuthLayout: React.FC = () => (
  <AuthProvider>
    <Outlet />
  </AuthProvider>
);

const AdminAuthLayout: React.FC = () => (
  <AdminAuthProvider>
    <Outlet />
  </AdminAuthProvider>
);

const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isInitializing } = useAuth();

  if (isInitializing) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

const RequireAdminAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isInitializing } = useAdminAuth();

  if (isInitializing) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace />;
  }

  return <>{children}</>;
};

export const AppRouter: React.FC = () => (
  <BrowserRouter>
    <Routes>
      <Route element={<FrontAuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={(
            <RequireAuth>
              <Navigate to="/workspace/home" replace />
            </RequireAuth>
          )}
        />
        <Route
          path="/workspace/home"
          element={(
            <RequireAuth>
              <WorkspacePage entryMode="home" />
            </RequireAuth>
          )}
        />
        <Route
          path="/workspace/favorites"
          element={(
            <RequireAuth>
              <WorkspacePage entryMode="favorites" />
            </RequireAuth>
          )}
        />
        <Route
          path="/workspace/single"
          element={(
            <RequireAuth>
              <WorkspacePage entryMode="single" />
            </RequireAuth>
          )}
        />
        <Route
          path="/workspace/batch"
          element={(
            <RequireAuth>
              <WorkspacePage entryMode="batch" />
            </RequireAuth>
          )}
        />
        <Route
          path="/workspace/detail-set"
          element={(
            <RequireAuth>
              <WorkspacePage entryMode="detail" />
            </RequireAuth>
          )}
        />
        <Route
          path="/workspace/history"
          element={(
            <RequireAuth>
              <WorkspacePage entryMode="history" />
            </RequireAuth>
          )}
        />
        <Route
          path="/workspace/uploads"
          element={(
            <RequireAuth>
              <WorkspacePage entryMode="uploads" />
            </RequireAuth>
          )}
        />
        <Route
          path="/workspace/prompts"
          element={(
            <RequireAuth>
              <WorkspacePage entryMode="prompts" />
            </RequireAuth>
          )}
        />
        <Route
          path="/workspace/styles"
          element={(
            <RequireAuth>
              <WorkspacePage entryMode="styles" />
            </RequireAuth>
          )}
        />
        <Route
          path="/workspace/text-to-image"
          element={(
            <RequireAuth>
              <WorkspacePage entryMode="text-to-image" />
            </RequireAuth>
          )}
        />
        <Route
          path="/workspace/ai-video"
          element={(
            <RequireAuth>
              <WorkspacePage entryMode="ai-video" />
            </RequireAuth>
          )}
        />
      </Route>

      <Route path="/admin" element={<AdminAuthLayout />}>
        <Route path="login" element={<AdminLoginPage />} />
        <Route
          index
          element={(
            <RequireAdminAuth>
              <AdminPage />
            </RequireAdminAuth>
          )}
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </BrowserRouter>
);
