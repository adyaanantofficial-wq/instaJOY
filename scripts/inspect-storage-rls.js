const path = require('path');
const dotenv = require('dotenv');
const { Client } = require('pg');

const root = path.resolve(process.cwd());
dotenv.config({ path: path.join(root, '.env.local') });
dotenv.config({ path: path.join(root, '.env') });

const dbUrl = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('Missing SUPABASE_DB_URL or DATABASE_URL');
  process.exit(1);
}

const client = new Client({ connectionString: dbUrl });

async function main() {
  await client.connect();
  try {
    const tables = await client.query(`
      select table_schema, table_name
      from information_schema.tables
      where table_schema in ('storage')
      order by table_name
    `);
    console.log('storage tables:', tables.rows);

    const policies = await client.query(`
      select n.nspname as schema, c.relname as table, p.polname, p.polcmd, p.polqual, p.polwithcheck
      from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'storage'
      order by c.relname, p.polname;
    `);
    console.log('storage policies:', policies.rows);

    const bucketObjPolicies = await client.query(`
      select relname, relrowsecurity, relforcerowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('storage')
      order by relname;
    `);
    console.log('storage relations RLS:', bucketObjPolicies.rows);

    const objectsRow = await client.query(`select count(*) from information_schema.tables where table_schema='storage' and table_name='objects'`);
    console.log('storage.objects exists:', objectsRow.rows[0].count);
  } finally {
    await client.end();
  }
}

main().catch((e)=>{console.error('error:', e); process.exit(1);});
