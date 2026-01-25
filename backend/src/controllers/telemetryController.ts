import { Request, Response } from 'express';
import { telemetryLogger, TelemetryLogEntry } from '../services/telemetryLogger';
import { logCleanupService } from '../services/logCleanupService';

// Error categories for telemetry
export type TelemetryErrorCategory =
  | 'EPISODE_FETCH_FAILED'
  | 'EPISODE_URL_INVALID'
  | 'AUDIO_PLAY_FAILED'
  | 'AUDIO_LOAD_FAILED'
  | 'RETRY_EXHAUSTED'
  | 'RETRY_SUCCEEDED'
  | 'NETWORK_ERROR'
  | 'TIMEOUT_ERROR'
  | 'MEDIA_ERROR'
  | 'PLAYBACK_INTERRUPTED';

interface TelemetryEvent {
  category: TelemetryErrorCategory;
  level: 'info' | 'warn' | 'error';
  sessionId: string;
  context: {
    bookId?: string;
    bookTitle?: string;
    episodeIndex?: number;
    episodeId?: string;
    retryAttempt?: number;
    maxRetries?: number;
    totalRetryDuration?: number;
    [key: string]: unknown;
  };
  error?: {
    message: string;
    code?: string;
    stack?: string;
  };
  client: {
    userAgent?: string;
    platform?: string;
    language?: string;
    screenSize?: string;
    connectionType?: string;
  };
  outcome: 'success' | 'failure' | 'retrying' | 'abandoned';
  clientTimestamp?: string;
}

// Validation helper
const isValidEvent = (event: unknown): event is TelemetryEvent => {
  if (typeof event !== 'object' || event === null) return false;
  const e = event as Record<string, unknown>;
  return (
    typeof e.category === 'string' &&
    typeof e.sessionId === 'string' &&
    typeof e.context === 'object' &&
    typeof e.outcome === 'string'
  );
};

/**
 * POST /api/telemetry/errors
 * Receive telemetry events from client
 */
export const receiveErrors = async (req: Request, res: Response): Promise<void> => {
  try {
    const { events } = req.body;

    if (!Array.isArray(events)) {
      res.status(400).json({
        success: false,
        error: 'Invalid payload: events must be an array',
      });
      return;
    }

    let accepted = 0;
    let rejected = 0;
    const errors: string[] = [];

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      if (isValidEvent(event)) {
        const logEntry: TelemetryLogEntry = {
          timestamp: event.clientTimestamp || new Date().toISOString(),
          level: event.level || 'error',
          category: event.category,
          sessionId: event.sessionId,
          context: event.context,
          error: event.error,
          client: event.client || {},
          outcome: event.outcome,
        };
        telemetryLogger.log(logEntry);
        accepted++;
      } else {
        rejected++;
        errors.push(`Invalid event at index ${i}`);
      }
    }

    // Return 202 Accepted (processing is async)
    res.status(202).json({
      success: true,
      accepted,
      rejected,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Telemetry error:', error);
    // Still return 202 - don't let telemetry failures affect client
    res.status(202).json({ success: true, accepted: 0, rejected: 0 });
  }
};

/**
 * POST /api/telemetry/cleanup
 * Manually trigger log cleanup (admin only)
 */
export const cleanup = async (req: Request, res: Response): Promise<void> => {
  try {
    const { retentionDays, dryRun } = req.body;

    const result = logCleanupService.cleanup(
      typeof retentionDays === 'number' ? retentionDays : undefined,
      dryRun === true
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Cleanup error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Cleanup failed',
    });
  }
};

/**
 * GET /api/telemetry/stats
 * Get aggregated statistics (admin only)
 */
export const getStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const { days = '7' } = req.query;
    const numDays = Math.min(parseInt(days as string) || 7, 30);

    const stats = {
      period: {
        start: '',
        end: new Date().toISOString(),
      },
      totalEvents: 0,
      eventsByCategory: {} as Record<string, number>,
      eventsByOutcome: {} as Record<string, number>,
      retryStats: {
        averageRetries: 0,
        successAfterRetry: 0,
        failedAfterMaxRetries: 0,
      },
      topAffectedBooks: [] as Array<{ bookId: string; errorCount: number }>,
    };

    const bookErrors: Record<string, number> = {};
    let totalRetries = 0;
    let retryEvents = 0;

    // Calculate start date
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - numDays);
    stats.period.start = startDate.toISOString();

    // Iterate through recent log files
    const logFiles = telemetryLogger.getLogFiles();

    for (const file of logFiles) {
      const dateMatch = file.match(/telemetry-(\d{4}-\d{2}-\d{2})\.json/);
      if (!dateMatch) continue;

      const fileDate = new Date(dateMatch[1]);
      if (fileDate < startDate) continue;

      const entries = telemetryLogger.readLogFile(dateMatch[1]);

      for (const entry of entries) {
        stats.totalEvents++;

        // Count by category
        stats.eventsByCategory[entry.category] =
          (stats.eventsByCategory[entry.category] || 0) + 1;

        // Count by outcome
        stats.eventsByOutcome[entry.outcome] =
          (stats.eventsByOutcome[entry.outcome] || 0) + 1;

        // Track retries
        if (entry.context?.retryAttempt && typeof entry.context.retryAttempt === 'number' && entry.context.retryAttempt > 0) {
          totalRetries += entry.context.retryAttempt;
          retryEvents++;
        }

        if (entry.category === 'RETRY_SUCCEEDED') {
          stats.retryStats.successAfterRetry++;
        }
        if (entry.category === 'RETRY_EXHAUSTED') {
          stats.retryStats.failedAfterMaxRetries++;
        }

        // Track book errors
        if (entry.context?.bookId && typeof entry.context.bookId === 'string' && entry.level === 'error') {
          bookErrors[entry.context.bookId] =
            (bookErrors[entry.context.bookId] || 0) + 1;
        }
      }
    }

    // Calculate averages
    if (retryEvents > 0) {
      stats.retryStats.averageRetries = Math.round((totalRetries / retryEvents) * 100) / 100;
    }

    // Top affected books
    stats.topAffectedBooks = Object.entries(bookErrors)
      .map(([bookId, errorCount]) => ({ bookId, errorCount }))
      .sort((a, b) => b.errorCount - a.errorCount)
      .slice(0, 10);

    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    console.error('Stats error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get stats',
    });
  }
};
