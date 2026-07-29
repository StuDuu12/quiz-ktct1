-- Practice continuation must remain independent of the current publication
-- state. Stamp trusted chapter scope into the immutable learner snapshot while
-- continuing to remove answer explanations.
create or replace function public.strip_practice_snapshot_explanation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_chapter_id uuid;
begin
  if exists (
    select 1
    from public.attempts a
    where a.id = new.attempt_id
      and a.kind = 'practice'::public.attempt_kind
  ) then
    select q.chapter_id
    into source_chapter_id
    from public.questions q
    where q.id = new.question_id;

    if source_chapter_id is null then
      raise exception 'Practice source question not found'
        using errcode = '23503';
    end if;

    new.question_snapshot :=
      (new.question_snapshot - 'explanation')
      || jsonb_build_object('chapter_id', source_chapter_id);
  end if;
  return new;
end;
$$;

-- Backfill snapshots created by earlier migrations. The source relation is
-- used only during this privileged migration; continuation reads the stored
-- immutable scope below.
alter table public.attempt_questions
disable trigger guard_attempt_question_mutation;

update public.attempt_questions aq
set question_snapshot =
  (aq.question_snapshot - 'explanation')
  || jsonb_build_object('chapter_id', q.chapter_id)
from public.attempts a, public.questions q
where a.id = aq.attempt_id
  and a.kind = 'practice'::public.attempt_kind
  and q.id = aq.question_id;

alter table public.attempt_questions
enable trigger guard_attempt_question_mutation;

create function public.load_practice_attempt_questions(
  target_attempt_id uuid,
  target_chapter_id uuid
)
returns setof public.attempt_questions
language plpgsql
security definer
set search_path = ''
as $$
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
  select aq.*
  from public.attempt_questions aq
  where aq.attempt_id = target_attempt_id
  order by aq.position;
end;
$$;

revoke all on function public.load_practice_attempt_questions(uuid, uuid)
from public, anon;
grant execute on function public.load_practice_attempt_questions(uuid, uuid)
to authenticated;
