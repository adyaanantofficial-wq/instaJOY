const fs = require('fs/promises');
const path = require('path');
const dotenv = require('dotenv');
const { Client } = require('pg');

const root = path.resolve(process.cwd());
dotenv.config({ path: path.join(root, '.env.local') });
dotenv.config({ path: path.join(root, '.env') });

const databaseUrl = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('Missing SUPABASE_DB_URL or DATABASE_URL in .env.local or .env');
  process.exit(1);
}

const schemaPath = path.join(root, 'supabase', 'schema.sql');
const migrationPath = path.join(root, 'supabase', 'migrations', '20260430_capsules_story_chain.sql');

async function loadSql(filePath) {
  const sql = await fs.readFile(filePath, 'utf8');
  return sql;
}

async function verifySql(client, sql, sourceLabel) {
  console.log(`\nVerifying SQL syntax for ${sourceLabel}...`);
  await client.query('BEGIN');
  try {
    await client.query(sql);
    console.log(`  ${sourceLabel} syntax OK`);
  } catch (error) {
    console.error(`  ${sourceLabel} syntax ERROR:`);
    console.error(error.message || error);
    if (error.position) {
      console.error(`  position: ${error.position}`);
    }
    throw error;
  } finally {
    await client.query('ROLLBACK');
  }
}

async function verifyRls(client) {
  console.log('\nVerifying RLS and policy metadata...');
  const tables = ['story_chains', 'story_chain_segments'];
  for (const table of tables) {
    const tableRes = await client.query(
      `select relrowsecurity, relname from pg_class join pg_namespace on pg_namespace.oid = pg_class.relnamespace where pg_namespace.nspname = 'public' and relname = $1`,
      [table]
    );
    if (!tableRes.rows.length) {
      console.error(`  Table public.${table} not found.`);
      continue;
    }
    const row = tableRes.rows[0];
    console.log(`  public.${table}: row level security = ${row.relrowsecurity}`);
    const policyRes = await client.query(
      `select polname, polcmd, polroles::text, polqual::text, polwithcheck::text from pg_policy where polrelid = $1::regclass order by polname`,
      [table]
    );
    if (!policyRes.rows.length) {
      console.warn(`    No policies defined for public.${table}`);
      continue;
    }
    console.log(`    ${policyRes.rows.length} policies:`);
    for (const policy of policyRes.rows) {
      console.log(`      - ${policy.polname} [cmd=${policy.polcmd}]`);
    }
  }
}

async function checkMigrationTables(client) {
  console.log('\nChecking schema objects from migration file...');
  const objects = [
    'public.story_chains',
    'public.story_chain_segments',
    'public.post_reaction_aggregates',
    'public.feed_cache'
  ];
  for (const object of objects) {
    const res = await client.query(`select 1 from information_schema.tables where table_schema = split_part($1, '.', 1) and table_name = split_part($1, '.', 2)`, [object]);
    console.log(`  ${object}: ${res.rows.length ? 'exists' : 'missing'}`);
  }
}

async function main() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const schemaSql = await loadSql(schemaPath);
    const migrationSql = await loadSql(migrationPath);

    await verifySql(client, schemaSql, 'supabase/schema.sql');
    await verifySql(client, migrationSql, 'supabase/migrations/20260430_capsules_story_chain.sql');
    await verifyRls(client);
    await checkMigrationTables(client);
    console.log('\nSupabase DB verification complete.');
  } catch (error) {
    console.error('\nVerification failed.');
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
