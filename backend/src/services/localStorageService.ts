import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config/env';

/**
 * Local file storage service for development environment.
 * Stores files in a local directory instead of Azure Blob Storage.
 */
class LocalStorageService {
  private storageDir: string;

  constructor() {
    // Store files in backend/storage directory
    this.storageDir = path.join(__dirname, '..', '..', 'storage');
    this.ensureDirectoryExists(this.storageDir);
  }

  private ensureDirectoryExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  private getFullPath(containerName: string, blobPath: string): string {
    const fullPath = path.join(this.storageDir, containerName, blobPath);
    // Ensure parent directory exists
    this.ensureDirectoryExists(path.dirname(fullPath));
    return fullPath;
  }

  async uploadFile(
    _storageConfigId: string | null,
    containerName: string,
    blobPath: string,
    fileBuffer: Buffer,
    _contentType: string
  ): Promise<string> {
    const fullPath = this.getFullPath(containerName, blobPath);

    fs.writeFileSync(fullPath, fileBuffer);

    // Return a local URL that can be served by the backend
    const relativePath = path.join(containerName, blobPath);
    return `/storage/${relativePath}`;
  }

  async generateSasUrl(
    _storageConfigId: string | null,
    containerName: string,
    blobPath: string,
    _expiryMinutes?: number
  ): Promise<string> {
    // For local storage, return a direct URL to the backend's static file server
    const relativePath = path.join(containerName, blobPath);
    const baseUrl = `http://localhost:${config.port}`;
    return `${baseUrl}/storage/${relativePath}`;
  }

  async deleteBlob(
    _storageConfigId: string | null,
    containerName: string,
    blobPath: string
  ): Promise<void> {
    const fullPath = this.getFullPath(containerName, blobPath);

    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);

      // Try to clean up empty parent directories
      let parentDir = path.dirname(fullPath);
      while (parentDir !== this.storageDir) {
        try {
          const contents = fs.readdirSync(parentDir);
          if (contents.length === 0) {
            fs.rmdirSync(parentDir);
            parentDir = path.dirname(parentDir);
          } else {
            break;
          }
        } catch {
          break;
        }
      }
    }
  }

  async selectStorageForUpload(_fileSizeBytes: number): Promise<string | null> {
    // For local storage, return null since there's no storage config in the database
    return null;
  }

  async updateStorageUsage(_storageConfigId: string | null, _addedBytes: number): Promise<void> {
    // No-op for local storage
  }

  getStorageDir(): string {
    return this.storageDir;
  }
}

export const localStorageService = new LocalStorageService();
