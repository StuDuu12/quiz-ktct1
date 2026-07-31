const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });
async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const res = await client.query("SELECT table_name FROM information_schema.views WHERE table_schema = 'public'");
  console.table(res.rows);
  await client.end();
}
run();