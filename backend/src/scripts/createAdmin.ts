import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

async function createAdmin() {
  const email = process.argv.find(arg => arg.startsWith('--email='))?.split('=')[1];
  const password = process.argv.find(arg => arg.startsWith('--password='))?.split('=')[1];

  if (!email || !password) {
    console.error('Usage: npm run create-admin -- --email=admin@example.com --password=YourPassword123');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('Creating admin user...');

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (email, password_hash, user_type, role, display_name)
       VALUES ($1, $2, 'adult', 'admin', 'Admin')
       RETURNING id, email, role`,
      [email, passwordHash]
    );

    console.log('✅ Admin user created successfully:');
    console.log(result.rows[0]);
  } catch (error: any) {
    if (error.code === '23505') {
      console.error('❌ User with this email already exists');
    } else {
      console.error('❌ Failed to create admin:', error);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

createAdmin();
