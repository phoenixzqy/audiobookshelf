#!/usr/bin/env npx ts-node

/**
 * Bulk Audiobook Ingest Script (Local)
 *
 * Moves audiobook folders directly into storage and inserts records into the database.
 * No HTTP upload — works entirely on the local filesystem and PostgreSQL.
 *
 * Usage:
 *   npm run bulk-upload -- --path=/path/to/audiobooks
 *
 * Options:
 *   --path=<dir>         Root directory containing audiobook folders (required)
 *   --type=<adult|kids>  Book type (default: adult)
 *   --storage=<id>       Storage config ID (default: use default storage)
 *   --dry-run            Preview what would be ingested without making changes
 *   --keep               Copy files instead of moving (keeps source)
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
 *   - By default, moves (renames) source files into storage — instant on same volume
 *   - Requires DATABASE_URL in backend/.env
 */

import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { pool, query } from '../config/database';
import { localStorageService } from '../services/localStorageService';

// Configuration
interface Config {
  rootDir: string;
  bookType: 'adult' | 'kids';
  dryRun: boolean;
  keepFiles: boolean;
  storageConfigId: string;
}

// Book structure
interface BookToIngest {
  title: string;
  folderPath: string;
  audioFiles: string[];
  coverFile: string | null;
  totalBytes: number;
}

// Supported file extensions
const AUDIO_EXTENSIONS = ['.mp3', '.m4a', '.m4b', '.wav', '.flac', '.ogg', '.aac'];
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
const COVER_NAMES = ['cover', 'folder', 'front', 'artwork', 'album'];

