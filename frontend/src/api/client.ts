import axios from 'axios';
import { useAuthStore } from '../stores/authStore';
import { getApiBaseUrl } from '../config/appConfig';
import { apiCacheService } from '../services/apiCacheService';
import { networkService } from '../services/networkService';

// Use dynamic URL - resolved at request time, not module load time
const api = axios.create({
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

// Request interceptor - set dynamic baseURL and handle auth tokens
api.interceptors.request.use(async (config) => {
  // Set baseURL dynamically (may change after LAN resolution)
  if (!config.baseURL) {
    config.baseURL = getApiBaseUrl();
  }

  // If offline and this is a GET request, try to serve from cache immediately
  if (!networkService.isOnline() && config.method === 'get' && config.url) {
    const cached = await apiCacheService.get(config.url);
    if (cached) {
      // Create an adapter that returns cached data without making a network request
      config.adapter = () => Promise.resolve({
        data: cached.data,
        status: 200,
        statusText: 'OK (offline cache)',
        headers: {},
        config,
      });
      return config;
    }
  }

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

// Response interceptor - handle token refresh on 401 + cache responses
api.interceptors.response.use(
  async (response) => {
    // Cache successful GET responses
    const url = response.config.url;
    if (response.config.method === 'get' && url && apiCacheService.shouldCache(url)) {
      apiCacheService.set(url, response.data);
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // If network error and we have a cached response, return it
    if (!error.response && originalRequest?.method === 'get' && originalRequest?.url) {
      const cached = await apiCacheService.get(originalRequest.url);
      if (cached) {
        console.log('[API] Serving from cache (network error):', originalRequest.url);
        return { data: cached.data, status: 200, statusText: 'OK (cached)', config: originalRequest, headers: {} };
      }
    }

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
