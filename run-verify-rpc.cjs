const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });
async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const sql = `
create or replace function public.verify_practice_answer(
  target_attempt_question_id uuid,
  target_option_id uuid
)
returns table (
  is_correct boolean,
  explanation text,
  correct_option_id uuid
)
language sql
security definer
set search_path = ''
as $$
  select
    (aqs.correct_option_id = target_option_id) as is_correct,
    aqs.explanation,
    aqs.correct_option_id
  from public.attempt_question_secrets aqs
  join public.attempt_questions aq on aq.id = aqs.attempt_question_id
  join public.attempts a on a.id = aq.attempt_id
  where aqs.attempt_question_id = target_attempt_question_id
    and a.user_id = auth.uid()
    and a.kind = 'practice'::public.attempt_kind;
$$;

grant execute on function public.verify_practice_answer(uuid, uuid) to authenticated;
  `;
  await client.query(sql);
  console.log('Successfully created verify_practice_answer');
  await client.end();
}
run();
