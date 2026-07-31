const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });
async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const res = await client.query("select prosrc from pg_proc where proname = 'set_practice_flag'");
  console.log(res.rows[0].prosrc);
  await client.end();
}
run();
