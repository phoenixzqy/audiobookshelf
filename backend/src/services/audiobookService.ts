import { query } from '../config/database';
import { Audiobook, Episode } from '../types';

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

class AudiobookService {
  async createBook(
    title: string,
    bookType: 'adult' | 'kids',
    storageConfigId: string | null,
    blobPath: string,
    episodes: Episode[],
    options?: {
      description?: string;
      author?: string;
      narrator?: string;
      coverUrl?: string;
      metadata?: Record<string, any>;
      isPublished?: boolean;
    }
  ): Promise<Audiobook> {
    const totalDuration = episodes.reduce((sum, ep) => sum + ep.duration, 0);

    const result = await query(
      `INSERT INTO audiobooks (title, description, author, narrator, cover_url, book_type, storage_config_id, blob_path, total_duration_seconds, episodes, metadata, is_published)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        title,
        options?.description || null,
        options?.author || null,
        options?.narrator || null,
        options?.coverUrl || null,
        bookType,
        storageConfigId,
        blobPath,
        totalDuration,
        JSON.stringify(episodes),
        JSON.stringify(options?.metadata || {}),
        options?.isPublished !== undefined ? options.isPublished : true, // Published by default
      ]
    );

    return result.rows[0];
  }

  // Optimized listing - returns summary without full episodes array
  // Sorts by: 1) books with history (most recent first), 2) then by created_at desc
  async getBooks(filters?: {
    bookType?: 'adult' | 'kids';
    isPublished?: boolean;
    limit?: number;
    offset?: number;
    userId?: string; // For sorting by history
  }): Promise<{ books: AudiobookSummary[]; total: number }> {
    const limit = filters?.limit || 20;
    const offset = filters?.offset || 0;

    // Build conditions for WHERE clause
    const conditions: string[] = [];
    const conditionParams: any[] = [];

    if (filters?.bookType) {
      conditions.push(`book_type = $PLACEHOLDER`);
      conditionParams.push(filters.bookType);
    }

    if (filters?.isPublished !== undefined) {
      conditions.push(`is_published = $PLACEHOLDER`);
      conditionParams.push(filters.isPublished);
    }

    // For count query (no table alias needed)
    let countParamIndex = 1;
    const countWhereClause = conditions.length > 0
      ? `WHERE ${conditions.map(c => c.replace('$PLACEHOLDER', `$${countParamIndex++}`)).join(' AND ')}`
      : '';

    const countResult = await query(
      `SELECT COUNT(*) FROM audiobooks ${countWhereClause}`,
      conditionParams
    );

    const total = parseInt(countResult.rows[0].count);

    // If userId provided, sort by history (most recent first), then by created_at
    if (filters?.userId) {
      // Build WHERE clause with table alias 'a'
      let paramIndex = 1;
      const userIdParam = paramIndex++;

      const aliasedConditions = conditions.map(c =>
        c.replace('book_type', 'a.book_type')
         .replace('is_published', 'a.is_published')
         .replace('$PLACEHOLDER', `$${paramIndex++}`)
      );
      const whereClause = aliasedConditions.length > 0
        ? `WHERE ${aliasedConditions.join(' AND ')}`
        : '';

      const limitParam = paramIndex++;
      const offsetParam = paramIndex++;

      const result = await query(
        `SELECT
          a.id, a.title, a.description, a.author, a.narrator, a.cover_url, a.book_type,
          a.total_duration_seconds, a.is_published, a.created_at, a.updated_at,
          jsonb_array_length(a.episodes) as episode_count,
          h.last_played_at
         FROM audiobooks a
         LEFT JOIN playback_history h ON a.id = h.book_id AND h.user_id = $${userIdParam}
         ${whereClause}
         ORDER BY
           CASE WHEN h.last_played_at IS NOT NULL THEN 0 ELSE 1 END,
           h.last_played_at DESC NULLS LAST,
           a.created_at DESC
         LIMIT $${limitParam} OFFSET $${offsetParam}`,
        [filters.userId, ...conditionParams, limit, offset]
      );

      // Remove last_played_at from response (it's just for sorting)
      const books = result.rows.map(({ last_played_at, ...book }) => book);

      return {
        books,
        total,
      };
    }

    // Default sorting by created_at (no user context)
    let paramIndex = 1;
    const simpleConditions = conditions.map(c => c.replace('$PLACEHOLDER', `$${paramIndex++}`));
    const whereClause = simpleConditions.length > 0
      ? `WHERE ${simpleConditions.join(' AND ')}`
      : '';

    const limitParam = paramIndex++;
    const offsetParam = paramIndex++;

    const result = await query(
      `SELECT
        id, title, description, author, narrator, cover_url, book_type,
        total_duration_seconds, is_published, created_at, updated_at,
        jsonb_array_length(episodes) as episode_count
       FROM audiobooks ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      [...conditionParams, limit, offset]
    );

    return {
      books: result.rows,
      total,
    };
  }

