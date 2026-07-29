-- The learner snapshot is intentionally answer-free. Preserve grading and
-- review data in a server-only relation with RLS enabled and no authenticated
-- grants or policies.
create table public.attempt_question_secrets (
  attempt_question_id uuid primary key
    references public.attempt_questions(id) on delete cascade,
  correct_option_id uuid not null
    references public.question_options(id),
  explanation text not null
);

alter table public.attempt_question_secrets enable row level security;
revoke all on public.attempt_question_secrets from public, anon, authenticated;

insert into public.attempt_question_secrets (
  attempt_question_id,
  correct_option_id,
  explanation
)
select aq.id, qo.id, q.explanation
from public.attempt_questions aq
join public.attempts a on a.id = aq.attempt_id
join public.questions q on q.id = aq.question_id
join public.question_options qo
  on qo.question_id = q.id
  and qo.is_correct
where a.kind = 'mock_exam'::public.attempt_kind
on conflict (attempt_question_id) do nothing;

create function public.capture_mock_exam_secret()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.attempts a
    where a.id = new.attempt_id
      and a.kind = 'mock_exam'::public.attempt_kind
  ) then
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
      raise exception 'Mock-exam question has no correct option snapshot'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger capture_mock_exam_secret
after insert on public.attempt_questions
for each row execute function public.capture_mock_exam_secret();

create function public.strip_mock_exam_snapshot_secrets()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.attempts a
    where a.id = new.attempt_id
      and a.kind = 'mock_exam'::public.attempt_kind
  ) then
    new.question_snapshot := jsonb_set(
      new.question_snapshot - 'explanation',
      '{options}',
      coalesce(
        (
          select jsonb_agg(value - 'is_correct' order by position)
          from jsonb_array_elements(
            coalesce(new.question_snapshot -> 'options', '[]'::jsonb)
          ) with ordinality as option(value, position)
        ),
        '[]'::jsonb
      )
    );
  end if;
  return new;
end;
$$;

create trigger strip_mock_exam_snapshot_secrets
before insert or update of attempt_id, question_snapshot
on public.attempt_questions
for each row execute function public.strip_mock_exam_snapshot_secrets();

-- Remove secrets from mock-exam rows created by older versions. Migration
-- maintenance temporarily bypasses the normal attempt-content guard.
alter table public.attempt_questions
disable trigger guard_attempt_question_mutation;

update public.attempt_questions aq
set question_snapshot = jsonb_set(
  aq.question_snapshot - 'explanation',
  '{options}',
  coalesce(
    (
      select jsonb_agg(value - 'is_correct' order by position)
      from jsonb_array_elements(
        coalesce(aq.question_snapshot -> 'options', '[]'::jsonb)
      ) with ordinality as option(value, position)
    ),
    '[]'::jsonb
  )
)
from public.attempts a
where a.id = aq.attempt_id
  and a.kind = 'mock_exam'::public.attempt_kind;

alter table public.attempt_questions
enable trigger guard_attempt_question_mutation;

-- Grade mock-exam answers against the protected immutable snapshot. Practice
-- keeps its existing immediate-feedback behavior.
create or replace function public.prepare_attempt_answer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected_question_id uuid;
  selected_question_id uuid;
  target_kind public.attempt_kind;
  snapshot_correct_option_id uuid;
begin
  select aq.question_id, a.kind
  into expected_question_id, target_kind
  from public.attempt_questions aq
  join public.attempts a on a.id = aq.attempt_id
  where aq.id = new.attempt_question_id;

  if expected_question_id is null then
    raise exception 'Attempt question does not exist'
      using errcode = '23503';
  end if;

  if new.selected_option_id is null then
    new.is_correct := null;
  else
    select question_id
    into selected_question_id
    from public.question_options
    where id = new.selected_option_id;

    if selected_question_id is distinct from expected_question_id then
      raise exception 'Selected option does not belong to the attempt question'
        using errcode = '23514';
    end if;

    if target_kind = 'mock_exam'::public.attempt_kind then
      select correct_option_id
      into snapshot_correct_option_id
      from public.attempt_question_secrets
      where attempt_question_id = new.attempt_question_id;

      if snapshot_correct_option_id is null then
        raise exception 'Mock-exam grading snapshot not found'
          using errcode = '23514';
      end if;
      new.is_correct := new.selected_option_id = snapshot_correct_option_id;
    else
      select is_correct
      into new.is_correct
      from public.question_options
      where id = new.selected_option_id;
    end if;
  end if;

  new.answered_at := now();
  return new;
end;
$$;

