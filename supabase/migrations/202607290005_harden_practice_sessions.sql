-- Explanations can reveal answer keys. Published question content remains
-- readable, while explanations are available only through scoped result RPCs.
revoke select on public.questions from anon, authenticated;
grant select (
  id,
  chapter_id,
  content,
  difficulty,
  status,
  source_number,
  created_by,
  created_at,
  updated_at
) on public.questions to anon, authenticated;

create or replace function public.strip_practice_snapshot_explanation()
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
      and a.kind = 'practice'::public.attempt_kind
  ) then
    new.question_snapshot := new.question_snapshot - 'explanation';
  end if;
  return new;
end;
$$;

create trigger strip_practice_snapshot_explanation
before insert or update of attempt_id, question_snapshot
on public.attempt_questions
for each row execute function public.strip_practice_snapshot_explanation();

-- Clean snapshots created before this hardening migration. Migration-owner
-- maintenance bypasses the normal learner immutability guard only for this
-- one key removal.
alter table public.attempt_questions
disable trigger guard_attempt_question_mutation;

update public.attempt_questions aq
set question_snapshot = aq.question_snapshot - 'explanation'
from public.attempts a
where a.id = aq.attempt_id
  and a.kind = 'practice'::public.attempt_kind
  and aq.question_snapshot ? 'explanation';

alter table public.attempt_questions
enable trigger guard_attempt_question_mutation;

create or replace function public.sync_practice_attempt(
  target_attempt_id uuid
)
returns public.attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := auth.uid();
  synced_attempt public.attempts%rowtype;
begin
  select *
  into synced_attempt
  from public.attempts
  where id = target_attempt_id
    and user_id = requester_id
    and kind = 'practice'::public.attempt_kind
  for update;

  if not found then
    raise exception 'Owned practice attempt not found'
      using errcode = '42501';
  end if;

  if synced_attempt.status = 'in_progress'::public.attempt_status
    and clock_timestamp() >= synced_attempt.expires_at then
    update public.attempts
    set status = 'expired'
    where id = target_attempt_id
    returning * into synced_attempt;
  end if;

  return synced_attempt;
end;
$$;

revoke all on function public.sync_practice_attempt(uuid)
from public, anon;
grant execute on function public.sync_practice_attempt(uuid)
to authenticated;

drop function public.save_practice_answer(uuid, uuid, uuid);

create function public.save_practice_answer(
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
  attempt_owner_id uuid;
  target_kind public.attempt_kind;
  target_status public.attempt_status;
  target_expires_at timestamptz;
  existing_option_id uuid;
  answer_exists boolean := false;
  answer_was_locked boolean := false;
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
    or target_status <> 'in_progress'::public.attempt_status
    or clock_timestamp() >= target_expires_at then
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

revoke all on function public.save_practice_answer(uuid, uuid, uuid)
from public, anon;
grant execute on function public.save_practice_answer(uuid, uuid, uuid)
to authenticated;
