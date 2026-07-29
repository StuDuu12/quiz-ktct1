-- The learner dashboard needs correctness totals only after a practice attempt
-- is submitted. Keep the underlying is_correct column unavailable to clients.
create or replace function public.get_submitted_practice_progress(
  target_course_id uuid
)
returns table (
  attempt_id uuid,
  chapter_id uuid,
  correct_count integer,
  total_count integer,
  submitted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  requester_id uuid := auth.uid();
begin
  if requester_id is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  return query
  select
    a.id as attempt_id,
    q.chapter_id,
    count(*) filter (where aa.is_correct)::integer as correct_count,
    count(*)::integer as total_count,
    a.submitted_at
  from public.attempts a
  join public.attempt_questions aq on aq.attempt_id = a.id
  join public.questions q on q.id = aq.question_id
  left join public.attempt_answers aa on aa.attempt_question_id = aq.id
  where a.user_id = requester_id
    and a.course_id = target_course_id
    and a.kind = 'practice'::public.attempt_kind
    and a.status = 'submitted'::public.attempt_status
  group by a.id, q.chapter_id, a.submitted_at;
end;
$$;

revoke all on function public.get_submitted_practice_progress(uuid)
from public, anon;
grant execute on function public.get_submitted_practice_progress(uuid)
to authenticated;
