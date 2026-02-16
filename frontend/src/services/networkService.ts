/**
 * Network Service
 *
 * Detects online/offline status and WiFi vs cellular connectivity.
 * Uses navigator.onLine + online/offline events + periodic health checks.
 */

import { getApiBaseUrl } from '../config/appConfig';

export type NetworkStatus = 'online' | 'offline';
export type ConnectionMode = 'wifi' | 'cellular' | 'unknown';

interface NetworkState {
  status: NetworkStatus;
  connectionMode: ConnectionMode;
  lastOnlineAt: number | null;
}

type NetworkListener = (state: NetworkState) => void;

class NetworkService {
  private state: NetworkState = {
    status: navigator.onLine ? 'online' : 'offline',
    connectionMode: 'unknown',
    lastOnlineAt: navigator.onLine ? Date.now() : null,
  };

  private listeners: NetworkListener[] = [];
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.detectConnectionMode();
    this.bindEvents();
    // Start periodic health checks (every 30s when online, every 10s when offline)
    this.startHealthChecks();
  }

  /** Current network state snapshot */
  getState(): Readonly<NetworkState> {
    return { ...this.state };
  }

  isOnline(): boolean {
    return this.state.status === 'online';
  }

  isWiFi(): boolean {
    return this.state.connectionMode === 'wifi';
  }

  /** Subscribe to state changes. Returns unsubscribe function. */
  subscribe(listener: NetworkListener): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }

  /** Force a connectivity check right now */
  async checkNow(): Promise<boolean> {
    const online = await this.pingHealth();
    this.updateStatus(online ? 'online' : 'offline');
    return online;
  }

  destroy() {
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
  }

  // --- Private ---

  private bindEvents() {
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);

    // Listen for connection changes (WiFi ↔ cellular)
    const conn = (navigator as any).connection;
    if (conn) {
      conn.addEventListener('change', this.handleConnectionChange);
    }
  }

  private handleOnline = () => {
    this.updateStatus('online');
    this.detectConnectionMode();
  };

  private handleOffline = () => {
    this.updateStatus('offline');
  };

  private handleConnectionChange = () => {
    this.detectConnectionMode();
    // Connection type change may mean we went offline/online
    this.checkNow();
  };

  private detectConnectionMode() {
    const conn = (navigator as any).connection;
    if (!conn) {
      this.state.connectionMode = 'unknown';
      return;
    }

    const type: string = conn.type || conn.effectiveType || '';
    if (type === 'wifi' || type === 'ethernet') {
      this.state.connectionMode = 'wifi';
    } else if (['cellular', '2g', '3g', '4g', '5g', 'slow-2g'].includes(type)) {
      this.state.connectionMode = 'cellular';
    } else {
      this.state.connectionMode = 'unknown';
    }
  }

  private updateStatus(status: NetworkStatus) {
    const changed = this.state.status !== status;
    this.state.status = status;

    if (status === 'online') {
      this.state.lastOnlineAt = Date.now();
    }

    if (changed) {
      console.log(`[Network] Status changed: ${status}`);
      this.notify();
    }
  }

  private notify() {
    const snapshot = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch (err) {
        console.error('[Network] Listener error:', err);
      }
    }
  }

  private startHealthChecks() {
    // Check every 30s — enough to detect connectivity issues
    // without burning battery/bandwidth
    this.healthCheckInterval = setInterval(() => {
      this.checkNow();
    }, 30000);
  }

  private async pingHealth(): Promise<boolean> {
    try {
      const baseUrl = getApiBaseUrl();
      // Use the parent URL's /health endpoint (strip /api)
      const healthUrl = baseUrl.replace(/\/api$/, '/health');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(healthUrl, {
        method: 'GET',
        signal: controller.signal,
        cache: 'no-store',
      });
      clearTimeout(timer);
      return res.ok;
    } catch {
      // If we can't reach our API, check navigator.onLine as fallback
      return navigator.onLine;
    }
  }
}

export const networkService = new NetworkService();
