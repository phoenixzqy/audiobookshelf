#!/usr/bin/env npx ts-node

/**
 * Rebuild From Storage — Re-create audiobook DB records from disk
 *
 * Scans a storage path for book-{uuid} directories that exist on disk
 * but are missing from the database, then inserts audiobook records.
 *
 * The UUID from the folder name is preserved as the database `id` so
 * all existing file paths remain valid.
 *
 * Usage:
 *   npx tsx src/scripts/rebuild-from-storage.ts --path="E:\audiobookshelf"
 *   npx tsx src/scripts/rebuild-from-storage.ts --path=./storage --dry-run
 *   npx tsx src/scripts/rebuild-from-storage.ts --path=./storage --type=kids
 *
 * Options:
 *   --path=<dir>         Root storage directory containing audiobooks/ (required)
 *   --type=<adult|kids>  Book type for all rebuilt books (default: adult)
 *   --dry-run            Preview what would be inserted without making changes
 *   --help               Show this help message
 *
 * Both --key=value and --key value formats are supported.
 *
 * Prerequisites:
 *   - Database must exist and schema must be applied (npm run migrate)
 *   - An admin user should be created (npm run create-admin)
 *
 * For a preview without DB, use list-storage.ts instead.
 */

import * as path from 'path';
import { pool, query } from '../config/database';
import { localStorageService } from '../services/localStorageService';
import { scanStorage, formatBytes, formatDuration, type ScannedBook } from '../services/storageRebuildService';

// ── Argument parsing ─────────────────────────────────────────

interface CliOptions {
  storagePath: string;
  bookType: 'adult' | 'kids';
  dryRun: boolean;
}

function showHelp(): void {
  console.log(`
Rebuild From Storage — Re-create audiobook DB records from disk

Scans a storage path for book-{uuid} directories missing from the database,
reads audio metadata, and inserts audiobook records.

Usage:
  npx tsx src/scripts/rebuild-from-storage.ts --path="E:\\audiobookshelf"
  npx tsx src/scripts/rebuild-from-storage.ts --path=./storage --dry-run
  npx tsx src/scripts/rebuild-from-storage.ts --path=./storage --type=kids

Options:
  --path=<dir>         Root storage directory containing audiobooks/ (required)
  --type=<adult|kids>  Book type for all rebuilt books (default: adult)
  --dry-run            Preview what would be inserted without making changes
  --help               Show this help message

Prerequisites:
  1. npm run migrate        (create database schema)
  2. npm run create-admin   (create admin user)
  `);
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }

  const options: CliOptions = {
    storagePath: '',
    bookType: 'adult',
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--dry-run') { options.dryRun = true; continue; }

    // --key=value
    const eqIdx = arg.indexOf('=');
    if (eqIdx !== -1) {
      const key = arg.substring(0, eqIdx).replace(/^-+/, '');
      const value = arg.substring(eqIdx + 1);
      if (key === 'path') options.storagePath = value;
      if (key === 'type') options.bookType = value as 'adult' | 'kids';
      continue;
    }

    // --key value
    if (arg.startsWith('-') && i + 1 < args.length && !args[i + 1].startsWith('-')) {
      const key = arg.replace(/^-+/, '');
      if (key === 'path') options.storagePath = args[++i];
      if (key === 'type') options.bookType = args[++i] as 'adult' | 'kids';
      continue;
    }

    // Positional
    if (!arg.startsWith('-') && !options.storagePath) {
      options.storagePath = arg;
    }
  }

  if (!options.storagePath) {
    options.storagePath = path.join(__dirname, '..', '..', 'storage');
  }

  return options;
}

// ── Storage config helpers ───────────────────────────────────

/**
 * Determine if the provided storage path is the default backend/storage
 * location or a custom path. For custom paths, ensure a storage_configs
 * record exists with blob_endpoint='local'.
 */
async function resolveStorageConfigId(storagePath: string): Promise<string | null> {
  const resolvedPath = path.resolve(storagePath);
  const defaultPath = path.resolve(localStorageService.getStorageDir());

  // If the path matches default storage, no config needed
  if (resolvedPath === defaultPath) {
    return null;
  }

  // Check if a storage_configs record already exists for this path
  const existing = await query(
    `SELECT id FROM storage_configs WHERE container_name = $1 AND blob_endpoint = 'local'`,
    [resolvedPath]
  );

  if (existing.rows.length > 0) {
    return existing.rows[0].id;
  }

  // Create a new storage_configs record
  const result = await query(
    `INSERT INTO storage_configs (name, blob_endpoint, container_name, access_key_encrypted, is_active)
     VALUES ($1, 'local', $2, '', true)
     RETURNING id`,
    [`Storage: ${resolvedPath}`, resolvedPath]
  );

  console.log(`   📁 Created storage config for: ${resolvedPath}`);
  return result.rows[0].id;
}

