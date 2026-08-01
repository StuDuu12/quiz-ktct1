const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });
async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  // Check only UPDATE grants for authenticated on attempts
  const res = await client.query(`
    SELECT column_name
    FROM information_schema.column_privileges
    WHERE table_name = 'attempts' 
      AND table_schema = 'public'
      AND grantee = 'authenticated'
      AND privilege_type = 'UPDATE'
    ORDER BY column_name;
  `);
  console.log('UPDATE columns for authenticated:', res.rows.map(r => r.column_name));
  await client.end();
}
run();
