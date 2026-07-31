const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });
async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const res = await client.query("SELECT pg_get_viewdef('public.attempt_question_secrets', true)");
  console.log(res.rows[0].pg_get_viewdef);
  await client.end();
}
run();