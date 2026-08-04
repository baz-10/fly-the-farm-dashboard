-- Production Beta identity reconciliation is explicit, idempotent and fail closed.
-- It creates no organisation identities, memberships, seats, roles, locations or Personnel.
do $$
declare
  v_platform_auth_user_id uuid;
  v_organisation_auth_user_id uuid;
  v_organisation_internal_user_id uuid;
  v_result jsonb;
  v_legacy_profile_count integer:=0;
begin
  if (select count(*) from auth.users where lower(email)='ben@trollope.com.au')<>1 then
    raise exception 'PLATFORM_IDENTITY_AMBIGUOUS';
  end if;
  select id into v_platform_auth_user_id from auth.users where lower(email)='ben@trollope.com.au';

  if to_regclass('public.ftf_profiles') is not null then
    execute 'select count(*) from public.ftf_profiles where user_id=$1 and tenant_id is not null' into v_legacy_profile_count using v_platform_auth_user_id;
  end if;
  if exists(select 1 from public.internal_users where auth_user_id=v_platform_auth_user_id) or v_legacy_profile_count>0 then
    raise exception 'PLATFORM_IDENTITY_HAS_TENANT_ACCESS';
  end if;

  v_result:=public.reconcile_platform_identity(v_platform_auth_user_id,'ben@trollope.com.au','Ben Trollope','PLATFORM_SUPER_ADMIN',v_platform_auth_user_id);
  if v_result->>'status' not in('RECONCILED','ALREADY_RECONCILED') then
    raise exception 'PLATFORM_IDENTITY_RECONCILIATION_FAILED: %',v_result->>'status';
  end if;

  if (select count(*) from auth.users where lower(email)='ben@flythefarm.com.au')<>1 then
    raise exception 'ORGANISATION_IDENTITY_AMBIGUOUS';
  end if;
  select id into v_organisation_auth_user_id from auth.users where lower(email)='ben@flythefarm.com.au';
  if (select count(*) from public.internal_users where auth_user_id=v_organisation_auth_user_id and archived_at is null)<>1 then
    raise exception 'ORGANISATION_INTERNAL_IDENTITY_AMBIGUOUS';
  end if;
  select id into v_organisation_internal_user_id from public.internal_users where auth_user_id=v_organisation_auth_user_id and archived_at is null;
  if not exists(
    select 1 from public.memberships m join public.roles r on r.organisation_id=m.organisation_id and r.id=m.role_id
    join public.organisations o on o.id=m.organisation_id
    where m.internal_user_id=v_organisation_internal_user_id and m.is_active and m.archived_at is null
      and r.code='admin'and r.archived_at is null and lower(o.name)='fly the farm'
  ) then raise exception 'FLY_THE_FARM_ADMIN_MEMBERSHIP_MISSING';end if;
  if (select count(*) from public.personnel where internal_user_id=v_organisation_internal_user_id and archived_at is null)>1 then
    raise exception 'ORGANISATION_PERSONNEL_IDENTITY_AMBIGUOUS';
  end if;

  if exists(select 1 from public.internal_users where auth_user_id=v_platform_auth_user_id)
    or exists(select 1 from public.memberships m join public.internal_users u on u.id=m.internal_user_id where u.auth_user_id=v_platform_auth_user_id)
    or exists(select 1 from public.internal_user_seat_assignments s join public.internal_users u on u.id=s.internal_user_id where u.auth_user_id=v_platform_auth_user_id)
    or exists(select 1 from public.membership_operating_location_assignments l join public.memberships m on m.id=l.membership_id join public.internal_users u on u.id=m.internal_user_id where u.auth_user_id=v_platform_auth_user_id) then
    raise exception 'PLATFORM_TENANT_CONTAMINATION_DETECTED';
  end if;
end$$;
