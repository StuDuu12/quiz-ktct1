const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });
async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const res = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    EXCEPT
    SELECT table_name
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND grantee = 'authenticated' AND privilege_type = 'UPDATE'
  `);
  console.log('Tables without UPDATE for authenticated:', res.rows.map(r => r.table_name));
  await client.end();
}
run();
