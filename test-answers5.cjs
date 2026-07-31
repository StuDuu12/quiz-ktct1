const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data: aqs } = await supabase.from('attempt_questions').select('id').eq('attempt_id', '9239c63e-9eee-4d10-852f-30cf50cdade2');
  const aqIds = aqs.map(q => q.id);
  const { data: answers, error } = await supabase.from('attempt_answers').select('*').in('attempt_question_id', aqIds);
  console.log('Total answers saved in DB for this attempt:', answers?.length);
  if (error) console.error(error);
}
run();