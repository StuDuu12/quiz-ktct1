create function public.admin_set_user_role(
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
  active_admin_count integer;
begin
  actor := public.assert_admin_actor();
  if target_user_id = actor.id then
    raise exception 'An admin cannot change their own role'
      using errcode = '23514';
  end if;

  -- Serialize role changes so two administrators cannot both remove the
  -- final active administrator in concurrent transactions.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('public.admin_set_user_role')
  );

  select * into previous
  from public.profiles
  where id = target_user_id
  for update;
  if not found then
    raise exception 'User not found'
      using errcode = 'P0002';
  end if;

  if previous.role = 'admin'::public.app_role
    and target_role <> 'admin'::public.app_role then
    select count(*)
    into active_admin_count
    from public.profiles
    where role = 'admin' and is_active and id <> target_user_id;

    if active_admin_count = 0 then
      raise exception 'At least one active admin must remain'
        using errcode = '23514';
    end if;
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

revoke all on function public.admin_set_user_role(uuid, public.app_role)
from public, anon;
grant execute on function public.admin_set_user_role(uuid, public.app_role)
to authenticated;
