create type public.app_role as enum ('admin', 'instructor', 'student');
create type public.attempt_kind as enum ('practice', 'mock_exam');
create type public.attempt_status as enum ('in_progress', 'submitted', 'expired');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null default '',
  role public.app_role not null default 'student',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (slug = lower(slug) and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (length(btrim(title)) > 0),
  description text not null default '',
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.course_instructors (
  course_id uuid not null references public.courses(id) on delete cascade,
  instructor_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (course_id, instructor_id)
);

create table public.chapters (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  position integer not null check (position > 0),
  title text not null check (length(btrim(title)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, position)
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  content text not null check (length(btrim(content)) > 0),
  explanation text not null default '',
  difficulty smallint not null default 2 check (difficulty between 1 and 4),
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  source_number integer check (source_number is null or source_number > 0),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  label text not null check (label in ('A', 'B', 'C', 'D')),
  content text not null check (length(btrim(content)) > 0),
  is_correct boolean not null default false,
  unique (question_id, label)
);

create table public.exam_configs (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  title text not null check (length(btrim(title)) > 0),
  kind public.attempt_kind not null default 'mock_exam',
  question_count integer not null check (question_count > 0),
  duration_seconds integer not null check (duration_seconds > 0),
  passing_score numeric(5, 2) not null default 0
    check (passing_score between 0 and 100),
  shuffle_questions boolean not null default true,
  shuffle_options boolean not null default true,
  settings jsonb not null default '{}'::jsonb
    check (jsonb_typeof(settings) = 'object'),
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  course_id uuid not null references public.courses(id),
  exam_config_id uuid references public.exam_configs(id) on delete set null,
  kind public.attempt_kind not null,
  status public.attempt_status not null default 'in_progress',
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  submitted_at timestamptz,
  score numeric(5, 2) check (score is null or score between 0 and 100),
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  question_order jsonb not null default '[]'::jsonb
    check (jsonb_typeof(question_order) = 'array'),
  option_order jsonb not null default '{}'::jsonb
    check (jsonb_typeof(option_order) = 'object'),
  created_at timestamptz not null default now(),
  constraint attempts_expiry_after_start check (expires_at > started_at),
  constraint attempts_submission_fields check (
    (
      status = 'submitted'
      and submitted_at is not null
      and score is not null
      and duration_seconds is not null
    )
    or
    (
      status <> 'submitted'
      and submitted_at is null
      and score is null
      and duration_seconds is null
    )
  )
);

create table public.attempt_questions (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  question_id uuid not null references public.questions(id),
  position integer not null check (position > 0),
  question_snapshot jsonb not null
    check (jsonb_typeof(question_snapshot) = 'object'),
  option_order jsonb not null
    check (jsonb_typeof(option_order) = 'array'),
  created_at timestamptz not null default now(),
  unique (attempt_id, question_id),
  unique (attempt_id, position)
);

create table public.attempt_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_question_id uuid not null unique
    references public.attempt_questions(id) on delete cascade,
  selected_option_id uuid references public.question_options(id),
  is_correct boolean,
  answered_at timestamptz not null default now()
);

create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id),
  file_name text not null check (length(btrim(file_name)) > 0),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  total_rows integer not null default 0 check (total_rows >= 0),
  processed_rows integer not null default 0 check (processed_rows >= 0),
  failed_rows integer not null default 0 check (failed_rows >= 0),
  errors jsonb not null default '[]'::jsonb
    check (jsonb_typeof(errors) = 'array'),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  constraint import_job_row_counts check (
    processed_rows + failed_rows <= total_rows
  ),
  constraint import_job_timestamps check (
    (started_at is null or started_at >= created_at)
    and (completed_at is null or started_at is not null)
    and (completed_at is null or completed_at >= started_at)
  )
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (length(btrim(action)) > 0),
  entity_type text not null check (length(btrim(entity_type)) > 0),
  entity_id uuid,
  old_data jsonb,
  new_data jsonb,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index course_instructors_instructor_id_idx
  on public.course_instructors (instructor_id, course_id);
create index chapters_course_id_idx
  on public.chapters (course_id, position);
create index questions_chapter_status_idx
  on public.questions (chapter_id, status);
create index questions_created_by_idx
  on public.questions (created_by);
create index question_options_question_id_idx
  on public.question_options (question_id);
create index exam_configs_course_active_idx
  on public.exam_configs (course_id, is_active);
create index attempts_user_started_idx
  on public.attempts (user_id, started_at desc);
create index attempts_course_status_idx
  on public.attempts (course_id, status);
create index attempts_expires_in_progress_idx
  on public.attempts (expires_at)
  where status = 'in_progress';
create index attempt_questions_attempt_position_idx
  on public.attempt_questions (attempt_id, position);
create index attempt_answers_selected_option_idx
  on public.attempt_answers (selected_option_id);
create index import_jobs_uploader_created_idx
  on public.import_jobs (uploaded_by, created_at desc);
create index import_jobs_course_status_idx
  on public.import_jobs (course_id, status);
create index audit_logs_actor_created_idx
  on public.audit_logs (actor_id, created_at desc);
create index audit_logs_entity_idx
  on public.audit_logs (entity_type, entity_id, created_at desc);

create or replace function public.current_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select role
      from public.profiles
      where id = auth.uid()
        and is_active
    ),
    'student'::public.app_role
  )
$$;

create or replace function public.is_course_instructor(target_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.course_instructors
    where course_id = target_course_id
      and instructor_id = auth.uid()
  )
$$;

