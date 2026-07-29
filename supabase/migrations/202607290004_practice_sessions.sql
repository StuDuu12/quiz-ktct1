alter table public.attempt_answers
add column is_flagged boolean not null default false;

grant select (is_flagged) on public.attempt_answers to authenticated;

create or replace function public.lock_practice_answer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_kind public.attempt_kind;
begin
  select a.kind
  into target_kind
  from public.attempt_questions aq
  join public.attempts a on a.id = aq.attempt_id
  where aq.id = old.attempt_question_id;

  if target_kind = 'practice'::public.attempt_kind then
    if tg_op = 'DELETE' and old.selected_option_id is not null then
      raise exception 'ANSWER_LOCKED'
        using errcode = '23514';
    end if;

    if tg_op = 'UPDATE'
      and old.selected_option_id is not null
      and new.selected_option_id is distinct from old.selected_option_id then
      raise exception 'ANSWER_LOCKED'
        using errcode = '23514';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger lock_practice_answer
before update of selected_option_id or delete
on public.attempt_answers
for each row execute function public.lock_practice_answer();

drop function public.start_attempt(uuid, uuid);

create function public.start_attempt(
  target_course_id uuid,
  target_exam_config_id uuid default null,
  target_chapter_id uuid default null
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
  should_shuffle_questions boolean;
  should_shuffle_options boolean;
  selected_question_ids uuid[];
  question_order_snapshot jsonb;
  option_order_snapshot jsonb := '{}'::jsonb;
  current_option_order jsonb;
  current_question_snapshot jsonb;
  created_attempt public.attempts%rowtype;
  question_position integer;
  attempt_started_at timestamptz := clock_timestamp();
begin
  if requester_id is null then
    raise exception 'Authentication required'
      using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = requester_id and is_active
  ) then
    raise exception 'Active profile required'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.courses
    where id = target_course_id and status = 'published'
  ) then
    raise exception 'Published course not found'
      using errcode = '22023';
  end if;

  if target_exam_config_id is not null and target_chapter_id is not null then
    raise exception 'Exam attempts cannot be scoped to a chapter'
      using errcode = '22023';
  end if;

  if target_chapter_id is not null and not exists (
    select 1 from public.chapters
    where id = target_chapter_id and course_id = target_course_id
  ) then
    raise exception 'Chapter does not belong to course'
      using errcode = '22023';
  end if;

  if target_exam_config_id is not null then
    select
      kind,
      question_count,
      duration_seconds,
      shuffle_questions,
      shuffle_options
    into
      selected_kind,
      selected_question_count,
      selected_duration_seconds,
      should_shuffle_questions,
      should_shuffle_options
    from public.exam_configs
    where id = target_exam_config_id
      and course_id = target_course_id
      and is_active;

    if not found then
      raise exception 'Active exam configuration does not belong to course'
        using errcode = '22023';
    end if;
  else
    selected_kind := 'practice';
    selected_duration_seconds := 3600;
    should_shuffle_questions := true;
    should_shuffle_options := true;

    select count(*)
    into selected_question_count
    from public.questions q
    join public.chapters ch on ch.id = q.chapter_id
    where ch.course_id = target_course_id
      and q.status = 'published'
      and (target_chapter_id is null or q.chapter_id = target_chapter_id);
  end if;

  select array_agg(ranked.id order by ranked.sort_key, ranked.id)
  into selected_question_ids
  from (
    select
      q.id,
      case
        when should_shuffle_questions then random()
        else coalesce(q.source_number, 2147483647)::double precision
      end as sort_key
    from public.questions q
    join public.chapters ch on ch.id = q.chapter_id
    where ch.course_id = target_course_id
      and q.status = 'published'
      and (target_chapter_id is null or q.chapter_id = target_chapter_id)
    order by sort_key, q.id
    limit selected_question_count
  ) ranked;

  if coalesce(array_length(selected_question_ids, 1), 0)
    <> selected_question_count then
    raise exception 'Course does not contain enough published questions'
      using errcode = '22023';
  end if;

  if selected_question_count = 0 then
    raise exception 'Chapter has no published questions'
      using errcode = '22023';
  end if;

  question_order_snapshot := to_jsonb(selected_question_ids);

  for question_position in 1..array_length(selected_question_ids, 1) loop
    select coalesce(
      jsonb_agg(to_jsonb(ordered.id) order by ordered.sort_key, ordered.id),
      '[]'::jsonb
    )
    into current_option_order
    from (
      select
        qo.id,
        case
          when should_shuffle_options then random()
          else ascii(qo.label)
        end as sort_key
      from public.question_options qo
      where qo.question_id = selected_question_ids[question_position]
    ) ordered;

    option_order_snapshot := option_order_snapshot || jsonb_build_object(
      selected_question_ids[question_position]::text,
      current_option_order
    );
  end loop;

  insert into public.attempts (
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
    requester_id,
    target_course_id,
    target_exam_config_id,
    selected_kind,
    attempt_started_at,
    attempt_started_at + make_interval(secs => selected_duration_seconds),
    question_order_snapshot,
    option_order_snapshot
  )
  returning * into created_attempt;

  for question_position in 1..array_length(selected_question_ids, 1) loop
    current_option_order := option_order_snapshot
      -> selected_question_ids[question_position]::text;

    select jsonb_build_object(
      'id', q.id,
      'content', q.content,
      'explanation', q.explanation,
      'difficulty', q.difficulty,
      'options', (
        select jsonb_agg(
          jsonb_build_object(
            'id', qo.id,
            'label', qo.label,
            'content', qo.content
          )
          order by ordered.position
        )
        from jsonb_array_elements_text(current_option_order)
          with ordinality as ordered(option_id, position)
        join public.question_options qo
          on qo.id = ordered.option_id::uuid
      )
    )
    into current_question_snapshot
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

