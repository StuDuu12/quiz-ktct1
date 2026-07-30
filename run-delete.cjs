const { Client } = require('pg');

async function run() {
  const client = new Client({
    connectionString: 'postgresql://postgres.yoxgvrsounnotrufakkz:chuduyisme123@aws-1-ap-south-1.pooler.supabase.com:6543/postgres'
  });
  await client.connect();
  const res = await client.query("DELETE FROM public.attempts WHERE kind = 'practice' AND status = 'in_progress'");
  console.log("Deleted " + res.rowCount + " active practice attempts.");
  await client.end();
}
run().catch(console.error);
