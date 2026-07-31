-- ===========================================================================
-- Migration: Optimize dashboard & history performance
-- ===========================================================================

-- 1) Add a denormalized chapter_id column to attempts for practice attempts.
ALTER TABLE public.attempts ADD COLUMN IF NOT EXISTS chapter_id uuid REFERENCES public.chapters(id);

-- 2) Backfill chapter_id from existing attempt_questions (disable trigger temporarily)
DO $$
BEGIN
  ALTER TABLE public.attempts DISABLE TRIGGER protect_attempt_submission;
  
  UPDATE public.attempts a
  SET chapter_id = sub.chapter_id
  FROM (
    SELECT DISTINCT ON (aq.attempt_id)
      aq.attempt_id,
      (aq.question_snapshot ->> 'chapter_id')::uuid AS chapter_id
    FROM public.attempt_questions aq
    ORDER BY aq.attempt_id, aq.position
  ) sub
  WHERE a.id = sub.attempt_id
    AND a.kind = 'practice'
    AND a.chapter_id IS NULL;

  ALTER TABLE public.attempts ENABLE TRIGGER protect_attempt_submission;
END $$;

-- 3) Create index on (user_id, kind, status, chapter_id) for fast dashboard lookups
CREATE INDEX IF NOT EXISTS attempts_user_kind_status_chapter_idx
ON public.attempts USING btree (user_id, kind, status, chapter_id);

-- 4) Create index on (user_id, course_id, kind, status) for dashboard attempts query
CREATE INDEX IF NOT EXISTS attempts_user_course_kind_idx
ON public.attempts USING btree (user_id, course_id, kind, status);

