import * as fs from 'fs';
import * as path from 'path';
import { query } from '../config/database';

interface CleanupResult {
  deletedFiles: string[];
  freedBytes: number;
  expiredTokensDeleted: number;
  dryRun: boolean;
}

class LogCleanupService {
  private readonly logsDir: string;
  private readonly DEFAULT_RETENTION_DAYS = 30;
  private cleanupTimeout: NodeJS.Timeout | null = null;

  constructor() {
    // Logs directory at repo root (not in backend folder)
    this.logsDir = path.resolve(__dirname, '..', '..', '..', 'logs');
  }

  /**
   * Delete expired refresh tokens from the database.
   * Without periodic cleanup, every login/refresh adds a row that stays forever.
   */
  async cleanupExpiredTokens(): Promise<number> {
    try {
      const result = await query('DELETE FROM refresh_tokens WHERE expires_at < NOW()');
      const count = result.rowCount ?? 0;
      if (count > 0) {
        console.log(`🗑️ Deleted ${count} expired refresh tokens`);
      }
      return count;
    } catch (err) {
      console.error('Failed to cleanup expired tokens:', err);
      return 0;
    }
  }

  /**
   * Clean up logs older than specified days
   */
  cleanup(retentionDays?: number, dryRun: boolean = false): CleanupResult {
    const days = retentionDays ?? this.DEFAULT_RETENTION_DAYS;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const result: CleanupResult = {
      deletedFiles: [],
      freedBytes: 0,
      expiredTokensDeleted: 0,
      dryRun,
    };

    if (!fs.existsSync(this.logsDir)) {
      return result;
    }

    try {
      const files = fs.readdirSync(this.logsDir)
        .filter(f => f.startsWith('telemetry-') && f.endsWith('.json'));

      for (const file of files) {
        // Extract date from filename: telemetry-YYYY-MM-DD.json
        const dateMatch = file.match(/telemetry-(\d{4}-\d{2}-\d{2})\.json/);
        if (!dateMatch) continue;

        const fileDate = new Date(dateMatch[1]);

        if (fileDate < cutoffDate) {
          const filePath = path.join(this.logsDir, file);

          try {
            const stats = fs.statSync(filePath);

            result.deletedFiles.push(file);
            result.freedBytes += stats.size;

            if (!dryRun) {
              fs.unlinkSync(filePath);
            }
          } catch (err) {
            console.error(`Failed to process file ${file}:`, err);
          }
        }
      }

      console.log(
        `🧹 Log cleanup ${dryRun ? '(dry run)' : ''}: ` +
        `deleted ${result.deletedFiles.length} files, ` +
        `freed ${(result.freedBytes / 1024).toFixed(2)} KB`
      );
    } catch (err) {
      console.error('Failed to cleanup logs:', err);
    }

    return result;
  }

  /**
   * Start scheduled cleanup (runs daily at 3 AM)
   */
  startScheduledCleanup(retentionDays?: number): void {
    // Run immediately on startup
    this.cleanup(retentionDays);
    this.cleanupExpiredTokens();

    // Schedule daily cleanup
    const scheduleNextCleanup = () => {
      const now = new Date();
      const next3AM = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + (now.getHours() >= 3 ? 1 : 0),
        3, 0, 0, 0
      );

      const msUntil3AM = next3AM.getTime() - now.getTime();

      this.cleanupTimeout = setTimeout(() => {
        this.cleanup(retentionDays);
        this.cleanupExpiredTokens();
        scheduleNextCleanup(); // Schedule next run
      }, msUntil3AM);
    };

    scheduleNextCleanup();
    console.log(`⏰ Scheduled cleanup: logs retention=${retentionDays ?? this.DEFAULT_RETENTION_DAYS} days, expired tokens daily`);
  }

  /**
   * Stop scheduled cleanup
   */
  stopScheduledCleanup(): void {
    if (this.cleanupTimeout) {
      clearTimeout(this.cleanupTimeout);
      this.cleanupTimeout = null;
    }
  }

  /**
   * Get the default retention days
   */
  getDefaultRetentionDays(): number {
    return this.DEFAULT_RETENTION_DAYS;
  }
}

// Singleton export
export const logCleanupService = new LogCleanupService();
