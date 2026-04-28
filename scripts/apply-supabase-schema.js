const fs = require('fs/promises');
const path = require('path');
const { Client } = require('pg');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const schemaPath = path.resolve(process.cwd(), 'supabase', 'schema.sql');
const databaseUrl = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('Error: SUPABASE_DB_URL or DATABASE_URL environment variable is required.');
  console.error('Set it in .env.local, .env, or your shell before running npm run apply:supabase-schema.');
  process.exit(1);
}

async function applySchema() {
  try {
    const sql = await fs.readFile(schemaPath, 'utf8');
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query(sql);
    await client.end();
    console.log('Supabase schema applied successfully.');
  } catch (error) {
    console.error('Failed to apply Supabase schema:', error.message || error);
    process.exit(1);
  }
}

applySchema();
