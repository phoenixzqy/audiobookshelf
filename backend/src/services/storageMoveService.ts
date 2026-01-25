import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { query } from '../config/database';
import { localStorageService } from './localStorageService';
import type { StorageLocation, MoveProgress, StorageMoveBatch } from '../types';

// Track active bulk move operations
const activeBatches: Map<string, { cancelled: boolean }> = new Map();

class StorageMoveService {
  /**
   * Get default storage directory path
   */
  getDefaultStoragePath(): string {
    return localStorageService.getStorageDir();
  }

  /**
   * Get all configured storage locations with their status
   */
  async getStorageLocations(): Promise<StorageLocation[]> {
    // Get the default storage location
    const defaultPath = this.getDefaultStoragePath();

    // Get custom storage locations from storage_configs table (for local storage)
    const result = await query(
      `SELECT id, name, container_name as base_path FROM storage_configs WHERE blob_endpoint = 'local' AND is_active = true`
    );

    const locations: StorageLocation[] = [];

    // Add default location first
    const defaultLocation = await this.buildLocationInfo('default', 'Default Storage', defaultPath);
    locations.push(defaultLocation);

    // Add custom locations
    for (const row of result.rows) {
      const location = await this.buildLocationInfo(row.id, row.name, row.base_path);
      locations.push(location);
    }

    return locations;
  }

  /**
   * Build location info with availability and disk space
   */
  private async buildLocationInfo(id: string, name: string, basePath: string): Promise<StorageLocation> {
    let isAvailable = false;
    let freeSpaceBytes = 0;
    let totalSpaceBytes = 0;
    let bookCount = 0;

    try {
      await fsp.access(basePath, fs.constants.W_OK);
      isAvailable = true;

      // Get disk space info
      const diskInfo = await this.getDiskSpace(basePath);
      freeSpaceBytes = diskInfo.free;
      totalSpaceBytes = diskInfo.total;

      // Count books in this location
      if (id === 'default') {
        const countResult = await query(
          `SELECT COUNT(*) FROM audiobooks WHERE storage_config_id IS NULL`
        );
        bookCount = parseInt(countResult.rows[0].count);
      } else {
        const countResult = await query(
          `SELECT COUNT(*) FROM audiobooks WHERE storage_config_id = $1`,
          [id]
        );
        bookCount = parseInt(countResult.rows[0].count);
      }
    } catch {
      isAvailable = false;
    }

    return {
      id,
      name,
      basePath,
      isAvailable,
      freeSpaceBytes,
      totalSpaceBytes,
      bookCount,
    };
  }

  /**
   * Get disk space information for a path
   */
  private async getDiskSpace(targetPath: string): Promise<{ free: number; total: number }> {
    // For Windows, use PowerShell to get disk space
    if (process.platform === 'win32') {
      const { exec } = await import('child_process');
      return new Promise((resolve) => {
        const driveLetter = path.parse(targetPath).root;
        exec(`powershell -Command "(Get-PSDrive -Name '${driveLetter[0]}').Free, (Get-PSDrive -Name '${driveLetter[0]}').Used + (Get-PSDrive -Name '${driveLetter[0]}').Free"`, (err, stdout) => {
          if (err) {
            resolve({ free: 0, total: 0 });
            return;
          }
          const lines = stdout.trim().split('\n').map(l => parseInt(l.trim()));
          resolve({ free: lines[0] || 0, total: lines[1] || 0 });
        });
      });
    }

    // For Unix-like systems, use statfs
    try {
      const stats = await fsp.statfs(targetPath);
      return {
        free: stats.bfree * stats.bsize,
        total: stats.blocks * stats.bsize,
      };
    } catch {
      return { free: 0, total: 0 };
    }
  }

