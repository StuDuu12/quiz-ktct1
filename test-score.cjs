const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data: att } = await supabase.from('attempts').select('score').eq('id', '9239c63e-9eee-4d10-852f-30cf50cdade2').single();
  console.log(att);
}
run();