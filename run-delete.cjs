const { Client } = require('pg');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

async function run() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const sql = fs.readFileSync(
    'supabase/migrations/202607310002_allow_deleting_attempts.sql',
    'utf8',
  );
  await client.query(sql);

  const { rowCount } = await client.query(
    `DELETE FROM public.attempts WHERE status = 'in_progress' AND kind = 'practice'`,
  );
  console.log('Deleted attempts:', rowCount);
  await client.end();
}

run();
