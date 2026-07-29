create function public.lock_admin_access_changes()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('public.admin_access_changes')
  );
end;
$$;

create function public.assert_active_admin_remains(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_admin_count bigint;
begin
  select count(*)
  into active_admin_count
  from public.profiles
  where role = 'admin' and is_active and id <> target_user_id;

  if active_admin_count = 0 then
    raise exception 'At least one active admin must remain'
      using errcode = '23514';
  end if;
end;
$$;

create or replace function public.admin_set_user_role(
  target_user_id uuid,
  target_role public.app_role
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
  perform public.lock_admin_access_changes();
  actor := public.assert_admin_actor();
  if target_user_id = actor.id then
    raise exception 'An admin cannot change their own role'
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

  if previous.role = 'admin'::public.app_role
    and previous.is_active
    and target_role <> 'admin'::public.app_role then
    perform public.assert_active_admin_remains(target_user_id);
  end if;

  if target_role in ('student'::public.app_role, 'admin'::public.app_role) then
    delete from public.course_instructors
    where instructor_id = target_user_id;
  end if;

  update public.profiles
  set role = target_role, is_active = true
  where id = target_user_id
  returning * into saved;

  perform public.write_audit_log(
    'profile.role_changed',
    'profile',
    target_user_id,
    to_jsonb(previous),
    to_jsonb(saved),
    jsonb_build_object('previous_role', previous.role, 'target_role', target_role)
  );
end;
$$;

create or replace function public.admin_set_instructor(
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
  perform public.lock_admin_access_changes();
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

  if previous.role = 'admin'::public.app_role and previous.is_active then
    perform public.assert_active_admin_remains(target_user_id);
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

create or replace function public.admin_set_user_active(
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
  perform public.lock_admin_access_changes();
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

  if not target_active
    and previous.role = 'admin'::public.app_role
    and previous.is_active then
    perform public.assert_active_admin_remains(target_user_id);
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

revoke all on function public.lock_admin_access_changes()
from public, anon, authenticated;
revoke all on function public.assert_active_admin_remains(uuid)
from public, anon, authenticated;
