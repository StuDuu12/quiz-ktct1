const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  
  // Disable trigger to prevent side effects
  await client.query(`ALTER TABLE public.attempts DISABLE TRIGGER protect_attempt_submission;`);
  
  // Revert expired practice attempts to in_progress
  const res = await client.query(`
    UPDATE public.attempts 
    SET status = 'in_progress' 
    WHERE kind = 'practice' AND status = 'expired';
  `);
  
  // Re-enable trigger
  await client.query(`ALTER TABLE public.attempts ENABLE TRIGGER protect_attempt_submission;`);
  
  console.log(`Reverted ${res.rowCount} expired practice attempts to in_progress.`);
  await client.end();
}
run();
