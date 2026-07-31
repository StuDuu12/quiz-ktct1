const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });
async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const res = await client.query("SELECT tgname, pg_get_triggerdef(t.oid) FROM pg_trigger t JOIN pg_class c ON t.tgrelid = c.oid WHERE c.relname = 'attempts'");
  console.table(res.rows);
  await client.end();
}
run();