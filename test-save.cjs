const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data: attempts } = await supabase.from('attempts').select('id, expires_at').eq('kind', 'practice').order('started_at', { ascending: false }).limit(1);
  if (!attempts || attempts.length === 0) return console.log('No attempts found');
  const attempt = attempts[0];
  console.log('Attempt:', attempt);
  const { data: aqs } = await supabase.from('attempt_questions').select('id, options:option_order').eq('attempt_id', attempt.id).limit(1);
  if (!aqs || aqs.length === 0) return console.log('No questions found');
  const aq = aqs[0];
  console.log('Question:', aq.id);
  const optionId = aq.options[0];
  console.log('Option:', optionId);
  const { data, error } = await supabase.rpc('save_practice_answer', {
    target_attempt_id: attempt.id,
    target_attempt_question_id: aq.id,
    target_option_id: optionId
  });
  console.log('Result:', data, error);
}
run();