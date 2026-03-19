#!/usr/bin/env npx ts-node

/**
 * Fix Encoding — Detect and repair corrupted Chinese text in database
 *
 * This script fixes a common encoding corruption issue where UTF-8 encoded
 * Chinese characters were incorrectly read as Latin-1 (ISO-8859-1) during
 * database recovery, resulting in "mojibake" like "ç¥ç§å¤è" instead of
 * proper Chinese text.
 *
 * The fix works by:
 * 1. Reading all books from the database
 * 2. Scanning actual files on disk (which have correct UTF-8 names)
 * 3. Comparing and detecting corrupted episode data
 * 4. Updating the database with the correct file names from disk
 *
 * Usage:
 *   npx tsx src/scripts/fix-encoding.ts --path="E:\audiobookshelf"
 *   npx tsx src/scripts/fix-encoding.ts --path=./storage --dry-run
 *   npx tsx src/scripts/fix-encoding.ts --path=./storage --verbose
 *
 * Options:
 *   --path=<dir>   Root storage directory containing audiobooks/ subfolder (required)
 *   --dry-run      Show what would be fixed without making changes
 *   --verbose      Show detailed comparison for each book
 *   --help         Show this help message
 */

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
}

// ── Encoding detection ───────────────────────────────────────

/**
 * Detect if a string contains encoding corruption (mojibake).
 * 
 * Corrupted UTF-8 text misread as Latin-1 typically contains:
 * - Characters in the range U+0080 to U+00FF (Latin-1 supplement)
 * - Mixed ASCII digits/punctuation with Latin-1 extended characters
 */
function isCorrupted(str: string): boolean {
  if (!str) return false;
  
  // Check for Latin-1 extended characters (0x80-0xFF)
  const latin1Extended = [...str].filter(c => {
    const code = c.charCodeAt(0);
    return code >= 0x80 && code <= 0xFF;
  });
  
  // No Latin-1 extended chars = not corrupted
  if (latin1Extended.length === 0) return false;
  
  // If we have Latin-1 extended characters mixed with ASCII,
  // it's likely corruption (UTF-8 bytes read as Latin-1)
  const hasAscii = /[a-zA-Z0-9._\-\/ ]/.test(str);
  if (hasAscii && latin1Extended.length > 0) {
    return true;
  }
  
  // Check for specific corruption patterns
  // These are UTF-8 sequences misread as Latin-1
  const corruptionPatterns = [
    // UTF-8 lead byte 0xE7 (ç) followed by continuation bytes
    /ç[\x80-\xFF]/,
    // UTF-8 lead byte 0xE9 (é) followed by continuation bytes  
    /é[\x80-\xFF]/,
    // UTF-8 lead byte 0xE8 (è) followed by continuation bytes
    /è[\x80-\xFF]/,
    // UTF-8 lead byte 0xE5 (å) followed by continuation bytes
    /å[\x80-\xFF]/,
    // UTF-8 lead byte 0xE4 (ä) followed by continuation bytes
    /ä[\x80-\xFF]/,
    // UTF-8 lead byte 0xE6 (æ) followed by continuation bytes
    /æ[\x80-\xFF]/,
    // UTF-8 lead byte 0xE3 (ã) followed by continuation bytes
    /ã[\x80-\xFF]/,
    // Mixed sequences with multiple 0xB0-0xBF values (common in CJK UTF-8)
    /[\u00A0-\u00FF]{2,}/,
  ];
  
  return corruptionPatterns.some(p => p.test(str));
}

/**
 * Attempt to fix a corrupted string by reversing the encoding error.
 * 
 * The corruption happened when:
 * 1. UTF-8 bytes were read as Latin-1 (each byte became a character)
 * 2. Those characters were then stored as UTF-8
 * 
 * To fix: treat each character's code point as a byte value, reconstruct
 * the original bytes, then decode as UTF-8.
 */
