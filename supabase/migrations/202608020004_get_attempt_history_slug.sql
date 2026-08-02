-- ==========================================================================
-- Migration: Add slug and position to history
-- ==========================================================================

drop function if exists public.get_attempt_history(
  uuid, public.attempt_kind, uuid, timestamptz, timestamptz, numeric, numeric, integer, integer
);

create function public.get_attempt_history(
  target_user_id uuid default null,
  filter_kind public.attempt_kind default null,
  filter_chapter_id uuid default null,
  filter_started_from timestamptz default null,
  filter_started_to timestamptz default null,
  filter_score_min numeric default null,
  filter_score_max numeric default null,
  page_number integer default 1,
  page_size integer default 20
)
returns table (
  attempt_id uuid,
  user_id uuid,
  course_id uuid,
  course_title text,
  course_slug text,
  kind public.attempt_kind,
  status public.attempt_status,
  started_at timestamptz,
  submitted_at timestamptz,
  score numeric,
  duration_seconds integer,
  chapter_id uuid,
  chapter_title text,
  chapter_position integer,
  question_count integer,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
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
      and (
        filter_chapter_id is null
        or exists (
          select 1
          from public.attempt_questions faq
          where faq.attempt_id = a.id
            and (faq.question_snapshot ->> 'chapter_id')::uuid
              = filter_chapter_id
        )
      )
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
    course.slug,
    c.kind,
    c.status,
    c.started_at,
    c.submitted_at,
    c.score,
    c.duration_seconds,
    chapter.id,
    chapter.title,
    chapter.position,
    (
      select count(*)::integer
      from public.attempt_questions count_aq
      where count_aq.attempt_id = c.id
    ),
    c.matching_count
  from counted c
  join public.courses course on course.id = c.course_id
  left join lateral (
    select ch.id, ch.title, ch.position
    from public.attempt_questions chapter_aq
    join public.chapters ch
      on ch.id = (chapter_aq.question_snapshot ->> 'chapter_id')::uuid
    where chapter_aq.attempt_id = c.id
    order by chapter_aq.position
    limit 1
  ) chapter on true
  order by c.started_at desc, c.id desc
  offset (safe_page - 1) * safe_page_size
  limit safe_page_size;
end;
$$;

revoke all on function public.get_attempt_history(
  uuid, public.attempt_kind, uuid, timestamptz, timestamptz, numeric, numeric, integer, integer
) from public, anon;
grant execute on function public.get_attempt_history(
  uuid, public.attempt_kind, uuid, timestamptz, timestamptz, numeric, numeric, integer, integer
) to authenticated;
