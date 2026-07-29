-- Advanced administration is RPC-only. Authenticated clients keep scoped
-- reads, while every administrative mutation is performed by one narrowly
-- scoped security-definer transaction with an audit entry.

alter table public.courses
add column cover_url text;

alter table public.chapters
add column status text not null default 'draft'
  check (status in ('draft', 'published', 'archived'));

alter table public.import_jobs
add column idempotency_key text;

create unique index import_jobs_uploader_idempotency_idx
on public.import_jobs (uploaded_by, idempotency_key)
where idempotency_key is not null;

create unique index questions_chapter_source_number_idx
on public.questions (chapter_id, source_number)
where source_number is not null;

create table public.question_versions (
  id bigint generated always as identity primary key,
  question_id uuid not null references public.questions(id),
  version_number integer not null check (version_number > 0),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  changed_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (question_id, version_number)
);

create table public.admin_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null check (length(btrim(email)) > 3),
  full_name text not null default '',
  course_ids uuid[] not null default '{}',
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed')),
  requested_by uuid not null references public.profiles(id),
  provider_user_id uuid,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.question_versions enable row level security;
alter table public.admin_invites enable row level security;

revoke all on public.question_versions, public.admin_invites
from public, anon, authenticated;

-- Existing broad table grants are intentionally removed. Server-side RPCs
-- below execute as the migration owner after authenticating and scoping the
-- caller. This also prevents an admin browser session from bypassing audit.
revoke insert, update, delete
on public.profiles, public.course_instructors, public.import_jobs,
  public.courses, public.chapters, public.questions,
  public.question_options, public.exam_configs
from authenticated;

-- Chapter status is part of the learner publication boundary. Managers retain
-- full scoped visibility while learners see only a fully published chain.
drop policy "public reads published chapters" on public.chapters;
create policy "public reads published chapters"
on public.chapters for select
using (
  (
    status = 'published'
    and exists (
      select 1
      from public.courses c
      where c.id = course_id
        and c.status = 'published'
    )
  )
  or public.can_manage_course(course_id)
);

drop policy "public reads published questions" on public.questions;
create policy "public reads published questions"
on public.questions for select
using (
  (
    status = 'published'
    and exists (
      select 1
      from public.chapters ch
      join public.courses c on c.id = ch.course_id
      where ch.id = chapter_id
        and ch.status = 'published'
        and c.status = 'published'
    )
  )
  or exists (
    select 1
    from public.chapters ch
    where ch.id = chapter_id
      and public.can_manage_course(ch.course_id)
  )
);

drop policy "public reads published question options"
on public.question_options;
create policy "public reads published question options"
on public.question_options for select
using (
  exists (
    select 1
    from public.questions q
    join public.chapters ch on ch.id = q.chapter_id
    join public.courses c on c.id = ch.course_id
    where q.id = question_id
      and q.status = 'published'
      and ch.status = 'published'
      and c.status = 'published'
  )
  or exists (
    select 1
    from public.questions q
    join public.chapters ch on ch.id = q.chapter_id
    where q.id = question_id
      and public.can_manage_course(ch.course_id)
  )
);

create function public.assert_authenticated_actor()
returns public.profiles
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required'
      using errcode = '28000';
  end if;

  select *
  into actor
  from public.profiles
  where id = auth.uid()
    and is_active;

  if not found then
    raise exception 'Active profile required'
      using errcode = '42501';
  end if;
  return actor;
end;
$$;

create function public.assert_admin_actor()
returns public.profiles
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
begin
  actor := public.assert_authenticated_actor();
  if actor.role <> 'admin'::public.app_role then
    raise exception 'Admin permission required'
      using errcode = '42501';
  end if;
  return actor;
end;
$$;

create function public.assert_course_manager(target_course_id uuid)
returns public.profiles
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
begin
  actor := public.assert_authenticated_actor();
  if actor.role = 'admin'::public.app_role then
    return actor;
  end if;
  if actor.role <> 'instructor'::public.app_role
    or not exists (
      select 1
      from public.course_instructors ci
      where ci.course_id = target_course_id
        and ci.instructor_id = actor.id
    ) then
    raise exception 'Course is outside the assigned scope'
      using errcode = '42501';
  end if;
  return actor;
