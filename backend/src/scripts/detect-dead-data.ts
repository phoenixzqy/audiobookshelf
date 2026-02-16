#!/usr/bin/env npx ts-node

/**
 * Dead Audiobook Data Cleanup Script
 *
 * Scans all storage locations (default + configured) for audiobook directories
 * that exist on disk but have no matching record in the database, and removes them.
 *
 * Usage:
 *   npm run cleanup-dead-data                  # Scan and delete dead data
 *   npm run cleanup-dead-data -- --dry-run     # Preview only, don't delete
 *
 * Options:
 *   --dry-run   Preview dead data without deleting
 *   --json      Output results as JSON
 *
 * Requires DATABASE_URL environment variable (reads from .env automatically).
 */

import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { pool, query } from '../config/database';
import { localStorageService } from '../services/localStorageService';

interface StorageLocation {
  id: string;
  name: string;
  basePath: string;
}

interface DeadEntry {
  location: string;
  blobPath: string;
  fullPath: string;
  sizeBytes: number;
}

// Parse CLI args
const args = process.argv.slice(2);
const shouldDelete = args.includes('--delete');
const jsonOutput = args.includes('--json');

function log(msg: string): void {
  if (!jsonOutput) {
    console.log(msg);
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

/**
 * Recursively calculate directory size in bytes
 */
async function getDirectorySize(dirPath: string): Promise<number> {
  let size = 0;
  try {
    const entries = await fsp.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        size += await getDirectorySize(fullPath);
      } else {
        const stat = await fsp.stat(fullPath);
        size += stat.size;
      }
    }
  } catch {
    // Directory unreadable
  }
  return size;
}

/**
 * Get all storage locations: default + all active local configs from DB
 */
async function getStorageLocations(): Promise<StorageLocation[]> {
  const locations: StorageLocation[] = [];

  // Default storage location
  const defaultPath = localStorageService.getStorageDir();
  locations.push({ id: 'default', name: 'Default Storage', basePath: defaultPath });

  // Custom storage locations from storage_configs
  const result = await query(
    `SELECT id, name, container_name as base_path
     FROM storage_configs
     WHERE blob_endpoint = 'local' AND is_active = true`
  );

  for (const row of result.rows) {
    locations.push({ id: row.id, name: row.name, basePath: row.base_path });
  }

  return locations;
}

/**
 * Get all blob_paths from the database, grouped by storage_config_id
 */
async function getRegisteredBlobPaths(): Promise<Map<string, Set<string>>> {
  const result = await query(
    `SELECT blob_path, storage_config_id FROM audiobooks`
  );

  const map = new Map<string, Set<string>>();
  for (const row of result.rows) {
    const key = row.storage_config_id || 'default';
    if (!map.has(key)) {
      map.set(key, new Set());
    }
    map.get(key)!.add(row.blob_path);
  }

  return map;
}

/**
 * Scan a storage location's audiobooks/ directory for dead data
 */
async function scanLocation(
  location: StorageLocation,
  registeredPaths: Set<string>
): Promise<DeadEntry[]> {
  const audiobooksDir = path.join(location.basePath, 'audiobooks');
  const deadEntries: DeadEntry[] = [];

  try {
    await fsp.access(audiobooksDir, fs.constants.R_OK);
  } catch {
    log(`  ⚠  Directory not accessible: ${audiobooksDir}`);
    return deadEntries;
  }

  const entries = await fsp.readdir(audiobooksDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const blobPath = entry.name;
    if (!registeredPaths.has(blobPath)) {
      const fullPath = path.join(audiobooksDir, blobPath);
      const sizeBytes = await getDirectorySize(fullPath);
      deadEntries.push({
        location: location.name,
        blobPath,
        fullPath,
        sizeBytes,
      });
    }
  }

  return deadEntries;
}

/**
 * Recursively delete a directory
 */
async function removeDirectory(dirPath: string): Promise<void> {
  await fsp.rm(dirPath, { recursive: true, force: true });
}

async function main(): Promise<void> {
  log('=== Dead Audiobook Data Detection ===\n');
  log(`Mode: ${shouldDelete ? '🗑  DELETE' : '👀 DRY-RUN (use --delete to remove)'}\n`);

  // 1. Get all storage locations
  const locations = await getStorageLocations();
  log(`Found ${locations.length} storage location(s):`);
  for (const loc of locations) {
    log(`  • ${loc.name}: ${loc.basePath}`);
  }
  log('');

  // 2. Get all registered blob_paths from DB
  const registeredMap = await getRegisteredBlobPaths();

  // 3. Scan each location
  const allDeadEntries: DeadEntry[] = [];

  for (const location of locations) {
    log(`Scanning: ${location.name} (${location.basePath}) ...`);
    const registered = registeredMap.get(location.id) || new Set<string>();
    const deadEntries = await scanLocation(location, registered);
    allDeadEntries.push(...deadEntries);

    if (deadEntries.length === 0) {
      log('  ✅ No dead data found.\n');
    } else {
      log(`  ❌ Found ${deadEntries.length} dead director(ies):`);
      for (const entry of deadEntries) {
        log(`     - ${entry.blobPath} (${formatBytes(entry.sizeBytes)})`);
      }
      log('');
    }
  }

  // 4. Summary
  const totalSize = allDeadEntries.reduce((sum, e) => sum + e.sizeBytes, 0);
  log('--- Summary ---');
  log(`Total dead directories: ${allDeadEntries.length}`);
  log(`Total reclaimable space: ${formatBytes(totalSize)}`);

  // 5. Delete if requested
  if (shouldDelete && allDeadEntries.length > 0) {
    log('\nDeleting dead data...');
    let deleted = 0;
    let errors = 0;

    for (const entry of allDeadEntries) {
      try {
        await removeDirectory(entry.fullPath);
        log(`  ✅ Deleted: ${entry.fullPath}`);
        deleted++;
      } catch (err) {
        log(`  ❌ Failed to delete ${entry.fullPath}: ${err}`);
        errors++;
      }
    }

    log(`\nDone: ${deleted} deleted, ${errors} errors.`);
  }

  // JSON output
  if (jsonOutput) {
    console.log(JSON.stringify({
      mode: shouldDelete ? 'delete' : 'dry-run',
      locations: locations.map(l => ({ id: l.id, name: l.name, basePath: l.basePath })),
      deadEntries: allDeadEntries.map(e => ({
        location: e.location,
        blobPath: e.blobPath,
        fullPath: e.fullPath,
        sizeBytes: e.sizeBytes,
      })),
      totalDeadCount: allDeadEntries.length,
      totalReclaimableBytes: totalSize,
    }, null, 2));
  }
}

main()
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  })
  .finally(() => {
    pool.end();
  });
