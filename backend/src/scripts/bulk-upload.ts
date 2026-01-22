#!/usr/bin/env npx ts-node

/**
 * Bulk Audiobook Upload Script
 *
 * Usage:
 *   npm run bulk-upload -- <root-directory> [options]
 *
 * Options:
 *   --type <adult|kids>  Book type (default: adult)
 *   --api <url>          API base URL (default: http://localhost:8080/api)
 *   --email <email>      Admin email for authentication
 *   --password <pass>    Admin password for authentication
 *   --dry-run            Show what would be uploaded without actually uploading
 *   --keep               Keep source files after upload (default: delete after success)
 *
 * Directory Structure:
 *   root/
 *   ├── Book Title 1/
 *   │   ├── 01-chapter-one.mp3
 *   │   ├── 02-chapter-two.mp3
 *   │   └── cover.jpg (or cover.png, cover.jpeg, folder.jpg, etc.)
 *   └── Book Title 2/
 *       ├── audio1.mp3
 *       └── cover.png
 *
 * Notes:
 *   - Book title is taken from the folder name
 *   - Audio files are sorted alphabetically for correct chapter order
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

function parseArgs(): Config {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
Bulk Audiobook Upload Script

Usage:
  npx ts-node scripts/bulk-upload.ts <root-directory> [options]

Options:
  --type <adult|kids>  Book type (default: adult)
  --api <url>          API base URL (default: http://localhost:8080/api)
  --email <email>      Admin email for authentication
  --password <pass>    Admin password for authentication
  --dry-run            Show what would be uploaded without actually uploading
  --keep               Keep source files after upload (default: delete after success)

Example:
  npx ts-node scripts/bulk-upload.ts ./audiobooks --email admin@example.com --password secret123
    `);
    process.exit(0);
  }

  const config: Config = {
    rootDir: args[0],
    bookType: 'adult',
    apiUrl: 'http://localhost:8080/api',
    email: '',
    password: '',
    dryRun: false,
    keepFiles: false,
  };

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case '--type':
        config.bookType = args[++i] as 'adult' | 'kids';
        break;
      case '--api':
        config.apiUrl = args[++i];
        break;
      case '--email':
        config.email = args[++i];
        break;
      case '--password':
        config.password = args[++i];
        break;
      case '--dry-run':
        config.dryRun = true;
        break;
      case '--keep':
        config.keepFiles = true;
        break;
    }
  }

  // Validate
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
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

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
    throw new Error(`Login failed: ${error.message}`);
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
  bookType: 'adult' | 'kids'
): Promise<void> {
  const form = new FormData();

  // Add metadata
  form.append('title', book.title);
  form.append('bookType', bookType);

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

  // Generate chapter metadata
  const chapters = book.audioFiles.map((file, index) => ({
    title: path.basename(file, path.extname(file))
      .replace(/^\d+[-_.\s]*/, '') // Remove leading numbers
      .replace(/[-_]/g, ' ') // Replace dashes/underscores with spaces
      .trim() || `Chapter ${index + 1}`,
    duration: 0,
  }));
  form.append('chapters', JSON.stringify(chapters));

  // Upload
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
      await uploadBook(config.apiUrl, accessToken, book, config.bookType);
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
