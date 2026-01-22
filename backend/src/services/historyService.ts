import { query } from '../config/database';
import { PlaybackHistory, HistorySyncRequest } from '../types';

class HistoryService {
  async syncHistory(
    userId: string,
    syncRequest: HistorySyncRequest
  ): Promise<PlaybackHistory> {
    const { bookId, currentTime, episodeIndex, playbackRate, lastPlayedAt, deviceInfo } = syncRequest;

    // Check if history exists
    const existing = await query(
      'SELECT * FROM playback_history WHERE user_id = $1 AND book_id = $2',
      [userId, bookId]
    );

    if (existing.rows.length === 0) {
      // Create new history
      const result = await query(
        `INSERT INTO playback_history (user_id, book_id, current_time_seconds, episode_index, playback_rate, last_played_at, device_info)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [userId, bookId, currentTime, episodeIndex, playbackRate, new Date(lastPlayedAt), deviceInfo || null]
      );

      return result.rows[0];
    }

    // Conflict resolution: use most recent timestamp
    const serverHistory = existing.rows[0];
    const serverTime = new Date(serverHistory.last_played_at).getTime();
    const clientTime = new Date(lastPlayedAt).getTime();

    if (clientTime > serverTime) {
      // Client is newer - update server
      const result = await query(
        `UPDATE playback_history
         SET current_time_seconds = $1, episode_index = $2, playback_rate = $3, last_played_at = $4, device_info = $5
         WHERE user_id = $6 AND book_id = $7
         RETURNING *`,
        [currentTime, episodeIndex, playbackRate, new Date(lastPlayedAt), deviceInfo || null, userId, bookId]
      );

      return result.rows[0];
    }

    // Server is newer or equal - return server data
    return serverHistory;
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

  async deleteHistory(userId: string, bookId: string): Promise<void> {
    await query(
      'DELETE FROM playback_history WHERE user_id = $1 AND book_id = $2',
      [userId, bookId]
    );
  }
}

export const historyService = new HistoryService();
