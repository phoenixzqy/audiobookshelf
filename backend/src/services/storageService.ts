import { BlobServiceClient, StorageSharedKeyCredential, generateBlobSASQueryParameters, BlobSASPermissions } from '@azure/storage-blob';
import { query } from '../config/database';
import { StorageConfig } from '../types';
import { encryptionService } from './encryptionService';
import { config } from '../config/env';
import { localStorageService } from './localStorageService';

// Interface for storage operations
interface IStorageService {
  uploadFile(storageConfigId: string | null, containerName: string, blobPath: string, fileBuffer: Buffer, contentType: string): Promise<string>;
  generateSasUrl(storageConfigId: string | null, containerName: string, blobPath: string, expiryMinutes?: number): Promise<string>;
  deleteBlob(storageConfigId: string | null, containerName: string, blobPath: string): Promise<void>;
  selectStorageForUpload(fileSizeBytes: number): Promise<string | null>;
  updateStorageUsage(storageConfigId: string | null, addedBytes: number): Promise<void>;
}

class AzureStorageService implements IStorageService {
  private clients: Map<string, BlobServiceClient> = new Map();

  private extractAccountName(endpoint: string): string {
    const match = endpoint.match(/https:\/\/([^.]+)\.blob\.core\.windows\.net/);
    if (!match) {
      throw new Error('Invalid blob endpoint format');
    }
    return match[1];
  }

  async getClient(storageConfigId: string | null): Promise<BlobServiceClient> {
    if (!storageConfigId) {
      throw new Error('Storage config ID is required for Azure storage');
    }

    if (this.clients.has(storageConfigId)) {
      return this.clients.get(storageConfigId)!;
    }

    const result = await query(
      'SELECT * FROM storage_configs WHERE id = $1 AND is_active = true',
      [storageConfigId]
    );

    if (result.rows.length === 0) {
      throw new Error('Storage config not found or inactive');
    }

    const storageConfig: StorageConfig = result.rows[0];
    const accessKey = encryptionService.decrypt(storageConfig.access_key_encrypted);
    const accountName = this.extractAccountName(storageConfig.blob_endpoint);

    const credential = new StorageSharedKeyCredential(accountName, accessKey);
    const client = new BlobServiceClient(storageConfig.blob_endpoint, credential);

    this.clients.set(storageConfigId, client);
    return client;
  }

  async uploadFile(
    storageConfigId: string | null,
    containerName: string,
    blobPath: string,
    fileBuffer: Buffer,
    contentType: string
  ): Promise<string> {
    const client = await this.getClient(storageConfigId);
    const containerClient = client.getContainerClient(containerName);

    // Ensure container exists
    await containerClient.createIfNotExists();

    const blockBlobClient = containerClient.getBlockBlobClient(blobPath);

    await blockBlobClient.upload(fileBuffer, fileBuffer.length, {
      blobHTTPHeaders: { blobContentType: contentType },
    });

    return blockBlobClient.url;
  }

  async generateSasUrl(
    storageConfigId: string | null,
    containerName: string,
    blobPath: string,
    expiryMinutes: number = config.sas.expiryMinutes
  ): Promise<string> {
    if (!storageConfigId) {
      throw new Error('Storage config ID is required for Azure storage');
    }

    const result = await query(
      'SELECT * FROM storage_configs WHERE id = $1 AND is_active = true',
      [storageConfigId]
    );

    if (result.rows.length === 0) {
      throw new Error('Storage config not found');
    }

    const storageConfig: StorageConfig = result.rows[0];
    const accessKey = encryptionService.decrypt(storageConfig.access_key_encrypted);
    const accountName = this.extractAccountName(storageConfig.blob_endpoint);

    const credential = new StorageSharedKeyCredential(accountName, accessKey);

    const expiresOn = new Date();
    expiresOn.setMinutes(expiresOn.getMinutes() + expiryMinutes);

    const sasToken = generateBlobSASQueryParameters(
      {
        containerName,
        blobName: blobPath,
        permissions: BlobSASPermissions.parse('r'),
        expiresOn,
      },
      credential
    ).toString();

    return `${storageConfig.blob_endpoint}/${containerName}/${blobPath}?${sasToken}`;
  }

  async deleteBlob(
    storageConfigId: string | null,
    containerName: string,
    blobPath: string
  ): Promise<void> {
    const client = await this.getClient(storageConfigId);
    const containerClient = client.getContainerClient(containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobPath);

    await blockBlobClient.deleteIfExists();
  }

