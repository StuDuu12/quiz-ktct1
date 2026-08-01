-- ==========================================================================
-- Migration: Create finish_practice_attempt RPC
-- 
-- Root cause: Migration 202607290008 revoked UPDATE on attempts and
-- INSERT/UPDATE/DELETE on attempt_answers from authenticated users.
-- The finishPractice TypeScript function used direct table operations
-- which silently failed due to missing permissions.
--
-- Fix: A SECURITY DEFINER function that properly handles finishing
-- practice attempts, bypassing table-level grant requirements.
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.finish_practice_attempt(
  target_attempt_id uuid,
  answers_to_save jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requester_id uuid := auth.uid();
  owned_attempt public.attempts%rowtype;
  result_status public.attempt_status;
  result_score numeric;
BEGIN
  IF requester_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING errcode = '28000';
  END IF;

  -- Lock and verify ownership + status
  SELECT * INTO owned_attempt
  FROM public.attempts
  WHERE id = target_attempt_id
    AND user_id = requester_id
    AND kind = 'practice'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Practice attempt not found'
      USING errcode = '42501';
  END IF;

  IF owned_attempt.status <> 'in_progress'::public.attempt_status THEN
    RAISE EXCEPTION 'Practice attempt is not in progress'
      USING errcode = '23514';
  END IF;

  -- Bulk upsert answers (flags + any unsaved selections)
  IF jsonb_array_length(answers_to_save) > 0 THEN
    INSERT INTO public.attempt_answers (attempt_question_id, selected_option_id, is_flagged)
    SELECT
      (item->>'attemptQuestionId')::uuid,
      NULLIF(item->>'optionId', '')::uuid,
      COALESCE((item->>'flagged')::boolean, false)
    FROM jsonb_array_elements(answers_to_save) AS item
    WHERE (item->>'attemptQuestionId')::uuid IN (
      SELECT aq.id
      FROM public.attempt_questions aq
      WHERE aq.attempt_id = target_attempt_id
    )
    ON CONFLICT (attempt_question_id)
    DO UPDATE SET
      is_flagged = EXCLUDED.is_flagged;
  END IF;

  -- Mark attempt as submitted.
  -- The protect_attempt_submission trigger will calculate the real score
  -- from attempt_answers.is_correct values.
  UPDATE public.attempts
  SET status = 'submitted', score = 0
  WHERE id = target_attempt_id
    AND user_id = requester_id
    AND kind = 'practice'
  RETURNING status, score
  INTO result_status, result_score;

  IF result_status IS NULL THEN
    RAISE EXCEPTION 'Failed to submit practice attempt'
      USING errcode = '23514';
  END IF;

  RETURN jsonb_build_object(
    'status', result_status::text,
    'score', COALESCE(result_score, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finish_practice_attempt(uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.finish_practice_attempt(uuid, jsonb) TO authenticated;


-- ==========================================================================
-- Also fix start_attempt to accept target_chapter_id (uuid) instead of
-- target_chapter_slug (text), matching the TypeScript generated types
-- and the way start_or_resume_practice calls it.
-- ==========================================================================

DROP FUNCTION IF EXISTS public.start_attempt(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.start_attempt(
  target_course_id uuid,
  target_exam_config_id uuid DEFAULT NULL,
  target_chapter_id uuid DEFAULT NULL
)
RETURNS public.attempts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
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
BEGIN
  IF target_exam_config_id IS NOT NULL THEN
    selected_kind := 'mock_exam';
    SELECT
      question_count,
      duration_seconds
    INTO
      selected_question_count,
      selected_duration_seconds
    FROM public.exam_configs
    WHERE id = target_exam_config_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Exam config not found'
        USING errcode = '23514';
    END IF;

    attempt_seed := attempt_id::text;

    SELECT array_agg(id)
    INTO selected_question_ids
    FROM (
      SELECT id
      FROM public.questions
      WHERE course_id = target_course_id
        AND status = 'published'
      ORDER BY md5(id::text || attempt_seed)
      LIMIT selected_question_count
    ) allocated;
  ELSE
    selected_kind := 'practice';
    selected_duration_seconds := 315360000; -- 10 years (effectively no limit)

    SELECT count(*)
    INTO selected_question_count
    FROM public.questions
    WHERE course_id = target_course_id
      AND status = 'published'
      AND (target_chapter_id IS NULL OR chapter_id = target_chapter_id);

    SELECT array_agg(id)
    INTO selected_question_ids
    FROM (
      SELECT q.id
      FROM public.questions q
      WHERE q.course_id = target_course_id
        AND q.status = 'published'
        AND (target_chapter_id IS NULL OR q.chapter_id = target_chapter_id)
      ORDER BY q.id
    ) allocated;
  END IF;

  IF array_length(selected_question_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No questions available'
      USING errcode = '23514';
  END IF;

  SELECT jsonb_agg(id)
  INTO question_order_snapshot
  FROM unnest(selected_question_ids) AS id;

  INSERT INTO public.attempts (
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
  VALUES (
    attempt_id,
    requester_id,
    target_course_id,
    target_exam_config_id,
    selected_kind,
    attempt_started_at,
    CASE
      WHEN selected_duration_seconds IS NULL THEN NULL
      ELSE attempt_started_at + make_interval(secs => selected_duration_seconds)
    END,
    question_order_snapshot,
    option_order_snapshot
  )
  RETURNING * INTO created_attempt;

  FOR question_position IN 1..array_length(selected_question_ids, 1) LOOP
    SELECT
      jsonb_build_object(
        'content', q.content,
        'chapter_id', q.chapter_id,
        'options', (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', o.id,
              'content', o.content,
              'label', o.label
            )
            ORDER BY o.label
          )
          FROM public.question_options o
          WHERE o.question_id = q.id
        )
      ),
      (
        SELECT jsonb_agg(o.id ORDER BY o.label)
        FROM public.question_options o
        WHERE o.question_id = q.id
      )
    INTO current_question_snapshot, current_option_order
    FROM public.questions q
    WHERE q.id = selected_question_ids[question_position];

    INSERT INTO public.attempt_questions (
      attempt_id,
      question_id,
      position,
      question_snapshot,
      option_order
    )
    VALUES (
      created_attempt.id,
      selected_question_ids[question_position],
      question_position,
      current_question_snapshot,
      current_option_order
    );
  END LOOP;

  RETURN created_attempt;
END;
$$;

REVOKE ALL ON FUNCTION public.start_attempt(uuid, uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.start_attempt(uuid, uuid, uuid) TO authenticated;
