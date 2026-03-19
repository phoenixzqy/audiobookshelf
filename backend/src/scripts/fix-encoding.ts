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
 * - Specific patterns like "ç¥", "é¬", "è¡" etc.
 */
function isCorrupted(str: string): boolean {
  if (!str) return false;
  
  // Quick check: if string has no Latin-1 extended chars, it's not corrupted
  const hasLatin1Extended = /[\u0080-\u00FF]/.test(str);
  if (!hasLatin1Extended) return false;
  
  // Check for common corruption patterns
  // These are UTF-8 lead bytes (0xC0-0xFF) followed by continuation bytes (0x80-0xBF)
  // which appear as Latin-1 characters when misread
  const corruptionPatterns = [
    // UTF-8 lead byte 0xE7 (ç) patterns - common for Chinese chars 0x7xxx
    /ç[¡¢£¤¥¦§¨©ª«¬­®¯°±²³´µ¶·¸¹º»¼½¾¿]/,
    // UTF-8 lead byte 0xE9 (é) patterns - common for Chinese chars 0x9xxx
    /é[¡¢£¤¥¦§¨©ª«¬­®¯°±²³´µ¶·¸¹º»¼½¾¿]/,
    // UTF-8 lead byte 0xE8 (è) patterns - common for Chinese chars 0x8xxx  
    /è[¡¢£¤¥¦§¨©ª«¬­®¯°±²³´µ¶·¸¹º»¼½¾¿]/,
    // UTF-8 lead byte 0xE5 (å) patterns - common for Chinese chars 0x5xxx
    /å[¡¢£¤¥¦§¨©ª«¬­®¯°±²³´µ¶·¸¹º»¼½¾¿]/,
    // UTF-8 lead byte 0xE4 (ä) patterns - common for Chinese chars 0x4xxx
    /ä[¡¢£¤¥¦§¨©ª«¬­®¯°±²³´µ¶·¸¹º»¼½¾¿]/,
    // UTF-8 lead byte 0xE6 (æ) patterns - common for Chinese chars 0x6xxx
    /æ[¡¢£¤¥¦§¨©ª«¬­®¯°±²³´µ¶·¸¹º»¼½¾¿]/,
    // UTF-8 lead byte 0xE3 (ã) patterns
    /ã[€‚ƒ„…†‡ˆ‰Š‹ŒŽ''""•–—˜™š›œžŸ¡¢£¤¥¦§¨©ª«¬­®¯°±²³´µ¶·¸¹º»¼½¾¿]/,
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
    const bytes: number[] = [];
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      if (code < 256) {
        bytes.push(code);
      } else {
        // Character outside Latin-1 range - encode as UTF-8
        const utf8 = Buffer.from(str[i], 'utf8');
        for (let j = 0; j < utf8.length; j++) {
          bytes.push(utf8[j]);
        }
      }
    }
    
    const fixed = Buffer.from(bytes).toString('utf8');
    
    // Validate the result - should contain valid characters
    // If it has replacement characters, the fix didn't work
    if (fixed.includes('\uFFFD')) {
      return null;
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
    SELECT id, title, blob_path, episodes
    FROM audiobooks
    ORDER BY title
  `);
  return result.rows;
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
    // Find matching disk episode by index
    const diskEp = diskEpisodes.find(d => d.index === dbEp.index);
    
    if (!diskEp) continue;
    
    const fileCorrupted = isCorrupted(dbEp.file);
    const titleCorrupted = isCorrupted(dbEp.title);
    
    if (fileCorrupted || titleCorrupted) {
      fixes.push({
        index: dbEp.index,
        oldFile: dbEp.file,
        newFile: diskEp.file,
        oldTitle: dbEp.title,
        newTitle: diskEp.title,
      });
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
      totalCorrupted++;
      totalEpisodesFixed += fixes.length;
      
      console.log(`   📖 ${dbBook.title}`);
      console.log(`      ID: ${dbBook.id}`);
      console.log(`      Corrupted episodes: ${fixes.length}`);
      
      if (options.verbose) {
        for (const fix of fixes.slice(0, 5)) {
          console.log(`      Episode ${fix.index + 1}:`);
          console.log(`        File: "${fix.oldFile}"`);
          console.log(`           → "${fix.newFile}"`);
          if (fix.oldTitle !== fix.oldFile) {
            console.log(`        Title: "${fix.oldTitle}"`);
            console.log(`            → "${fix.newTitle}"`);
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
        console.log(`      ✅ Fixed\n`);
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