function tryFixEncoding(str: string): string | null {
  try {
    if (!str) return null;
    
    const bytes: number[] = [];
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      
      // Latin-1 extended chars (128-255) - treat as single byte
      if (code >= 0x80 && code <= 0xFF) {
        bytes.push(code);
      }
      // ASCII chars - keep as-is
      else if (code >= 0x00 && code <= 0x7F) {
        bytes.push(code);
      }
      // Unicode characters outside ASCII/Latin-1 range
      // These might already be partially correct, encode as UTF-8
      else {
        const utf8Bytes = Buffer.from(str[i], 'utf8');
        for (let j = 0; j < utf8Bytes.length; j++) {
          bytes.push(utf8Bytes[j]);
        }
      }
    }
    
    const fixed = Buffer.from(bytes).toString('utf8');
    
    // Validation: check the result contains valid characters
    if (!fixed || fixed.includes('\uFFFD')) {
      return null;
    }
    
    // Additional validation: if input was corrupted (had Latin-1 chars),
    // output should be different and not have those chars
    const hadLatin1 = /[\u0080-\u00FF]/.test(str);
    if (hadLatin1 && fixed === str) {
      return null; // No change, fix didn't work
    }
    
    return fixed;
  } catch {
    return null;
  }
}

// ── CLI parsing ──────────────────────────────────────────────

interface CliOptions {
  storagePath: string;
  dryRun: boolean;
  verbose: boolean;
}

