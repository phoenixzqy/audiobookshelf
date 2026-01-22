import { Request } from 'express';

export interface User {
  id: string;
  email: string;
  password_hash: string;
  user_type: 'kid' | 'adult';
  role: 'admin' | 'user';
  display_name: string | null;
  config: Record<string, any>;
  created_at: Date;
  updated_at: Date;
  last_login: Date | null;
}

export interface Audiobook {
  id: string;
  title: string;
  description: string | null;
  author: string | null;
  narrator: string | null;
  cover_url: string | null;
  book_type: 'adult' | 'kids';
  storage_config_id: string;
  blob_path: string;
  total_duration_seconds: number | null;
  episodes: Episode[];
  metadata: Record<string, any>;
  is_published: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Episode {
  index: number;
  title: string;
  file: string;
  duration: number;
}

export interface StorageConfig {
  id: string;
  name: string;
  blob_endpoint: string;
  container_name: string;
  access_key_encrypted: string;
  is_primary: boolean;
  is_active: boolean;
  storage_quota_gb: number | null;
  current_usage_gb: number;
  created_at: Date;
  updated_at: Date;
}

export interface PlaybackHistory {
  id: string;
  user_id: string;
  book_id: string;
  current_time_seconds: number;
  episode_index: number;
  playback_rate: number;
  last_played_at: Date;
  device_info: Record<string, any> | null;
  created_at: Date;
  updated_at: Date;
}

export interface RefreshToken {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  created_at: Date;
}

export interface AdminLog {
  id: string;
  admin_id: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  details: Record<string, any> | null;
  created_at: Date;
}

// Request extensions
export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    user_type: 'kid' | 'adult';
    role: 'admin' | 'user';
  };
  contentFilter?: Record<string, any>;
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// Auth types
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  user_type: 'kid' | 'adult';
  display_name?: string;
}

export interface AuthResponse {
  user: Omit<User, 'password_hash'>;
  accessToken: string;
  refreshToken: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

// History sync types
export interface HistorySyncRequest {
  bookId: string;
  currentTime: number;
  episodeIndex: number;
  playbackRate: number;
  lastPlayedAt: string;
  deviceInfo?: Record<string, any>;
}
