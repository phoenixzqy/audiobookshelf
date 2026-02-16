#!/usr/bin/env npx ts-node

/**
 * Bulk Audiobook Upload Script
 *
 * Usage (--key=value format recommended for cross-platform compatibility):
 *   npm run bulk-upload -- --path=/path/to/audiobooks --email=admin@test.com --password=secret
 *
 * Options:
 *   --path=<dir>         Root directory containing audiobook folders (required)
 *   --type=<adult|kids>  Book type (default: adult)
 *   --api=<url>          API base URL (default: http://localhost:8081/api)
 *   --email=<email>      Admin email for authentication
 *   --password=<pass>    Admin password for authentication
 *   --storage=<id>       Storage config ID to upload to (default: auto-select)
 *   --dry-run            Show what would be uploaded without actually uploading
 *   --keep               Keep source files after upload (default: delete after success)
 *
 * Both --key=value and --key value formats are supported.
 * Positional first argument is also accepted as --path for backward compatibility.
 *
 * Directory Structure:
 *   root/
 *   ├── Book Title 1/
 *   │   ├── 01-episode-one.mp3
 *   │   ├── 02-episode-two.mp3
 *   │   └── cover.jpg (or cover.png, cover.jpeg, folder.jpg, etc.)
 *   └── Book Title 2/
 *       ├── audio1.mp3
 *       └── cover.png
 *
 * Notes:
 *   - Book title is taken from the folder name
 *   - Audio files are sorted by embedded numbers (e.g. "图书 001 xx.mp3" sorts before "图书 002 xx.mp3")
 *   - Supports .mp3, .m4a, .m4b, .wav, .flac, .ogg, .aac audio formats
 *   - Supports .jpg, .jpeg, .png, .webp, .gif cover images
 *   - Skips books that already exist in the library (by exact title match)
 *   - By default, deletes source folder after successful upload to save storage
 */

import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import FormData from 'form-data';

// Configuration
interface Config {
  rootDir: string;
  bookType: 'adult' | 'kids';
  apiUrl: string;
  email: string;
  password: string;
  dryRun: boolean;
  keepFiles: boolean;
  storageConfigId: string;
}

// Book structure
interface BookToUpload {
  title: string;
  folderPath: string;
  audioFiles: string[];
  coverFile: string | null;
}

// Supported file extensions
const AUDIO_EXTENSIONS = ['.mp3', '.m4a', '.m4b', '.wav', '.flac', '.ogg', '.aac'];
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
const COVER_NAMES = ['cover', 'folder', 'front', 'artwork', 'album'];

function showHelp(): void {
  console.log(`
Bulk Audiobook Upload Script

Usage (recommended — works on all platforms):
  npx tsx src/scripts/bulk-upload.ts --path=/path/to/audiobooks --email=admin@test.com --password=secret

Options:
  --path=<dir>         Root directory containing audiobook folders (required)
  --type=<adult|kids>  Book type (default: adult)
  --api=<url>          API base URL (default: http://localhost:8081/api)
  --email=<email>      Admin email for authentication
  --password=<pass>    Admin password for authentication
  --storage=<id>       Storage config ID to upload to (default: auto-select)
  --dry-run            Show what would be uploaded without actually uploading
  --keep               Keep source files after upload (default: delete after success)

Environment variables (alternative to CLI args, useful for PowerShell):
  UPLOAD_PATH, UPLOAD_EMAIL, UPLOAD_PASSWORD, UPLOAD_TYPE, UPLOAD_API, UPLOAD_STORAGE, UPLOAD_DRY_RUN, UPLOAD_KEEP

Examples:
  npx tsx src/scripts/bulk-upload.ts --path="H:\\audiobooks\\kids" --email=admin@example.com --password=secret --type=kids
  npx tsx src/scripts/bulk-upload.ts --path=./audiobooks --dry-run

  # PowerShell with environment variables:
  $env:UPLOAD_PATH="H:\\audiobooks\\kids"; $env:UPLOAD_EMAIL="admin@test.com"; $env:UPLOAD_PASSWORD="secret"; npm run bulk-upload
  `);
}

