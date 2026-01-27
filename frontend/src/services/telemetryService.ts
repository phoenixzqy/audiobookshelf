import api from '../api/client';
import { getApiBaseUrl } from '../config/appConfig';
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
      navigator.sendBeacon(`${getApiBaseUrl()}/telemetry/errors`, new Blob([payload], { type: 'application/json' }));
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
   * Track general media error with full debugging context
   */
  trackMediaError(
    bookId: string,
    episodeIndex: number,
    error: MediaError | null,
    audioElement?: HTMLAudioElement | null,
    additionalContext?: Record<string, unknown>
  ): void {
    // Get buffered ranges as a string for debugging
    let bufferedRanges = '';
    if (audioElement?.buffered) {
      const ranges: string[] = [];
      for (let i = 0; i < audioElement.buffered.length; i++) {
        ranges.push(`${audioElement.buffered.start(i).toFixed(2)}-${audioElement.buffered.end(i).toFixed(2)}`);
      }
      bufferedRanges = ranges.join(', ');
    }

    // Build detailed context
    const context: Record<string, unknown> = {
      bookId,
      episodeIndex,
      // Full audio URL for debugging (may contain SAS token - will be logged server-side only)
      audioUrl: audioElement?.src || 'unknown',
      // Audio element state
      audioReadyState: audioElement?.readyState,
      audioNetworkState: audioElement?.networkState,
      audioDuration: audioElement?.duration,
      audioCurrentTime: audioElement?.currentTime,
      audioBuffered: bufferedRanges || 'none',
      audioPaused: audioElement?.paused,
      audioEnded: audioElement?.ended,
      audioError: audioElement?.error ? {
        code: audioElement.error.code,
        message: audioElement.error.message,
      } : null,
      ...additionalContext,
    };

    // Map error codes to human-readable messages
    const errorCodeMap: Record<number, string> = {
      1: 'MEDIA_ERR_ABORTED - Fetching aborted by user',
      2: 'MEDIA_ERR_NETWORK - Network error',
      3: 'MEDIA_ERR_DECODE - Decoding error',
      4: 'MEDIA_ERR_SRC_NOT_SUPPORTED - Source not supported',
    };

    const errorMessage = error?.code
      ? errorCodeMap[error.code] || `Unknown error code: ${error.code}`
      : 'Unknown media error';

    this.track(
      'MEDIA_ERROR',
      'error',
      context,
      'failure',
      {
        message: `MEDIA_ELEMENT_ERROR: ${errorMessage}`,
        code: error?.code?.toString(),
        mediaErrorCode: error?.code,
        mediaErrorMessage: error?.message || errorMessage,
      }
    );
  }

  /**
   * Track stalled recovery attempt
   */
  trackStalledRecovery(
    bookId: string,
    episodeIndex: number,
    audioElement: HTMLAudioElement | null,
    outcome: 'success' | 'failure',
    recoveryDuration: number
  ): void {
    let bufferedRanges = '';
    if (audioElement?.buffered) {
      const ranges: string[] = [];
      for (let i = 0; i < audioElement.buffered.length; i++) {
        ranges.push(`${audioElement.buffered.start(i).toFixed(2)}-${audioElement.buffered.end(i).toFixed(2)}`);
      }
      bufferedRanges = ranges.join(', ');
    }

    this.track(
      'STALLED_RECOVERY',
      outcome === 'success' ? 'info' : 'error',
      {
        bookId,
        episodeIndex,
        audioUrl: audioElement?.src || 'unknown',
        audioReadyState: audioElement?.readyState,
        audioNetworkState: audioElement?.networkState,
        audioCurrentTime: audioElement?.currentTime,
        audioBuffered: bufferedRanges || 'none',
        totalRetryDuration: recoveryDuration,
      },
      outcome
    );
  }

  /**
   * Track error recovery attempt (for handleError recovery)
   */
  trackErrorRecovery(
    bookId: string,
    episodeIndex: number,
    originalError: { code?: number; message?: string } | null,
    audioUrl: string,
    outcome: 'success' | 'failure',
    attempts: number,
    totalDuration: number
  ): void {
    this.track(
      'ERROR_RECOVERY',
      outcome === 'success' ? 'info' : 'error',
      {
        bookId,
        episodeIndex,
        audioUrl,
        retryAttempt: attempts,
        totalRetryDuration: totalDuration,
        originalErrorCode: originalError?.code,
        originalErrorMessage: originalError?.message,
      },
      outcome
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
