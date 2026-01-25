import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

// Load environment variables from backend/.env
const envPath = path.join(__dirname, '..', '..', '.env');
dotenv.config({ path: envPath });

// Colors for console output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
};

function log(color: keyof typeof colors, prefix: string, message: string) {
  console.log(`${colors[color]}[${prefix}]${colors.reset} ${message}`);
}

async function applyPatches() {
  console.log(`${colors.blue}============================================${colors.reset}`);
  console.log(`${colors.blue}  Audiobook Platform - Apply DB Patches${colors.reset}`);
  console.log(`${colors.blue}============================================${colors.reset}`);
  console.log('');

  // Check for DATABASE_URL
  if (!process.env.DATABASE_URL) {
    log('red', 'ERROR', `DATABASE_URL not found in .env file at: ${envPath}`);
    process.exit(1);
  }

  log('green', 'OK', 'Found DATABASE_URL in .env');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  // Test database connection
  try {
    await pool.query('SELECT 1');
    log('green', 'OK', 'Database connection successful');
  } catch (error) {
    log('red', 'ERROR', `Failed to connect to database: ${error}`);
    process.exit(1);
  }

  console.log('');

  // Find patches directory
  const patchesDir = path.join(__dirname, 'patches');

  if (!fs.existsSync(patchesDir)) {
    log('yellow', 'WARN', `No patches directory found at: ${patchesDir}`);
    console.log('Nothing to apply.');
    await pool.end();
    process.exit(0);
  }

  // Get all .sql files sorted alphabetically
  const patchFiles = fs.readdirSync(patchesDir)
    .filter(file => file.endsWith('.sql'))
    .sort();

  if (patchFiles.length === 0) {
    log('yellow', 'INFO', `No patch files found in: ${patchesDir}`);
    await pool.end();
    process.exit(0);
  }

  // Check if specific patch was requested
  const specificPatch = process.argv[2];
  let filesToApply = patchFiles;

  if (specificPatch) {
    if (!patchFiles.includes(specificPatch)) {
      log('red', 'ERROR', `Patch file not found: ${specificPatch}`);
      await pool.end();
      process.exit(1);
    }
    filesToApply = [specificPatch];
    log('blue', 'INFO', `Applying specific patch: ${specificPatch}`);
  } else {
    log('blue', 'INFO', `Found ${patchFiles.length} patch file(s) to apply`);
  }

  console.log('');

  // Apply each patch
  let applied = 0;
  let failed = 0;

  for (const patchFile of filesToApply) {
    const patchPath = path.join(patchesDir, patchFile);
    log('blue', 'APPLYING', patchFile);

    try {
      const sql = fs.readFileSync(patchPath, 'utf8');
      await pool.query(sql);
      log('green', 'OK', `Applied: ${patchFile}`);
      applied++;
    } catch (error: any) {
      log('red', 'FAILED', `Failed to apply: ${patchFile}`);
      console.log(`         Error: ${error.message}`);
      failed++;
    }

    console.log('');
  }

  // Summary
  console.log('============================================');
  console.log(`${colors.blue}Summary:${colors.reset}`);
  console.log(`  Applied: ${colors.green}${applied}${colors.reset}`);
  console.log(`  Failed:  ${colors.red}${failed}${colors.reset}`);
  console.log('============================================');

  await pool.end();

  if (failed > 0) {
    log('yellow', 'WARN', 'Some patches failed. Review the errors above.');
    process.exit(1);
  }

  log('green', 'SUCCESS', 'All patches applied successfully!');
}

applyPatches().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
