-- Version the complete learner-visible answer/flag state. This relation is
-- server-only; learners can observe a revision only through the owned review
-- RPC, and every mutation advances it while holding the attempt row lock.
create table public.attempt_answer_revisions (
  attempt_id uuid primary key
    references public.attempts(id) on delete cascade,
  revision bigint not null default 0 check (revision >= 0)
);

alter table public.attempt_answer_revisions enable row level security;
revoke all on public.attempt_answer_revisions
from public, anon, authenticated;

insert into public.attempt_answer_revisions (attempt_id)
select id from public.attempts
on conflict (attempt_id) do nothing;

create function public.initialize_attempt_answer_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.attempt_answer_revisions (attempt_id)
  values (new.id)
  on conflict (attempt_id) do nothing;
  return new;
end;
$$;

create trigger initialize_attempt_answer_revision
after insert on public.attempts
for each row execute function public.initialize_attempt_answer_revision();

create or replace function public.save_mock_exam_answer(
  target_attempt_id uuid,
  target_attempt_question_id uuid,
  target_option_id uuid
)
returns table (
  selected_option_id uuid,
  is_flagged boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := auth.uid();
  owned_attempt public.attempts%rowtype;
begin
  select *
  into owned_attempt
  from public.attempts
  where id = target_attempt_id
    and user_id = requester_id
    and kind = 'mock_exam'::public.attempt_kind
  for update;

  if not found then
    raise exception 'Owned mock exam not found'
      using errcode = '42501';
  end if;

  if owned_attempt.status <> 'in_progress'::public.attempt_status
    or clock_timestamp() >= owned_attempt.expires_at then
    raise exception 'Mock exam is not in progress'
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

  insert into public.attempt_answers (
    attempt_question_id,
    selected_option_id
  )
  values (
    target_attempt_question_id,
    target_option_id
  )
  on conflict (attempt_question_id) do update
  set selected_option_id = excluded.selected_option_id;

  update public.attempt_answer_revisions
  set revision = revision + 1
  where attempt_id = target_attempt_id;

  return query
  select aa.selected_option_id, aa.is_flagged
  from public.attempt_answers aa
  where aa.attempt_question_id = target_attempt_question_id;
end;
$$;

create or replace function public.set_mock_exam_flag(
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
  owned_attempt public.attempts%rowtype;
begin
  select *
  into owned_attempt
  from public.attempts
  where id = target_attempt_id
    and user_id = requester_id
    and kind = 'mock_exam'::public.attempt_kind
  for update;

  if not found then
    raise exception 'Owned mock exam not found'
      using errcode = '42501';
  end if;

  if owned_attempt.status <> 'in_progress'::public.attempt_status
    or clock_timestamp() >= owned_attempt.expires_at then
    raise exception 'Mock exam is not in progress'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.attempt_questions aq
    where aq.id = target_attempt_question_id
      and aq.attempt_id = target_attempt_id
  ) then
    raise exception 'Attempt question is outside the owned mock exam'
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

  update public.attempt_answer_revisions
  set revision = revision + 1
  where attempt_id = target_attempt_id;
end;
$$;

create function public.get_mock_exam_review(target_attempt_id uuid)
returns table (
  attempt_question_id uuid,
  selected_option_id uuid,
  is_flagged boolean,
  answer_revision bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := auth.uid();
  owned_attempt public.attempts%rowtype;
  current_revision bigint;
begin
  select *
  into owned_attempt
  from public.attempts
  where id = target_attempt_id
    and user_id = requester_id
    and kind = 'mock_exam'::public.attempt_kind
  for update;

  if not found then
    raise exception 'Owned mock exam not found'
      using errcode = '42501';
  end if;

  if owned_attempt.status <> 'in_progress'::public.attempt_status
    or clock_timestamp() >= owned_attempt.expires_at then
    raise exception 'Mock exam is not in progress'
      using errcode = '23514';
  end if;

  select revision
  into current_revision
  from public.attempt_answer_revisions
  where attempt_id = target_attempt_id;

  return query
  select
    aq.id,
    aa.selected_option_id,
    coalesce(aa.is_flagged, false),
    current_revision
  from public.attempt_questions aq
  left join public.attempt_answers aa on aa.attempt_question_id = aq.id
  where aq.attempt_id = target_attempt_id
  order by aq.position;
end;
$$;

-- Manual submission binds the confirmation to the exact authoritative
-- revision returned by get_mock_exam_review.
create function public.submit_mock_exam_attempt(
  target_attempt_id uuid,
  expected_answer_revision bigint
)
returns public.attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := auth.uid();
  submitted_attempt public.attempts%rowtype;
  current_revision bigint;
begin
  select *
  into submitted_attempt
  from public.attempts
  where id = target_attempt_id
    and user_id = requester_id
    and kind = 'mock_exam'::public.attempt_kind
  for update;

  if not found then
    raise exception 'Owned mock exam not found'
      using errcode = '42501';
  end if;

  if submitted_attempt.status = 'submitted'::public.attempt_status then
    return submitted_attempt;
  end if;

  if submitted_attempt.status <> 'in_progress'::public.attempt_status then
    raise exception 'Mock exam is not in progress'
      using errcode = '23514';
  end if;

  select revision
  into current_revision
  from public.attempt_answer_revisions
  where attempt_id = target_attempt_id;

  if expected_answer_revision is distinct from current_revision then
    raise exception 'REVIEW_STALE'
      using errcode = '40001';
  end if;

  update public.attempts
  set status = 'submitted'
  where id = target_attempt_id
  returning * into submitted_attempt;

  return submitted_attempt;
end;
$$;

-- The one-argument overload is the deadline path used by synchronized reloads
-- and automatic submission. Before the deadline, a reviewed revision is
-- mandatory.
create or replace function public.submit_mock_exam_attempt(
  target_attempt_id uuid
)
returns public.attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := auth.uid();
  submitted_attempt public.attempts%rowtype;
begin
  select *
  into submitted_attempt
  from public.attempts
  where id = target_attempt_id
    and user_id = requester_id
    and kind = 'mock_exam'::public.attempt_kind
  for update;

  if not found then
    raise exception 'Owned mock exam not found'
      using errcode = '42501';
  end if;

  if submitted_attempt.status = 'submitted'::public.attempt_status then
    return submitted_attempt;
  end if;

  if submitted_attempt.status <> 'in_progress'::public.attempt_status then
    raise exception 'Mock exam is not in progress'
      using errcode = '23514';
  end if;

  if clock_timestamp() < submitted_attempt.expires_at then
    raise exception 'REVIEW_REQUIRED'
      using errcode = '23514';
  end if;

  update public.attempts
  set status = 'submitted'
  where id = target_attempt_id
  returning * into submitted_attempt;

  return submitted_attempt;
end;
$$;

revoke all on function public.get_mock_exam_review(uuid)
from public, anon;
grant execute on function public.get_mock_exam_review(uuid)
to authenticated;

revoke all on function public.submit_mock_exam_attempt(uuid, bigint)
from public, anon;
grant execute on function public.submit_mock_exam_attempt(uuid, bigint)
to authenticated;
