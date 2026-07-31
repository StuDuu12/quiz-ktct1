const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data: latest } = await supabase.from('attempts').select('*').eq('kind', 'practice').order('started_at', { ascending: false }).limit(1).single();
  console.log('Latest attempt:', latest?.id, latest?.status);
  
  if (latest) {
    const { data: aqs } = await supabase.from('attempt_questions').select('id').eq('attempt_id', latest.id);
    const aqIds = aqs.map(q => q.id);
    const { data: answers, error } = await supabase.from('attempt_answers').select('*').in('attempt_question_id', aqIds);
    console.log('Total answers saved in DB for this attempt:', answers?.length);
    if (error) console.error(error);
  }
}
run();