  async getBookById(id: string): Promise<Audiobook | null> {
    const result = await query('SELECT * FROM audiobooks WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return null;
    }

    const book = result.rows[0];
    // Ensure episodes is always an array (handle case where JSONB might be null or string)
    if (!book.episodes) {
      book.episodes = [];
    } else if (typeof book.episodes === 'string') {
      book.episodes = JSON.parse(book.episodes);
    }
    // Same for metadata
    if (!book.metadata) {
      book.metadata = {};
    } else if (typeof book.metadata === 'string') {
      book.metadata = JSON.parse(book.metadata);
    }

    return book;
  }

  async updateBook(id: string, updates: Partial<Audiobook>): Promise<Audiobook> {
    const fields: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (updates.title !== undefined) {
      fields.push(`title = $${paramIndex++}`);
      params.push(updates.title);
    }

    if (updates.description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      params.push(updates.description);
    }

    if (updates.author !== undefined) {
      fields.push(`author = $${paramIndex++}`);
      params.push(updates.author);
    }

    if (updates.narrator !== undefined) {
      fields.push(`narrator = $${paramIndex++}`);
      params.push(updates.narrator);
    }

    if (updates.is_published !== undefined) {
      fields.push(`is_published = $${paramIndex++}`);
      params.push(updates.is_published);
    }

    if (updates.cover_url !== undefined) {
      fields.push(`cover_url = $${paramIndex++}`);
      params.push(updates.cover_url);
    }

    if (updates.book_type !== undefined) {
      fields.push(`book_type = $${paramIndex++}`);
      params.push(updates.book_type);
    }

    if (updates.episodes !== undefined) {
      fields.push(`episodes = $${paramIndex++}`);
      params.push(JSON.stringify(updates.episodes));
      // Also update total duration
      const totalDuration = updates.episodes.reduce((sum, ep) => sum + ep.duration, 0);
      fields.push(`total_duration_seconds = $${paramIndex++}`);
      params.push(totalDuration);
    }

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    // Always update the updated_at timestamp
    fields.push(`updated_at = NOW()`);

    params.push(id);

    const result = await query(
      `UPDATE audiobooks SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );

    return result.rows[0];
  }

  async deleteBook(id: string): Promise<void> {
    await query('DELETE FROM audiobooks WHERE id = $1', [id]);
  }

  async publishBook(id: string): Promise<Audiobook> {
    const result = await query(
      'UPDATE audiobooks SET is_published = true WHERE id = $1 RETURNING *',
      [id]
    );

    return result.rows[0];
  }

  async unpublishBook(id: string): Promise<Audiobook> {
    const result = await query(
      'UPDATE audiobooks SET is_published = false WHERE id = $1 RETURNING *',
      [id]
    );

    return result.rows[0];
  }
}

export const audiobookService = new AudiobookService();
