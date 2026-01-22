import axios from 'axios';
import { useAuthStore } from '../stores/authStore';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8080/api',
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
    // Refresh if less than 1 hour until expiry
    return timeUntilExpiry < 60 * 60 * 1000;
  } catch {
    return true; // If we can't decode, assume it needs refresh
  }
}

// Refresh token function
async function refreshAccessToken(): Promise<boolean> {
  const { refreshToken, updateTokens, logout } = useAuthStore.getState();

  if (!refreshToken) {
    return false;
  }

  try {
    const response = await axios.post(
      `${import.meta.env.VITE_API_URL || 'http://localhost:8080/api'}/auth/refresh`,
      { refreshToken }
    );

    const { accessToken: newAccessToken, refreshToken: newRefreshToken } = response.data.data;
    updateTokens(newAccessToken, newRefreshToken);
    return true;
  } catch (error) {
    logout();
    return false;
  }
}

// Request interceptor - add auth token and proactively refresh if expiring soon
api.interceptors.request.use(async (config) => {
  const { accessToken, refreshToken } = useAuthStore.getState();

  if (accessToken) {
    // Proactively refresh if token is expiring soon
    if (isTokenExpiringSoon(accessToken) && refreshToken) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        // Use the new token
        const { accessToken: newToken } = useAuthStore.getState();
        config.headers.Authorization = `Bearer ${newToken}`;
        return config;
      }
    }
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// Response interceptor - handle token refresh on 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

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
        window.location.href = '/login';
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
