const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });
async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const res = await client.query("select policyname, cmd, qual from pg_policies where tablename = 'attempts'");
  console.log(JSON.stringify(res.rows, null, 2));
  await client.end();
}
run();
