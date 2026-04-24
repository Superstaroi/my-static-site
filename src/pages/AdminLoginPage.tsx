import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../services/api';
import { useAdminAuth } from '../auth/AdminAuthContext';
import { AuthShell } from './AuthShell';

export const AdminLoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated, isInitializing, login } = useAdminAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isInitializing && isAuthenticated) {
      navigate('/admin', { replace: true });
    }
  }, [isAuthenticated, isInitializing, navigate]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      await login(username, password, remember);
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '登录失败，请稍后重试。');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="登录"
      topCenterText="后台管理系统"
      usernameLabel="用户名"
      passwordLabel="密码"
      rememberLabel="记住登录"
      submitLabel="登录"
      username={username}
      password={password}
      remember={remember}
      submitting={submitting}
      error={error}
      onUsernameChange={setUsername}
      onPasswordChange={setPassword}
      onRememberChange={setRemember}
      onSubmit={handleSubmit}
    />
  );
};
