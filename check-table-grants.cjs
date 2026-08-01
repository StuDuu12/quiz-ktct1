const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });
async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const res = await client.query(`
    SELECT grantee, privilege_type
    FROM information_schema.role_table_grants
    WHERE table_name = 'attempts' AND table_schema = 'public'
    ORDER BY grantee, privilege_type;
  `);
  console.log(res.rows);
  await client.end();
}
run();
