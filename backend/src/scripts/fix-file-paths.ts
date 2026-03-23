#!/usr/bin/env npx ts-node

/**
 * Fix File Paths — Update database episode file paths and titles to match disk files
 *
 * This script fixes file path and title mismatches in the database by scanning the storage
 * directory and updating the episode data to match the actual files on disk.
 *
 * Usage:
 *   npx tsx src/scripts/fix-file-paths.ts --path=./storage
 *   npx tsx src/scripts/fix-file-paths.ts --path=./storage --dry-run
 *
 * Options:
 *   --path=<dir>   Root storage directory containing audiobooks/ subfolder (required)
 *   --dry-run      Show what would be fixed without making changes
 *   --help         Show this help message
 */

import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { Pool } from 'pg';
import { scanStorage, ScannedBook } from '../services/storageRebuildService';

// ── Database configuration ───────────────────────────────────

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'audiobookshelf',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

// ── Types ────────────────────────────────────────────────────

interface DbBook {
  id: string;
  title: string;
  blob_path: string;
  episodes: Episode[];
}

interface Episode {
  index: number;
  file: string;
  title: string;
  duration: number;
}

function isCorrupted(str: string): boolean {
  if (!str) return false;

  const latin1Extended = [...str].filter(c => {
    const code = c.charCodeAt(0);
    return code >= 0x80 && code <= 0xFF;
  });

  if (latin1Extended.length === 0) return false;

  const hasAscii = /[a-zA-Z0-9._\-\/ ]/.test(str);
  if (hasAscii && latin1Extended.length > 0) return true;

  const corruptionPatterns = [
    /ç[\x80-\xFF]/,
    /é[\x80-\xFF]/,
    /è[\x80-\xFF]/,
    /å[\x80-\xFF]/,
    /ä[\x80-\xFF]/,
    /æ[\x80-\xFF]/,
    /ã[\x80-\xFF]/,
    /[\u00A0-\u00FF]{2,}/,
  ];

  return corruptionPatterns.some(p => p.test(str));
}

interface FixResult {
  bookId: string;
  bookTitle: string;
  corrupted: boolean;
  episodesFixed: number;
  details: EpisodeFix[];
}

interface EpisodeFix {
  index: number;
  oldFile: string;
  newFile: string;
  oldTitle: string;
  newTitle: string;
  renameDisk: boolean;
}

// ── CLI parsing ──────────────────────────────────────────────

interface CliOptions {
  storagePath: string;
  dryRun: boolean;
}

