-- ==========================================================================
-- Migration: Fix practice session saves
--
-- 1. Updates verify_practice_answer to actually SAVE the answer to the DB
-- 2. Removes expires_at checks from set_practice_flag and verify_practice_answer
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.verify_practice_answer(
  target_attempt_question_id uuid,
  target_option_id uuid
)
RETURNS TABLE (
  is_correct boolean,
  explanation text,
  correct_option_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requester_id uuid := auth.uid();
  valid_attempt_id uuid;
  secret_record RECORD;
BEGIN
  -- 1. Verify ownership and state
  SELECT a.id
  INTO valid_attempt_id
  FROM public.attempt_questions aq
  JOIN public.attempts a ON a.id = aq.attempt_id
  WHERE aq.id = target_attempt_question_id
    AND a.user_id = requester_id
    AND a.kind = 'practice'::public.attempt_kind
    AND a.status = 'in_progress'::public.attempt_status
    AND (a.expires_at IS NULL OR a.expires_at > clock_timestamp());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Practice attempt is not in progress or not owned'
      USING errcode = '42501';
  END IF;

  -- 2. Save the answer!
  INSERT INTO public.attempt_answers (
    attempt_question_id,
    selected_option_id
  )
  VALUES (
    target_attempt_question_id,
    target_option_id
  )
  ON CONFLICT (attempt_question_id) DO UPDATE
  SET selected_option_id = EXCLUDED.selected_option_id;

  -- 3. Return the feedback
  SELECT
    (aqs.correct_option_id = target_option_id) AS is_correct,
    aqs.explanation,
    aqs.correct_option_id
  INTO secret_record
  FROM public.attempt_question_secrets aqs
  WHERE aqs.attempt_question_id = target_attempt_question_id;

  RETURN QUERY SELECT secret_record.is_correct, secret_record.explanation, secret_record.correct_option_id;
END;
$$;


CREATE OR REPLACE FUNCTION public.set_practice_flag(
  target_attempt_id uuid,
  target_attempt_question_id uuid,
  target_flagged boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requester_id uuid := auth.uid();
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.attempts a
    JOIN public.attempt_questions aq ON aq.attempt_id = a.id
    WHERE a.id = target_attempt_id
      AND aq.id = target_attempt_question_id
      AND a.user_id = requester_id
      AND a.kind = 'practice'::public.attempt_kind
      AND a.status = 'in_progress'::public.attempt_status
      AND (a.expires_at IS NULL OR clock_timestamp() < a.expires_at)
  ) THEN
    RAISE EXCEPTION 'Practice attempt is not in progress or not owned'
      USING errcode = '42501';
  END IF;

  INSERT INTO public.attempt_answers (
    attempt_question_id,
    selected_option_id,
    is_flagged
  )
  VALUES (
    target_attempt_question_id,
    NULL,
    target_flagged
  )
  ON CONFLICT (attempt_question_id) DO UPDATE
  SET is_flagged = EXCLUDED.is_flagged;
END;
$$;
