export interface User {
  id: string;
  email: string;
  user_type: 'kid' | 'adult';
  role: 'admin' | 'user';
  display_name: string | null;
  config: Record<string, any>;
}

// Summary type for book listings (without full episodes array)
export interface AudiobookSummary {
  id: string;
  title: string;
  description: string | null;
  author: string | null;
  narrator: string | null;
  cover_url: string | null;
  book_type: 'adult' | 'kids';
  total_duration_seconds: number | null;
  episode_count: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

// Full audiobook with episodes (for detail/player pages)
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
  created_at: string;
  updated_at: string;
}

export interface Episode {
  index: number;
  title: string;
  file: string;
  duration: number;
}

export interface PlaybackHistory {
  id: string;
  user_id: string;
  book_id: string;
  current_time_seconds: number;
  episode_index: number;
  playback_rate: number;
  last_played_at: string;
  device_info: Record<string, any> | null;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}
