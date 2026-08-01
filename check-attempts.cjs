const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const res = await client.query(`SELECT id, status, started_at, expires_at FROM public.attempts WHERE kind = 'practice' LIMIT 5;`);
  console.log(res.rows);
  await client.end();
}
run();
