const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });
async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const res = await client.query("select tgname, prosrc from pg_trigger t join pg_proc p on t.tgfoid = p.oid where t.tgrelid = 'attempt_answers'::regclass");
  console.log(res.rows);
  await client.end();
}
run();
