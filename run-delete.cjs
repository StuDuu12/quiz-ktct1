const { Client } = require('pg');
const fs = require('fs');
async function run() {
  const client = new Client({ connectionString: 'postgresql://postgres.yoxgvrsounnotrufakkz:chuduyisme123@aws-1-ap-south-1.pooler.supabase.com:6543/postgres' });
  await client.connect();
  const sql = fs.readFileSync('supabase/migrations/202607310002_allow_deleting_attempts.sql', 'utf8');
  await client.query(sql);
  
  const { rowCount } = await client.query(`DELETE FROM public.attempts WHERE status = 'in_progress' AND kind = 'practice'`);
  console.log('Deleted attempts:', rowCount);
  await client.end();
}
run();