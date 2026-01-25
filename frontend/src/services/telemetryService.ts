import api from '../api/client';
import type {
  TelemetryEvent,
  TelemetryErrorCategory,
  TelemetryOutcome,
  TelemetryLevel,
  TelemetryContext,
  TelemetryClient,
  TelemetryError,
} from '../types/telemetry';

const BATCH_SIZE = 10;
const FLUSH_INTERVAL_MS = 5000; // 5 seconds
const MAX_RETRIES = 5;

class TelemetryService {
  private sessionId: string;
  private eventQueue: TelemetryEvent[] = [];
  private flushTimeout: ReturnType<typeof setTimeout> | null = null;
  private isFlushing = false;

  constructor() {
    this.sessionId = this.generateSessionId();

    // Flush on page unload
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.flushSync();
      });
      window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          this.flush();
        }
      });
    }
  }

  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private getClientInfo(): TelemetryClient {
    if (typeof window === 'undefined') {
      return {
        userAgent: 'server',
        platform: 'server',
        language: 'en',
        screenSize: '0x0',
      };
    }

    const nav = navigator as Navigator & { connection?: { effectiveType?: string } };

    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      screenSize: `${window.screen.width}x${window.screen.height}`,
      connectionType: nav.connection?.effectiveType,
    };
  }

  /**
   * Track an error event - non-blocking, fire-and-forget
   */
  track(
    category: TelemetryErrorCategory,
    level: TelemetryLevel,
    context: TelemetryContext,
    outcome: TelemetryOutcome,
    error?: TelemetryError
  ): void {
    const event: TelemetryEvent = {
      category,
      level,
      sessionId: this.sessionId,
      context: {
        ...context,
        maxRetries: context.maxRetries ?? MAX_RETRIES,
      },
      error,
      client: this.getClientInfo(),
      outcome,
      clientTimestamp: new Date().toISOString(),
    };

    this.eventQueue.push(event);

    // Flush if batch size reached
    if (this.eventQueue.length >= BATCH_SIZE) {
      this.flush();
    } else {
      // Schedule flush
      this.scheduleFlush();
    }
  }

  private scheduleFlush(): void {
    if (this.flushTimeout) return;

    this.flushTimeout = setTimeout(() => {
      this.flush();
    }, FLUSH_INTERVAL_MS);
  }

  /**
   * Flush events asynchronously (fire and forget)
   */
  private async flush(): Promise<void> {
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }

    if (this.eventQueue.length === 0 || this.isFlushing) return;

    this.isFlushing = true;
    const events = [...this.eventQueue];
    this.eventQueue = [];

    // Fire and forget - don't await, don't block
    api.post('/telemetry/errors', { events }).catch(() => {
      // Silently fail - telemetry should never impact user experience
      // Could store in localStorage for retry later if needed
    }).finally(() => {
      this.isFlushing = false;
    });
  }

  /**
   * Synchronous flush using sendBeacon (for page unload)
   */
  private flushSync(): void {
    if (this.eventQueue.length === 0) return;

    const events = [...this.eventQueue];
    this.eventQueue = [];

    try {
      const payload = JSON.stringify({ events });
      navigator.sendBeacon('/api/telemetry/errors', new Blob([payload], { type: 'application/json' }));
    } catch {
      // Silently fail
    }
  }

  // ============================================
  // Convenience methods for common scenarios
  // ============================================

  /**
   * Track episode fetch error during transition
   */
  trackEpisodeFetchError(
    bookId: string,
    episodeIndex: number,
    retryAttempt: number,
    error: Error,
    outcome: 'retrying' | 'failure'
  ): void {
    this.track(
      'EPISODE_FETCH_FAILED',
      'error',
      { bookId, episodeIndex, retryAttempt },
      outcome,
      { message: error.message, stack: error.stack }
    );
  }

  /**
   * Track audio play error during transition
   */
  trackAudioPlayError(
    bookId: string,
    episodeIndex: number,
    retryAttempt: number,
    error: Error,
    outcome: 'retrying' | 'failure'
  ): void {
    this.track(
      'AUDIO_PLAY_FAILED',
      'error',
      { bookId, episodeIndex, retryAttempt },
      outcome,
      { message: error.message, stack: error.stack }
    );
  }

  /**
   * Track successful retry after failure(s)
   */
  trackRetrySuccess(
    bookId: string,
    episodeIndex: number,
    totalAttempts: number,
    totalDuration: number
  ): void {
    this.track(
      'RETRY_SUCCEEDED',
      'info',
      {
        bookId,
        episodeIndex,
        retryAttempt: totalAttempts - 1, // 0-indexed
        totalRetryDuration: totalDuration,
      },
      'success'
    );
  }

  /**
   * Track when all retries are exhausted
   */
  trackRetryExhausted(
    bookId: string,
    episodeIndex: number,
    totalDuration: number,
    lastError: Error
  ): void {
    this.track(
      'RETRY_EXHAUSTED',
      'error',
      {
        bookId,
        episodeIndex,
        retryAttempt: MAX_RETRIES,
        totalRetryDuration: totalDuration,
      },
      'failure',
      { message: lastError.message, stack: lastError.stack }
    );
  }

  /**
   * Track general media error
   */
  trackMediaError(
    bookId: string,
    episodeIndex: number,
    error: MediaError | null
  ): void {
    this.track(
      'MEDIA_ERROR',
      'error',
      { bookId, episodeIndex },
      'failure',
      {
        message: error?.message || 'Unknown media error',
        code: error?.code?.toString(),
      }
    );
  }

  /**
   * Get current session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }
}

// Singleton export
export const telemetryService = new TelemetryService();
