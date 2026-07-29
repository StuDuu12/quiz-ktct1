-- Protected all-kind secret capture, legacy reconciliation, and option-ID
-- protection are installed in migration 004 before practice creation.

-- Grade every attempt kind from the protected immutable answer key.
create or replace function public.prepare_attempt_answer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  snapshot_correct_option_id uuid;
begin
  if not exists (
    select 1
    from public.attempt_questions aq
    cross join lateral jsonb_array_elements_text(aq.option_order)
      snapshot_option(option_id)
    where aq.id = new.attempt_question_id
      and (
        new.selected_option_id is null
        or snapshot_option.option_id = new.selected_option_id::text
      )
  ) then
    raise exception 'Selected option is outside the attempt snapshot'
      using errcode = '23514';
  end if;

  if new.selected_option_id is null then
    new.is_correct := null;
  else
    select aqs.correct_option_id
    into snapshot_correct_option_id
    from public.attempt_question_secrets aqs
    where aqs.attempt_question_id = new.attempt_question_id;

    if snapshot_correct_option_id is null then
      raise exception 'Attempt grading snapshot not found'
        using errcode = '23514';
    end if;

    new.is_correct := new.selected_option_id = snapshot_correct_option_id;
  end if;

  new.answered_at := clock_timestamp();
  return new;
end;
$$;

-- Practice still reveals feedback immediately, but the feedback now comes
-- from the protected attempt snapshot instead of mutable source questions.
create or replace function public.save_practice_answer(
  target_attempt_id uuid,
  target_attempt_question_id uuid,
  target_option_id uuid
)
returns table (
  selected_option_id uuid,
  is_correct boolean,
  explanation text,
  was_already_locked boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := auth.uid();
  owned_attempt public.attempts%rowtype;
  existing_option_id uuid;
  answer_exists boolean := false;
  answer_was_locked boolean := false;
begin
  select *
  into owned_attempt
  from public.attempts
  where id = target_attempt_id
    and user_id = requester_id
    and kind = 'practice'::public.attempt_kind
  for update;

  if not found then
    raise exception 'Owned practice attempt not found'
      using errcode = '42501';
  end if;

  if owned_attempt.status <> 'in_progress'::public.attempt_status
    or clock_timestamp() >= owned_attempt.expires_at then
    raise exception 'Practice attempt is not in progress'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.attempt_questions aq
    cross join lateral jsonb_array_elements_text(aq.option_order)
      snapshot_option(option_id)
    where aq.id = target_attempt_question_id
      and aq.attempt_id = target_attempt_id
      and snapshot_option.option_id = target_option_id::text
  ) then
    raise exception 'Selected option is outside the attempt snapshot'
      using errcode = '23514';
  end if;

  select aa.selected_option_id, true
  into existing_option_id, answer_exists
  from public.attempt_answers aa
  where aa.attempt_question_id = target_attempt_question_id
  for update;

  if answer_exists and existing_option_id is not null then
    answer_was_locked := true;
  elsif answer_exists then
    update public.attempt_answers
    set selected_option_id = target_option_id
    where attempt_question_id = target_attempt_question_id;
  else
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
  select
    aa.selected_option_id,
    aa.is_correct,
    aqs.explanation,
    answer_was_locked
  from public.attempt_answers aa
  join public.attempt_question_secrets aqs
    on aqs.attempt_question_id = aa.attempt_question_id
  where aa.attempt_question_id = target_attempt_question_id
    and aa.selected_option_id is not null;
end;
$$;