create function public.save_practice_answer(
  target_attempt_id uuid,
  target_attempt_question_id uuid,
  target_option_id uuid
)
returns table (
  is_correct boolean,
  explanation text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := auth.uid();
  attempt_owner_id uuid;
  target_kind public.attempt_kind;
  target_status public.attempt_status;
  target_expires_at timestamptz;
  target_question_id uuid;
  selected_question_id uuid;
  existing_option_id uuid;
  answer_exists boolean;
begin
  select user_id, kind, status, expires_at
  into attempt_owner_id, target_kind, target_status, target_expires_at
  from public.attempts
  where id = target_attempt_id
  for update;

  if not found or requester_id is distinct from attempt_owner_id then
    raise exception 'Owned practice attempt not found'
      using errcode = '42501';
  end if;

  if target_kind <> 'practice'::public.attempt_kind
    or target_status <> 'in_progress'::public.attempt_status then
    raise exception 'Practice attempt is not in progress'
      using errcode = '23514';
  end if;

  if clock_timestamp() >= target_expires_at then
    raise exception 'Practice attempt is not in progress'
      using errcode = '23514';
  end if;

  select question_id
  into target_question_id
  from public.attempt_questions
  where id = target_attempt_question_id
    and attempt_id = target_attempt_id;

  if not found then
    raise exception 'Attempt question is outside the owned attempt'
      using errcode = '42501';
  end if;

  select question_id
  into selected_question_id
  from public.question_options
  where id = target_option_id;

  if selected_question_id is distinct from target_question_id then
    raise exception 'Selected option does not belong to the attempt question'
      using errcode = '23514';
  end if;

  select selected_option_id, true
  into existing_option_id, answer_exists
  from public.attempt_answers
  where attempt_question_id = target_attempt_question_id
  for update;

  if answer_exists and existing_option_id is not null
    and existing_option_id is distinct from target_option_id then
    raise exception 'ANSWER_LOCKED'
      using errcode = '23514';
  elsif answer_exists and existing_option_id is null then
    update public.attempt_answers
    set selected_option_id = target_option_id
    where attempt_question_id = target_attempt_question_id;
  elsif not coalesce(answer_exists, false) then
    insert into public.attempt_answers (
      attempt_question_id,
      selected_option_id
    )
    values (
      target_attempt_question_id,
      target_option_id
    );
  end if;

  return query
  select aa.is_correct, q.explanation
  from public.attempt_answers aa
  join public.attempt_questions aq on aq.id = aa.attempt_question_id
  join public.questions q on q.id = aq.question_id
  where aa.attempt_question_id = target_attempt_question_id
    and aa.selected_option_id = target_option_id
    and aq.attempt_id = target_attempt_id;
end;
$$;

create function public.set_practice_flag(
  target_attempt_id uuid,
  target_attempt_question_id uuid,
  target_flagged boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := auth.uid();
begin
  if not exists (
    select 1
    from public.attempts a
    join public.attempt_questions aq on aq.attempt_id = a.id
    where a.id = target_attempt_id
      and aq.id = target_attempt_question_id
      and a.user_id = requester_id
      and a.kind = 'practice'::public.attempt_kind
      and a.status = 'in_progress'::public.attempt_status
      and clock_timestamp() < a.expires_at
  ) then
    raise exception 'Practice attempt is not in progress or not owned'
      using errcode = '42501';
  end if;

  insert into public.attempt_answers (
    attempt_question_id,
    selected_option_id,
    is_flagged
  )
  values (
    target_attempt_question_id,
    null,
    target_flagged
  )
  on conflict (attempt_question_id) do update
  set is_flagged = excluded.is_flagged;
end;
$$;

create function public.finish_practice_attempt(target_attempt_id uuid)
returns public.attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := auth.uid();
  finished_attempt public.attempts%rowtype;
begin
  select *
  into finished_attempt
  from public.attempts
  where id = target_attempt_id
    and user_id = requester_id
    and kind = 'practice'::public.attempt_kind
  for update;

  if not found then
    raise exception 'Owned practice attempt not found'
      using errcode = '42501';
  end if;

  if finished_attempt.status <> 'in_progress'::public.attempt_status then
    return finished_attempt;
  end if;

  update public.attempts
  set status = 'submitted'
  where id = target_attempt_id
  returning * into finished_attempt;

  return finished_attempt;
end;
$$;

revoke all on function public.start_attempt(uuid, uuid, uuid)
from public, anon;
grant execute on function public.start_attempt(uuid, uuid, uuid)
to authenticated;

revoke all on function public.save_practice_answer(uuid, uuid, uuid)
from public, anon;
grant execute on function public.save_practice_answer(uuid, uuid, uuid)
to authenticated;

revoke all on function public.set_practice_flag(uuid, uuid, boolean)
from public, anon;
grant execute on function public.set_practice_flag(uuid, uuid, boolean)
to authenticated;

revoke all on function public.finish_practice_attempt(uuid)
from public, anon;
grant execute on function public.finish_practice_attempt(uuid)
to authenticated;
