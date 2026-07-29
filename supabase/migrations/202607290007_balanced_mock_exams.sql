-- The protected all-kind grading relation and capture trigger are installed
-- in migration 004, before practice attempts can be created.

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

-- Canonical cross-runtime ranking contract: FNV-1a over UTF-8 bytes, returned
-- as an unsigned 32-bit integer represented in bigint.
create function public.seeded_hash32(value text)
returns bigint
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  bytes bytea := convert_to(value, 'UTF8');
  hash_value bigint := 2166136261;
  byte_index integer;
begin
  if octet_length(bytes) > 0 then
    for byte_index in 0..octet_length(bytes) - 1 loop
      hash_value := (
        (hash_value # get_byte(bytes, byte_index)::bigint) * 16777619
      ) % 4294967296;
    end loop;
  end if;
  return hash_value;
end;
$$;

revoke all on function public.seeded_hash32(text)
from public, anon, authenticated;

-- One authoritative allocator supplies start_attempt and deterministic
-- production-level parity tests. It is deliberately unavailable to learners.
create function public.allocate_mock_exam_questions(
  target_course_id uuid,
  allocation_seed text
)
returns table (
  question_position integer,
  question_id uuid,
  chapter_id uuid,
  option_order jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with chapter_count as (
    select count(*)::integer as value
    from public.chapters ch
    where ch.course_id = target_course_id
  ),
  chapter_allocations as (
    select
      ch.id as chapter_id,
      row_number() over (
        order by
          public.seeded_hash32(
            allocation_seed || ':chapters:' || ch.id::text
          ),
          ch.id
      ) as allocation_rank
    from public.chapters ch
    where ch.course_id = target_course_id
  ),
  chapter_quotas as (
    select
      ca.chapter_id,
      (40 / cc.value)
        + case
            when ca.allocation_rank <= (40 % cc.value) then 1
            else 0
          end as quota
    from chapter_allocations ca
    cross join chapter_count cc
    where cc.value > 0
  ),
  ranked_questions as (
    select
      q.id as question_id,
      q.chapter_id,
      cq.quota,
      row_number() over (
        partition by q.chapter_id
        order by
          public.seeded_hash32(
            allocation_seed || ':chapter:' || q.chapter_id::text
            || ':' || q.id::text
          ),
          q.id
      ) as chapter_rank
    from public.questions q
    join chapter_quotas cq on cq.chapter_id = q.chapter_id
    where q.status = 'published'
  ),
  quota_selection as (
    select question_id, chapter_id
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
      rq.chapter_id,
      row_number() over (
        order by
          public.seeded_hash32(
            allocation_seed || ':backfill:' || rq.question_id::text
          ),
          rq.question_id
      ) as backfill_rank
    from ranked_questions rq
    where rq.chapter_rank > rq.quota
  ),
  backfill_selection as (
    select bc.question_id, bc.chapter_id
    from backfill_candidates bc
    cross join quota_count qc
    where bc.backfill_rank <= 40 - qc.selected_count
  ),
  selected as (
    select question_id, chapter_id from quota_selection
    union all
    select question_id, chapter_id from backfill_selection
  ),
  ordered_selection as (
    select
      row_number() over (
        order by
          public.seeded_hash32(
            allocation_seed || ':questions:' || selected.question_id::text
          ),
          selected.question_id
      )::integer as position,
      selected.question_id,
      selected.chapter_id
    from selected
  )
  select
    os.position as question_position,
    os.question_id,
    os.chapter_id,
    (
      select coalesce(
        jsonb_agg(
          to_jsonb(qo.id)
          order by
            public.seeded_hash32(
              allocation_seed || ':option:' || os.question_id::text
              || ':' || qo.id::text
            ),
            qo.id
        ),
        '[]'::jsonb
      )
      from public.question_options qo
      where qo.question_id = os.question_id
    ) as option_order
  from ordered_selection os
  order by os.position
$$;

revoke all on function public.allocate_mock_exam_questions(uuid, text)
from public, anon, authenticated;

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

    select
      array_agg(
        allocated.question_id order by allocated.question_position
      ),
      coalesce(
        jsonb_object_agg(
          allocated.question_id::text,
          allocated.option_order
          order by allocated.question_position
        ),
        '{}'::jsonb
      )
    into selected_question_ids, option_order_snapshot
    from public.allocate_mock_exam_questions(
      target_course_id,
      attempt_seed
    ) allocated;
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

  if selected_kind = 'practice'::public.attempt_kind then
    for question_position in 1..array_length(selected_question_ids, 1) loop
      select coalesce(
        jsonb_agg(to_jsonb(ordered.id) order by ordered.sort_key, ordered.id),
        '[]'::jsonb
      )
      into current_option_order
      from (
        select qo.id, md5(random()::text) as sort_key
        from public.question_options qo
        where qo.question_id = selected_question_ids[question_position]
      ) ordered;

      option_order_snapshot := option_order_snapshot || jsonb_build_object(
        selected_question_ids[question_position]::text,
        current_option_order
      );
    end loop;
  end if;

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
