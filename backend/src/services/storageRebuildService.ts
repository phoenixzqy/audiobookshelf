/**
 * Storage Rebuild Service
 *
 * Shared logic for scanning book-{uuid} directories on disk and rebuilding
 * audiobook database records from the files found.  Used by both CLI scripts
 * (list-storage, rebuild-from-storage) and could be wired into admin API later.
 */

import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';

// Supported file extensions (same as bulk-upload.ts)
const AUDIO_EXTENSIONS = ['.mp3', '.m4a', '.m4b', '.wav', '.flac', '.ogg', '.aac'];
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
const COVER_NAMES = ['cover', 'folder', 'front', 'artwork', 'album'];

// ── Public types ─────────────────────────────────────────────

export interface ScannedBook {
  /** UUID extracted from folder name (book-{uuid}) */
  id: string;
  /** Full folder name, e.g. "book-9821743a-..." */
  folderName: string;
  /** Absolute path to the book folder */
  folderPath: string;
  /** Title detected from audio metadata, or derived from file names */
  detectedTitle: string;
  /** Artist / author from audio metadata */
  detectedAuthor: string | null;
  /** Album from audio metadata */
  detectedAlbum: string | null;
  /** Sorted list of audio file names */
  audioFiles: string[];
  /** Cover image file name, or null */
  coverFile: string | null;
  /** Total size of all files in bytes */
  totalBytes: number;
  /** Episode metadata (title, duration per file) */
  episodes: EpisodeInfo[];
}

export interface EpisodeInfo {
  index: number;
  title: string;
  file: string;
  duration: number;
}

// ── Helpers ──────────────────────────────────────────────────

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

/**
 * Attempt to extract the UUID from a folder name like "book-{uuid}".
 * Returns null if the folder doesn't match the expected pattern.
 */
function extractBookId(folderName: string): string | null {
  const match = folderName.match(/^book-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
  return match ? match[1] : null;
}

// ── Core scanning logic ──────────────────────────────────────

/**
 * Read audio metadata (title, album, artist, duration) from a file.
 * Uses dynamic import for the ESM-only music-metadata package.
 */
async function readAudioMetadata(filePath: string): Promise<{
  title: string | null;
  album: string | null;
  artist: string | null;
  duration: number;
}> {
  try {
    const mm = await import('music-metadata');
    const metadata = await mm.parseFile(filePath);
    return {
      title: metadata.common.title || null,
      album: metadata.common.album || null,
      artist: metadata.common.artist || null,
      duration: Math.round(metadata.format.duration || 0),
    };
  } catch {
    return { title: null, album: null, artist: null, duration: 0 };
  }
}

/**
 * Scan a single book-{uuid} directory and collect metadata.
 */
async function scanBookFolder(folderPath: string, folderName: string): Promise<ScannedBook | null> {
  const bookId = extractBookId(folderName);
  if (!bookId) return null;

  let files: string[];
  try {
    files = await fsp.readdir(folderPath);
  } catch {
    return null;
  }

  const audioFiles = files.filter(isAudioFile).sort(compareByNumbers);
  if (audioFiles.length === 0) return null;

  // Find cover image
  let coverFile: string | null = null;
  const coverCandidate = files.find(isCoverImage);
  if (coverCandidate) {
    coverFile = coverCandidate;
  } else {
    const anyImage = files.find(isImageFile);
    if (anyImage) coverFile = anyImage;
  }

  // Calculate total size
  let totalBytes = 0;
  for (const f of files) {
    try {
      const stat = await fsp.stat(path.join(folderPath, f));
      if (stat.isFile()) totalBytes += stat.size;
    } catch {
      // skip
    }
  }

  // Read metadata from first audio file for book-level info
  const firstAudioPath = path.join(folderPath, audioFiles[0]);
  const firstMeta = await readAudioMetadata(firstAudioPath);

  // Read duration for each audio file
  const episodes: EpisodeInfo[] = [];
  for (let i = 0; i < audioFiles.length; i++) {
    const audioPath = path.join(folderPath, audioFiles[i]);
    const meta = i === 0 ? firstMeta : await readAudioMetadata(audioPath);
    episodes.push({
      index: i,
      title: meta.title || path.basename(audioFiles[i], path.extname(audioFiles[i])),
      file: audioFiles[i],
      duration: meta.duration,
    });
  }

  // Determine book title: prefer album > artist – album > file-derived
  let detectedTitle = firstMeta.album || firstMeta.title || null;
  if (!detectedTitle) {
    // Try to find a common prefix among audio file names
    detectedTitle = deriveBookTitleFromFiles(audioFiles);
  }

  return {
    id: bookId,
    folderName,
    folderPath,
    detectedTitle: detectedTitle || `Unknown (${folderName})`,
    detectedAuthor: firstMeta.artist || null,
    detectedAlbum: firstMeta.album || null,
    audioFiles,
    coverFile,
    totalBytes,
    episodes,
  };
}

/**
 * Try to derive a book title from common patterns in audio file names.
 */
function deriveBookTitleFromFiles(audioFiles: string[]): string | null {
  if (audioFiles.length === 0) return null;

  // Strip extensions and leading numbers
  const names = audioFiles.map(f =>
    path.basename(f, path.extname(f))
      .replace(/^\d+[-_.\s]*/, '')
      .replace(/[-_]/g, ' ')
      .trim()
  );

  // Find longest common prefix among all names
  if (names.length === 1) return names[0] || null;

  let prefix = names[0];
  for (let i = 1; i < names.length; i++) {
    while (names[i].indexOf(prefix) !== 0 && prefix.length > 0) {
      prefix = prefix.slice(0, -1);
    }
    if (prefix.length === 0) break;
  }

  prefix = prefix.replace(/[\s\-_]+$/, '').trim();
  return prefix.length >= 2 ? prefix : null;
}

// ── Public API ───────────────────────────────────────────────

/**
 * Scan a storage root path for book-{uuid} directories.
 * Does NOT require a database connection.
 *
 * @param storagePath  Root storage path (e.g. "E:\\audiobookshelf").
 *                     The function looks for an "audiobooks" subdirectory.
 */
export async function scanStorage(storagePath: string): Promise<ScannedBook[]> {
  const audiobooksDir = path.join(storagePath, 'audiobooks');

  try {
    await fsp.access(audiobooksDir, fs.constants.R_OK);
  } catch {
    throw new Error(`Directory not accessible: ${audiobooksDir}`);
  }

  const entries = await fsp.readdir(audiobooksDir, { withFileTypes: true });
  const bookFolders = entries.filter(e => e.isDirectory() && extractBookId(e.name));

  const books: ScannedBook[] = [];
  for (const entry of bookFolders) {
    const folderPath = path.join(audiobooksDir, entry.name);
    const scanned = await scanBookFolder(folderPath, entry.name);
    if (scanned) {
      books.push(scanned);
    }
  }

  // Sort by detected title
  books.sort((a, b) => a.detectedTitle.localeCompare(b.detectedTitle));
  return books;
}

/**
 * Format bytes to a human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Format seconds to a human-readable duration string (e.g. "1h 23m 45s").
 */
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 || parts.length === 0) parts.push(`${s}s`);
  return parts.join(' ');
}
