const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data: attempts } = await supabase.from('attempts').select('id, status, started_at').eq('kind', 'practice').eq('status', 'in_progress').order('started_at', { ascending: false }).limit(10);
  for (const att of attempts) {
    const { count } = await supabase.from('attempt_questions').select('*', { count: 'exact', head: true }).eq('attempt_id', att.id);
    console.log('Attempt:', att.id, 'Questions:', count, 'Started:', att.started_at);
  }
}
run();