end;
$$;

create function public.admin_upsert_course(
  target_course_id uuid,
  target_slug text,
  target_title text,
  target_description text,
  target_status text,
  target_cover_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  previous public.courses%rowtype;
  saved public.courses%rowtype;
begin
  if target_status not in ('draft', 'published', 'archived')
    or target_slug is null
    or target_slug <> lower(target_slug)
    or target_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    or length(btrim(coalesce(target_title, ''))) = 0 then
    raise exception 'Invalid course payload'
      using errcode = '23514';
  end if;

  if target_course_id is null then
    actor := public.assert_admin_actor();
    insert into public.courses (
      slug, title, description, status, cover_url, created_by
    )
    values (
      target_slug,
      btrim(target_title),
      coalesce(target_description, ''),
      target_status,
      nullif(btrim(coalesce(target_cover_url, '')), ''),
      actor.id
    )
    returning * into saved;
    perform public.write_audit_log(
      'course.created', 'course', saved.id, null, to_jsonb(saved),
      '{}'::jsonb
    );
    return saved.id;
  end if;

  actor := public.assert_course_manager(target_course_id);
  select * into previous
  from public.courses
  where id = target_course_id
  for update;
  if not found then
    raise exception 'Course not found'
      using errcode = 'P0002';
  end if;

  update public.courses
  set
    slug = target_slug,
    title = btrim(target_title),
    description = coalesce(target_description, ''),
    status = target_status,
    cover_url = nullif(btrim(coalesce(target_cover_url, '')), '')
  where id = target_course_id
  returning * into saved;

  perform public.write_audit_log(
    'course.updated', 'course', saved.id, to_jsonb(previous), to_jsonb(saved),
    '{}'::jsonb
  );
  return saved.id;
end;
$$;

create function public.admin_upsert_chapter(
  target_chapter_id uuid,
  target_course_id uuid,
  target_position integer,
  target_title text,
  target_status text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  previous public.chapters%rowtype;
  saved public.chapters%rowtype;
  previous_course_id uuid;
begin
  actor := public.assert_course_manager(target_course_id);
  if target_position is null
    or target_position < 1
    or length(btrim(coalesce(target_title, ''))) = 0
    or target_status not in ('draft', 'published', 'archived') then
    raise exception 'Invalid chapter payload'
      using errcode = '23514';
  end if;

  if target_chapter_id is null then
    insert into public.chapters (
      course_id, position, title, status
    )
    values (
      target_course_id, target_position, btrim(target_title), target_status
    )
    returning * into saved;
    perform public.write_audit_log(
      'chapter.created', 'chapter', saved.id, null, to_jsonb(saved),
      jsonb_build_object('course_id', target_course_id)
    );
    return saved.id;
  end if;

  select *
  into previous
  from public.chapters
  where id = target_chapter_id
  for update;
  if not found then
    raise exception 'Chapter not found'
      using errcode = 'P0002';
  end if;
  previous_course_id := previous.course_id;
  perform public.assert_course_manager(previous_course_id);

  update public.chapters
  set
    course_id = target_course_id,
    position = target_position,
    title = btrim(target_title),
    status = target_status
  where id = target_chapter_id
  returning * into saved;

  perform public.write_audit_log(
    'chapter.updated', 'chapter', saved.id, to_jsonb(previous), to_jsonb(saved),
    jsonb_build_object('course_id', target_course_id)
  );
  return saved.id;
end;
$$;

create function public.admin_upsert_question(
  target_question_id uuid,
  target_chapter_id uuid,
  target_content text,
  target_explanation text,
  target_difficulty integer,
  target_status text,
  target_source_number integer,
  target_options jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  target_course_id uuid;
  previous_course_id uuid;
  previous jsonb;
  saved public.questions%rowtype;
  option_payload jsonb;
  option_labels text[];
  option_count integer;
  correct_count integer;
  next_version integer;
begin
  select course_id into target_course_id
  from public.chapters
  where id = target_chapter_id;
  if target_course_id is null then
    raise exception 'Chapter not found'
      using errcode = 'P0002';
  end if;
  actor := public.assert_course_manager(target_course_id);

  if length(btrim(coalesce(target_content, ''))) = 0
    or target_difficulty not between 1 and 4
    or target_status not in ('draft', 'published', 'archived')
    or target_options is null
    or jsonb_typeof(target_options) <> 'array' then
    raise exception 'Invalid question payload'
      using errcode = '23514';
  end if;

  select
    count(*)::integer,
    count(*) filter (
      where coalesce((option_value ->> 'isCorrect')::boolean, false)
    )::integer,
    array_agg(option_value ->> 'label' order by option_value ->> 'label')
  into option_count, correct_count, option_labels
  from jsonb_array_elements(target_options) option_value;

  if target_status = 'published' and (
    option_count <> 4
    or option_labels is distinct from array['A', 'B', 'C', 'D']::text[]
    or correct_count <> 1
    or exists (
      select 1
      from jsonb_array_elements(target_options) option_value
      where length(btrim(coalesce(option_value ->> 'content', ''))) = 0
    )
  ) then
    raise exception 'Published question requires exactly four options and one correct answer'
      using errcode = '23514';
  end if;

  if option_count > 0 and (
    option_count <> (
      select count(distinct option_value ->> 'label')
      from jsonb_array_elements(target_options) option_value
    )
    or exists (
      select 1
      from jsonb_array_elements(target_options) option_value
      where option_value ->> 'label' not in ('A', 'B', 'C', 'D')
        or length(btrim(coalesce(option_value ->> 'content', ''))) = 0
    )
  ) then
    raise exception 'Question options are invalid'
      using errcode = '23514';
  end if;

  if target_question_id is null then
    insert into public.questions (
      chapter_id, content, explanation, difficulty, status,
      source_number, created_by
    )
    values (
      target_chapter_id, btrim(target_content),
      coalesce(target_explanation, ''), target_difficulty::smallint, 'draft',
      target_source_number, actor.id
    )
    returning * into saved;
  else
    select
      jsonb_build_object(
        'question', to_jsonb(q),
        'options', coalesce(
          (
            select jsonb_agg(to_jsonb(qo) order by qo.label)
            from public.question_options qo
            where qo.question_id = q.id
          ),
          '[]'::jsonb
        )
      ),
      ch.course_id
    into previous, previous_course_id
    from public.questions q
    join public.chapters ch on ch.id = q.chapter_id
    where q.id = target_question_id
    for update of q;
    if previous is null then
      raise exception 'Question not found'
        using errcode = 'P0002';
    end if;
    perform public.assert_course_manager(previous_course_id);

    update public.questions
    set
      chapter_id = target_chapter_id,
      content = btrim(target_content),
      explanation = coalesce(target_explanation, ''),
      difficulty = target_difficulty::smallint,
      status = 'draft',
      source_number = target_source_number
    where id = target_question_id
    returning * into saved;
  end if;

  for option_payload in
    select option_value
    from jsonb_array_elements(target_options) option_value
  loop
    insert into public.question_options (
      question_id, label, content, is_correct
    )
    values (
      saved.id,
      option_payload ->> 'label',
      btrim(option_payload ->> 'content'),
      coalesce((option_payload ->> 'isCorrect')::boolean, false)
    )
    on conflict (question_id, label) do update
    set
      content = excluded.content,
      is_correct = excluded.is_correct;
  end loop;

  delete from public.question_options qo
  where qo.question_id = saved.id
    and not exists (
      select 1
      from jsonb_array_elements(target_options) option_value
      where option_value ->> 'label' = qo.label
    );

  update public.questions
  set status = target_status
  where id = saved.id
  returning * into saved;

  select coalesce(max(version_number), 0) + 1
  into next_version
  from public.question_versions
  where question_id = saved.id;

  insert into public.question_versions (
    question_id, version_number, snapshot, changed_by
  )
  values (
    saved.id,
    next_version,
    jsonb_build_object(
      'question', to_jsonb(saved),
      'options', coalesce(
        (
          select jsonb_agg(to_jsonb(qo) order by qo.label)
          from public.question_options qo
          where qo.question_id = saved.id
        ),
        '[]'::jsonb
      )
    ),
    actor.id
  );

  perform public.write_audit_log(
    case when target_question_id is null
      then 'question.created'
      else 'question.updated'
    end,
    'question',
    saved.id,
    previous,
    (
      select snapshot
      from public.question_versions
      where question_id = saved.id
        and version_number = next_version
    ),
    jsonb_build_object('course_id', target_course_id)
  );
  return saved.id;
end;
$$;

create function public.admin_set_instructor(
  target_user_id uuid,
  target_course_ids uuid[],
  target_approved boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  previous public.profiles%rowtype;
  normalized_course_ids uuid[];
begin
  actor := public.assert_admin_actor();
  if target_user_id = actor.id then
    raise exception 'An admin cannot change their own role through instructor approval'
      using errcode = '23514';
  end if;

  select * into previous
  from public.profiles
  where id = target_user_id
  for update;
  if not found then
    raise exception 'User not found'
      using errcode = 'P0002';
  end if;

  select coalesce(array_agg(distinct course_id order by course_id), '{}')
  into normalized_course_ids
  from unnest(coalesce(target_course_ids, '{}')) course_id;

  if exists (
    select 1
    from unnest(normalized_course_ids) course_id
    where not exists (
      select 1 from public.courses c where c.id = course_id
    )
  ) then
    raise exception 'Assigned course does not exist'
      using errcode = '23503';
  end if;

  delete from public.course_instructors
  where instructor_id = target_user_id;

  if target_approved then
    update public.profiles
    set role = 'instructor'::public.app_role, is_active = true
    where id = target_user_id;

    insert into public.course_instructors (
      course_id, instructor_id, assigned_by
    )
    select course_id, target_user_id, actor.id
    from unnest(normalized_course_ids) course_id;
  else
    update public.profiles
    set role = 'student'::public.app_role
    where id = target_user_id;
  end if;

  perform public.write_audit_log(
    case when target_approved
      then 'instructor.approved'
      else 'instructor.revoked'
    end,
    'profile',
    target_user_id,
    to_jsonb(previous),
    (
      select to_jsonb(p)
      from public.profiles p
      where p.id = target_user_id
    ),
    jsonb_build_object('course_ids', to_jsonb(normalized_course_ids))
  );
end;
$$;

create function public.admin_set_user_active(
  target_user_id uuid,
  target_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  previous public.profiles%rowtype;
  saved public.profiles%rowtype;
begin
  actor := public.assert_admin_actor();
  if target_user_id = actor.id and not target_active then
    raise exception 'An admin cannot deactivate their own account'
      using errcode = '23514';
  end if;
  select * into previous
  from public.profiles
  where id = target_user_id
  for update;
  if not found then
    raise exception 'User not found'
      using errcode = 'P0002';
  end if;

  update public.profiles
  set is_active = target_active
  where id = target_user_id
  returning * into saved;

  if not target_active then
    delete from public.course_instructors
    where instructor_id = target_user_id;
  end if;

  perform public.write_audit_log(
    case when target_active then 'user.activated' else 'user.deactivated' end,
    'profile',
    target_user_id,
    to_jsonb(previous),
    to_jsonb(saved),
    '{}'::jsonb
  );
end;
$$;

create function public.admin_import_questions(
  target_course_id uuid,
  target_chapter_id uuid,
  target_file_name text,
  target_idempotency_key text,
  target_questions jsonb
)
returns table (
  job_id uuid,
  imported_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  existing_job public.import_jobs%rowtype;
  saved_job public.import_jobs%rowtype;
  question_payload jsonb;
  option_payload jsonb;
  saved_question_id uuid;
  row_count integer;
  inserted_count integer := 0;
  correct_count integer;
  option_count integer;
  labels text[];
begin
  actor := public.assert_course_manager(target_course_id);
  if not exists (
    select 1
    from public.chapters ch
    where ch.id = target_chapter_id
      and ch.course_id = target_course_id
  ) then
    raise exception 'Chapter is outside the target course'
      using errcode = '42501';
  end if;
  if length(btrim(coalesce(target_file_name, ''))) = 0
    or length(btrim(coalesce(target_idempotency_key, ''))) < 8
    or jsonb_typeof(target_questions) <> 'array'
    or jsonb_array_length(target_questions) = 0 then
    raise exception 'Invalid import payload'
      using errcode = '23514';
  end if;

  select * into existing_job
  from public.import_jobs
  where uploaded_by = actor.id
    and idempotency_key = target_idempotency_key;
  if found then
    if existing_job.status <> 'completed' then
      raise exception 'Import job is not complete'
        using errcode = '40001';
    end if;
    return query
    select existing_job.id, existing_job.processed_rows;
    return;
  end if;

  -- Validate the entire batch before creating any durable row. An exception
  -- also rolls back the containing RPC statement, preserving atomicity.
  for question_payload in
    select question_value
    from jsonb_array_elements(target_questions) question_value
  loop
    select
      count(*)::integer,
      count(*) filter (
        where coalesce((option_value ->> 'isCorrect')::boolean, false)
      )::integer,
      array_agg(option_value ->> 'label' order by option_value ->> 'label')
    into option_count, correct_count, labels
    from jsonb_array_elements(
      coalesce(question_payload -> 'options', '[]'::jsonb)
    ) option_value;

    if length(btrim(coalesce(question_payload ->> 'content', ''))) = 0
      or length(btrim(coalesce(question_payload ->> 'explanation', ''))) = 0
      or coalesce((question_payload ->> 'sourceNumber')::integer, 0) < 1
      or coalesce((question_payload ->> 'difficulty')::integer, 0)
        not between 1 and 4
      or coalesce(question_payload ->> 'status', 'draft')
        not in ('draft', 'published', 'archived')
      or option_count <> 4
      or labels is distinct from array['A', 'B', 'C', 'D']::text[]
      or correct_count <> 1
      or exists (
        select 1
        from jsonb_array_elements(
          coalesce(question_payload -> 'options', '[]'::jsonb)
        ) option_value
        where length(btrim(coalesce(option_value ->> 'content', ''))) = 0
      ) then
      raise exception 'Imported question requires four valid options and one correct answer'
        using errcode = '23514';
    end if;
  end loop;

  if exists (
    select 1
    from jsonb_array_elements(target_questions) question_value
    group by (question_value ->> 'sourceNumber')::integer
    having count(*) > 1
  ) then
    raise exception 'Import batch contains duplicate source numbers'
      using errcode = '23505';
  end if;

  row_count := jsonb_array_length(target_questions);
  insert into public.import_jobs (
    course_id, uploaded_by, file_name, status, total_rows,
    processed_rows, failed_rows, errors, started_at, idempotency_key
  )
  values (
    target_course_id, actor.id, btrim(target_file_name), 'processing',
    row_count, 0, 0, '[]'::jsonb, clock_timestamp(),
    target_idempotency_key
  )
  returning * into saved_job;

  for question_payload in
    select question_value
    from jsonb_array_elements(target_questions) question_value
    order by (question_value ->> 'sourceNumber')::integer
  loop
    select id into saved_question_id
    from public.questions
    where chapter_id = target_chapter_id
      and source_number = (question_payload ->> 'sourceNumber')::integer;

    if saved_question_id is not null then
      continue;
    end if;

    insert into public.questions (
      chapter_id, content, explanation, difficulty, status,
      source_number, created_by
    )
    values (
      target_chapter_id,
      btrim(question_payload ->> 'content'),
      btrim(question_payload ->> 'explanation'),
      (question_payload ->> 'difficulty')::smallint,
      'draft',
      (question_payload ->> 'sourceNumber')::integer,
      actor.id
    )
    returning id into saved_question_id;

    for option_payload in
      select option_value
      from jsonb_array_elements(question_payload -> 'options') option_value
    loop
      insert into public.question_options (
        question_id, label, content, is_correct
      )
      values (
        saved_question_id,
        option_payload ->> 'label',
        btrim(option_payload ->> 'content'),
        (option_payload ->> 'isCorrect')::boolean
      );
    end loop;

    update public.questions
    set status = coalesce(question_payload ->> 'status', 'draft')
    where id = saved_question_id;

    insert into public.question_versions (
      question_id, version_number, snapshot, changed_by
    )
    values (
      saved_question_id,
      1,
      jsonb_build_object(
        'question',
        (
          select to_jsonb(q)
          from public.questions q
          where q.id = saved_question_id
        ),
        'options',
        (
          select jsonb_agg(to_jsonb(qo) order by qo.label)
          from public.question_options qo
          where qo.question_id = saved_question_id
        )
      ),
      actor.id
    );
    inserted_count := inserted_count + 1;
    saved_question_id := null;
  end loop;

  update public.import_jobs
  set
    status = 'completed',
    processed_rows = inserted_count,
    errors = case
      when inserted_count < row_count
      then jsonb_build_array(
        jsonb_build_object(
          'code', 'duplicates-skipped',
          'count', row_count - inserted_count
        )
      )
      else '[]'::jsonb
    end,
    completed_at = clock_timestamp()
  where id = saved_job.id
  returning * into saved_job;

  perform public.write_audit_log(
    'questions.imported',
    'import_job',
    saved_job.id,
    null,
    to_jsonb(saved_job),
    jsonb_build_object(
      'course_id', target_course_id,
      'chapter_id', target_chapter_id,
      'idempotency_key', target_idempotency_key,
      'imported_count', inserted_count
    )
  );

  return query select saved_job.id, inserted_count;
end;
$$;

create function public.admin_request_invite(
  target_email text,
  target_full_name text,
  target_course_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  saved public.admin_invites%rowtype;
  normalized_course_ids uuid[];
begin
  actor := public.assert_admin_actor();
  if btrim(coalesce(target_email, '')) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Valid invite email required'
      using errcode = '23514';
  end if;
  select coalesce(array_agg(distinct course_id order by course_id), '{}')
  into normalized_course_ids
  from unnest(coalesce(target_course_ids, '{}')) course_id;
  if exists (
    select 1
    from unnest(normalized_course_ids) course_id
    where not exists (select 1 from public.courses c where c.id = course_id)
  ) then
    raise exception 'Invite course does not exist'
      using errcode = '23503';
  end if;

  insert into public.admin_invites (
    email, full_name, course_ids, requested_by
  )
  values (
    lower(btrim(target_email)),
    btrim(coalesce(target_full_name, '')),
    normalized_course_ids,
    actor.id
  )
  returning * into saved;

  perform public.write_audit_log(
    'invite.requested', 'admin_invite', saved.id, null, to_jsonb(saved),
    '{}'::jsonb
  );
  return saved.id;
end;
$$;

create function public.admin_finalize_invite(
  target_invite_id uuid,
  target_status text,
  target_provider_user_id uuid default null,
  target_error_message text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  previous public.admin_invites%rowtype;
  saved public.admin_invites%rowtype;
begin
  actor := public.assert_admin_actor();
  if target_status not in ('sent', 'failed') then
    raise exception 'Invite terminal status required'
      using errcode = '23514';
  end if;
  select * into previous
  from public.admin_invites
  where id = target_invite_id
    and status = 'pending'
  for update;
  if not found then
    raise exception 'Pending invite not found'
      using errcode = 'P0002';
  end if;

  update public.admin_invites
  set
    status = target_status,
    provider_user_id = target_provider_user_id,
    error_message = case
      when target_status = 'failed'
      then left(coalesce(target_error_message, 'Invite provider failed'), 500)
      else null
    end,
    completed_at = clock_timestamp()
  where id = target_invite_id
  returning * into saved;

  perform public.write_audit_log(
    case when target_status = 'sent'
      then 'invite.sent'
      else 'invite.failed'
    end,
    'admin_invite',
    target_invite_id,
    to_jsonb(previous),
    to_jsonb(saved),
    '{}'::jsonb
  );
end;
$$;

create function public.get_admin_questions(target_course_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
begin
  actor := public.assert_authenticated_actor();
  if target_course_id is not null then
    perform public.assert_course_manager(target_course_id);
  elsif actor.role = 'student'::public.app_role then
    raise exception 'Administration permission required'
      using errcode = '42501';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', q.id,
          'chapterId', q.chapter_id,
          'chapterTitle', ch.title,
          'courseId', ch.course_id,
          'content', q.content,
          'explanation', q.explanation,
          'difficulty', q.difficulty,
          'status', q.status,
          'sourceNumber', q.source_number,
          'updatedAt', q.updated_at,
          'options', (
            select coalesce(
              jsonb_agg(
                jsonb_build_object(
                  'id', qo.id,
                  'label', qo.label,
                  'content', qo.content,
                  'isCorrect', qo.is_correct
                )
                order by qo.label
              ),
              '[]'::jsonb
            )
            from public.question_options qo
            where qo.question_id = q.id
          )
        )
        order by ch.position, q.source_number nulls last, q.created_at
      )
      from public.questions q
      join public.chapters ch on ch.id = q.chapter_id
      where (target_course_id is null or ch.course_id = target_course_id)
        and (
          actor.role = 'admin'::public.app_role
          or exists (
            select 1
            from public.course_instructors ci
            where ci.course_id = ch.course_id
              and ci.instructor_id = actor.id
          )
        )
    ),
    '[]'::jsonb
  );
end;
$$;

create function public.get_admin_report(target_course_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  result jsonb;
begin
  actor := public.assert_authenticated_actor();
  if actor.role = 'student'::public.app_role then
    raise exception 'Administration permission required'
      using errcode = '42501';
  end if;
  if target_course_id is not null then
    perform public.assert_course_manager(target_course_id);
  end if;

  with scoped_courses as (
    select c.id
    from public.courses c
    where (target_course_id is null or c.id = target_course_id)
      and (
        actor.role = 'admin'::public.app_role
        or exists (
          select 1
          from public.course_instructors ci
          where ci.course_id = c.id
            and ci.instructor_id = actor.id
        )
      )
  ),
  scoped_attempts as (
    select a.*
    from public.attempts a
    join scoped_courses sc on sc.id = a.course_id
  ),
  answer_facts as (
    select
      aq.question_id,
      aq.question_snapshot ->> 'content' as question_content,
      nullif(aq.question_snapshot ->> 'chapter_id', '')::uuid as chapter_id,
      ch.title as chapter_title,
      aa.selected_option_id,
      coalesce(aa.is_correct, false) as answer_correct,
      selected_option.label as selected_label
    from scoped_attempts a
    join public.attempt_questions aq on aq.attempt_id = a.id
    left join public.attempt_answers aa on aa.attempt_question_id = aq.id
    left join public.chapters ch
      on ch.id = nullif(aq.question_snapshot ->> 'chapter_id', '')::uuid
    left join lateral (
      select option_value ->> 'label' as label
      from jsonb_array_elements(
        coalesce(aq.question_snapshot -> 'options', '[]'::jsonb)
      ) option_value
      where option_value ->> 'id' = aa.selected_option_id::text
      limit 1
    ) selected_option on true
    where a.status = 'submitted'::public.attempt_status
  ),
  chapter_metrics as (
    select
      af.chapter_id,
      coalesce(af.chapter_title, 'Chưa xác định') as chapter_title,
      count(*) filter (where af.selected_option_id is not null)::integer
        as answers,
      round(
        100.0 * count(*) filter (
          where af.selected_option_id is not null and not af.answer_correct
        ) / nullif(
          count(*) filter (where af.selected_option_id is not null),
          0
        )
      )::integer as incorrect_rate
    from answer_facts af
    group by af.chapter_id, af.chapter_title
  ),
  question_metrics as (
    select
      af.question_id,
      max(af.question_content) as question_content,
      max(af.chapter_id::text)::uuid as chapter_id,
      max(af.chapter_title) as chapter_title,
      count(*)::integer as attempts,
      round(
        100.0 * count(*) filter (where af.answer_correct)
        / nullif(count(*), 0)
      )::integer as correct_rate,
      round(
        100.0 * count(*) filter (where af.selected_option_id is null)
        / nullif(count(*), 0)
      )::integer as unanswered_rate
    from answer_facts af
    group by af.question_id
  )
  select jsonb_build_object(
    'summary',
    jsonb_build_object(
      'activeUsers',
      (
        select count(distinct user_id)
        from scoped_attempts
        where started_at >= clock_timestamp() - interval '30 days'
      ),
      'attempts', (select count(*) from scoped_attempts),
      'averageScore',
      (
        select round(avg(score))::integer
        from scoped_attempts
        where status = 'submitted'::public.attempt_status
          and score is not null
      ),
      'completionRate',
      coalesce(
        (
          select round(
            100.0 * count(*) filter (
              where status = 'submitted'::public.attempt_status
            ) / nullif(count(*), 0)
          )::integer
          from scoped_attempts
        ),
        0
      ),
      'totalUsers',
      case
        when actor.role = 'admin'::public.app_role
        then (select count(*) from public.profiles where is_active)
        else (select count(distinct user_id) from scoped_attempts)
      end
    ),
    'chapterDifficulty',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'chapterId', cm.chapter_id,
            'chapterTitle', cm.chapter_title,
            'answers', cm.answers,
            'incorrectRate', coalesce(cm.incorrect_rate, 0)
          )
          order by cm.incorrect_rate desc nulls last, cm.chapter_title
        )
        from chapter_metrics cm
      ),
      '[]'::jsonb
    ),
    'questionMetrics',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'questionId', qm.question_id,
            'questionContent', qm.question_content,
            'chapterId', qm.chapter_id,
            'chapterTitle', qm.chapter_title,
            'attempts', qm.attempts,
            'correctRate', coalesce(qm.correct_rate, 0),
            'unansweredRate', coalesce(qm.unanswered_rate, 0),
            'mostSelectedDistractor',
            (
              select selected_label
              from answer_facts distractor
              where distractor.question_id = qm.question_id
                and distractor.selected_option_id is not null
                and not distractor.answer_correct
              group by selected_label
              order by count(*) desc, selected_label
              limit 1
            ),
            'distractorRates',
            coalesce(
              (
                select jsonb_object_agg(selected_label, selection_rate)
                from (
                  select
                    distractor.selected_label,
                    round(
                      100.0 * count(*) / nullif(qm.attempts, 0)
                    )::integer as selection_rate
                  from answer_facts distractor
                  where distractor.question_id = qm.question_id
                    and distractor.selected_option_id is not null
                    and not distractor.answer_correct
                  group by distractor.selected_label
                ) distractor_rates
              ),
              '{}'::jsonb
            )
          )
          order by qm.correct_rate, qm.question_id
        )
        from question_metrics qm
      ),
      '[]'::jsonb
    )
  )
  into result;

  return result;
