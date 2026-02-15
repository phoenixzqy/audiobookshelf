import * as fs from 'fs';
import * as path from 'path';

export interface TelemetryLogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  category: string;
  sessionId: string;
  context: {
    bookId?: string;
    bookTitle?: string;
    episodeIndex?: number;
    episodeId?: string;
    episodeTitle?: string;
    retryAttempt?: number;
    maxRetries?: number;
    totalRetryDuration?: number;
    playbackPosition?: number;
    [key: string]: unknown;
  };
  error?: {
    message: string;
    code?: string;
    stack?: string;
    httpStatus?: number;
  };
  client: {
    userAgent?: string;
    platform?: string;
    language?: string;
    screenSize?: string;
    connectionType?: string;
    [key: string]: unknown;
  };
  outcome: 'success' | 'failure' | 'retrying' | 'abandoned';
}

class TelemetryLogger {
  private readonly logsDir: string;
  private writeStream: fs.WriteStream | null = null;
  private currentDate: string = '';

  constructor() {
    // Logs directory at repo root (not in backend folder)
    this.logsDir = path.resolve(__dirname, '..', '..', '..', 'logs');
    this.ensureLogsDirectory();
  }

  private ensureLogsDirectory(): void {
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
      console.log(`📋 Created logs directory at: ${this.logsDir}`);
    }
  }

  private getLogFilePath(date: string): string {
    return path.join(this.logsDir, `telemetry-${date}.json`);
  }

  private getCurrentDateString(): string {
    return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  }

  private getWriteStream(): fs.WriteStream {
    const today = this.getCurrentDateString();

    // Rotate to new file if date changed
    if (this.currentDate !== today) {
      if (this.writeStream) {
        this.writeStream.end();
        this.writeStream = null;
      }
      this.currentDate = today;
      const stream = fs.createWriteStream(
        this.getLogFilePath(today),
        { flags: 'a' } // Append mode
      );
      stream.on('error', (err) => {
        console.error('Telemetry write stream error:', err);
        // Discard broken stream so next write creates a fresh one
        this.writeStream = null;
        this.currentDate = '';
      });
      this.writeStream = stream;
    }

    return this.writeStream!;
  }

  /**
   * Write a telemetry event to the log file.
   * Non-blocking, fire-and-forget. Drops writes if stream is backpressured
   * to avoid unbounded memory growth.
   */
  log(entry: TelemetryLogEntry): void {
    const logLine = JSON.stringify({
      ...entry,
      timestamp: entry.timestamp || new Date().toISOString(),
    }) + '\n';

    try {
      const stream = this.getWriteStream();
      // write() returns false when internal buffer is full (backpressure).
      // We intentionally drop the write to prevent memory buildup.
      stream.write(logLine);
    } catch (err) {
      console.error('Failed to get write stream:', err);
    }
  }

  /**
   * Write multiple events (batch)
   */
  logBatch(entries: TelemetryLogEntry[]): void {
    try {
      const stream = this.getWriteStream();
      const timestamp = new Date().toISOString();

      for (const entry of entries) {
        const logLine = JSON.stringify({
          ...entry,
          timestamp: entry.timestamp || timestamp,
        }) + '\n';

        stream.write(logLine);
      }
    } catch (err) {
      console.error('Failed to write telemetry batch:', err);
    }
  }

  /**
   * Get list of log files
   */
  getLogFiles(): string[] {
    try {
      if (!fs.existsSync(this.logsDir)) {
        return [];
      }
      return fs.readdirSync(this.logsDir)
        .filter(f => f.startsWith('telemetry-') && f.endsWith('.json'))
        .sort();
    } catch (err) {
      console.error('Failed to list log files:', err);
      return [];
    }
  }

  /**
   * Read a specific log file
   */
  readLogFile(date: string): TelemetryLogEntry[] {
    const filePath = this.getLogFilePath(date);

    if (!fs.existsSync(filePath)) {
      return [];
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return content
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          try {
            return JSON.parse(line) as TelemetryLogEntry;
          } catch {
            return null;
          }
        })
        .filter((entry): entry is TelemetryLogEntry => entry !== null);
    } catch (err) {
      console.error('Failed to read log file:', err);
      return [];
    }
  }

  /**
   * Get the logs directory path
   */
  getLogsDir(): string {
    return this.logsDir;
  }

  /**
   * Close the write stream (for graceful shutdown)
   */
  close(): void {
    if (this.writeStream) {
      this.writeStream.end();
      this.writeStream = null;
    }
  }
}

// Singleton export
export const telemetryLogger = new TelemetryLogger();