function parseArgs(): Config {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }

  const config: Config = {
    rootDir: '',
    bookType: 'adult',
    apiUrl: 'http://localhost:8081/api',
    email: '',
    password: '',
    dryRun: false,
    keepFiles: false,
    storageConfigId: '',
  };

  // Parse a --key=value token, returns [key, value] or null
  function parseKeyValue(arg: string): [string, string] | null {
    const eqIdx = arg.indexOf('=');
    if (eqIdx === -1) return null;
    return [arg.substring(0, eqIdx), arg.substring(eqIdx + 1)];
  }

  function applyValue(key: string, value: string): void {
    // Normalize: strip leading dashes and support both --key and -key
    const normalizedKey = key.replace(/^-+/, '');
    switch (normalizedKey) {
      case 'path': config.rootDir = value; break;
      case 'type': config.bookType = value as 'adult' | 'kids'; break;
      case 'api': config.apiUrl = value; break;
      case 'email': config.email = value; break;
      case 'password': config.password = value; break;
      case 'storage': config.storageConfigId = value; break;
    }
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // Boolean flags
    if (arg === '--dry-run' || arg === '-dry-run') { config.dryRun = true; continue; }
    if (arg === '--keep' || arg === '-keep') { config.keepFiles = true; continue; }

    // --key=value or -key=value format
    const kv = parseKeyValue(arg);
    if (kv) {
      applyValue(kv[0], kv[1]);
      continue;
    }

    // --key value or -key value format (value is next arg)
    if (arg.startsWith('-') && i + 1 < args.length && !args[i + 1].startsWith('-')) {
      applyValue(arg, args[++i]);
      continue;
    }

    // Positional arg: treat as --path (backward compat)
    if (!arg.startsWith('-') && !config.rootDir) {
      config.rootDir = arg;
    }
  }

  // Environment variable fallbacks (useful when shell arg passing is unreliable)
  if (!config.rootDir && process.env.UPLOAD_PATH) config.rootDir = process.env.UPLOAD_PATH;
  if (!config.email && process.env.UPLOAD_EMAIL) config.email = process.env.UPLOAD_EMAIL;
  if (!config.password && process.env.UPLOAD_PASSWORD) config.password = process.env.UPLOAD_PASSWORD;
  if (process.env.UPLOAD_TYPE) config.bookType = process.env.UPLOAD_TYPE as 'adult' | 'kids';
  if (process.env.UPLOAD_API) config.apiUrl = process.env.UPLOAD_API;
  if (process.env.UPLOAD_STORAGE) config.storageConfigId = process.env.UPLOAD_STORAGE;
  if (process.env.UPLOAD_DRY_RUN === '1' || process.env.UPLOAD_DRY_RUN === 'true') config.dryRun = true;
  if (process.env.UPLOAD_KEEP === '1' || process.env.UPLOAD_KEEP === 'true') config.keepFiles = true;

  // Validate
  if (!config.rootDir) {
    console.error('Error: --path is required (root directory containing audiobook folders)');
    console.error('');
    console.error('Usage (run directly with npx tsx — most reliable across all platforms):');
    console.error('  npx tsx src/scripts/bulk-upload.ts --path="H:\\audiobooks\\kids" --email=admin@test.com --password=secret --dry-run');
    console.error('');
    console.error('Or use environment variables (PowerShell):');
    console.error('  $env:UPLOAD_PATH="H:\\audiobooks\\kids"; $env:UPLOAD_DRY_RUN="1"; npm run bulk-upload');
    console.error('');
    console.error('Use --help for full usage information.');
    process.exit(1);
  }

  if (!fs.existsSync(config.rootDir)) {
    console.error(`Error: Directory not found: ${config.rootDir}`);
    process.exit(1);
  }

  if (!config.dryRun && (!config.email || !config.password)) {
    console.error('Error: --email and --password are required for upload');
    console.error('Use --dry-run to preview without uploading');
    process.exit(1);
  }

  return config;
}

function isAudioFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return AUDIO_EXTENSIONS.includes(ext);
}

function isImageFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext);
}

function isCoverImage(filename: string): boolean {
  if (!isImageFile(filename)) return false;
  const baseName = path.basename(filename, path.extname(filename)).toLowerCase();
  return COVER_NAMES.some(name => baseName.includes(name));
}

/**
 * Extract all numeric sequences from a filename for sorting.
 * E.g. "图书 001 xx播讲.mp3" → [1], "Book 2 Part 10.mp3" → [2, 10]
 */
function extractNumbers(filename: string): number[] {
  const matches = filename.match(/\d+/g);
  return matches ? matches.map(Number) : [];
}

/**
 * Compare filenames by embedded numbers, then fall back to locale compare.
 * Handles patterns like "图书 001 xx.mp3" vs "图书 002 xx.mp3".
 */
function compareByNumbers(a: string, b: string): number {
  const numsA = extractNumbers(a);
  const numsB = extractNumbers(b);

  for (let i = 0; i < Math.max(numsA.length, numsB.length); i++) {
    const na = numsA[i] ?? -1;
    const nb = numsB[i] ?? -1;
    if (na !== nb) return na - nb;
  }

  return a.localeCompare(b, undefined, { numeric: true });
}

