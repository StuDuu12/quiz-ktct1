const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function run() {
  const { data: signIn, error: signInErr } = await supabase.auth.signInWithPassword({
    email: 'student@example.com',
    password: 'password123'
  });
  if (signInErr) { console.error(signInErr); return; }
  console.log('Signed in as:', signIn.user.id);
  
  const { data: latest } = await supabase.from('attempts').select('*').eq('kind', 'practice').eq('user_id', signIn.user.id).order('started_at', { ascending: false }).limit(1).single();
  console.log('Latest attempt:', latest?.id, latest?.status);
  
  if (latest && latest.status === 'in_progress') {
    const { data, error } = await supabase
      .from('attempts')
      .update({ status: 'submitted', score: 100 })
      .eq('id', latest.id)
      .eq('user_id', signIn.user.id)
      .eq('kind', 'practice')
      .select('status, score')
      .maybeSingle();
    console.log('Update result:', JSON.stringify({ data, error }, null, 2));
  } else {
    console.log('No in_progress attempt found for user. Cannot test update.');
  }
}
run();