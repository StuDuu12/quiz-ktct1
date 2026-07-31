const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });
async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const res = await client.query("SELECT conname FROM pg_constraint WHERE conrelid = 'attempt_answers'::regclass AND contype = 'u'");
  console.log(res.rows);
  await client.end();
}
run();
