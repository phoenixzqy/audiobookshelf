import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config();

async function resetDatabase() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('⚠️  Resetting database (this will delete all data)...\n');

    // Drop all tables in reverse dependency order
    console.log('Dropping existing tables...');
    await pool.query(`
      DROP TABLE IF EXISTS admin_logs CASCADE;
      DROP TABLE IF EXISTS refresh_tokens CASCADE;
      DROP TABLE IF EXISTS playback_history CASCADE;
      DROP TABLE IF EXISTS audiobooks CASCADE;
      DROP TABLE IF EXISTS storage_configs CASCADE;
      DROP TABLE IF EXISTS users CASCADE;

      DROP FUNCTION IF EXISTS update_updated_at_column CASCADE;
    `);
    console.log('✅ Dropped all tables\n');

    // Read and execute schema
    console.log('Creating new schema...');
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    await pool.query(schema);
    console.log('✅ Created new schema\n');

    console.log('═══════════════════════════════════════');
    console.log('✅ Database reset completed successfully');
    console.log('═══════════════════════════════════════');
    console.log('\nNext steps:');
    console.log('1. Run: npm run create-admin -- --email your@email.com --password yourpassword');
    console.log('2. Start the server: npm run dev');
  } catch (error) {
    console.error('❌ Database reset failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

resetDatabase();
