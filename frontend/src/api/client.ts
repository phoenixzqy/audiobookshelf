import axios from 'axios';
import { useAuthStore } from '../stores/authStore';
import { getApiBaseUrl } from '../config/appConfig';

// Use dynamic URL - from config.js in production, relative in dev (proxied)
const api = axios.create({
  baseURL: getApiBaseUrl(),
  headers: {
    'Content-Type': 'application/json',
  },
});

// Helper to decode JWT and check expiry
function isTokenExpiringSoon(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const expiresAt = payload.exp * 1000; // Convert to milliseconds
    const now = Date.now();
    const timeUntilExpiry = expiresAt - now;
    // Refresh if less than 5 minutes until expiry
    return timeUntilExpiry < 5 * 60 * 1000;
  } catch {
    return true; // If we can't decode, assume it needs refresh
  }
}

// Check if token is already expired
function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const expiresAt = payload.exp * 1000;
    return Date.now() >= expiresAt;
  } catch {
    return true;
  }
}

// Mutex for refresh operation to prevent concurrent refreshes
let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

// Refresh token function with mutex
async function refreshAccessToken(): Promise<boolean> {
  // If already refreshing, wait for that to complete
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  const { refreshToken, updateTokens, logout } = useAuthStore.getState();

  if (!refreshToken) {
    return false;
  }

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const response = await axios.post(`${getApiBaseUrl()}/auth/refresh`, { refreshToken });

      const { accessToken: newAccessToken, refreshToken: newRefreshToken } = response.data.data;
      updateTokens(newAccessToken, newRefreshToken);
      return true;
    } catch (error) {
      // Only logout if refresh actually failed (not network error)
      const axiosError = error as any;
      if (axiosError?.response?.status === 401 || axiosError?.response?.status === 403) {
        logout();
      }
      return false;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// Request interceptor - add auth token and proactively refresh if expiring soon
api.interceptors.request.use(async (config) => {
  // Skip token handling for auth endpoints (login, register, refresh)
  const isAuthEndpoint = config.url?.startsWith('/auth/');
  if (isAuthEndpoint) {
    return config;
  }

  const { accessToken, refreshToken } = useAuthStore.getState();

  if (accessToken) {
    // Don't try to refresh if token is already expired - let 401 handler deal with it
    // Only proactively refresh if token is expiring soon but not yet expired
    if (!isTokenExpired(accessToken) && isTokenExpiringSoon(accessToken) && refreshToken) {
      await refreshAccessToken();
      // Get the potentially updated token
      const { accessToken: currentToken } = useAuthStore.getState();
      config.headers.Authorization = `Bearer ${currentToken}`;
    } else {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
  }
  return config;
});

// Response interceptor - handle token refresh on 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Skip refresh handling for auth endpoints
    const isAuthEndpoint = originalRequest?.url?.startsWith('/auth/');
    if (isAuthEndpoint) {
      return Promise.reject(error);
    }

    // If 401 and we haven't tried to refresh yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      const refreshed = await refreshAccessToken();
      if (refreshed) {
        // Retry the original request with new token
        const { accessToken } = useAuthStore.getState();
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      } else {
        // Don't redirect if we're already on login page
        if (!window.location.pathname.includes('/login')) {
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
