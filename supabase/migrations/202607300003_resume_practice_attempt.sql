create or replace function public.start_or_resume_practice(
  target_course_id uuid,
  target_chapter_id uuid
)
returns public.attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := auth.uid();
  resumed_attempt public.attempts%rowtype;
begin
  if requester_id is null then
    raise exception 'Authentication required'
      using errcode = '28000';
  end if;

  if target_chapter_id is null then
    raise exception 'Chapter is required'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      requester_id::text || ':' || target_chapter_id::text,
      0
    )
  );

  select attempt.*
  into resumed_attempt
  from public.attempts attempt
  where attempt.user_id = requester_id
    and attempt.course_id = target_course_id
    and attempt.kind = 'practice'::public.attempt_kind
    and attempt.status = 'in_progress'::public.attempt_status
    and attempt.expires_at > clock_timestamp()
    and exists (
      select 1
      from public.attempt_questions attempt_question
      where attempt_question.attempt_id = attempt.id
        and attempt_question.question_snapshot ->> 'chapter_id'
          = target_chapter_id::text
    )
    and not exists (
      select 1
      from public.attempt_questions attempt_question
      where attempt_question.attempt_id = attempt.id
        and coalesce(
          attempt_question.question_snapshot ->> 'chapter_id',
          ''
        ) <> target_chapter_id::text
    )
  order by attempt.started_at desc, attempt.id desc
  limit 1;

  if found then
    return resumed_attempt;
  end if;

  select *
  into resumed_attempt
  from public.start_attempt(
    target_course_id,
    null,
    target_chapter_id
  );

  return resumed_attempt;
end;
$$;

revoke all on function public.start_or_resume_practice(uuid, uuid)
from public, anon;
grant execute on function public.start_or_resume_practice(uuid, uuid)
to authenticated;

create or replace function public.load_practice_answer_feedback(
  target_attempt_id uuid
)
returns table (
  attempt_question_id uuid,
  selected_option_id uuid,
  is_correct boolean,
  explanation text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    answer.attempt_question_id,
    answer.selected_option_id,
    answer.is_correct,
    secret.explanation
  from public.attempts attempt
  join public.attempt_questions attempt_question
    on attempt_question.attempt_id = attempt.id
  join public.attempt_answers answer
    on answer.attempt_question_id = attempt_question.id
  join public.attempt_question_secrets secret
    on secret.attempt_question_id = attempt_question.id
  where attempt.id = target_attempt_id
    and attempt.user_id = auth.uid()
    and attempt.kind = 'practice'::public.attempt_kind
    and answer.selected_option_id is not null
  order by attempt_question.position
$$;

revoke all on function public.load_practice_answer_feedback(uuid)
from public, anon;
grant execute on function public.load_practice_answer_feedback(uuid)
to authenticated;
