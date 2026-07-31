const fs = require('fs');
const { Client } = require('pg');

async function run() {
  const client = new Client({
    connectionString: 'postgresql://postgres.yoxgvrsounnotrufakkz:chuduyisme123@aws-1-ap-south-1.pooler.supabase.com:6543/postgres'
  });
  await client.connect();
  let sql = fs.readFileSync('supabase/migrations/202607310001_remove_practice_expiration.sql', 'utf8');
  if (sql.charCodeAt(0) === 0xFEFF) {
    sql = sql.slice(1);
  }
  await client.query(sql);
  await client.end();
  console.log('Done!');
}
run().catch(console.error);