  async selectStorageForUpload(fileSizeBytes: number): Promise<string> {
    const result = await query(
      `SELECT id, storage_quota_gb, current_usage_gb
       FROM storage_configs
       WHERE is_active = true
       ORDER BY is_primary DESC, current_usage_gb ASC`
    );

    if (result.rows.length === 0) {
      throw new Error('No active storage configs available');
    }

    const requiredGb = fileSizeBytes / (1024 ** 3);

    for (const storageConfig of result.rows) {
      const availableGb = (storageConfig.storage_quota_gb || 1000) - (storageConfig.current_usage_gb || 0);

      if (availableGb >= requiredGb) {
        return storageConfig.id;
      }
    }

    throw new Error('Insufficient storage quota available');
  }

  async updateStorageUsage(storageConfigId: string | null, addedBytes: number): Promise<void> {
    if (!storageConfigId) {
      return; // No-op for local storage
    }

    const addedGb = addedBytes / (1024 ** 3);

    await query(
      `UPDATE storage_configs
       SET current_usage_gb = current_usage_gb + $1
       WHERE id = $2`,
      [addedGb, storageConfigId]
    );
  }

  async createStorageConfig(
    name: string,
    blobEndpoint: string,
    containerName: string,
    accessKey: string,
    isPrimary: boolean = false,
    storageQuotaGb?: number
  ): Promise<StorageConfig> {
    const accessKeyEncrypted = encryptionService.encrypt(accessKey);

    const result = await query(
      `INSERT INTO storage_configs (name, blob_endpoint, container_name, access_key_encrypted, is_primary, storage_quota_gb)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [name, blobEndpoint, containerName, accessKeyEncrypted, isPrimary, storageQuotaGb || null]
    );

    return result.rows[0];
  }
}

// Create the appropriate storage service based on environment
const azureStorageService = new AzureStorageService();

// Storage service that automatically chooses between local and Azure based on config
class StorageServiceProxy implements IStorageService {
  private useLocalStorage(): boolean {
    return config.storage.useLocal;
  }

  async uploadFile(
    storageConfigId: string | null,
    containerName: string,
    blobPath: string,
    fileBuffer: Buffer,
    contentType: string
  ): Promise<string> {
    if (this.useLocalStorage()) {
      return localStorageService.uploadFile(storageConfigId, containerName, blobPath, fileBuffer, contentType);
    }
    return azureStorageService.uploadFile(storageConfigId, containerName, blobPath, fileBuffer, contentType);
  }

  async generateSasUrl(
    storageConfigId: string | null,
    containerName: string,
    blobPath: string,
    expiryMinutes?: number
  ): Promise<string> {
    if (this.useLocalStorage()) {
      return localStorageService.generateSasUrl(storageConfigId, containerName, blobPath, expiryMinutes);
    }
    return azureStorageService.generateSasUrl(storageConfigId, containerName, blobPath, expiryMinutes);
  }

  async deleteBlob(
    storageConfigId: string | null,
    containerName: string,
    blobPath: string
  ): Promise<void> {
    if (this.useLocalStorage()) {
      return localStorageService.deleteBlob(storageConfigId, containerName, blobPath);
    }
    return azureStorageService.deleteBlob(storageConfigId, containerName, blobPath);
  }

  async selectStorageForUpload(fileSizeBytes: number): Promise<string | null> {
    if (this.useLocalStorage()) {
      return localStorageService.selectStorageForUpload(fileSizeBytes);
    }
    return azureStorageService.selectStorageForUpload(fileSizeBytes);
  }

  async updateStorageUsage(storageConfigId: string | null, addedBytes: number): Promise<void> {
    if (this.useLocalStorage()) {
      return localStorageService.updateStorageUsage(storageConfigId, addedBytes);
    }
    return azureStorageService.updateStorageUsage(storageConfigId, addedBytes);
  }

  // Azure-specific methods
  async createStorageConfig(
    name: string,
    blobEndpoint: string,
    containerName: string,
    accessKey: string,
    isPrimary: boolean = false,
    storageQuotaGb?: number
  ): Promise<StorageConfig> {
    return azureStorageService.createStorageConfig(name, blobEndpoint, containerName, accessKey, isPrimary, storageQuotaGb);
  }
}

export const storageService = new StorageServiceProxy();
