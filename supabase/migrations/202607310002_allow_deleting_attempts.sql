CREATE OR REPLACE FUNCTION public.guard_attempt_content_mutation()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
  AS $$
  declare
    target_attempt_id uuid;
    target_status public.attempt_status;
    target_expires_at timestamptz;
  begin
    if tg_table_name = 'attempt_questions' then
      target_attempt_id := case
        when tg_op = 'DELETE' then old.attempt_id
        else new.attempt_id
      end;
    else
      select aq.attempt_id
      into target_attempt_id
      from public.attempt_questions aq
      where aq.id = case
        when tg_op = 'DELETE' then old.attempt_question_id
        else new.attempt_question_id
      end;
    end if;

    select status, expires_at
    into target_status, target_expires_at
    from public.attempts
    where id = target_attempt_id;

    -- Allow cascade delete when attempt is already deleted (target_status IS NULL)
    if tg_op = 'DELETE' and target_status is null then
      return old;
    end if;

    if target_status is distinct from 'in_progress'::public.attempt_status then
      raise exception 'Attempt content is immutable after completion'
        using errcode = '23514';
    end if;

    if clock_timestamp() >= target_expires_at then
      raise exception 'Attempt has expired'
        using errcode = '23514';
    end if;

    return case when tg_op = 'DELETE' then old else new end;
  end;
  $$;
