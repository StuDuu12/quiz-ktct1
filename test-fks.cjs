const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });
async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const res = await client.query("select conname, confdeltype from pg_constraint where conrelid = 'attempt_questions'::regclass or conrelid = 'attempt_answers'::regclass");
  console.log(res.rows);
  await client.end();
}
run();
