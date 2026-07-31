const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data: attempts } = await supabase.from('attempts').select('id, status, started_at').eq('kind', 'practice').order('started_at', { ascending: false }).limit(20);
  for (const att of attempts) {
    const { count } = await supabase.from('attempt_questions').select('*', { count: 'exact', head: true }).eq('attempt_id', att.id);
    if (count === 87) {
      console.log('FOUND 87 QUESTIONS:', att.id, att.status, att.started_at);
    }
  }
}
run();