-- 5) Create a fast RPC to get dashboard chapter summaries in a single query
CREATE OR REPLACE FUNCTION public.get_dashboard_chapter_summaries(
  target_course_id uuid
)
RETURNS TABLE (
  chapter_id uuid,
  active_attempt_id uuid,
  attempt_id uuid,
  attempt_score numeric,
  attempt_status public.attempt_status,
  attempt_submitted_at timestamptz,
  attempt_started_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    a.chapter_id,
    CASE
      WHEN a.status = 'in_progress' AND a.expires_at > clock_timestamp()
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
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_chapter_summaries(uuid) TO authenticated;

-- 6) Replace get_submitted_practice_progress with a faster version using chapter_id
CREATE OR REPLACE FUNCTION public.get_submitted_practice_progress(
  target_course_id uuid
)
RETURNS TABLE (
  attempt_id uuid,
  chapter_id uuid,
  correct_count integer,
  total_count integer,
  submitted_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    a.id AS attempt_id,
    a.chapter_id,
    (
      SELECT count(*) FILTER (WHERE aa.is_correct)::integer
      FROM public.attempt_questions aq
      LEFT JOIN public.attempt_answers aa ON aa.attempt_question_id = aq.id
      WHERE aq.attempt_id = a.id
    ) AS correct_count,
    (
      SELECT count(*)::integer
      FROM public.attempt_questions aq
      WHERE aq.attempt_id = a.id
    ) AS total_count,
    a.submitted_at
  FROM public.attempts a
  WHERE a.user_id = auth.uid()
    AND a.course_id = target_course_id
    AND a.kind = 'practice'
    AND a.status = 'submitted'
    AND a.chapter_id IS NOT NULL;
$$;

-- 7) Optimize get_attempt_history to use chapter_id instead of JSON extraction
DROP FUNCTION IF EXISTS public.get_attempt_history(uuid,public.attempt_kind,uuid,timestamptz,timestamptz,numeric,numeric,integer,integer);
CREATE OR REPLACE FUNCTION public.get_attempt_history(
  target_user_id uuid,
  filter_kind public.attempt_kind,
  filter_chapter_id uuid,
  filter_started_from timestamptz,
  filter_started_to timestamptz,
  filter_score_min numeric,
  filter_score_max numeric,
  page_number integer,
  page_size integer
)
RETURNS TABLE (
  attempt_id uuid,
  user_id uuid,
  course_id uuid,
  course_title text,
  kind public.attempt_kind,
  status public.attempt_status,
  started_at timestamptz,
  submitted_at timestamptz,
  score numeric,
  duration_seconds integer,
  chapter_id uuid,
  chapter_title text,
  question_count integer,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
declare
  requester_id uuid := auth.uid();
  requester_role public.app_role;
  scoped_user_id uuid;
  safe_page integer := greatest(coalesce(page_number, 1), 1);
  safe_page_size integer := least(greatest(coalesce(page_size, 20), 1), 100);
begin
  if requester_id is null then
    raise exception 'Authentication required'
      using errcode = '28000';
  end if;

  requester_role := public.current_role();
  scoped_user_id := case
    when requester_role = 'student'::public.app_role then requester_id
    else target_user_id
  end;

  return query
  with filtered as (
    select a.*
    from public.attempts a
    where (
        a.user_id = requester_id
        or requester_role = 'admin'::public.app_role
        or public.can_manage_course(a.course_id)
      )
      and (scoped_user_id is null or a.user_id = scoped_user_id)
      and (filter_kind is null or a.kind = filter_kind)
      and (filter_chapter_id is null or a.chapter_id = filter_chapter_id)
      and (filter_started_from is null or a.started_at >= filter_started_from)
      and (filter_started_to is null or a.started_at <= filter_started_to)
      and (filter_score_min is null or a.score >= filter_score_min)
      and (filter_score_max is null or a.score <= filter_score_max)
  ),
  counted as (
    select f.*, count(*) over () as matching_count
    from filtered f
  )
  select
    c.id,
    c.user_id,
    c.course_id,
    course.title,
    c.kind,
    c.status,
    c.started_at,
    c.submitted_at,
    c.score,
    c.duration_seconds,
    ch.id,
    ch.title,
    (
      select count(*)::integer
      from public.attempt_questions count_aq
      where count_aq.attempt_id = c.id
    ),
    c.matching_count
  from counted c
  join public.courses course on course.id = c.course_id
  left join public.chapters ch on ch.id = c.chapter_id
  order by c.started_at desc, c.id desc
  offset (safe_page - 1) * safe_page_size
  limit safe_page_size;
end;
$$;

-- 8) Update start_or_resume_practice to set chapter_id on the attempt
CREATE OR REPLACE FUNCTION public.start_or_resume_practice(
  target_course_id uuid,
  target_chapter_id uuid
)
RETURNS public.attempts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
declare
  requester_id uuid := auth.uid();
  resumed_attempt public.attempts%rowtype;
begin
  if requester_id is null then
    raise exception 'Authentication required'
      using errcode = '28000';
  end if;

  if target_chapter_id is null then
    raise exception 'Chapter is required'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      requester_id::text || ':' || target_chapter_id::text,
      0
    )
  );

  -- Try to resume using the indexed chapter_id column
  select attempt.*
  into resumed_attempt
  from public.attempts attempt
  where attempt.user_id = requester_id
    and attempt.course_id = target_course_id
    and attempt.kind = 'practice'::public.attempt_kind
    and attempt.status = 'in_progress'::public.attempt_status
    and attempt.expires_at > clock_timestamp()
    and attempt.chapter_id = target_chapter_id
  order by attempt.started_at desc, attempt.id desc
  limit 1;

  if found then
    return resumed_attempt;
  end if;

  select *
  into resumed_attempt
  from public.start_attempt(
    target_course_id,
    null,
    target_chapter_id
  );

  -- Set the chapter_id on the newly created attempt
  -- The attempt is still in_progress so protect_attempt_submission allows this
  update public.attempts
  set chapter_id = target_chapter_id
  where id = resumed_attempt.id;

  resumed_attempt.chapter_id := target_chapter_id;
  return resumed_attempt;
end;
$$;