function showHelp(): void {
  console.log(`
Fix File Paths — Update database episode file paths and titles to match disk files

This script updates episode file paths and titles in the database to match the actual
files found on disk, fixing any mismatches that may cause 404 errors.

Usage:
  npx tsx src/scripts/fix-file-paths.ts --path=./storage
  npx tsx src/scripts/fix-file-paths.ts --path=./storage --dry-run

Options:
  --path=<dir>   Root storage directory (required)
  --dry-run      Show what would be fixed without making changes
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
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--dry-run') { options.dryRun = true; continue; }

    const eqIdx = arg.indexOf('=');
    if (eqIdx !== -1) {
      const key = arg.substring(0, eqIdx).replace(/^-+/, '');
      const value = arg.substring(eqIdx + 1);
      if (key === 'path') options.storagePath = value;
      continue;
    }

    if (arg.startsWith('-') && i + 1 < args.length && !args[i + 1].startsWith('-')) {
      const key = arg.replace(/^-+/, '');
      if (key === 'path') options.storagePath = args[++i];
      continue;
    }

    if (!arg.startsWith('-') && !options.storagePath) {
      options.storagePath = arg;
    }
  }

  if (!options.storagePath) {
    options.storagePath = path.join(__dirname, '..', '..', 'storage');
  }

  return options;
}

// ── Main logic ───────────────────────────────────────────────

async function getAllBooks(): Promise<DbBook[]> {
  const result = await pool.query(`
    SELECT 
      id, 
      title, 
      blob_path,
      CASE 
        WHEN jsonb_typeof(episodes) = 'array' THEN episodes
        ELSE '[]'::jsonb
      END as episodes
    FROM audiobooks
    ORDER BY title
  `);
  
  return result.rows.map(row => ({
    ...row,
    episodes: Array.isArray(row.episodes) ? row.episodes : [],
  }));
}

async function updateBookEpisodes(bookId: string, episodes: Episode[]): Promise<void> {
  await pool.query(`
    UPDATE audiobooks
    SET episodes = $1::jsonb, updated_at = NOW()
    WHERE id = $2
  `, [JSON.stringify(episodes), bookId]);
}

function findMatchingDiskBook(dbBook: DbBook, diskBooks: ScannedBook[]): ScannedBook | null {
  // Try to match by UUID in blob_path
  for (const diskBook of diskBooks) {
    if (dbBook.blob_path.includes(diskBook.id)) {
      return diskBook;
    }
  }
  
  // Try to match by book ID directly
  const matchById = diskBooks.find(d => d.id === dbBook.id);
  if (matchById) return matchById;
  
  return null;
}

function compareEpisodes(dbEpisodes: Episode[], diskEpisodes: { index: number; file: string; title: string; duration: number }[]): EpisodeFix[] {
  const fixes: EpisodeFix[] = [];

  for (const dbEp of dbEpisodes) {
    const diskEp = diskEpisodes.find(d => d.index === dbEp.index);
    if (!diskEp) continue;

    if (dbEp.file !== diskEp.file || dbEp.title !== diskEp.title) {
      const diskFileCorrupt = isCorrupted(diskEp.file);
      const dbFileCorrupt = isCorrupted(dbEp.file);
      const renameDisk = diskFileCorrupt && !dbFileCorrupt;

      fixes.push({
        index: dbEp.index,
        oldFile: diskEp.file,
        newFile: dbEp.file,
        oldTitle: diskEp.title,
        newTitle: dbEp.title,
        renameDisk,
      });
    }
  }

  return fixes;
}

async function renameDiskFile(folderPath: string, oldName: string, newName: string, dryRun: boolean): Promise<boolean> {
  if (oldName === newName) return false;

  const fromPath = path.join(folderPath, oldName);
  const toPath = path.join(folderPath, newName);

  try {
    await fsp.access(fromPath, fs.constants.R_OK);
  } catch {
    console.warn(`      ⚠️  Disk file not found for rename: ${oldName}`);
    return false;
  }

  if (dryRun) {
    console.log(`      ⏸️  Would rename on disk: "${oldName}" → "${newName}"`);
    return true;
  }

  try {
    await fsp.access(toPath, fs.constants.F_OK);
    console.warn(`      ⚠️  Target file already exists, skipping rename: ${newName}`);
    return false;
  } catch {
    // target does not exist (good)
  }

  await fsp.rename(fromPath, toPath);
  console.log(`      ✏️  Renamed disk file: "${oldName}" → "${newName}"`);
  return true;
}

async function main() {
  const options = parseArgs();
  
  console.log('🔧 Fix File Paths — Update database file paths to match disk\n');
  console.log(`   Storage path: ${path.resolve(options.storagePath)}`);
  console.log(`   Mode: ${options.dryRun ? 'DRY RUN (no changes)' : 'LIVE (will update database)'}`);
  console.log('');
  
  // Step 1: Scan disk for actual file names
  console.log('📂 Scanning storage for audiobooks...');
  const diskBooks = await scanStorage(options.storagePath);
  console.log(`   Found ${diskBooks.length} books on disk\n`);
  
  if (diskBooks.length === 0) {
    console.log('   No books found on disk. Nothing to compare.\n');
    await pool.end();
    return;
  }
  
  // Step 2: Get books from database
  console.log('🗄️  Loading books from database...');
  const dbBooks = await getAllBooks();
  console.log(`   Found ${dbBooks.length} books in database\n`);
  
  // Step 3: Compare and detect corruption
  console.log('🔍 Analyzing encoding...\n');
  
  const results: FixResult[] = [];
  let totalFixed = 0;
  
  for (const dbBook of dbBooks) {
    const diskBook = findMatchingDiskBook(dbBook, diskBooks);
    
    if (!diskBook) {
      continue;
    }
    
    const fixes = compareEpisodes(dbBook.episodes, diskBook.episodes);
    
    const result: FixResult = {
      bookId: dbBook.id,
      bookTitle: dbBook.title,
      corrupted: fixes.length > 0,
      episodesFixed: fixes.length,
      details: fixes,
    };
    
    results.push(result);
    
    if (fixes.length > 0) {
      totalFixed += fixes.length;
      
      console.log(`   📖 ${dbBook.title}`);
      console.log(`      ID: ${dbBook.id}`);
      console.log(`      File mismatches: ${fixes.length}`);
      
      const firstFix = fixes[0];
      console.log(`      Example fix (Episode ${firstFix.index + 1}):`);
      console.log(`        File: "${firstFix.oldFile}" → "${firstFix.newFile}"`);

      // Rename corrupted disk files first.
      for (const fix of fixes) {
        if (fix.renameDisk) {
          await renameDiskFile(diskBook.folderPath, fix.oldFile, fix.newFile, options.dryRun);
        }
      }

      // Step 4: Update DB episodes with correct values.
      if (!options.dryRun) {
        const fixedEpisodes = dbBook.episodes.map(ep => {
          const fix = fixes.find(f => f.index === ep.index);
          if (fix) {
            return {
              ...ep,
              file: fix.newFile,
              title: fix.newTitle,
            };
          }
          return ep;
        });

        await updateBookEpisodes(dbBook.id, fixedEpisodes);

        // Verify the fix was applied
        const verifyResult = await pool.query(`
          SELECT episodes FROM audiobooks WHERE id = $1
        `, [dbBook.id]);

        if (verifyResult.rows.length > 0) {
          const savedEpisodes = verifyResult.rows[0].episodes;
          const savedEpisode = savedEpisodes.find((e: Episode) => e.index === firstFix.index);
          
          if (savedEpisode && savedEpisode.file === firstFix.newFile) {
            console.log(`      ✅ Fixed and verified\n`);
          } else {
            console.log(`      ⚠️  Update may have failed - verification showed no change\n`);
            console.log(`         Expected: ${firstFix.newFile}`);
            console.log(`         Got: ${savedEpisode?.file || 'undefined'}\n`);
          }
        }
      } else {
        console.log(`      ⏸️  Would fix (dry-run)\n`);
      }
    }
  }
  
  // Summary
  console.log('─'.repeat(60));
  console.log('\n📊 Summary:\n');
  console.log(`   Books analyzed:    ${results.length}`);
  console.log(`   Episodes fixed:    ${totalFixed}`);
  
  if (options.dryRun && totalFixed > 0) {
    console.log('\n   Run without --dry-run to apply fixes.\n');
  } else if (totalFixed > 0) {
    console.log('\n   ✅ All file paths have been fixed.\n');
  } else {
    console.log('\n   ✅ No file path mismatches detected.\n');
  }
  
  await pool.end();
}

main().catch((error) => {
  console.error('Fatal error:', error.message || error);
  pool.end();
  process.exit(1);
});
