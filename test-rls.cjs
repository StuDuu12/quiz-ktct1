const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });
async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const res = await client.query("select polname, polcmd, polqual, polwithcheck from pg_policy where polrelid = 'public.attempts'::regclass");
  console.table(res.rows);
  await client.end();
}
run();