-- Mock exams are generated inside the authenticated database boundary. The
-- attempt UUID is the server-created seed, so chapter quotas, backfill,
-- question order, and option order are fixed for the lifetime of the attempt.
create or replace function public.start_attempt(
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
  selected_question_ids uuid[];
  question_order_snapshot jsonb;
  option_order_snapshot jsonb := '{}'::jsonb;
  current_option_order jsonb;
  current_question_snapshot jsonb;
  created_attempt public.attempts%rowtype;
  question_position integer;
  attempt_id uuid := gen_random_uuid();
  attempt_seed text;
  attempt_started_at timestamptz := clock_timestamp();
  course_chapter_count integer;
begin
  if requester_id is null then
    raise exception 'Authentication required'
      using errcode = '28000';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = requester_id
      and is_active
  ) then
    raise exception 'Active profile required'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.courses
    where id = target_course_id
      and status = 'published'
  ) then
    raise exception 'Published course not found'
      using errcode = '22023';
  end if;

  if target_exam_config_id is not null and target_chapter_id is not null then
    raise exception 'Mock exams cannot be scoped to a chapter'
      using errcode = '22023';
  end if;

  if target_chapter_id is not null and not exists (
    select 1
    from public.chapters
    where id = target_chapter_id
      and course_id = target_course_id
  ) then
    raise exception 'Chapter does not belong to course'
      using errcode = '22023';
  end if;

  if target_exam_config_id is not null then
    select ec.kind
    into selected_kind
    from public.exam_configs ec
    where ec.id = target_exam_config_id
      and ec.course_id = target_course_id
      and ec.kind = 'mock_exam'::public.attempt_kind
      and ec.is_active;

    if not found then
      raise exception
        'Active mock-exam configuration does not belong to published course'
        using errcode = '22023';
    end if;

    selected_question_count := 40;
    selected_duration_seconds := 60 * 60;
    attempt_seed := attempt_id::text;

    select count(*)
    into course_chapter_count
    from public.chapters
    where course_id = target_course_id;

    if course_chapter_count <> 6 then
      raise exception 'Mock exam course must contain exactly six chapters'
        using errcode = '22023';
    end if;

    with chapter_allocations as (
      select
        ch.id as chapter_id,
        row_number() over (
          order by
            md5(attempt_seed || ':chapter:' || ch.id::text),
            ch.id
        ) as allocation_rank
      from public.chapters ch
      where ch.course_id = target_course_id
    ),
    chapter_quotas as (
      select
        chapter_id,
        (selected_question_count / course_chapter_count)
          + case
              when allocation_rank
                <= (selected_question_count % course_chapter_count)
              then 1
              else 0
            end as quota
      from chapter_allocations
    ),
    ranked_questions as (
      select
        q.id as question_id,
        q.chapter_id,
        cq.quota,
        row_number() over (
          partition by q.chapter_id
          order by
            md5(attempt_seed || ':question:' || q.id::text),
            q.id
        ) as chapter_rank
      from public.questions q
      join chapter_quotas cq on cq.chapter_id = q.chapter_id
      where q.status = 'published'
    ),
    quota_selection as (
      select question_id
      from ranked_questions
      where chapter_rank <= quota
    ),
    quota_count as (
      select count(*) as selected_count
      from quota_selection
    ),
    backfill_candidates as (
      select
        rq.question_id,
        row_number() over (
          order by
            md5(attempt_seed || ':backfill:' || rq.question_id::text),
            rq.question_id
        ) as backfill_rank
      from ranked_questions rq
      where rq.chapter_rank > rq.quota
    ),
    backfill_selection as (
      select bc.question_id
      from backfill_candidates bc
      cross join quota_count qc
      where bc.backfill_rank
        <= selected_question_count - qc.selected_count
    ),
    selected as (
      select question_id from quota_selection
      union all
      select question_id from backfill_selection
    )
    select array_agg(
      question_id
      order by
        md5(attempt_seed || ':order:' || question_id::text),
        question_id
    )
    into selected_question_ids
    from selected;
  else
    selected_kind := 'practice';
    selected_duration_seconds := 60 * 60;

    select count(*)
    into selected_question_count
    from public.questions q
    join public.chapters ch on ch.id = q.chapter_id
    where ch.course_id = target_course_id
      and q.status = 'published'
      and (target_chapter_id is null or q.chapter_id = target_chapter_id);

    select array_agg(ranked.id order by ranked.sort_key, ranked.id)
    into selected_question_ids
    from (
      select q.id, random() as sort_key
      from public.questions q
      join public.chapters ch on ch.id = q.chapter_id
      where ch.course_id = target_course_id
        and q.status = 'published'
        and (target_chapter_id is null or q.chapter_id = target_chapter_id)
      order by sort_key, q.id
      limit selected_question_count
    ) ranked;
  end if;

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
          when selected_kind = 'mock_exam'::public.attempt_kind
          then md5(
            attempt_seed || ':option:'
            || selected_question_ids[question_position]::text
            || ':' || qo.id::text
          )
          else md5(random()::text)
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
    attempt_started_at + make_interval(secs => selected_duration_seconds),
    question_order_snapshot,
    option_order_snapshot
  )
  returning * into created_attempt;

  for question_position in 1..array_length(selected_question_ids, 1) loop
    current_option_order := option_order_snapshot
      -> selected_question_ids[question_position]::text;

    select
      jsonb_build_object(
        'id', q.id,
        'chapter_id', q.chapter_id,
        'content', q.content,
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
      || case
          when selected_kind = 'practice'::public.attempt_kind
          then jsonb_build_object('explanation', q.explanation)
          else '{}'::jsonb
        end
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

revoke all on function public.start_attempt(uuid, uuid, uuid)
from public, anon;
grant execute on function public.start_attempt(uuid, uuid, uuid)
to authenticated;
