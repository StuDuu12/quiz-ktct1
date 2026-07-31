-- Drop the existing function
drop function if exists public.start_attempt(uuid, uuid, text);

-- Recreate start_attempt with no expiration for practice
create or replace function public.start_attempt(
  target_course_id uuid,
  target_exam_config_id uuid,
  target_chapter_slug text default null
)
returns public.attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := auth.uid();
  selected_kind public.attempt_kind;
  selected_question_count integer;
  selected_duration_seconds integer;
  selected_question_ids uuid[];
  question_order_snapshot jsonb;
  option_order_snapshot jsonb := '{}'::jsonb;
  current_option_order jsonb;
  attempt_id uuid := gen_random_uuid();
  attempt_started_at timestamptz := clock_timestamp();
  created_attempt public.attempts;
  question_position integer;
  current_question_snapshot jsonb;
  attempt_seed text;
begin
  if target_exam_config_id is not null then
    selected_kind := 'mock_exam';
    select
      question_count,
      duration_seconds
    into
      selected_question_count,
      selected_duration_seconds
    from public.exam_configs
    where id = target_exam_config_id;

    if not found then
      raise exception 'Exam config not found'
        using errcode = '23514';
    end if;

    attempt_seed := attempt_id::text;

    select array_agg(id)
    into selected_question_ids
    from (
      select id
      from public.questions
      where course_id = target_course_id
        and status = 'published'
      order by
        -- Use md5 hash of question_id + seed for pseudo-random ordering
        -- that is evenly distributed
        md5(id::text || attempt_seed)
      limit selected_question_count
    ) allocated;
  else
    selected_kind := 'practice';
    selected_duration_seconds := 315360000; -- 10 years

    select count(*)
    into selected_question_count
    from public.questions
    where course_id = target_course_id
      and status = 'published'
      and (target_chapter_slug is null or chapter_id = (
        select id from public.chapters
        where course_id = target_course_id and slug = target_chapter_slug
        limit 1
      ));

    select array_agg(id)
    into selected_question_ids
    from (
      select q.id
      from public.questions q
      where q.course_id = target_course_id
        and q.status = 'published'
        and (target_chapter_slug is null or q.chapter_id = (
          select id from public.chapters
          where course_id = target_course_id and slug = target_chapter_slug
          limit 1
        ))
      order by q.id
    ) allocated;
  end if;

  if array_length(selected_question_ids, 1) is null then
    raise exception 'No questions available'
      using errcode = '23514';
  end if;

  select jsonb_agg(id)
  into question_order_snapshot
  from unnest(selected_question_ids) as id;

  insert into public.attempts (
    id,
    user_id,
    course_id,
    exam_config_id,
    kind,
    started_at,
    expires_at,
    question_order,
    option_order
  )
  values (
    attempt_id,
    requester_id,
    target_course_id,
    target_exam_config_id,
    selected_kind,
    attempt_started_at,
    case
      when selected_duration_seconds is null then null
      else attempt_started_at + make_interval(secs => selected_duration_seconds)
    end,
    question_order_snapshot,
    option_order_snapshot
  )
  returning * into created_attempt;

  for question_position in 1..array_length(selected_question_ids, 1) loop
    select
      jsonb_build_object(
        'content', q.content,
        'options', (
          select jsonb_agg(
            jsonb_build_object(
              'id', o.id,
              'content', o.content,
              'label', o.label
            )
            order by o.label
          )
          from public.options o
          where o.question_id = q.id
        )
      ),
      (
        select jsonb_agg(o.id order by o.label)
        from public.options o
        where o.question_id = q.id
      )
    into current_question_snapshot, current_option_order
    from public.questions q
    where q.id = selected_question_ids[question_position];

    insert into public.attempt_questions (
      attempt_id,
      question_id,
      position,
      question_snapshot,
      option_order
    )
    values (
      created_attempt.id,
      selected_question_ids[question_position],
      question_position,
      current_question_snapshot,
      current_option_order
    );
  end loop;

  return created_attempt;
end;
$$;


-- Remove expiration for all existing in_progress practice attempts
DO $$
BEGIN
  ALTER TABLE public.attempts DISABLE TRIGGER protect_attempt_submission;
  UPDATE public.attempts
  SET expires_at = started_at + interval '10 years'
  WHERE kind = 'practice'::public.attempt_kind;
  ALTER TABLE public.attempts ENABLE TRIGGER protect_attempt_submission;
END
$$;
