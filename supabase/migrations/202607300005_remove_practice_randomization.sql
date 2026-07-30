create or replace function public.start_attempt(
    target_course_id uuid,
    target_exam_config_id uuid default null,
    target_chapter_id uuid default null
  )
  returns public.attempts
  language plpgsql
  security definer
  set search_path = ''
  as $$
  declare
    requester_id uuid := auth.uid();
    selected_kind public.attempt_kind;
    selected_question_count integer;
    selected_duration_seconds integer;
    selected_question_ids uuid[];
    question_order_snapshot jsonb;
    option_order_snapshot jsonb := '{}'::jsonb;
    current_option_order jsonb;
    current_question_snapshot jsonb;
    created_attempt public.attempts%rowtype;
    question_position integer;
    attempt_id uuid := gen_random_uuid();
    attempt_seed text;
    attempt_started_at timestamptz := clock_timestamp();
    course_chapter_count integer;
  begin
    if requester_id is null then
      raise exception 'Authentication required'
        using errcode = '28000';
    end if;
  
    if not exists (
      select 1
      from public.profiles
      where id = requester_id
        and is_active
    ) then
      raise exception 'Active profile required'
        using errcode = '42501';
    end if;
  
    if not exists (
      select 1
      from public.courses
      where id = target_course_id
        and status = 'published'
    ) then
      raise exception 'Published course not found'
        using errcode = '22023';
    end if;
  
    if target_exam_config_id is not null and target_chapter_id is not null then
      raise exception 'Mock exams cannot be scoped to a chapter'
        using errcode = '22023';
    end if;
  
    if target_chapter_id is not null and not exists (
      select 1
      from public.chapters
      where id = target_chapter_id
        and course_id = target_course_id
    ) then
      raise exception 'Chapter does not belong to course'
        using errcode = '22023';
    end if;
  
    if target_exam_config_id is not null then
      select ec.kind
      into selected_kind
      from public.exam_configs ec
      where ec.id = target_exam_config_id
        and ec.course_id = target_course_id
        and ec.kind = 'mock_exam'::public.attempt_kind
        and ec.is_active;
  
      if not found then
        raise exception
          'Active mock-exam configuration does not belong to published course'
          using errcode = '22023';
      end if;
  
      selected_question_count := 40;
      selected_duration_seconds := 60 * 60;
      attempt_seed := attempt_id::text;
  
      select count(*)
      into course_chapter_count
      from public.chapters
      where course_id = target_course_id;
  
      if course_chapter_count <> 6 then
        raise exception 'Mock exam course must contain exactly six chapters'
          using errcode = '22023';
      end if;
  
      select
        array_agg(
          allocated.question_id order by allocated.question_position
        ),
        coalesce(
          jsonb_object_agg(
            allocated.question_id::text,
            allocated.option_order
            order by allocated.question_position
          ),
          '{}'::jsonb
        )
      into selected_question_ids, option_order_snapshot
      from public.allocate_mock_exam_questions(
        target_course_id,
        attempt_seed
      ) allocated;
    else
      selected_kind := 'practice';
      selected_duration_seconds := 60 * 60;
  
      select count(*)
      into selected_question_count
      from public.questions q
      join public.chapters ch on ch.id = q.chapter_id
      where ch.course_id = target_course_id
        and q.status = 'published'
        and (target_chapter_id is null or q.chapter_id = target_chapter_id);
  
      select array_agg(ranked.id order by ranked.sort_key, ranked.id)
      into selected_question_ids
      from (
        select q.id, coalesce(q.source_number, 2147483647)::double precision as sort_key
        from public.questions q
        join public.chapters ch on ch.id = q.chapter_id
        where ch.course_id = target_course_id
          and q.status = 'published'
          and (target_chapter_id is null or q.chapter_id = target_chapter_id)
        order by sort_key, q.id
        limit selected_question_count
      ) ranked;
    end if;
  
    if coalesce(array_length(selected_question_ids, 1), 0)
      <> selected_question_count then
      raise exception 'Course does not contain enough published questions'
        using errcode = '22023';
    end if;
  
    if selected_question_count = 0 then
      raise exception 'Chapter has no published questions'
        using errcode = '22023';
    end if;
  
    question_order_snapshot := to_jsonb(selected_question_ids);
  
    if selected_kind = 'practice'::public.attempt_kind then
      for question_position in 1..array_length(selected_question_ids, 1) loop
        select coalesce(
          jsonb_agg(to_jsonb(ordered.id) order by ordered.sort_key, ordered.id),
          '[]'::jsonb
        )
        into current_option_order
        from (
          select qo.id, qo.label as sort_key
          from public.question_options qo
          where qo.question_id = selected_question_ids[question_position]
        ) ordered;
  
        option_order_snapshot := option_order_snapshot || jsonb_build_object(
          selected_question_ids[question_position]::text,
          current_option_order
        );
      end loop;
    end if;
  
    insert into public.attempts (
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
    values (
      attempt_id,
      requester_id,
      target_course_id,
      target_exam_config_id,
      selected_kind,
      attempt_started_at,
      attempt_started_at + make_interval(secs => selected_duration_seconds),
      question_order_snapshot,
      option_order_snapshot
    )
    returning * into created_attempt;
  
    for question_position in 1..array_length(selected_question_ids, 1) loop
      current_option_order := option_order_snapshot
        -> selected_question_ids[question_position]::text;
  
      select
        jsonb_build_object(
          'id', q.id,
          'chapter_id', q.chapter_id,
          'content', q.content,
          'difficulty', q.difficulty,
          'options', (
            select jsonb_agg(
              jsonb_build_object(
                'id', qo.id,
                'label', qo.label,
                'content', qo.content
              )
              order by ordered.position
            )
            from jsonb_array_elements_text(current_option_order)
              with ordinality as ordered(option_id, position)
            join public.question_options qo
              on qo.id = ordered.option_id::uuid
          )
        )
        || case
            when selected_kind = 'practice'::public.attempt_kind
            then jsonb_build_object('explanation', q.explanation)
            else '{}'::jsonb
          end
      into current_question_snapshot
      from public.questions q
      where q.id = selected_question_ids[question_position];
  
      insert into public.attempt_questions (
        attempt_id,
        question_id,
        position,
        question_snapshot,
        option_order
      )
      values (
        created_attempt.id,
        selected_question_ids[question_position],
        question_position,
        current_question_snapshot,
        current_option_order
      );
    end loop;
  
    return created_attempt;
  end;
  $$;
  
  revoke all on function public.start_attempt(uuid, uuid, uuid)
  from public, anon;
  grant execute on function public.start_attempt(uuid, uuid, uuid)
  to authenticated;