-- Detailed results are the only learner-visible path to the protected answer
-- key. Authorization is checked before submission state to avoid cross-user
-- existence/status disclosure.
create function public.get_attempt_result_details(target_attempt_id uuid)
returns table (
  attempt_id uuid,
  attempt_question_id uuid,
  question_position integer,
  kind public.attempt_kind,
  score numeric,
  started_at timestamptz,
  submitted_at timestamptz,
  duration_seconds integer,
  question_snapshot jsonb,
  selected_option_id uuid,
  correct_option_id uuid,
  is_correct boolean,
  is_flagged boolean,
  is_unanswered boolean,
  answered_at timestamptz,
  explanation text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  requester_id uuid := auth.uid();
  selected_attempt public.attempts%rowtype;
begin
  if requester_id is null then
    raise exception 'Authentication required'
      using errcode = '28000';
  end if;

  select *
  into selected_attempt
  from public.attempts
  where id = target_attempt_id;

  if not found
    or (
      selected_attempt.user_id is distinct from requester_id
      and not public.can_manage_course(selected_attempt.course_id)
    ) then
    raise exception 'Attempt results are outside the authorized scope'
      using errcode = '42501';
  end if;

  if selected_attempt.status <> 'submitted'::public.attempt_status then
    raise exception 'Attempt results are unavailable before submission'
      using errcode = '42501';
  end if;

  return query
  select
    selected_attempt.id,
    aq.id,
    aq.position,
    selected_attempt.kind,
    selected_attempt.score,
    selected_attempt.started_at,
    selected_attempt.submitted_at,
    selected_attempt.duration_seconds,
    aq.question_snapshot,
    aa.selected_option_id,
    aqs.correct_option_id,
    aa.selected_option_id is not null
      and aa.selected_option_id = aqs.correct_option_id,
    coalesce(aa.is_flagged, false),
    aa.selected_option_id is null,
    aa.answered_at,
    aqs.explanation
  from public.attempt_questions aq
  join public.attempt_question_secrets aqs
    on aqs.attempt_question_id = aq.id
  left join public.attempt_answers aa
    on aa.attempt_question_id = aq.id
  where aq.attempt_id = selected_attempt.id
  order by aq.position;
end;
$$;

-- History includes every attempt state. Student scope is always derived from
-- auth.uid(); target_user_id is honored only for authorized staff viewers.
create function public.get_attempt_history(
  target_user_id uuid default null,
  filter_kind public.attempt_kind default null,
  filter_chapter_id uuid default null,
  filter_started_from timestamptz default null,
  filter_started_to timestamptz default null,
  filter_score_min numeric default null,
  filter_score_max numeric default null,
  page_number integer default 1,
  page_size integer default 20
)
returns table (
  attempt_id uuid,
  user_id uuid,
  course_id uuid,
  course_title text,
  kind public.attempt_kind,
  status public.attempt_status,
  started_at timestamptz,
  submitted_at timestamptz,
  score numeric,
  duration_seconds integer,
  chapter_id uuid,
  chapter_title text,
  question_count integer,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  requester_id uuid := auth.uid();
  requester_role public.app_role;
  scoped_user_id uuid;
  safe_page integer := greatest(coalesce(page_number, 1), 1);
  safe_page_size integer := least(greatest(coalesce(page_size, 20), 1), 100);
begin
  if requester_id is null then
    raise exception 'Authentication required'
      using errcode = '28000';
  end if;

  requester_role := public.current_role();
  scoped_user_id := case
    when requester_role = 'student'::public.app_role then requester_id
    else target_user_id
  end;

  return query
  with filtered as (
    select a.*
    from public.attempts a
    where (
        a.user_id = requester_id
        or requester_role = 'admin'::public.app_role
        or public.can_manage_course(a.course_id)
      )
      and (scoped_user_id is null or a.user_id = scoped_user_id)
      and (filter_kind is null or a.kind = filter_kind)
      and (
        filter_chapter_id is null
        or exists (
          select 1
          from public.attempt_questions faq
          where faq.attempt_id = a.id
            and (faq.question_snapshot ->> 'chapter_id')::uuid
              = filter_chapter_id
        )
      )
      and (filter_started_from is null or a.started_at >= filter_started_from)
      and (filter_started_to is null or a.started_at <= filter_started_to)
      and (filter_score_min is null or a.score >= filter_score_min)
      and (filter_score_max is null or a.score <= filter_score_max)
  ),
  counted as (
    select f.*, count(*) over () as matching_count
    from filtered f
  )
  select
    c.id,
    c.user_id,
    c.course_id,
    course.title,
    c.kind,
    c.status,
    c.started_at,
    c.submitted_at,
    c.score,
    c.duration_seconds,
    chapter.id,
    chapter.title,
    (
      select count(*)::integer
      from public.attempt_questions count_aq
      where count_aq.attempt_id = c.id
    ),
    c.matching_count
  from counted c
  join public.courses course on course.id = c.course_id
  left join lateral (
    select ch.id, ch.title
    from public.attempt_questions chapter_aq
    join public.chapters ch
      on ch.id = (chapter_aq.question_snapshot ->> 'chapter_id')::uuid
    where chapter_aq.attempt_id = c.id
    order by chapter_aq.position
    limit 1
  ) chapter on true
  order by c.started_at desc, c.id desc
  offset (safe_page - 1) * safe_page_size
  limit safe_page_size;
end;
$$;

revoke all on function public.get_attempt_result_details(uuid)
from public, anon;
grant execute on function public.get_attempt_result_details(uuid)
to authenticated;

revoke all on function public.get_attempt_history(
  uuid,
  public.attempt_kind,
  uuid,
  timestamptz,
  timestamptz,
  numeric,
  numeric,
  integer,
  integer
)
from public, anon;
grant execute on function public.get_attempt_history(
  uuid,
  public.attempt_kind,
  uuid,
  timestamptz,
  timestamptz,
  numeric,
  numeric,
  integer,
  integer
)
to authenticated;
