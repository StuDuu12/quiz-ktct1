const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function check() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const res = await client.query(`SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'load_practice_answer_feedback'`);
  console.log('load_practice_answer_feedback', res.rows[0]?.pg_get_functiondef);
  await client.end();
}

check().catch(console.error);
