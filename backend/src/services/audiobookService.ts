import { query } from '../config/database';
import { Audiobook, Chapter } from '../types';

class AudiobookService {
  async createBook(
    title: string,
    bookType: 'adult' | 'kids',
    storageConfigId: string,
    blobPath: string,
    chapters: Chapter[],
    options?: {
      description?: string;
      author?: string;
      narrator?: string;
      coverUrl?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<Audiobook> {
    const totalDuration = chapters.reduce((sum, ch) => sum + ch.duration, 0);

    const result = await query(
      `INSERT INTO audiobooks (title, description, author, narrator, cover_url, book_type, storage_config_id, blob_path, total_duration_seconds, chapters, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
        JSON.stringify(chapters),
        JSON.stringify(options?.metadata || {}),
      ]
    );

    return result.rows[0];
  }

  async getBooks(filters?: {
    bookType?: 'adult' | 'kids';
    isPublished?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ books: Audiobook[]; total: number }> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters?.bookType) {
      conditions.push(`book_type = $${paramIndex++}`);
      params.push(filters.bookType);
    }

    if (filters?.isPublished !== undefined) {
      conditions.push(`is_published = $${paramIndex++}`);
      params.push(filters.isPublished);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await query(
      `SELECT COUNT(*) FROM audiobooks ${whereClause}`,
      params
    );

    const total = parseInt(countResult.rows[0].count);

    const limit = filters?.limit || 20;
    const offset = filters?.offset || 0;

    const result = await query(
      `SELECT * FROM audiobooks ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset]
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

    return result.rows[0];
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

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

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
