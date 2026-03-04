#!/usr/bin/env npx ts-node

/**
 * List Storage — Inspect book-{uuid} directories on disk (read-only)
 *
 * Scans a storage path for audiobook folders with UUID-based names,
 * reads audio metadata (ID3 tags), and displays a human-readable summary.
 *
 * NO database connection is required.
 *
 * Usage:
 *   npx tsx src/scripts/list-storage.ts --path="E:\audiobookshelf"
 *   npx tsx src/scripts/list-storage.ts --path=./storage
 *   npx tsx src/scripts/list-storage.ts --path=./storage --json
 *   npx tsx src/scripts/list-storage.ts --path=./storage --verbose
 *
 * Options:
 *   --path=<dir>   Root storage directory containing audiobooks/ subfolder (required)
 *   --json         Output results as JSON
 *   --verbose      Show individual audio files per book
 *   --help         Show this help message
 *
 * Both --key=value and --key value formats are supported.
 */

import * as path from 'path';
import { scanStorage, formatBytes, formatDuration } from '../services/storageRebuildService';

// ── Argument parsing ─────────────────────────────────────────

interface CliOptions {
  storagePath: string;
  jsonOutput: boolean;
  verbose: boolean;
}

function showHelp(): void {
  console.log(`
List Storage — Inspect book-{uuid} directories on disk

Scans a storage path for audiobook folders, reads audio metadata (ID3 tags),
and displays a human-readable summary.  No database connection needed.

Usage:
  npx tsx src/scripts/list-storage.ts --path="E:\\audiobookshelf"
  npx tsx src/scripts/list-storage.ts --path=./storage
  npx tsx src/scripts/list-storage.ts --path=./storage --json
  npx tsx src/scripts/list-storage.ts --path=./storage --verbose

Options:
  --path=<dir>   Root storage directory containing audiobooks/ subfolder (required)
  --json         Output results as JSON
  --verbose      Show individual audio files per book
  --help         Show this help message
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
    jsonOutput: false,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--json') { options.jsonOutput = true; continue; }
    if (arg === '--verbose') { options.verbose = true; continue; }

    // --key=value
    const eqIdx = arg.indexOf('=');
    if (eqIdx !== -1) {
      const key = arg.substring(0, eqIdx).replace(/^-+/, '');
      const value = arg.substring(eqIdx + 1);
      if (key === 'path') options.storagePath = value;
      continue;
    }

    // --key value
    if (arg.startsWith('-') && i + 1 < args.length && !args[i + 1].startsWith('-')) {
      const key = arg.replace(/^-+/, '');
      if (key === 'path') options.storagePath = args[++i];
      continue;
    }

    // Positional
    if (!arg.startsWith('-') && !options.storagePath) {
      options.storagePath = arg;
    }
  }

  // Default to backend/storage if not specified
  if (!options.storagePath) {
    options.storagePath = path.join(__dirname, '..', '..', 'storage');
  }

  return options;
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
  const options = parseArgs();

  if (!options.jsonOutput) {
    console.log('📂 List Storage — Scanning for audiobooks\n');
    console.log(`   Storage path: ${path.resolve(options.storagePath)}`);
    console.log('');
  }

  const books = await scanStorage(options.storagePath);

  if (books.length === 0) {
    if (options.jsonOutput) {
      console.log(JSON.stringify({ books: [], total: 0 }, null, 2));
    } else {
      console.log('   No book-{uuid} directories found.\n');
    }
    return;
  }

  if (options.jsonOutput) {
    console.log(JSON.stringify({
      storagePath: path.resolve(options.storagePath),
      total: books.length,
      books: books.map(b => ({
        id: b.id,
        folderName: b.folderName,
        detectedTitle: b.detectedTitle,
        detectedAuthor: b.detectedAuthor,
        detectedAlbum: b.detectedAlbum,
        audioFileCount: b.audioFiles.length,
        coverFile: b.coverFile,
        totalBytes: b.totalBytes,
        totalDurationSeconds: b.episodes.reduce((sum, e) => sum + e.duration, 0),
        audioFiles: b.audioFiles,
        episodes: b.episodes,
      })),
    }, null, 2));
    return;
  }

  // Human-readable output
  let totalSize = 0;
  let totalDuration = 0;
  let booksWithCover = 0;

  console.log(`   Found ${books.length} audiobook(s):\n`);
  console.log('   ─'.padEnd(100, '─'));

  for (let i = 0; i < books.length; i++) {
    const book = books[i];
    const bookDuration = book.episodes.reduce((sum, e) => sum + e.duration, 0);
    totalSize += book.totalBytes;
    totalDuration += bookDuration;
    if (book.coverFile) booksWithCover++;

    console.log(`   ${i + 1}. ${book.detectedTitle}`);
    console.log(`      UUID:     ${book.id}`);
    console.log(`      Folder:   ${book.folderName}`);
    if (book.detectedAuthor) {
      console.log(`      Author:   ${book.detectedAuthor}`);
    }
    if (book.detectedAlbum && book.detectedAlbum !== book.detectedTitle) {
      console.log(`      Album:    ${book.detectedAlbum}`);
    }
    console.log(`      Episodes: ${book.audioFiles.length} files`);
    console.log(`      Duration: ${formatDuration(bookDuration)}`);
    console.log(`      Size:     ${formatBytes(book.totalBytes)}`);
    console.log(`      Cover:    ${book.coverFile || '(none)'}`);

    if (options.verbose) {
      console.log(`      Files:`);
      for (const ep of book.episodes) {
        const durStr = ep.duration > 0 ? ` (${formatDuration(ep.duration)})` : '';
        console.log(`        ${ep.index + 1}. ${ep.file}${durStr}`);
      }
    }

    console.log('   ─'.padEnd(100, '─'));
  }

  console.log(`\n   Summary:`);
  console.log(`     Books:    ${books.length}`);
  console.log(`     Covers:   ${booksWithCover} / ${books.length}`);
  console.log(`     Duration: ${formatDuration(totalDuration)}`);
  console.log(`     Size:     ${formatBytes(totalSize)}`);
  console.log('');
}

main().catch((error) => {
  console.error('Fatal error:', error.message || error);
  process.exit(1);
});