  /**
   * Add a new storage location
   */
  async addStorageLocation(name: string, basePath: string): Promise<StorageLocation> {
    // Normalize path
    const normalizedPath = path.resolve(basePath);

    // Validate path exists and is writable
    try {
      await fsp.access(normalizedPath, fs.constants.W_OK);
    } catch {
      throw new Error('Path does not exist or is not writable');
    }

    // Check for duplicates
    const existing = await query(
      `SELECT id FROM storage_configs WHERE container_name = $1 AND blob_endpoint = 'local'`,
      [normalizedPath]
    );
    if (existing.rows.length > 0) {
      throw new Error('Storage location already exists');
    }

    // Insert into database
    const result = await query(
      `INSERT INTO storage_configs (name, blob_endpoint, container_name, access_key_encrypted, is_active)
       VALUES ($1, 'local', $2, '', true)
       RETURNING id`,
      [name, normalizedPath]
    );

    return this.buildLocationInfo(result.rows[0].id, name, normalizedPath);
  }

  /**
   * Delete a storage location (only if no books are using it)
   */
  async deleteStorageLocation(locationId: string): Promise<void> {
    if (locationId === 'default') {
      throw new Error('Cannot delete default storage location');
    }

    // Check if any books are using this location
    const bookCount = await query(
      `SELECT COUNT(*) FROM audiobooks WHERE storage_config_id = $1`,
      [locationId]
    );

    if (parseInt(bookCount.rows[0].count) > 0) {
      throw new Error('Cannot delete storage location with books. Move books first.');
    }

    await query(`DELETE FROM storage_configs WHERE id = $1`, [locationId]);
  }

  /**
   * Validate a filesystem path
   */
  async validatePath(targetPath: string): Promise<{ isValid: boolean; exists: boolean; isWritable: boolean; freeSpaceBytes: number; errorMessage?: string }> {
    const normalizedPath = path.resolve(targetPath);
    let exists = false;
    let isWritable = false;
    let freeSpaceBytes = 0;

    try {
      await fsp.access(normalizedPath);
      exists = true;

      await fsp.access(normalizedPath, fs.constants.W_OK);
      isWritable = true;

      const diskInfo = await this.getDiskSpace(normalizedPath);
      freeSpaceBytes = diskInfo.free;
    } catch {
      // Path doesn't exist or isn't writable
    }

    return {
      isValid: exists && isWritable,
      exists,
      isWritable,
      freeSpaceBytes,
      errorMessage: !exists ? 'Path does not exist' : (!isWritable ? 'Path is not writable' : undefined),
    };
  }

