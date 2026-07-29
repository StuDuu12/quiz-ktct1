alter table public.attempt_answers
add column is_flagged boolean not null default false;

grant select (is_flagged) on public.attempt_answers to authenticated;

-- Capture grading material as soon as practice attempts can be created.
-- Learners never receive table access; feedback is exposed only through the
-- owned practice RPC and submitted-result RPC added later.
create table public.attempt_question_secrets (
  attempt_question_id uuid primary key
    references public.attempt_questions(id) on delete cascade,
  correct_option_id uuid not null
    references public.question_options(id),
  explanation text not null
);

alter table public.attempt_question_secrets enable row level security;
revoke all on public.attempt_question_secrets
from public, anon, authenticated;

-- Rows created before this capture relation cannot always recover an historic
-- answer key. Prefer a formerly-correct selected answer when it proves the key;
-- otherwise use the best source state available at migration time. Preserve a
-- snapshot explanation when one exists.
insert into public.attempt_question_secrets (
  attempt_question_id,
  correct_option_id,
  explanation
)
select
  aq.id,
  recovered_key.correct_option_id,
  case
    when aq.question_snapshot ? 'explanation'
      then aq.question_snapshot ->> 'explanation'
    else q.explanation
  end
from public.attempt_questions aq
join public.questions q on q.id = aq.question_id
join lateral (
  select candidate.correct_option_id
  from (
    select aa.selected_option_id as correct_option_id, 0 as priority
    from public.attempt_answers aa
    where aa.attempt_question_id = aq.id
      and aa.selected_option_id is not null
      and aa.is_correct
    union all
    select qo.id, 1
    from public.question_options qo
    where qo.question_id = aq.question_id
      and qo.is_correct
  ) candidate
  order by candidate.priority
  limit 1
) recovered_key on true
on conflict (attempt_question_id) do nothing;

create function public.capture_attempt_question_secret()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.attempt_question_secrets (
    attempt_question_id,
    correct_option_id,
    explanation
  )
  select new.id, qo.id, q.explanation
  from public.questions q
  join public.question_options qo
    on qo.question_id = q.id
    and qo.is_correct
  where q.id = new.question_id;

  if not found then
    raise exception 'Attempt grading snapshot not found'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger capture_attempt_question_secret
after insert on public.attempt_questions
for each row execute function public.capture_attempt_question_secret();

-- An option ID stored in an attempt snapshot is part of immutable attempt
-- content. Content/correctness may evolve in the source bank, but deleting or
-- replacing the identity would make the learner's stored choice unsavable.
create function public.protect_attempt_snapshot_option_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
    tg_op = 'DELETE'
    or new.id is distinct from old.id
  ) and exists (
    select 1
    from public.attempt_questions aq
    cross join lateral jsonb_array_elements_text(aq.option_order)
      snapshot_option(option_id)
    where snapshot_option.option_id = old.id::text
  ) then
    raise exception 'Option identity is referenced by an attempt snapshot'
      using errcode = '23503';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger protect_attempt_snapshot_option_identity
before update or delete on public.question_options
for each row execute function public.protect_attempt_snapshot_option_identity();

-- Keep truly pre-capture submitted rows internally consistent with the one
-- recoverable key chosen above. Migration-owner maintenance temporarily
-- bypasses normal completed-attempt immutability.
alter table public.attempt_answers
disable trigger guard_attempt_answer_mutation;

update public.attempt_answers aa
set is_correct = case
  when aa.selected_option_id is null then null
  else aa.selected_option_id = aqs.correct_option_id
end
from public.attempt_question_secrets aqs
where aqs.attempt_question_id = aa.attempt_question_id;

alter table public.attempt_answers
enable trigger guard_attempt_answer_mutation;

alter table public.attempts
disable trigger protect_attempt_submission;

with grading as (
  select
    a.id as attempt_id,
    count(aq.id)::integer as total_questions,
    count(*) filter (where aa.is_correct)::integer as correct_answers
  from public.attempts a
  left join public.attempt_questions aq on aq.attempt_id = a.id
  left join public.attempt_answers aa on aa.attempt_question_id = aq.id
  where a.status = 'submitted'::public.attempt_status
  group by a.id
)
update public.attempts a
set score = case
  when grading.total_questions = 0 then 0
  else round(
    (grading.correct_answers::numeric * 100) / grading.total_questions,
    2
  )
end
from grading
where grading.attempt_id = a.id;

alter table public.attempts
enable trigger protect_attempt_submission;

-- All answer grading is based on immutable option membership and the protected
-- key, never mutable live question membership.
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
