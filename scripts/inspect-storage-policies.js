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
    const res = await client.query(`
      select
        c.relname as table_name,
        p.polname,
        p.polcmd,
        pg_get_expr(p.polqual, p.polrelid) as using_expr,
        pg_get_expr(p.polwithcheck, p.polrelid) as with_check_expr
      from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'storage'
      order by c.relname, p.polname;
    `);
    console.log(JSON.stringify(res.rows, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((e)=>{ console.error(e); process.exit(1); });