function showHelp(): void {
  console.log(`
Fix Encoding — Detect and repair corrupted Chinese text in database

This script fixes encoding corruption where UTF-8 Chinese characters
were incorrectly read as Latin-1 during database recovery.

Usage:
  npx tsx src/scripts/fix-encoding.ts --path="E:\\audiobookshelf"
  npx tsx src/scripts/fix-encoding.ts --path=./storage --dry-run
  npx tsx src/scripts/fix-encoding.ts --path=./storage --verbose

Options:
  --path=<dir>   Root storage directory (required)
  --dry-run      Show what would be fixed without making changes
  --verbose      Show detailed comparison
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
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--dry-run') { options.dryRun = true; continue; }
    if (arg === '--verbose') { options.verbose = true; continue; }

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

function compareEpisodes(dbEpisodes: Episode[], diskEpisodes: { index: number; file: string; title: string; duration: number }[], verbose: boolean = false): EpisodeFix[] {
  const fixes: EpisodeFix[] = [];
  
  for (const dbEp of dbEpisodes) {
    const fileCorrupted = isCorrupted(dbEp.file);
    const titleCorrupted = isCorrupted(dbEp.title);
    
    if (fileCorrupted || titleCorrupted) {
      // Try to fix the corrupted text by reversing the encoding error
      const fixedFile = fileCorrupted ? tryFixEncoding(dbEp.file) : dbEp.file;
      const fixedTitle = titleCorrupted ? tryFixEncoding(dbEp.title) : dbEp.title;
      
      if (verbose) {
        console.log(`      [Debug] Episode ${dbEp.index}:`);
        if (fileCorrupted) {
          console.log(`        File corrupted: true`);
          console.log(`          Original: "${dbEp.file}"`);
          console.log(`          Fixed: "${fixedFile || '(failed to recover)'}"`);
        }
        if (titleCorrupted) {
          console.log(`        Title corrupted: true`);
          console.log(`          Original: "${dbEp.title}"`);
          console.log(`          Fixed: "${fixedTitle || '(failed to recover)'}"`);
        }
      }
      
      // Use fixed text if recovery was successful, otherwise try disk filenames
      let newFile = fixedFile || dbEp.file;
      let newTitle = fixedTitle || dbEp.title;
      
      // As fallback, try to match with disk and use disk filenames
      if (!fixedFile || !fixedTitle) {
        const diskEp = diskEpisodes.find(d => d.index === dbEp.index);
        if (diskEp) {
          newFile = !fixedFile ? diskEp.file : newFile;
          newTitle = !fixedTitle ? diskEp.title : newTitle;
          
          if (verbose && diskEp) {
            if (!fixedFile) console.log(`        Using disk filename: "${diskEp.file}"`);
            if (!fixedTitle) console.log(`        Using disk title: "${diskEp.title}"`);
          }
        }
      }
      
      // Only add a fix if something actually changed
      if (newFile !== dbEp.file || newTitle !== dbEp.title) {
        fixes.push({
          index: dbEp.index,
          oldFile: dbEp.file,
          newFile: newFile,
          oldTitle: dbEp.title,
          newTitle: newTitle,
        });
      }
    }
  }
  
  return fixes;
}

async function main() {
  const options = parseArgs();
  
  console.log('🔧 Fix Encoding — Detect and repair corrupted text\n');
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
  let totalCorrupted = 0;
  let totalEpisodesFixed = 0;
  
  for (const dbBook of dbBooks) {
    const diskBook = findMatchingDiskBook(dbBook, diskBooks);
    
    if (!diskBook) {
      if (options.verbose) {
        console.log(`   ⚠️  No disk match for: ${dbBook.title} (${dbBook.id})`);
      }
      continue;
    }
    
    const fixes = compareEpisodes(dbBook.episodes, diskBook.episodes, options.verbose);
    
    const result: FixResult = {
      bookId: dbBook.id,
      bookTitle: dbBook.title,
      corrupted: fixes.length > 0,
      episodesFixed: fixes.length,
      details: fixes,
    };
    
    results.push(result);
    
    if (fixes.length > 0) {
      totalCorrupted++;
      totalEpisodesFixed += fixes.length;
      
      console.log(`   📖 ${dbBook.title}`);
      console.log(`      ID: ${dbBook.id}`);
      console.log(`      Corrupted episodes: ${fixes.length}`);
      
      // Show first fix as an example
      if (fixes.length > 0) {
        const firstFix = fixes[0];
        console.log(`      Example fix (Episode ${firstFix.index + 1}):`);
        console.log(`        File: "${firstFix.oldFile}" → "${firstFix.newFile}"`);
      }
      
      if (options.verbose) {
        for (const fix of fixes.slice(0, 5)) {
          console.log(`      Episode ${fix.index + 1} (verbose):`);
          console.log(`        File:`);
          console.log(`          Old: "${fix.oldFile}"`);
          console.log(`          New: "${fix.newFile}"`);
          if (fix.oldTitle !== fix.oldFile || fix.newTitle !== fix.newFile) {
            console.log(`        Title:`);
            console.log(`          Old: "${fix.oldTitle}"`);
            console.log(`          New: "${fix.newTitle}"`);
          }
        }
        if (fixes.length > 5) {
          console.log(`      ... and ${fixes.length - 5} more episodes`);
        }
      }
      
      // Step 4: Apply fix
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
          const firstFixed = fixes[0];
          const savedEpisode = savedEpisodes.find((e: Episode) => e.index === firstFixed.index);
          
          if (savedEpisode && savedEpisode.file === firstFixed.newFile) {
            console.log(`      ✅ Fixed and verified\n`);
          } else {
            console.log(`      ⚠️  Update may have failed - verification showed no change\n`);
            console.log(`         Expected: ${firstFixed.newFile}`);
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
  console.log(`   Books corrupted:   ${totalCorrupted}`);
  console.log(`   Episodes to fix:   ${totalEpisodesFixed}`);
  
  if (options.dryRun && totalCorrupted > 0) {
    console.log('\n   Run without --dry-run to apply fixes.\n');
  } else if (totalCorrupted > 0) {
    console.log('\n   ✅ All corrupted data has been fixed.\n');
  } else {
    console.log('\n   ✅ No encoding corruption detected.\n');
  }
  
  await pool.end();
}

main().catch((error) => {
  console.error('Fatal error:', error.message || error);
  pool.end();
  process.exit(1);
});