  /**
   * Browse a filesystem path (for directory picker)
   */
  async browsePath(targetPath: string): Promise<{ currentPath: string; parentPath: string | null; items: Array<{ name: string; type: string; path: string }> }> {
    // Handle Windows drives listing
    if (!targetPath && process.platform === 'win32') {
      const drives = await this.getWindowsDrives();
      return {
        currentPath: '',
        parentPath: null,
        items: drives.map(d => ({ name: d, type: 'drive', path: d })),
      };
    }

    const normalizedPath = path.resolve(targetPath || '/');

    try {
      const items = await fsp.readdir(normalizedPath, { withFileTypes: true });
      const directories = items
        .filter(item => item.isDirectory() && !item.name.startsWith('.'))
        .map(item => ({
          name: item.name,
          type: 'directory',
          path: path.join(normalizedPath, item.name),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      const parentPath = path.dirname(normalizedPath);
      return {
        currentPath: normalizedPath,
        parentPath: parentPath !== normalizedPath ? parentPath : null,
        items: directories,
      };
    } catch (error) {
      throw new Error(`Failed to browse path: ${(error as Error).message}`);
    }
  }

  /**
   * Get Windows drive letters
   */
  private async getWindowsDrives(): Promise<string[]> {
    const { exec } = await import('child_process');
    return new Promise((resolve) => {
      exec('wmic logicaldisk get name', (err, stdout) => {
        if (err) {
          resolve(['C:\\']);
          return;
        }
        const drives = stdout
          .split('\n')
          .map(line => line.trim())
          .filter(line => /^[A-Z]:$/.test(line))
          .map(drive => drive + '\\');
        resolve(drives);
      });
    });
  }

  /**
   * Get the size of an audiobook's files
   */
  async getAudiobookSize(audiobookId: string): Promise<number> {
    const result = await query(
      `SELECT blob_path, storage_config_id FROM audiobooks WHERE id = $1`,
      [audiobookId]
    );

    if (result.rows.length === 0) {
      throw new Error('Audiobook not found');
    }

    const { blob_path, storage_config_id } = result.rows[0];
    const basePath = await this.getStorageBasePath(storage_config_id);
    const bookPath = path.join(basePath, 'audiobooks', blob_path);

    return this.getDirectorySize(bookPath);
  }

  /**
   * Get the base path for a storage config
   */
  private async getStorageBasePath(storageConfigId: string | null): Promise<string> {
    if (!storageConfigId) {
      return this.getDefaultStoragePath();
    }

    const result = await query(
      `SELECT container_name FROM storage_configs WHERE id = $1`,
      [storageConfigId]
    );

    if (result.rows.length === 0) {
      return this.getDefaultStoragePath();
    }

    return result.rows[0].container_name;
  }

  /**
   * Calculate total size of a directory
   */
  private async getDirectorySize(dirPath: string): Promise<number> {
    let size = 0;

    try {
      const entries = await fsp.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          size += await this.getDirectorySize(fullPath);
        } else {
          const stat = await fsp.stat(fullPath);
          size += stat.size;
        }
      }
    } catch {
      // Directory doesn't exist or isn't readable
    }

    return size;
  }

  /**
   * Move a single audiobook to a new storage location
   */
  async moveSingleBook(audiobookId: string, destinationPath: string, batchId?: string): Promise<{ success: boolean; error?: string }> {
    // Get audiobook details
    const bookResult = await query(
      `SELECT a.*, sc.container_name as source_base_path
       FROM audiobooks a
       LEFT JOIN storage_configs sc ON a.storage_config_id = sc.id
       WHERE a.id = $1`,
      [audiobookId]
    );

    if (bookResult.rows.length === 0) {
      throw new Error('Audiobook not found');
    }

    const audiobook = bookResult.rows[0];
    const sourceBasePath = audiobook.source_base_path || this.getDefaultStoragePath();
    const sourcePath = path.join(sourceBasePath, 'audiobooks', audiobook.blob_path);
    const destPath = path.join(destinationPath, 'audiobooks', audiobook.blob_path);

    // Check if source and destination are the same
    if (path.resolve(sourcePath) === path.resolve(destPath)) {
      return { success: true }; // No-op
    }

    // Create move history record
    const historyResult = await query(
      `INSERT INTO storage_move_history (audiobook_id, batch_id, source_path, dest_path, status, started_at)
       VALUES ($1, $2, $3, $4, 'in_progress', NOW())
       RETURNING id`,
      [audiobookId, batchId || null, sourcePath, destPath]
    );
    const historyId = historyResult.rows[0].id;

    try {
      // Step 1: Copy files to destination
      await this.copyDirectory(sourcePath, destPath);

      // Step 2: Verify copy integrity
      await this.verifyDirectoryCopy(sourcePath, destPath);

      // Step 3: Get or create storage config for destination
      let destStorageConfigId: string | null = null;
      const normalizedDestPath = path.resolve(destinationPath);

      if (normalizedDestPath !== path.resolve(this.getDefaultStoragePath())) {
        // Check if storage config exists for this path
        const configResult = await query(
          `SELECT id FROM storage_configs WHERE container_name = $1 AND blob_endpoint = 'local'`,
          [normalizedDestPath]
        );

        if (configResult.rows.length > 0) {
          destStorageConfigId = configResult.rows[0].id;
        } else {
          // Create a new storage config
          const insertResult = await query(
            `INSERT INTO storage_configs (name, blob_endpoint, container_name, access_key_encrypted, is_active)
             VALUES ($1, 'local', $2, '', true)
             RETURNING id`,
            [`Storage: ${normalizedDestPath}`, normalizedDestPath]
          );
          destStorageConfigId = insertResult.rows[0].id;
        }
      }

      // Step 4: Update database
      await query(
        `UPDATE audiobooks SET storage_config_id = $1 WHERE id = $2`,
        [destStorageConfigId, audiobookId]
      );

      // Step 5: Update history to completed
      await query(
        `UPDATE storage_move_history SET status = 'completed', completed_at = NOW() WHERE id = $1`,
        [historyId]
      );

      // Step 6: Delete source files (only after DB update succeeds)
      await this.deleteDirectory(sourcePath);

      return { success: true };
    } catch (error) {
      const errorMessage = (error as Error).message;

      // Update history with error
      await query(
        `UPDATE storage_move_history SET status = 'failed', error_message = $1, completed_at = NOW() WHERE id = $2`,
        [errorMessage, historyId]
      );

      // Attempt cleanup of partial copy
      try {
        await this.deleteDirectory(destPath);
      } catch {
        // Ignore cleanup errors
      }

      return { success: false, error: errorMessage };
    }
  }

  /**
   * Start a bulk move operation (returns immediately, processes in background)
   */
  async startBulkMove(audiobookIds: string[], destinationPath: string, stopOnError: boolean = false): Promise<string> {
    // Validate destination
    const validation = await this.validatePath(destinationPath);
    if (!validation.isValid) {
      throw new Error(validation.errorMessage || 'Invalid destination path');
    }

    // Calculate total size and check free space
    let totalSize = 0;
    for (const id of audiobookIds) {
      totalSize += await this.getAudiobookSize(id);
    }

    if (validation.freeSpaceBytes < totalSize * 1.1) { // 10% buffer
      throw new Error(`Insufficient space. Need ${this.formatBytes(totalSize)}, have ${this.formatBytes(validation.freeSpaceBytes)}`);
    }

    // Create batch record
    const batchResult = await query(
      `INSERT INTO storage_move_batches (total_books, status) VALUES ($1, 'in_progress') RETURNING id`,
      [audiobookIds.length]
    );
    const batchId = batchResult.rows[0].id;

    // Track this batch
    activeBatches.set(batchId, { cancelled: false });

    // Process in background (don't await)
    this.processBulkMove(batchId, audiobookIds, destinationPath, stopOnError);

    return batchId;
  }

  /**
   * Process bulk move operation
   */
  private async processBulkMove(batchId: string, audiobookIds: string[], destinationPath: string, stopOnError: boolean): Promise<void> {
    const batchState = activeBatches.get(batchId);
    let completedCount = 0;
    let failedCount = 0;

    for (const audiobookId of audiobookIds) {
      // Check for cancellation
      if (batchState?.cancelled) {
        await query(
          `UPDATE storage_move_batches SET status = 'cancelled', completed_at = NOW() WHERE id = $1`,
          [batchId]
        );
        break;
      }

      const result = await this.moveSingleBook(audiobookId, destinationPath, batchId);

      if (result.success) {
        completedCount++;
      } else {
        failedCount++;
        if (stopOnError) {
          await query(
            `UPDATE storage_move_batches SET status = 'stopped_on_error', completed_books = $1, failed_books = $2, completed_at = NOW() WHERE id = $3`,
            [completedCount, failedCount, batchId]
          );
          break;
        }
      }

      // Update progress
      await query(
        `UPDATE storage_move_batches SET completed_books = $1, failed_books = $2 WHERE id = $3`,
        [completedCount, failedCount, batchId]
      );
    }

    // Finalize batch
    if (!batchState?.cancelled) {
      const finalStatus = failedCount > 0 ? 'completed_with_errors' : 'completed';
      await query(
        `UPDATE storage_move_batches SET status = $1, completed_at = NOW() WHERE id = $2`,
        [finalStatus, batchId]
      );
    }

    activeBatches.delete(batchId);
  }

  /**
   * Get progress of a bulk move operation
   */
  async getBatchProgress(batchId: string): Promise<MoveProgress> {
    const batchResult = await query(
      `SELECT * FROM storage_move_batches WHERE id = $1`,
      [batchId]
    );

    if (batchResult.rows.length === 0) {
      throw new Error('Batch not found');
    }

    const batch = batchResult.rows[0] as StorageMoveBatch;

    // Get errors from this batch
    const errorsResult = await query(
      `SELECT h.audiobook_id, a.title, h.error_message as error
       FROM storage_move_history h
       JOIN audiobooks a ON h.audiobook_id = a.id
       WHERE h.batch_id = $1 AND h.status = 'failed'`,
      [batchId]
    );

    // Get currently processing book
    const currentResult = await query(
      `SELECT h.audiobook_id as id, a.title
       FROM storage_move_history h
       JOIN audiobooks a ON h.audiobook_id = a.id
       WHERE h.batch_id = $1 AND h.status = 'in_progress'
       LIMIT 1`,
      [batchId]
    );

    return {
      batchId,
      totalBooks: batch.total_books,
      completedBooks: batch.completed_books,
      failedBooks: batch.failed_books,
      currentBook: currentResult.rows[0] || undefined,
      status: batch.status,
      errors: errorsResult.rows.map(row => ({
        audiobookId: row.audiobook_id,
        title: row.title,
        error: row.error,
      })),
    };
  }

  /**
   * Cancel a bulk move operation
   */
  async cancelBulkMove(batchId: string): Promise<void> {
    const batchState = activeBatches.get(batchId);
    if (batchState) {
      batchState.cancelled = true;
    }
  }

  /**
   * Get audiobooks with their storage location info
   */
  async getAudiobooksWithStorage(): Promise<Array<{
    id: string;
    title: string;
    author: string | null;
    storagePath: string;
    storageConfigId: string | null;
    sizeBytes: number;
  }>> {
    const result = await query(
      `SELECT a.id, a.title, a.author, a.blob_path, a.storage_config_id, sc.container_name
       FROM audiobooks a
       LEFT JOIN storage_configs sc ON a.storage_config_id = sc.id
       ORDER BY a.title`
    );

    const books = [];
    for (const row of result.rows) {
      const basePath = row.container_name || this.getDefaultStoragePath();
      const bookPath = path.join(basePath, 'audiobooks', row.blob_path);
      const sizeBytes = await this.getDirectorySize(bookPath);

      books.push({
        id: row.id,
        title: row.title,
        author: row.author,
        storagePath: basePath,
        storageConfigId: row.storage_config_id,
        sizeBytes,
      });
    }

    return books;
  }

  /**
   * Copy directory recursively
   */
  private async copyDirectory(src: string, dest: string): Promise<void> {
    await fsp.mkdir(dest, { recursive: true });
    const entries = await fsp.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        await fsp.copyFile(srcPath, destPath);
      }
    }
  }

  /**
   * Verify directory copy integrity
   */
  private async verifyDirectoryCopy(src: string, dest: string): Promise<void> {
    const srcEntries = await fsp.readdir(src, { withFileTypes: true });

    for (const entry of srcEntries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await this.verifyDirectoryCopy(srcPath, destPath);
      } else {
        const srcStat = await fsp.stat(srcPath);
        const destStat = await fsp.stat(destPath);

        if (srcStat.size !== destStat.size) {
          throw new Error(`File size mismatch for ${entry.name}`);
        }
      }
    }
  }

  /**
   * Delete directory recursively
   */
  private async deleteDirectory(dir: string): Promise<void> {
    await fsp.rm(dir, { recursive: true, force: true });
  }

  /**
   * Format bytes to human-readable string
   */
  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) {
      bytes /= 1024;
      i++;
    }
    return `${bytes.toFixed(2)} ${units[i]}`;
  }
}

export const storageMoveService = new StorageMoveService();
