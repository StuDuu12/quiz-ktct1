-- Preserve the question order from the validated Markdown source for practice.
-- Mock exams intentionally keep their seeded pseudo-random allocation.
alter table public.questions
  add column if not exists practice_position integer;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'questions_practice_position_positive'
      and conrelid = 'public.questions'::regclass
  ) then
    alter table public.questions
      add constraint questions_practice_position_positive
      check (practice_position is null or practice_position > 0) not valid;
  end if;
end
$$;

alter table public.questions
  validate constraint questions_practice_position_positive;

create unique index if not exists questions_chapter_practice_position_idx
  on public.questions (chapter_id, practice_position)
  where practice_position is not null;

create or replace function public.assign_question_practice_position()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.practice_position is null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'practice-position:' || new.chapter_id::text,
        0
      )
    );
    select coalesce(max(question.practice_position), 0) + 1
    into new.practice_position
    from public.questions question
    where question.chapter_id = new.chapter_id;
  end if;
  return new;
end;
$$;

drop trigger if exists assign_question_practice_position
  on public.questions;
create trigger assign_question_practice_position
before insert on public.questions
for each row execute function public.assign_question_practice_position();

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
  attempt_id uuid := gen_random_uuid();
  attempt_started_at timestamptz := clock_timestamp();
  created_attempt public.attempts;
  question_position integer;
  current_question_snapshot jsonb;
  attempt_seed text;
begin
  if target_exam_config_id is not null then
    selected_kind := 'mock_exam';
    select question_count, duration_seconds
    into selected_question_count, selected_duration_seconds
    from public.exam_configs
    where id = target_exam_config_id
      and course_id = target_course_id;

    if not found then
      raise exception 'Exam config not found'
        using errcode = '23514';
    end if;

    attempt_seed := attempt_id::text;

    select array_agg(id)
    into selected_question_ids
    from (
      select question.id
      from public.questions question
      join public.chapters chapter on chapter.id = question.chapter_id
      where chapter.course_id = target_course_id
        and question.status = 'published'
      order by md5(question.id::text || attempt_seed)
      limit selected_question_count
    ) allocated;
  else
    selected_kind := 'practice';
    selected_duration_seconds := null;

    select count(*)
    into selected_question_count
    from public.questions question
    join public.chapters chapter on chapter.id = question.chapter_id
    where chapter.course_id = target_course_id
      and question.status = 'published'
      and (
        target_chapter_id is null
        or question.chapter_id = target_chapter_id
      );

    select array_agg(id)
    into selected_question_ids
    from (
      select question.id
      from public.questions question
      join public.chapters chapter on chapter.id = question.chapter_id
      where chapter.course_id = target_course_id
        and question.status = 'published'
        and (
          target_chapter_id is null
          or question.chapter_id = target_chapter_id
        )
      order by
        question.practice_position asc nulls last,
        question.created_at asc,
        question.id asc
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
    option_order,
    chapter_id
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
    option_order_snapshot,
    target_chapter_id
  )
  returning * into created_attempt;

  for question_position in 1..array_length(selected_question_ids, 1) loop
    select
      jsonb_build_object(
        'content', question.content,
        'chapter_id', question.chapter_id,
        'options', (
          select jsonb_agg(
            jsonb_build_object(
              'id', option.id,
              'content', option.content,
              'label', option.label
            )
            order by option.label
          )
          from public.question_options option
          where option.question_id = question.id
        )
      ),
      (
        select jsonb_agg(option.id order by option.label)
        from public.question_options option
        where option.question_id = question.id
      )
    into current_question_snapshot, current_option_order
    from public.questions question
    where question.id = selected_question_ids[question_position];

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
