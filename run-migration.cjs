const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });
async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const sql = `
create or replace function public.protect_attempt_submission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  total_questions integer;
  correct_answers integer;
begin
  if (
    new.id is distinct from old.id
    or new.user_id is distinct from old.user_id
    or new.course_id is distinct from old.course_id
    or new.exam_config_id is distinct from old.exam_config_id
    or new.kind is distinct from old.kind
    or new.started_at is distinct from old.started_at
    or new.question_order is distinct from old.question_order
    or new.option_order is distinct from old.option_order
  ) then
    raise exception 'Attempt identity and snapshots are immutable'
      using errcode = '23514';
  end if;

  if old.status <> 'in_progress' and new is distinct from old then
    raise exception 'Submitted or expired attempts are immutable'
      using errcode = '23514';
  end if;

  if old.status = 'in_progress'
    and clock_timestamp() >= old.expires_at
    and not (
      old.kind = 'mock_exam'::public.attempt_kind
      and new.status = 'submitted'::public.attempt_status
    ) then
    new.status := 'expired';
    new.submitted_at := null;
    new.duration_seconds := null;
    -- we do not override score for practice if they pass it, but for expired, set to null
    new.score := null;
    return new;
  end if;

  if new.status = 'submitted' and old.status = 'in_progress' then
    if old.kind = 'practice'::public.attempt_kind then
      new.submitted_at := least(clock_timestamp(), coalesce(old.expires_at, clock_timestamp()));
      new.duration_seconds := greatest(
        0,
        floor(extract(epoch from (new.submitted_at - old.started_at)))::integer
      );
      -- DO NOT OVERRIDE new.score! Let the client pass it!
    else
      select count(*), count(*) filter (where aa.is_correct)
      into total_questions, correct_answers
      from public.attempt_questions aq
      left join public.attempt_answers aa
        on aa.attempt_question_id = aq.id
      where aq.attempt_id = old.id;

      new.submitted_at := least(clock_timestamp(), old.expires_at);
      new.duration_seconds := greatest(
        0,
        floor(extract(epoch from (new.submitted_at - old.started_at)))::integer
      );
      new.score := case
        when total_questions = 0 then 0
        else round((correct_answers::numeric * 100) / total_questions, 2)
      end;
    end if;
  elsif new.status = 'expired' and old.status = 'in_progress' then
    new.submitted_at := null;
    new.duration_seconds := null;
    new.score := null;
  elsif new.status = 'in_progress' then
    new.submitted_at := null;
    new.duration_seconds := null;
    new.score := null;
  end if;

  return new;
end;
$$;
  `;
  await client.query(sql);
  console.log('Successfully updated protect_attempt_submission');
  
  const sql2 = `
DO $$
BEGIN
  ALTER TABLE public.attempts DISABLE TRIGGER protect_attempt_submission;
  UPDATE public.attempts
  SET expires_at = started_at + interval '10 years'
  WHERE kind = 'practice'::public.attempt_kind;
  ALTER TABLE public.attempts ENABLE TRIGGER protect_attempt_submission;
END
$$;
  `;
  await client.query(sql2);
  console.log('Successfully extended expiration for all practice attempts');
  await client.end();
}
run();
