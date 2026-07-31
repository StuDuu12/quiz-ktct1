-- 202607300006_mock_exam_difficulty_distribution_and_question_delete.sql
-- Enforces mock exam distribution: 8 level 1, 16 level 2, 8 level 3, 8 level 4 across 6 chapters.
-- Adds admin_delete_question function for question management.

create or replace function public.allocate_mock_exam_questions(
  target_course_id uuid,
  allocation_seed text
)
returns table (
  question_position integer,
  question_id uuid,
  chapter_id uuid,
  option_order jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with difficulty_targets (difficulty, target_count) as (
    values
      (1::smallint, 8),
      (2::smallint, 16),
      (3::smallint, 8),
      (4::smallint, 8)
  ),
  chapter_count as (
    select count(*)::integer as value
    from public.chapters ch
    where ch.course_id = target_course_id
  ),
  chapter_allocations as (
    select
      ch.id as chapter_id,
      row_number() over (
        order by
          public.seeded_hash32(
            allocation_seed || ':chapters:' || ch.id::text
          ),
          ch.id
      ) as allocation_rank
    from public.chapters ch
    where ch.course_id = target_course_id
  ),
  difficulty_chapter_quotas as (
    select
      dt.difficulty,
      ca.chapter_id,
      (dt.target_count / cc.value)
        + case
            when ca.allocation_rank <= (dt.target_count % cc.value) then 1
            else 0
          end as quota
    from difficulty_targets dt
    cross join chapter_allocations ca
    cross join chapter_count cc
    where cc.value > 0
  ),
  ranked_questions as (
    select
      q.id as question_id,
      q.chapter_id,
      q.difficulty,
      dcq.quota,
      row_number() over (
        partition by q.difficulty, q.chapter_id
        order by
          public.seeded_hash32(
            allocation_seed || ':diff:' || q.difficulty::text
            || ':chap:' || q.chapter_id::text
            || ':' || q.id::text
          ),
          q.id
      ) as chapter_rank
    from public.questions q
    join difficulty_chapter_quotas dcq
      on dcq.difficulty = q.difficulty
     and dcq.chapter_id = q.chapter_id
    where q.status = 'published'
  ),
  primary_selection as (
    select question_id, chapter_id, difficulty
    from ranked_questions
    where chapter_rank <= quota
  ),
  difficulty_backfill_candidates as (
    select
      rq.question_id,
      rq.chapter_id,
      rq.difficulty,
      row_number() over (
        partition by rq.difficulty
        order by
          public.seeded_hash32(
            allocation_seed || ':diff_backfill:' || rq.difficulty::text
            || ':' || rq.question_id::text
          ),
          rq.question_id
      ) as diff_rank
    from ranked_questions rq
    where rq.question_id not in (select question_id from primary_selection)
  ),
  difficulty_shortfalls as (
    select
      dt.difficulty,
      dt.target_count - coalesce(count(ps.question_id), 0) as shortfall
    from difficulty_targets dt
    left join primary_selection ps on ps.difficulty = dt.difficulty
    group by dt.difficulty, dt.target_count
  ),
  difficulty_backfill_selection as (
    select dbc.question_id, dbc.chapter_id, dbc.difficulty
    from difficulty_backfill_candidates dbc
    join difficulty_shortfalls ds on ds.difficulty = dbc.difficulty
    where ds.shortfall > 0 and dbc.diff_rank <= ds.shortfall
  ),
  combined_difficulty_selection as (
    select question_id, chapter_id, difficulty from primary_selection
    union all
    select question_id, chapter_id, difficulty from difficulty_backfill_selection
  ),
  overall_backfill_candidates as (
    select
      q.id as question_id,
      q.chapter_id,
      q.difficulty,
      row_number() over (
        order by
          public.seeded_hash32(
            allocation_seed || ':overall_backfill:' || q.id::text
          ),
          q.id
      ) as overall_rank
    from public.questions q
    join public.chapters ch on ch.id = q.chapter_id
    where ch.course_id = target_course_id
      and q.status = 'published'
      and q.id not in (select question_id from combined_difficulty_selection)
  ),
  selected as (
    select question_id, chapter_id, difficulty from combined_difficulty_selection
    union all
    select obc.question_id, obc.chapter_id, obc.difficulty
    from overall_backfill_candidates obc
    where obc.overall_rank <= 40 - (select count(*) from combined_difficulty_selection)
  ),
  ordered_selection as (
    select
      row_number() over (
        order by
          public.seeded_hash32(
            allocation_seed || ':questions:' || selected.question_id::text
          ),
          selected.question_id
      )::integer as position,
      selected.question_id,
      selected.chapter_id
    from selected
  )
  select
    os.position as question_position,
    os.question_id,
    os.chapter_id,
    (
      select coalesce(
        jsonb_agg(
          to_jsonb(qo.id)
          order by
            public.seeded_hash32(
              allocation_seed || ':option:' || os.question_id::text
              || ':' || qo.id::text
            ),
            qo.id
        ),
        '[]'::jsonb
      )
      from public.question_options qo
      where qo.question_id = os.question_id
    ) as option_order
  from ordered_selection os
  order by os.position
$$;

revoke all on function public.allocate_mock_exam_questions(uuid, text)
from public, anon, authenticated;


create or replace function public.admin_delete_question(
  target_question_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_course_id uuid;
begin
  select ch.course_id into target_course_id
  from public.questions q
  join public.chapters ch on ch.id = q.chapter_id
  where q.id = target_question_id;

  if target_course_id is null then
    raise exception 'Question not found'
      using errcode = 'P0002';
  end if;

  perform public.assert_course_manager(target_course_id);

  delete from public.questions
  where id = target_question_id;

  return true;
end;
$$;

revoke all on function public.admin_delete_question(uuid) from public, anon;
grant execute on function public.admin_delete_question(uuid) to authenticated;
