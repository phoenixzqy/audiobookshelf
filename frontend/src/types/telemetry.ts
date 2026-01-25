// Error categories for telemetry classification
export type TelemetryErrorCategory =
  | 'EPISODE_FETCH_FAILED'    // fetchEpisodeUrl API failure
  | 'EPISODE_URL_INVALID'     // URL returned but invalid
  | 'AUDIO_PLAY_FAILED'       // audio.play() promise rejection
  | 'AUDIO_LOAD_FAILED'       // Audio element failed to load
  | 'RETRY_EXHAUSTED'         // All retries failed
  | 'RETRY_SUCCEEDED'         // Succeeded after retry(s)
  | 'NETWORK_ERROR'           // General network failure
  | 'TIMEOUT_ERROR'           // Request timeout
  | 'MEDIA_ERROR'             // HTMLMediaElement error
  | 'PLAYBACK_INTERRUPTED';   // Playback stopped unexpectedly

export type TelemetryOutcome = 'success' | 'failure' | 'retrying' | 'abandoned';
export type TelemetryLevel = 'info' | 'warn' | 'error';

export interface TelemetryContext {
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
}

export interface TelemetryError {
  message: string;
  code?: string;
  stack?: string;
  httpStatus?: number;
}

export interface TelemetryClient {
  userAgent: string;
  platform: string;
  language: string;
  screenSize: string;
  connectionType?: string;
}

export interface TelemetryEvent {
  category: TelemetryErrorCategory;
  level: TelemetryLevel;
  sessionId: string;
  context: TelemetryContext;
  error?: TelemetryError;
  client: TelemetryClient;
  outcome: TelemetryOutcome;
  clientTimestamp: string;
}

export interface TelemetryRequest {
  events: TelemetryEvent[];
}

export interface TelemetryResponse {
  success: boolean;
  accepted: number;
  rejected: number;
  errors?: string[];
}