function scanDirectory(rootDir: string): BookToUpload[] {
  const books: BookToUpload[] = [];
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const folderPath = path.join(rootDir, entry.name);
    const files = fs.readdirSync(folderPath);

    // Find audio files and sort alphabetically
    const audioFiles = files
      .filter(isAudioFile)
      .sort(compareByNumbers);

    if (audioFiles.length === 0) {
      console.warn(`Warning: No audio files found in "${entry.name}", skipping...`);
      continue;
    }

    // Find cover image
    let coverFile: string | null = null;

    // First, try to find a file with a cover-like name
    const coverCandidate = files.find(isCoverImage);
    if (coverCandidate) {
      coverFile = coverCandidate;
    } else {
      // Otherwise, use any image file
      const anyImage = files.find(isImageFile);
      if (anyImage) {
        coverFile = anyImage;
      }
    }

    books.push({
      title: entry.name,
      folderPath,
      audioFiles,
      coverFile,
    });
  }

  return books;
}

async function login(apiUrl: string, email: string, password: string): Promise<string> {
  try {
    const response = await axios.post(`${apiUrl}/auth/login`, {
      email,
      password,
    });
    return response.data.data.accessToken;
  } catch (error: any) {
    if (error.response?.status === 401) {
      throw new Error('Invalid email or password');
    }
    
    // Provide detailed error information
    let errorMsg = error.message;
    if (error.response?.status) {
      errorMsg = `HTTP ${error.response.status}`;
      if (error.response.data?.error) {
        errorMsg += `: ${error.response.data.error}`;
      } else if (error.response.data?.message) {
        errorMsg += `: ${error.response.data.message}`;
      }
    } else if (error.code === 'ECONNREFUSED') {
      errorMsg = `Cannot connect to API at ${apiUrl} (connection refused)`;
    }
    
    throw new Error(`Login failed: ${errorMsg}`);
  }
}

async function getExistingBookTitles(apiUrl: string, accessToken: string): Promise<Set<string>> {
  const titles = new Set<string>();
  try {
    // Fetch all books (paginated if needed)
    let offset = 0;
    const limit = 100;
    let hasMore = true;

    while (hasMore) {
      const response = await axios.get(`${apiUrl}/books`, {
        params: { limit, offset },
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });

      const books = response.data.data?.books || [];
      for (const book of books) {
        titles.add(book.title.toLowerCase());
      }

      hasMore = books.length === limit;
      offset += limit;
    }
  } catch (error: any) {
    console.warn(`Warning: Could not fetch existing books: ${error.message}`);
  }
  return titles;
}

function deleteFolder(folderPath: string): void {
  try {
    fs.rmSync(folderPath, { recursive: true, force: true });
  } catch (error: any) {
    console.warn(`Warning: Could not delete folder ${folderPath}: ${error.message}`);
  }
}