function showHelp(): void {
  console.log(`
Bulk Audiobook Ingest Script (Local)

Moves audiobook folders directly into storage and inserts DB records.
No API server needed — operates on local filesystem + PostgreSQL.

Usage:
  npm run bulk-upload -- --path=/path/to/audiobooks
  npx tsx src/scripts/bulk-upload.ts --path=/path/to/audiobooks

Options:
  --path=<dir>         Root directory containing audiobook folders (required)
  --type=<adult|kids>  Book type (default: adult)
  --storage=<id>       Storage config ID (default: use default storage)
  --dry-run            Preview what would be ingested without making changes
  --keep               Copy files instead of moving (keeps source)

Environment variables (alternative to CLI args):
  UPLOAD_PATH, UPLOAD_TYPE, UPLOAD_STORAGE, UPLOAD_DRY_RUN, UPLOAD_KEEP

Examples:
  npm run bulk-upload -- --path="H:\\audiobooks\\kids" --type=kids
  npm run bulk-upload -- --path=./audiobooks --dry-run
  npm run bulk-upload -- --path=./audiobooks --keep
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
    dryRun: false,
    keepFiles: false,
    storageConfigId: '',
  };

  function parseKeyValue(arg: string): [string, string] | null {
    const eqIdx = arg.indexOf('=');
    if (eqIdx === -1) return null;
    return [arg.substring(0, eqIdx), arg.substring(eqIdx + 1)];
  }

  function applyValue(key: string, value: string): void {
    const normalizedKey = key.replace(/^-+/, '');
    switch (normalizedKey) {
      case 'path': config.rootDir = value; break;
      case 'type': config.bookType = value as 'adult' | 'kids'; break;
      case 'storage': config.storageConfigId = value; break;
    }
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--dry-run' || arg === '-dry-run') { config.dryRun = true; continue; }
    if (arg === '--keep' || arg === '-keep') { config.keepFiles = true; continue; }

    const kv = parseKeyValue(arg);
    if (kv) {
      applyValue(kv[0], kv[1]);
      continue;
    }

    if (arg.startsWith('-') && i + 1 < args.length && !args[i + 1].startsWith('-')) {
      applyValue(arg, args[++i]);
      continue;
    }

    if (!arg.startsWith('-') && !config.rootDir) {
      config.rootDir = arg;
    }
  }

  // Environment variable fallbacks
  if (!config.rootDir && process.env.UPLOAD_PATH) config.rootDir = process.env.UPLOAD_PATH;
  if (process.env.UPLOAD_TYPE) config.bookType = process.env.UPLOAD_TYPE as 'adult' | 'kids';
  if (process.env.UPLOAD_STORAGE) config.storageConfigId = process.env.UPLOAD_STORAGE;
  if (process.env.UPLOAD_DRY_RUN === '1' || process.env.UPLOAD_DRY_RUN === 'true') config.dryRun = true;
  if (process.env.UPLOAD_KEEP === '1' || process.env.UPLOAD_KEEP === 'true') config.keepFiles = true;

  if (!config.rootDir) {
    console.error('Error: --path is required (root directory containing audiobook folders)');
    console.error('Use --help for full usage information.');
    process.exit(1);
  }

  if (!fs.existsSync(config.rootDir)) {
    console.error(`Error: Directory not found: ${config.rootDir}`);
    process.exit(1);
  }

  return config;
}

// ── File helpers ─────────────────────────────────────────────

function isAudioFile(filename: string): boolean {
  return AUDIO_EXTENSIONS.includes(path.extname(filename).toLowerCase());
}

function isImageFile(filename: string): boolean {
  return IMAGE_EXTENSIONS.includes(path.extname(filename).toLowerCase());
}

function isCoverImage(filename: string): boolean {
  if (!isImageFile(filename)) return false;
  const baseName = path.basename(filename, path.extname(filename)).toLowerCase();
  return COVER_NAMES.some(name => baseName.includes(name));
}

function extractNumbers(filename: string): number[] {
  const matches = filename.match(/\d+/g);
  return matches ? matches.map(Number) : [];
}

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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function getFileSize(filePath: string): number {
  return fs.statSync(filePath).size;
}

// ── Directory scanning ───────────────────────────────────────

function scanDirectory(rootDir: string): BookToIngest[] {
  const books: BookToIngest[] = [];
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const folderPath = path.join(rootDir, entry.name);
    const files = fs.readdirSync(folderPath);
    const audioFiles = files.filter(isAudioFile).sort(compareByNumbers);

    if (audioFiles.length === 0) {
      console.warn(`⚠️  No audio files in "${entry.name}", skipping`);
      continue;
    }

    let coverFile: string | null = null;
    const coverCandidate = files.find(isCoverImage);
    if (coverCandidate) {
      coverFile = coverCandidate;
    } else {
      const anyImage = files.find(isImageFile);
      if (anyImage) coverFile = anyImage;
    }

    let totalBytes = 0;
    for (const f of audioFiles) {
      totalBytes += getFileSize(path.join(folderPath, f));
    }
    if (coverFile) {
      totalBytes += getFileSize(path.join(folderPath, coverFile));
    }

    books.push({ title: entry.name, folderPath, audioFiles, coverFile, totalBytes });
  }

  return books;
}

// ── Storage path resolution ──────────────────────────────────

async function resolveStorageBasePath(storageConfigId: string | null): Promise<string> {
  if (!storageConfigId) {
    return localStorageService.getStorageDir();
  }

  const result = await query(
    `SELECT container_name FROM storage_configs WHERE id = $1`,
    [storageConfigId]
  );

  if (result.rows.length === 0) {
    console.warn(`⚠️  Storage config "${storageConfigId}" not found, using default`);
    return localStorageService.getStorageDir();
  }

  return result.rows[0].container_name;
}

// ── File move/copy with cross-volume fallback ────────────────

async function moveFile(src: string, dest: string): Promise<void> {
  try {
    await fsp.rename(src, dest);
  } catch (err: any) {
    if (err.code === 'EXDEV') {
      await fsp.copyFile(src, dest);
      await fsp.unlink(src);
    } else {
      throw err;
    }
  }
}

async function copyFile(src: string, dest: string): Promise<void> {
  await fsp.copyFile(src, dest);
}

// ── Existing book check ──────────────────────────────────────

async function getExistingBookTitles(): Promise<Set<string>> {
  const result = await query(`SELECT LOWER(title) as title FROM audiobooks`);
  return new Set(result.rows.map((r: any) => r.title));
}

// ── Ingest a single book ─────────────────────────────────────

async function ingestBook(
  book: BookToIngest,
  bookType: 'adult' | 'kids',
  storageBasePath: string,
  storageConfigId: string | null,
  keepFiles: boolean
): Promise<void> {
  const startTime = Date.now();
  const bookId = uuidv4();
  const blobPath = `book-${bookId}`;
  const targetDir = path.join(storageBasePath, 'audiobooks', blobPath);
  const transferFn = keepFiles ? copyFile : moveFile;
  const verb = keepFiles ? 'Copying' : 'Moving';

  console.log(`   📂 Target: ${targetDir}`);

  await fsp.mkdir(targetDir, { recursive: true });

  let movedFiles = 0;
  const totalFiles = book.audioFiles.length + (book.coverFile ? 1 : 0);

  try {
    // Move/copy cover
    let coverUrl: string | null = null;
    if (book.coverFile) {
      const src = path.join(book.folderPath, book.coverFile);
      const dest = path.join(targetDir, book.coverFile);
      console.log(`   📎 ${verb} cover: ${book.coverFile}`);
      await transferFn(src, dest);
      coverUrl = `/storage/audiobooks/${blobPath}/${book.coverFile}`;
      movedFiles++;
    }

    // Move/copy audio files
    console.log(`   🎵 ${verb} ${book.audioFiles.length} audio file(s)...`);
    for (let i = 0; i < book.audioFiles.length; i++) {
      const audioFile = book.audioFiles[i];
      const src = path.join(book.folderPath, audioFile);
      const dest = path.join(targetDir, audioFile);
      await transferFn(src, dest);
      movedFiles++;

      if ((movedFiles % 100 === 0) || i === book.audioFiles.length - 1) {
        const pct = Math.round((movedFiles / totalFiles) * 100);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        process.stdout.write(`\r   📦 ${verb}: ${movedFiles}/${totalFiles} files (${pct}%) | ${elapsed}s elapsed   `);
      }
    }
    process.stdout.write('\n');

    // Build episodes JSONB
    const episodes = book.audioFiles.map((file, index) => ({
      index,
      title: path.basename(file, path.extname(file))
        .replace(/^\d+[-_.\s]*/, '')
        .replace(/[-_]/g, ' ')
        .trim() || `Episode ${index + 1}`,
      file,
      duration: 0,
    }));

    // Insert into database
    console.log(`   💾 Inserting DB record...`);
    await query(
      `INSERT INTO audiobooks (id, title, book_type, storage_config_id, blob_path, total_duration_seconds, episodes, cover_url, is_published)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        bookId,
        book.title,
        bookType,
        storageConfigId,
        blobPath,
        0,
        JSON.stringify(episodes),
        coverUrl,
        true,
      ]
    );

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`   ✅ Done in ${elapsed}s (${formatFileSize(book.totalBytes)})`);

    // Clean up empty source folder if we moved files
    if (!keepFiles) {
      try {
        const remaining = fs.readdirSync(book.folderPath);
        if (remaining.length === 0) {
          fs.rmdirSync(book.folderPath);
          console.log(`   🗑️  Removed empty source folder`);
        } else {
          console.log(`   ⚠️  Source folder not empty (${remaining.length} extra files), keeping it`);
        }
      } catch {
        // Ignore cleanup errors
      }
    }
  } catch (error) {
    // Rollback: remove the partially-created target directory
    console.log(`\n   🔄 Rolling back: removing ${targetDir}`);
    try {
      await fsp.rm(targetDir, { recursive: true, force: true });
    } catch {
      // Ignore rollback errors
    }
    throw error;
  }
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
  const config = parseArgs();

  console.log('📚 Bulk Audiobook Ingest (Local)');
  console.log(`   Mode: ${config.keepFiles ? 'COPY (keeping source)' : 'MOVE (source will be removed)'}`);
  console.log(`   Source: ${config.rootDir}`);
  console.log('');

  console.log('🔍 Scanning directory...');
  const books = scanDirectory(config.rootDir);

  if (books.length === 0) {
    console.log('No audiobooks found.');
    return;
  }

  let totalSize = 0;
  for (const book of books) {
    totalSize += book.totalBytes;
    console.log(`   📚 ${book.title} — ${book.audioFiles.length} files, ${formatFileSize(book.totalBytes)}`);
  }
  console.log(`\n   Total: ${books.length} book(s), ${formatFileSize(totalSize)}\n`);

  // Resolve storage path
  const storageConfigId = config.storageConfigId || null;
  const storageBasePath = await resolveStorageBasePath(storageConfigId);
  console.log(`📁 Storage: ${storageBasePath}${storageConfigId ? ` (config: ${storageConfigId})` : ' (default)'}`);

  // Check for existing books
  console.log('📖 Checking for duplicates...');
  const existingTitles = await getExistingBookTitles();

  const booksToIngest = books.filter(book => {
    if (existingTitles.has(book.title.toLowerCase())) {
      console.log(`   ⏭️  "${book.title}" already exists, skipping`);
      return false;
    }
    return true;
  });

  if (booksToIngest.length === 0) {
    console.log('\nNo new books to ingest.');
    return;
  }

  if (booksToIngest.length !== books.length) {
    console.log(`\n📤 Will ingest ${booksToIngest.length} new book(s)\n`);
  }

  if (config.dryRun) {
    console.log('\n🔍 Dry run — no changes made.');
    return;
  }

  let successCount = 0;
  let failCount = 0;
  const skippedCount = books.length - booksToIngest.length;

  for (let i = 0; i < booksToIngest.length; i++) {
    const book = booksToIngest[i];
    console.log(`\n[${i + 1}/${booksToIngest.length}] 📚 "${book.title}"`);

    try {
      await ingestBook(book, config.bookType, storageBasePath, storageConfigId, config.keepFiles);
      successCount++;
    } catch (error: any) {
      console.log(`   ❌ Failed: ${error.message}`);
      failCount++;
    }
  }

  console.log('\n═══════════════════════════════════');
  console.log(`✅ Ingested: ${successCount}`);
  if (skippedCount > 0) console.log(`⏭️  Skipped (duplicates): ${skippedCount}`);
  if (failCount > 0) console.log(`❌ Failed: ${failCount}`);
  console.log('═══════════════════════════════════');
}

main()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  })
  .finally(() => {
    pool.end();
  });
