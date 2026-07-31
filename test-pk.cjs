const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });
async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const res = await client.query("SELECT kcu.column_name FROM information_schema.table_constraints tco JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tco.constraint_name AND kcu.constraint_schema = tco.constraint_schema WHERE tco.constraint_type = 'PRIMARY KEY' AND kcu.table_name = 'attempt_answers'");
  console.log(res.rows);
  await client.end();
}
run();
