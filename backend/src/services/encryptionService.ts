import * as crypto from 'crypto';
import { config } from '../config/env';

class EncryptionService {
  private algorithm = 'aes-256-cbc';
  private key: Buffer;

  constructor() {
    // Ensure key is 32 bytes for AES-256
    const keyString = config.encryption.key;
    this.key = Buffer.from(keyString.padEnd(32, '0').slice(0, 32));
  }

  encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return iv.toString('hex') + ':' + encrypted;
  }

  decrypt(encrypted: string): string {
    const parts = encrypted.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = parts[1];

    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);

    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}

export const encryptionService = new EncryptionService();
