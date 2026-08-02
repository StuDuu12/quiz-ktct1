CREATE OR REPLACE FUNCTION public.start_attempt(target_course_id uuid, target_exam_config_id uuid DEFAULT NULL::uuid, target_chapter_id uuid DEFAULT NULL::uuid)
 RETURNS attempts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      ORDER BY q.created_at ASC, q.id ASC
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
$function$;
