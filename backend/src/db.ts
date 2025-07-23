import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Simple dotenv config without path
const result = dotenv.config({ debug: true });
if (result.error) {
  console.error('❌ dotenv error:', result.error);
  throw result.error;
}
console.log('✅ PARSED:', result.parsed);

// Debug: Check if DATABASE_URL is loaded
console.log('✅ DATABASE_URL loaded:', !!process.env.DATABASE_URL);
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL not found in .env file');
  console.error('Current working directory:', process.cwd());
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export default pool;
