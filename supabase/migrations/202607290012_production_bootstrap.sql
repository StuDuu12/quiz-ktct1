-- The first production administrator is promoted through a service-role-only
-- bootstrap function. It can promote one matching profile, is idempotent for
-- that profile, and permanently closes once any different administrator exists.
--
-- The verified source contains repeated display numbers in Chapter 6. Stable
-- seed UUIDs, rather than a chapter/source-number uniqueness constraint, are
-- therefore the idempotency boundary for the one-time production import.
drop index if exists public.questions_chapter_source_number_idx;

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
  )
  and public.current_role() <> 'admin'
  and not (
    current_setting('ktct.initial_admin_bootstrap', true) = 'enabled'
    and coalesce(auth.jwt() ->> 'role', '') = 'service_role'
  )
  then
    raise exception 'Only admins may change profile role, status, or email'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create function public.bootstrap_initial_admin(
  target_user_id uuid,
  target_email text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_profile public.profiles%rowtype;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Service role is required'
      using errcode = '42501';
  end if;

  select *
  into target_profile
  from public.profiles
  where id = target_user_id
  for update;

  if target_profile.id is null
    or lower(target_profile.email) <> lower(btrim(target_email))
  then
    raise exception 'Target profile does not match the authenticated user'
      using errcode = '23514';
  end if;

  if target_profile.role = 'admin'::public.app_role
    and target_profile.is_active
  then
    return;
  end if;

  if exists (
    select 1
    from public.profiles
    where role = 'admin'::public.app_role
      and id <> target_user_id
  ) then
    raise exception 'An initial administrator already exists'
      using errcode = '23505';
  end if;

  perform set_config('ktct.initial_admin_bootstrap', 'enabled', true);
  update public.profiles
  set role = 'admin'::public.app_role,
      is_active = true
  where id = target_user_id;
end;
$$;

revoke all on function public.bootstrap_initial_admin(uuid, text)
from public, anon, authenticated;
grant execute on function public.bootstrap_initial_admin(uuid, text)
to service_role;
