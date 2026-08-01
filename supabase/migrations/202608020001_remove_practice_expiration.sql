-- ==========================================================================
-- Migration: Remove expiration logic from practice sessions
--
-- Practice sessions should not expire. This updates start_attempt to set
-- expires_at to NULL for practice, updates start_or_resume_practice to
-- handle NULL expires_at, and removes expiration logic from sync_practice_attempt.
-- ==========================================================================

-- 1. Update start_attempt to set selected_duration_seconds to NULL for practice
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
    selected_duration_seconds := NULL; -- No time limit for practice

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
    option_order,
    chapter_id
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
    option_order_snapshot,
    target_chapter_id
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


-- 2. Update start_or_resume_practice to allow NULL expires_at
CREATE OR REPLACE FUNCTION public.start_or_resume_practice(
  target_course_id uuid,
  target_chapter_id uuid
)
RETURNS public.attempts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requester_id uuid := auth.uid();
  resumed_attempt public.attempts%rowtype;
BEGIN
  IF requester_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING errcode = '28000';
  END IF;

  IF target_chapter_id IS NULL THEN
    RAISE EXCEPTION 'Chapter is required'
      USING errcode = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      requester_id::text || ':' || target_chapter_id::text,
      0
    )
  );

  -- Try to resume using the indexed chapter_id column
  SELECT attempt.*
  INTO resumed_attempt
  FROM public.attempts attempt
  WHERE attempt.user_id = requester_id
    AND attempt.course_id = target_course_id
    AND attempt.kind = 'practice'::public.attempt_kind
    AND attempt.status = 'in_progress'::public.attempt_status
    AND (attempt.expires_at IS NULL OR attempt.expires_at > clock_timestamp())
    AND attempt.chapter_id = target_chapter_id
  ORDER BY attempt.started_at DESC, attempt.id DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN resumed_attempt;
  END IF;

  SELECT *
  INTO resumed_attempt
  FROM public.start_attempt(
    target_course_id,
    NULL,
    target_chapter_id
  );

  RETURN resumed_attempt;
END;
$$;


-- 3. Update sync_practice_attempt to not expire practice sessions automatically
CREATE OR REPLACE FUNCTION public.sync_practice_attempt(
  target_attempt_id uuid
)
RETURNS public.attempts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requester_id uuid := auth.uid();
  synced_attempt public.attempts%rowtype;
BEGIN
  SELECT *
  INTO synced_attempt
  FROM public.attempts
  WHERE id = target_attempt_id
    AND user_id = requester_id
    AND kind = 'practice'::public.attempt_kind
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Practice attempt not found'
      USING errcode = '42501';
  END IF;

  -- Practice sessions no longer expire automatically.
  -- We just return the latest state.
  RETURN synced_attempt;
END;
$$;


-- 4. Update the dashboard summaries RPC so it doesn't filter out NULL expires_at
CREATE OR REPLACE FUNCTION public.get_dashboard_chapter_summaries(target_course_id uuid)
 RETURNS TABLE(chapter_id uuid, active_attempt_id uuid, attempt_id uuid, attempt_score numeric, attempt_status attempt_status, attempt_submitted_at timestamp with time zone, attempt_started_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT
    a.chapter_id,
    CASE
      WHEN a.status = 'in_progress' AND (a.expires_at IS NULL OR a.expires_at > clock_timestamp())
      THEN a.id
      ELSE NULL
    END AS active_attempt_id,
    a.id AS attempt_id,
    a.score AS attempt_score,
    a.status AS attempt_status,
    a.submitted_at AS attempt_submitted_at,
    a.started_at AS attempt_started_at
  FROM public.attempts a
  WHERE a.user_id = auth.uid()
    AND a.course_id = target_course_id
    AND a.kind = 'practice'
    AND a.chapter_id IS NOT NULL
  ORDER BY a.started_at DESC;
$function$;
