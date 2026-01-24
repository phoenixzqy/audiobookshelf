import { query } from '../config/database';
import { PlaybackHistory, HistorySyncRequest } from '../types';

class HistoryService {
  async syncHistory(
    userId: string,
    syncRequest: HistorySyncRequest
  ): Promise<PlaybackHistory> {
    const { bookId, currentTime, episodeIndex, playbackRate, lastPlayedAt, deviceInfo } = syncRequest;

    // Use PostgreSQL UPSERT with conflict resolution based on timestamp
    // Only update if client timestamp is newer than server timestamp
    const result = await query(
      `INSERT INTO playback_history (user_id, book_id, current_time_seconds, episode_index, playback_rate, last_played_at, device_info)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, book_id)
       DO UPDATE SET
         current_time_seconds = EXCLUDED.current_time_seconds,
         episode_index = EXCLUDED.episode_index,
         playback_rate = EXCLUDED.playback_rate,
         last_played_at = EXCLUDED.last_played_at,
         device_info = EXCLUDED.device_info
       WHERE playback_history.last_played_at < EXCLUDED.last_played_at
       RETURNING *`,
      [userId, bookId, currentTime, episodeIndex, playbackRate, new Date(lastPlayedAt), deviceInfo || null]
    );

    // If no rows returned, it means server had newer data - fetch and return it
    if (result.rows.length === 0) {
      const existing = await query(
        'SELECT * FROM playback_history WHERE user_id = $1 AND book_id = $2',
        [userId, bookId]
      );
      return existing.rows[0];
    }

    return result.rows[0];
  }

  async getHistory(userId: string, bookId?: string): Promise<PlaybackHistory[]> {
    if (bookId) {
      const result = await query(
        'SELECT * FROM playback_history WHERE user_id = $1 AND book_id = $2',
        [userId, bookId]
      );
      return result.rows;
    }

    const result = await query(
      'SELECT * FROM playback_history WHERE user_id = $1 ORDER BY last_played_at DESC',
      [userId]
    );

    return result.rows;
  }

  async getRecentHistory(userId: string, limit: number = 10): Promise<any[]> {
    const result = await query(
      `SELECT h.*, b.title, b.author, b.cover_url, b.episodes
       FROM playback_history h
       JOIN audiobooks b ON h.book_id = b.id
       WHERE h.user_id = $1
       ORDER BY h.last_played_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    return result.rows;
  }

  /**
   * Get the most recent history entry with full book details (for mini player startup)
   */
  async getMostRecentWithBook(userId: string): Promise<{ history: PlaybackHistory; book: any } | null> {
    const result = await query(
      `SELECT
        h.id, h.user_id, h.book_id, h.current_time_seconds, h.episode_index,
        h.playback_rate, h.last_played_at, h.device_info, h.created_at, h.updated_at,
        b.id as b_id, b.title, b.author, b.narrator, b.description, b.cover_url,
        b.episodes, b.book_type, b.created_at as b_created_at, b.updated_at as b_updated_at
       FROM playback_history h
       JOIN audiobooks b ON h.book_id = b.id
       WHERE h.user_id = $1
       ORDER BY h.last_played_at DESC
       LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    // Parse episodes JSON and calculate episode_count
    const episodes = typeof row.episodes === 'string' ? JSON.parse(row.episodes) : row.episodes;

    return {
      history: {
        id: row.id,
        user_id: row.user_id,
        book_id: row.book_id,
        current_time_seconds: row.current_time_seconds,
        episode_index: row.episode_index,
        playback_rate: row.playback_rate,
        last_played_at: row.last_played_at,
        device_info: row.device_info,
        created_at: row.created_at,
        updated_at: row.updated_at,
      },
      book: {
        id: row.b_id,
        title: row.title,
        author: row.author,
        narrator: row.narrator,
        description: row.description,
        cover_url: row.cover_url,
        episodes: episodes,
        episode_count: Array.isArray(episodes) ? episodes.length : 0,
        book_type: row.book_type,
        created_at: row.b_created_at,
        updated_at: row.b_updated_at,
      },
    };
  }

  /**
   * Get history for a specific book (for playerStore loadBook)
   */
  async getByBookId(userId: string, bookId: string): Promise<PlaybackHistory | null> {
    const result = await query(
      'SELECT * FROM playback_history WHERE user_id = $1 AND book_id = $2',
      [userId, bookId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get all history with book details pre-joined (for HistoryPage)
   */
  async getAllWithBooks(userId: string): Promise<any[]> {
    const result = await query(
      `SELECT
        h.id, h.user_id, h.book_id, h.current_time_seconds, h.episode_index,
        h.playback_rate, h.last_played_at, h.device_info, h.created_at, h.updated_at,
        b.id as b_id, b.title, b.author, b.cover_url, b.episodes, b.book_type
       FROM playback_history h
       JOIN audiobooks b ON h.book_id = b.id
       WHERE h.user_id = $1
       ORDER BY h.last_played_at DESC`,
      [userId]
    );

    return result.rows.map(row => {
      // Parse episodes JSON and calculate episode_count
      const episodes = typeof row.episodes === 'string' ? JSON.parse(row.episodes) : row.episodes;

      return {
        id: row.id,
        user_id: row.user_id,
        book_id: row.book_id,
        current_time_seconds: row.current_time_seconds,
        episode_index: row.episode_index,
        playback_rate: row.playback_rate,
        last_played_at: row.last_played_at,
        device_info: row.device_info,
        created_at: row.created_at,
        updated_at: row.updated_at,
        book: {
          id: row.b_id,
          title: row.title,
          author: row.author,
          cover_url: row.cover_url,
          episode_count: Array.isArray(episodes) ? episodes.length : 0,
          book_type: row.book_type,
        },
      };
    });
  }

  async deleteHistory(userId: string, bookId: string): Promise<void> {
    await query(
      'DELETE FROM playback_history WHERE user_id = $1 AND book_id = $2',
      [userId, bookId]
    );
  }
}

export const historyService = new HistoryService();
