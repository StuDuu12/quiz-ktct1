const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });
async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const res = await client.query("SELECT pg_get_triggerdef(t.oid) FROM pg_trigger t JOIN pg_class c ON t.tgrelid = c.oid WHERE t.tgname = 'protect_attempt_submission'");
  console.log(res.rows[0]?.pg_get_triggerdef);
  await client.end();
}
run();