create or replace function public.can_manage_course(target_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_role() = 'admin'
    or (
      public.current_role() = 'instructor'
      and public.is_course_instructor(target_course_id)
    )
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  );
  return new;
end;
$$;

create or replace function public.protect_profile_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
    new.role is distinct from old.role
    or new.is_active is distinct from old.is_active
    or new.email is distinct from old.email
  ) and public.current_role() <> 'admin' then
    raise exception 'Only admins may change profile role, status, or email'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.protect_attempt_submission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  total_questions integer;
  correct_answers integer;
begin
  if (
    new.id is distinct from old.id
    or new.user_id is distinct from old.user_id
    or new.course_id is distinct from old.course_id
    or new.exam_config_id is distinct from old.exam_config_id
    or new.kind is distinct from old.kind
    or new.started_at is distinct from old.started_at
    or new.expires_at is distinct from old.expires_at
    or new.question_order is distinct from old.question_order
    or new.option_order is distinct from old.option_order
  ) then
    raise exception 'Attempt identity and snapshots are immutable'
      using errcode = '23514';
  end if;

  if old.status <> 'in_progress' and new is distinct from old then
    raise exception 'Submitted or expired attempts are immutable'
      using errcode = '23514';
  end if;

  if new.status = 'submitted' and old.status = 'in_progress' then
    select count(*), count(*) filter (where aa.is_correct)
    into total_questions, correct_answers
    from public.attempt_questions aq
    left join public.attempt_answers aa
      on aa.attempt_question_id = aq.id
    where aq.attempt_id = old.id;

    new.submitted_at := now();
    new.duration_seconds := greatest(
      0,
      floor(extract(epoch from (new.submitted_at - old.started_at)))::integer
    );
    new.score := case
      when total_questions = 0 then 0
      else round((correct_answers::numeric * 100) / total_questions, 2)
    end;
  elsif new.status = 'expired' and old.status = 'in_progress' then
    new.submitted_at := null;
    new.duration_seconds := null;
    new.score := null;
  elsif new.status = 'in_progress' then
    new.submitted_at := null;
    new.duration_seconds := null;
    new.score := null;
  end if;

  return new;
end;
$$;

create or replace function public.guard_attempt_content_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_attempt_id uuid;
  target_status public.attempt_status;
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

  select status
  into target_status
  from public.attempts
  where id = target_attempt_id;

  if target_status is distinct from 'in_progress'::public.attempt_status then
    raise exception 'Attempt content is immutable after completion'
      using errcode = '23514';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.prepare_attempt_answer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected_question_id uuid;
  selected_question_id uuid;
begin
  select question_id
  into expected_question_id
  from public.attempt_questions
  where id = new.attempt_question_id;

  if expected_question_id is null then
    raise exception 'Attempt question does not exist'
      using errcode = '23503';
  end if;

  if new.selected_option_id is null then
    new.is_correct := null;
  else
    select question_id, is_correct
    into selected_question_id, new.is_correct
    from public.question_options
    where id = new.selected_option_id;

    if selected_question_id is distinct from expected_question_id then
      raise exception 'Selected option does not belong to the attempt question'
        using errcode = '23514';
    end if;
  end if;

  new.answered_at := now();
  return new;
end;
$$;

create or replace function public.write_audit_log(
  audit_action text,
  audit_entity_type text,
  audit_entity_id uuid default null,
  audit_old_data jsonb default null,
  audit_new_data jsonb default null,
  audit_metadata jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  audit_id bigint;
begin
  insert into public.audit_logs (
    actor_id,
    action,
    entity_type,
    entity_id,
    old_data,
    new_data,
    metadata
  )
  values (
    auth.uid(),
    audit_action,
    audit_entity_type,
    audit_entity_id,
    audit_old_data,
    audit_new_data,
    audit_metadata
  )
  returning id into audit_id;

  return audit_id;
end;
$$;

create or replace function public.audit_profile_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
    new.role is distinct from old.role
    or new.is_active is distinct from old.is_active
  ) then
    perform public.write_audit_log(
      'profile.access_changed',
      'profile',
      new.id,
      to_jsonb(old),
      to_jsonb(new),
      '{}'::jsonb
    );
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger protect_profile_privileged_fields
before update on public.profiles
for each row execute function public.protect_profile_privileged_fields();

create trigger audit_profile_changes
after update on public.profiles
for each row execute function public.audit_profile_changes();

create trigger courses_set_updated_at
before update on public.courses
for each row execute function public.set_updated_at();

create trigger chapters_set_updated_at
before update on public.chapters
for each row execute function public.set_updated_at();

create trigger questions_set_updated_at
before update on public.questions
for each row execute function public.set_updated_at();

create trigger exam_configs_set_updated_at
before update on public.exam_configs
for each row execute function public.set_updated_at();

create trigger protect_attempt_submission
before update on public.attempts
for each row execute function public.protect_attempt_submission();

create trigger guard_attempt_question_mutation
before insert or update or delete on public.attempt_questions
for each row execute function public.guard_attempt_content_mutation();

create trigger guard_attempt_answer_mutation
before insert or update or delete on public.attempt_answers
for each row execute function public.guard_attempt_content_mutation();

create trigger prepare_attempt_answer
before insert or update of attempt_question_id, selected_option_id
on public.attempt_answers
for each row execute function public.prepare_attempt_answer();

revoke all on function public.write_audit_log(
  text,
  text,
  uuid,
  jsonb,
  jsonb,
  jsonb
) from public;
grant execute on function public.write_audit_log(
  text,
  text,
  uuid,
  jsonb,
  jsonb,
  jsonb
) to service_role;