end;
$$;

-- Helpers are internal implementation details; only the portal RPC surface is
-- executable by authenticated users.
revoke all on function public.assert_authenticated_actor()
from public, anon, authenticated;
revoke all on function public.assert_admin_actor()
from public, anon, authenticated;
revoke all on function public.assert_course_manager(uuid)
from public, anon, authenticated;

revoke all on function public.admin_upsert_course(
  uuid, text, text, text, text, text
) from public, anon;
grant execute on function public.admin_upsert_course(
  uuid, text, text, text, text, text
) to authenticated;

revoke all on function public.admin_upsert_chapter(
  uuid, uuid, integer, text, text
) from public, anon;
grant execute on function public.admin_upsert_chapter(
  uuid, uuid, integer, text, text
) to authenticated;

revoke all on function public.admin_upsert_question(
  uuid, uuid, text, text, integer, text, integer, jsonb
) from public, anon;
grant execute on function public.admin_upsert_question(
  uuid, uuid, text, text, integer, text, integer, jsonb
) to authenticated;

revoke all on function public.admin_set_instructor(uuid, uuid[], boolean)
from public, anon;
grant execute on function public.admin_set_instructor(uuid, uuid[], boolean)
to authenticated;

revoke all on function public.admin_set_user_active(uuid, boolean)
from public, anon;
grant execute on function public.admin_set_user_active(uuid, boolean)
to authenticated;

revoke all on function public.admin_import_questions(
  uuid, uuid, text, text, jsonb
) from public, anon;
grant execute on function public.admin_import_questions(
  uuid, uuid, text, text, jsonb
) to authenticated;

revoke all on function public.admin_request_invite(text, text, uuid[])
from public, anon;
grant execute on function public.admin_request_invite(text, text, uuid[])
to authenticated;

revoke all on function public.admin_finalize_invite(
  uuid, text, uuid, text
) from public, anon;
grant execute on function public.admin_finalize_invite(
  uuid, text, uuid, text
) to authenticated;

revoke all on function public.get_admin_questions(uuid)
from public, anon;
grant execute on function public.get_admin_questions(uuid)
to authenticated;

revoke all on function public.get_admin_report(uuid)
from public, anon;
grant execute on function public.get_admin_report(uuid)
to authenticated;
