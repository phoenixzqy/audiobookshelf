import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/authStore';
import { getApiBaseUrl, getConnectionType } from '../config/appConfig';
import api from '../api/client';

export default function LoginPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setAuth, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const apiUrl = getApiBaseUrl();

    try {
      // Clear any stale tokens before login attempt
      logout();

      const response = await api.post('/auth/login', { email, password });
      const { user, accessToken, refreshToken } = response.data.data;
      setAuth(user, accessToken, refreshToken);
      navigate('/');
    } catch (err: any) {
      const connType = getConnectionType();
      if (err.response) {
        // Server responded with an error status
        const status = err.response.status;
        const serverMsg = err.response.data?.error || err.response.statusText;
        setError(`[${status}] ${serverMsg} (${connType}→${apiUrl})`);
      } else if (err.request) {
        // Request was made but no response (network error)
        const msg = err.message || 'No response from server';
        setError(`Network error: ${msg} (${connType}→${apiUrl})`);
      } else {
        setError(`Error: ${err.message} (${connType}→${apiUrl})`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-indigo-400">🎧 {t('common.appName')}</h1>
          <p className="mt-2 text-gray-400">{t('auth.signInToAccount')}</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          {error && (
            <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded text-sm break-all select-text">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300">
                {t('auth.email')}
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder={t('auth.emailPlaceholder')}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300">
                {t('auth.password')}
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder={t('auth.passwordPlaceholder')}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? t('auth.signingIn') : t('auth.signIn')}
          </button>

          <p className="text-center text-sm text-gray-400">
            {t('auth.noAccount')}{' '}
            <Link to="/register" className="text-indigo-400 hover:text-indigo-300">
              {t('auth.register')}
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
