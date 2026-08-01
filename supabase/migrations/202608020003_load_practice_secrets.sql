CREATE OR REPLACE FUNCTION public.load_practice_attempt_questions(target_attempt_id uuid, target_chapter_id uuid)
 RETURNS SETOF attempt_questions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  requester_id uuid := auth.uid();
begin
  if requester_id is null or not exists (
    select 1
    from public.attempts a
    where a.id = target_attempt_id
      and a.user_id = requester_id
      and a.kind = 'practice'::public.attempt_kind
  ) then
    raise exception 'Owned practice attempt not found'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.attempt_questions aq
    where aq.attempt_id = target_attempt_id
  ) or exists (
    select 1
    from public.attempt_questions aq
    where aq.attempt_id = target_attempt_id
      and aq.question_snapshot ->> 'chapter_id'
        is distinct from target_chapter_id::text
  ) then
    raise exception 'Practice chapter mismatch'
      using errcode = '22023';
  end if;

  return query
  select 
    aq.id, 
    aq.attempt_id, 
    aq.question_id, 
    aq.position, 
    (aq.question_snapshot || jsonb_build_object(
      'explanation', aqs.explanation,
      'correct_option_id', aqs.correct_option_id
    )) as question_snapshot,
    aq.option_order, 
    aq.created_at
  from public.attempt_questions aq
  join public.attempt_question_secrets aqs on aqs.attempt_question_id = aq.id
  where aq.attempt_id = target_attempt_id
  order by aq.position;
end;
$function$
