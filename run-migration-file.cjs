const { Client } = require('pg');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });
async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const file = process.argv[2];
  const sql = fs.readFileSync(file, 'utf8');
  await client.query(sql);
  console.log('Successfully ran ' + file);
  await client.end();
}
run();
