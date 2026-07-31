const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });
async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const { rows } = await client.query("SELECT id FROM public.attempts WHERE status = 'submitted' LIMIT 1");
  if (rows.length > 0) {
    const id = rows[0].id;
    console.log('Trying to delete submitted attempt:', id);
    try {
      await client.query("DELETE FROM public.attempts WHERE id = $1", [id]);
      console.log('Success!');
    } catch (e) {
      console.error('Error:', e.message);
    }
  } else {
    console.log('No submitted attempts found');
  }
  await client.end();
}
run();
