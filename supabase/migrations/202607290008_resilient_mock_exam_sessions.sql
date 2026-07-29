-- Mock-exam writes cross narrow security-definer RPCs. Learners retain read
-- access to their RLS-scoped session, but cannot bypass kind, deadline, or
-- ownership checks with direct table mutations.
revoke update on public.attempts from authenticated;
revoke insert, update, delete on public.attempt_answers from authenticated;

create or replace function public.protect_attempt_submission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  total_questions integer;
  correct_answers integer;
begin
  if (
    new.id is distinct from old.id
    or new.user_id is distinct from old.user_id
    or new.course_id is distinct from old.course_id
    or new.exam_config_id is distinct from old.exam_config_id
    or new.kind is distinct from old.kind
    or new.started_at is distinct from old.started_at
    or new.expires_at is distinct from old.expires_at
    or new.question_order is distinct from old.question_order
    or new.option_order is distinct from old.option_order
  ) then
    raise exception 'Attempt identity and snapshots are immutable'
      using errcode = '23514';
  end if;

  if old.status <> 'in_progress' and new is distinct from old then
    raise exception 'Submitted or expired attempts are immutable'
      using errcode = '23514';
  end if;

  -- Practice expires without a result. Mock exams intentionally take the
  -- submit branch at their deadline so saved work is graded exactly once.
  if old.status = 'in_progress'
    and clock_timestamp() >= old.expires_at
    and not (
      old.kind = 'mock_exam'::public.attempt_kind
      and new.status = 'submitted'::public.attempt_status
    ) then
    new.status := 'expired';
    new.submitted_at := null;
    new.duration_seconds := null;
    new.score := null;
    return new;
  end if;

  if new.status = 'submitted' and old.status = 'in_progress' then
    select count(*), count(*) filter (where aa.is_correct)
    into total_questions, correct_answers
    from public.attempt_questions aq
    left join public.attempt_answers aa
      on aa.attempt_question_id = aq.id
    where aq.attempt_id = old.id;

    new.submitted_at := least(clock_timestamp(), old.expires_at);
    new.duration_seconds := greatest(
      0,
      floor(extract(epoch from (new.submitted_at - old.started_at)))::integer
    );
    new.score := case
      when total_questions = 0 then 0
      else round((correct_answers::numeric * 100) / total_questions, 2)
    end;
  elsif new.status = 'expired' and old.status = 'in_progress' then
    new.submitted_at := null;
    new.duration_seconds := null;
    new.score := null;
  elsif new.status = 'in_progress' then
    new.submitted_at := null;
    new.duration_seconds := null;
    new.score := null;
  end if;

  return new;
end;
$$;

create function public.save_mock_exam_answer(
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

  return query
  select aa.selected_option_id, aa.is_flagged
  from public.attempt_answers aa
  where aa.attempt_question_id = target_attempt_question_id;
end;
$$;

create function public.set_mock_exam_flag(
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
end;
$$;

create function public.submit_mock_exam_attempt(target_attempt_id uuid)
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

  update public.attempts
  set status = 'submitted'
  where id = target_attempt_id
  returning * into submitted_attempt;

  return submitted_attempt;
end;
$$;

create function public.sync_mock_exam_attempt(target_attempt_id uuid)
returns table (
  id uuid,
  user_id uuid,
  course_id uuid,
  status public.attempt_status,
  started_at timestamptz,
  expires_at timestamptz,
  submitted_at timestamptz,
  score numeric,
  duration_seconds integer,
  server_now timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := auth.uid();
  synced_attempt public.attempts%rowtype;
begin
  select a.*
  into synced_attempt
  from public.attempts a
  where a.id = target_attempt_id
    and a.user_id = requester_id
    and a.kind = 'mock_exam'::public.attempt_kind
  for update;

  if not found then
    raise exception 'Owned mock exam not found'
      using errcode = '42501';
  end if;

  if synced_attempt.status = 'in_progress'::public.attempt_status
    and clock_timestamp() >= synced_attempt.expires_at then
    select *
    into synced_attempt
    from public.submit_mock_exam_attempt(target_attempt_id);
  end if;

  return query
  select
    synced_attempt.id,
    synced_attempt.user_id,
    synced_attempt.course_id,
    synced_attempt.status,
    synced_attempt.started_at,
    synced_attempt.expires_at,
    synced_attempt.submitted_at,
    synced_attempt.score,
    synced_attempt.duration_seconds,
    clock_timestamp();
end;
$$;

revoke all on function public.save_mock_exam_answer(uuid, uuid, uuid)
from public, anon;
grant execute on function public.save_mock_exam_answer(uuid, uuid, uuid)
to authenticated;

revoke all on function public.set_mock_exam_flag(uuid, uuid, boolean)
from public, anon;
grant execute on function public.set_mock_exam_flag(uuid, uuid, boolean)
to authenticated;

revoke all on function public.submit_mock_exam_attempt(uuid)
from public, anon;
grant execute on function public.submit_mock_exam_attempt(uuid)
to authenticated;

revoke all on function public.sync_mock_exam_attempt(uuid)
from public, anon;
grant execute on function public.sync_mock_exam_attempt(uuid)
to authenticated;
