const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function fix() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  
  await client.query(`ALTER TABLE public.attempts DISABLE TRIGGER protect_attempt_submission;`);
  
  // Update expired ones back to in_progress and clear submission fields
  const r1 = await client.query(`
    UPDATE public.attempts 
    SET status = 'in_progress', 
        expires_at = started_at + interval '10 years',
        submitted_at = null,
        duration_seconds = null,
        score = null
    WHERE kind = 'practice' AND status = 'expired';
  `);
  
  // Extend expires_at for currently in_progress ones
  const r2 = await client.query(`
    UPDATE public.attempts 
    SET expires_at = started_at + interval '10 years' 
    WHERE kind = 'practice' AND status = 'in_progress';
  `);
  
  await client.query(`ALTER TABLE public.attempts ENABLE TRIGGER protect_attempt_submission;`);
  
  console.log('Fixed expired:', r1.rowCount);
  console.log('Fixed in_progress:', r2.rowCount);
  await client.end();
}

fix().catch(console.error);