async function uploadBook(
  apiUrl: string,
  accessToken: string,
  book: BookToUpload,
  bookType: 'adult' | 'kids',
  storageConfigId?: string
): Promise<void> {
  const form = new FormData();

  // Add metadata
  form.append('title', book.title);
  form.append('bookType', bookType);
  if (storageConfigId) {
    form.append('storageConfigId', storageConfigId);
  }

  // Add cover if exists
  if (book.coverFile) {
    const coverPath = path.join(book.folderPath, book.coverFile);
    form.append('cover', fs.createReadStream(coverPath));
  }

  // Add audio files in order
  for (const audioFile of book.audioFiles) {
    const audioPath = path.join(book.folderPath, audioFile);
    form.append('audioFiles', fs.createReadStream(audioPath));
  }

  // Generate episode metadata
  const episodes = book.audioFiles.map((file, index) => ({
    title: path.basename(file, path.extname(file))
      .replace(/^\d+[-_.\s]*/, '') // Remove leading numbers
      .replace(/[-_]/g, ' ') // Replace dashes/underscores with spaces
      .trim() || `Episode ${index + 1}`,
    duration: 0,
  }));
  form.append('chapters', JSON.stringify(episodes));

  // Upload
  try {
    const response = await axios.post(`${apiUrl}/admin/books`, form, {
      headers: {
        ...form.getHeaders(),
        'Authorization': `Bearer ${accessToken}`,
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    if (!response.data.success) {
      throw new Error(response.data.error || 'Upload failed');
    }
  } catch (error: any) {
    if (error.response?.data?.error) {
      throw new Error(error.response.data.error);
    }
    throw error;
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function getFileSize(filePath: string): number {
  return fs.statSync(filePath).size;
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

function isRetryableError(error: any): boolean {
  if (error.code === 'ECONNRESET' || error.code === 'EPIPE' || error.code === 'ETIMEDOUT') {
    return true;
  }
  const status = error.response?.status;
  return status === 408 || status === 429 || status === 502 || status === 503 || status === 504;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function uploadBookWithRetry(
  apiUrl: string,
  accessToken: string,
  book: BookToUpload,
  bookType: 'adult' | 'kids',
  storageConfigId?: string
): Promise<void> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await uploadBook(apiUrl, accessToken, book, bookType, storageConfigId);
      return;
    } catch (error: any) {
      if (attempt < MAX_RETRIES && isRetryableError(error)) {
        const delay = RETRY_DELAY_MS * attempt;
        process.stdout.write(`\n   ⚠️  ${error.message} — retrying in ${delay / 1000}s (${attempt}/${MAX_RETRIES})... `);
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }
}

async function main() {
  const config = parseArgs();

  console.log('🔍 Scanning directory:', config.rootDir);
  console.log('');

  const books = scanDirectory(config.rootDir);

  if (books.length === 0) {
    console.log('No audiobooks found in the directory.');
    process.exit(0);
  }

  console.log(`Found ${books.length} audiobook(s):\n`);

  // Display summary
  let totalSize = 0;
  for (const book of books) {
    let bookSize = 0;
    for (const audio of book.audioFiles) {
      bookSize += getFileSize(path.join(book.folderPath, audio));
    }
    if (book.coverFile) {
      bookSize += getFileSize(path.join(book.folderPath, book.coverFile));
    }
    totalSize += bookSize;

    console.log(`📚 ${book.title}`);
    console.log(`   📁 ${book.audioFiles.length} audio file(s), ${formatFileSize(bookSize)}`);
    console.log(`   🎵 Files: ${book.audioFiles.slice(0, 3).join(', ')}${book.audioFiles.length > 3 ? '...' : ''}`);
    console.log(`   🖼️  Cover: ${book.coverFile || 'None'}`);
    console.log('');
  }

  console.log(`Total size: ${formatFileSize(totalSize)}`);
  console.log('');

  if (config.dryRun) {
    console.log('🔍 Dry run mode - no files will be uploaded.');
    process.exit(0);
  }

  // Login
  console.log('🔐 Logging in...');
  let accessToken: string;
  try {
    accessToken = await login(config.apiUrl, config.email, config.password);
    console.log('✅ Login successful\n');
  } catch (error: any) {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  }

  // Fetch existing books to avoid duplicates
  console.log('📖 Checking for existing books...');
  const existingTitles = await getExistingBookTitles(config.apiUrl, accessToken);
  console.log(`   Found ${existingTitles.size} existing book(s) in library\n`);

  // Filter out books that already exist
  const booksToUpload = books.filter(book => {
    const exists = existingTitles.has(book.title.toLowerCase());
    if (exists) {
      console.log(`⏭️  Skipping "${book.title}" (already exists)`);
    }
    return !exists;
  });

  if (booksToUpload.length === 0) {
    console.log('\nNo new books to upload.');
    process.exit(0);
  }

  if (booksToUpload.length !== books.length) {
    console.log(`\n📤 Will upload ${booksToUpload.length} new book(s)\n`);
  }

  // Upload books
  let successCount = 0;
  let failCount = 0;
  let skippedCount = books.length - booksToUpload.length;

  for (let i = 0; i < booksToUpload.length; i++) {
    const book = booksToUpload[i];
    process.stdout.write(`[${i + 1}/${booksToUpload.length}] Uploading "${book.title}"... `);

    try {
      await uploadBookWithRetry(config.apiUrl, accessToken, book, config.bookType, config.storageConfigId || undefined);
      console.log('✅');
      successCount++;

      // Delete source folder after successful upload (unless --keep is specified)
      if (!config.keepFiles) {
        deleteFolder(book.folderPath);
        console.log(`   🗑️  Deleted source folder`);
      }
    } catch (error: any) {
      console.log(`❌ ${error.message}`);
      failCount++;
    }
  }

  console.log('');
  console.log('═══════════════════════════════════');
  console.log(`✅ Successful: ${successCount}`);
  if (skippedCount > 0) {
    console.log(`⏭️  Skipped (already exists): ${skippedCount}`);
  }
  if (failCount > 0) {
    console.log(`❌ Failed: ${failCount}`);
  }
  if (!config.keepFiles && successCount > 0) {
    console.log(`🗑️  Source folders deleted: ${successCount}`);
  }
  console.log('═══════════════════════════════════');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
