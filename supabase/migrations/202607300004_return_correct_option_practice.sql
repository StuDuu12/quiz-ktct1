drop function if exists public.load_practice_answer_feedback(uuid);
drop function if exists public.save_practice_answer(uuid, uuid, uuid);

create or replace function public.load_practice_answer_feedback(
  target_attempt_id uuid
)
returns table (
  attempt_question_id uuid,
  selected_option_id uuid,
  is_correct boolean,
  explanation text,
  correct_option_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    answer.attempt_question_id,
    answer.selected_option_id,
    answer.is_correct,
    secret.explanation,
    secret.correct_option_id
  from public.attempts attempt
  join public.attempt_questions attempt_question
    on attempt_question.attempt_id = attempt.id
  join public.attempt_answers answer
    on answer.attempt_question_id = attempt_question.id
  join public.attempt_question_secrets secret
    on secret.attempt_question_id = attempt_question.id
  where attempt.id = target_attempt_id
    and attempt.user_id = auth.uid()
    and attempt.kind = 'practice'::public.attempt_kind
    and answer.selected_option_id is not null
  order by attempt_question.position
$$;

revoke all on function public.load_practice_answer_feedback(uuid) from public, anon;
grant execute on function public.load_practice_answer_feedback(uuid) to authenticated;

create or replace function public.save_practice_answer(
  target_attempt_id uuid,
  target_attempt_question_id uuid,
  target_option_id uuid
)
returns table (
  selected_option_id uuid,
  is_correct boolean,
  explanation text,
  was_already_locked boolean,
  correct_option_id uuid
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
    answer_was_locked,
    aqs.correct_option_id
  from public.attempt_answers aa
  join public.attempt_question_secrets aqs
    on aqs.attempt_question_id = aa.attempt_question_id
  where aa.attempt_question_id = target_attempt_question_id
    and aa.selected_option_id is not null;
end;
$$;

revoke all on function public.save_practice_answer(uuid, uuid, uuid) from public, anon;
grant execute on function public.save_practice_answer(uuid, uuid, uuid) to authenticated;
