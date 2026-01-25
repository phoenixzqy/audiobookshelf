export interface RetryConfig {
  maxRetries: number;          // Default: 5
  retryInterval: number;       // Default: 2000ms
  onRetry?: (attempt: number, error: Error) => void;
  onSuccess?: (attempt: number) => void;
  onFailure?: (attempts: number, lastError: Error) => void;
}

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  attempts: number;
  totalDuration: number;
  lastError?: Error;
}

const DEFAULT_CONFIG: Required<RetryConfig> = {
  maxRetries: 5,
  retryInterval: 2000,
  onRetry: () => {},
  onSuccess: () => {},
  onFailure: () => {},
};

export class RetryManager {
  private config: Required<RetryConfig>;

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
  }

  /**
   * Execute an operation with retry logic
   * @param operation - Async function to execute
   * @returns Result with success status, data, attempts count, and duration
   */
  async execute<T>(operation: () => Promise<T>): Promise<RetryResult<T>> {
    const startTime = Date.now();
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const data = await operation();
        this.config.onSuccess(attempt);
        return {
          success: true,
          data,
          attempts: attempt + 1,
          totalDuration: Date.now() - startTime,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < this.config.maxRetries) {
          this.config.onRetry(attempt + 1, lastError);
          await this.delay(this.config.retryInterval);
        }
      }
    }

    this.config.onFailure(this.config.maxRetries + 1, lastError!);
    return {
      success: false,
      attempts: this.config.maxRetries + 1,
      totalDuration: Date.now() - startTime,
      lastError,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Convenience function for one-off retry operations
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config?: Partial<RetryConfig>
): Promise<RetryResult<T>> {
  const manager = new RetryManager(config);
  return manager.execute(operation);
}
