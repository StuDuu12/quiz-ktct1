const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });
async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const res = await client.query(`SELECT prosrc FROM pg_proc WHERE proname = 'load_practice_attempt_questions'`);
  console.log(res.rows[0]?.prosrc);
  await client.end();
}
run();
