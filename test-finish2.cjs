const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data: latest } = await supabase.from('attempts').select('*').eq('kind', 'practice').eq('status', 'in_progress').order('started_at', { ascending: false }).limit(1).single();
  console.log('Latest in_progress attempt:', latest);
  if (!latest) return;
  const { data, error } = await supabase
    .from('attempts')
    .update({ status: 'submitted', score: 100 })
    .eq('id', latest.id)
    .select();
  console.log('Update result:', JSON.stringify({ data, error }, null, 2));
}
run();