/**
 * Get all book IDs that already exist in the database.
 */
async function getExistingBookIds(): Promise<Set<string>> {
  const result = await query(`SELECT id FROM audiobooks`);
  return new Set(result.rows.map((r: { id: string }) => r.id));
}

// ── Insert logic ─────────────────────────────────────────────

async function insertBook(
  book: ScannedBook,
  bookType: 'adult' | 'kids',
  storageConfigId: string | null
): Promise<void> {
  const coverUrl = book.coverFile
    ? `/storage/audiobooks/${book.folderName}/${book.coverFile}`
    : null;

  const totalDuration = book.episodes.reduce((sum, e) => sum + e.duration, 0);

  const episodes = book.episodes.map(ep => ({
    index: ep.index,
    title: ep.title,
    file: ep.file,
    duration: ep.duration,
  }));

  await query(
    `INSERT INTO audiobooks (id, title, book_type, storage_config_id, blob_path, total_duration_seconds, episodes, cover_url, is_published)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      book.id,
      book.detectedTitle,
      bookType,
      storageConfigId,
      book.folderName,
      totalDuration,
      JSON.stringify(episodes),
      coverUrl,
      true,
    ]
  );
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
  const options = parseArgs();

  console.log('🔄 Rebuild From Storage\n');
  console.log(`   Mode:    ${options.dryRun ? '👀 DRY-RUN (preview only)' : '💾 REBUILD (inserting records)'}`);
  console.log(`   Path:    ${path.resolve(options.storagePath)}`);
  console.log(`   Type:    ${options.bookType}`);
  console.log('');

  // Step 1: Scan storage
  console.log('🔍 Scanning storage for audiobooks...');
  const books = await scanStorage(options.storagePath);

  if (books.length === 0) {
    console.log('   No book-{uuid} directories found.\n');
    return;
  }

  console.log(`   Found ${books.length} book(s) on disk.\n`);

  // Step 2: Check which are already in DB
  console.log('📖 Checking database for existing records...');
  const existingIds = await getExistingBookIds();

  const newBooks = books.filter(b => !existingIds.has(b.id));
  const existingBooks = books.filter(b => existingIds.has(b.id));

  if (existingBooks.length > 0) {
    console.log(`   ⏭️  ${existingBooks.length} book(s) already in database, will skip:`);
    for (const b of existingBooks) {
      console.log(`      • ${b.detectedTitle} (${b.id})`);
    }
    console.log('');
  }

  if (newBooks.length === 0) {
    console.log('   ✅ All books already in database. Nothing to rebuild.\n');
    return;
  }

  console.log(`   📤 ${newBooks.length} new book(s) to rebuild:\n`);

  for (let i = 0; i < newBooks.length; i++) {
    const book = newBooks[i];
    const duration = book.episodes.reduce((sum, e) => sum + e.duration, 0);
    console.log(`   ${i + 1}. ${book.detectedTitle}`);
    console.log(`      ${book.audioFiles.length} episodes, ${formatDuration(duration)}, ${formatBytes(book.totalBytes)}${book.coverFile ? ', has cover' : ''}`);
  }

  if (options.dryRun) {
    console.log('\n   🔍 Dry run — no changes made.\n');
    return;
  }

  // Step 3: Resolve storage config
  console.log('\n📁 Resolving storage configuration...');
  const storageConfigId = await resolveStorageConfigId(options.storagePath);
  if (storageConfigId) {
    console.log(`   Using storage config: ${storageConfigId}`);
  } else {
    console.log(`   Using default storage.`);
  }

  // Step 4: Insert records
  console.log('\n💾 Inserting audiobook records...\n');

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < newBooks.length; i++) {
    const book = newBooks[i];
    try {
      await insertBook(book, options.bookType, storageConfigId);
      console.log(`   ✅ [${i + 1}/${newBooks.length}] ${book.detectedTitle}`);
      successCount++;
    } catch (error: any) {
      console.log(`   ❌ [${i + 1}/${newBooks.length}] ${book.detectedTitle}: ${error.message}`);
      failCount++;
    }
  }

  console.log('\n═══════════════════════════════════');
  console.log(`✅ Rebuilt: ${successCount}`);
  if (existingBooks.length > 0) console.log(`⏭️  Skipped (already in DB): ${existingBooks.length}`);
  if (failCount > 0) console.log(`❌ Failed: ${failCount}`);
  console.log('═══════════════════════════════════\n');
}

main()
  .catch((error) => {
    console.error('Fatal error:', error.message || error);
    process.exit(1);
  })
  .finally(() => {
    pool.end();
  });
