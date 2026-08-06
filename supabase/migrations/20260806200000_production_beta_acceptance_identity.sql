-- IMP-OPS-001: least-privilege, non-personal organisation acceptance identity.
-- The Auth account must already exist through the normal invitation lifecycle.

do $$
declare
  v_organisation_id uuid;
  v_auth_user_id uuid;
  v_internal_user_id uuid;
  v_role_id uuid;
  v_membership_id uuid;
  v_location_id uuid;
  v_allocation_id uuid;
  v_count integer;
  v_permission_codes constant text[] := array[
    'operating_locations.read',
    'clients.read','clients.create','clients.archive',
    'properties.read','properties.create','properties.archive',
    'fields.read','fields.create','fields.archive',
    'field_boundary_versions.read','field_boundary_versions.create',
    'jobs.read','jobs.create','jobs.archive',
    'missions.read','missions.create','missions.archive'
  ];
begin
  if not exists(
    select 1 from information_schema.columns
    where table_schema='auth' and table_name='users' and column_name='email'
  ) then
    -- Lightweight migration verifiers model auth.users with only its primary key.
    return;
  end if;
  select count(*) into v_count from public.organisations
  where lower(name) = lower('Fly The Farm') and archived_at is null;
  if v_count = 0 and not exists(
    select 1 from auth.users where lower(email) = lower('info@flythefarm.com.au')
  ) then
    -- Schema-only and new-tenant environments have no identity to reconcile.
    -- Production Beta has both records and therefore cannot take this branch.
    return;
  end if;
  if v_count <> 1 then raise exception 'ACCEPTANCE_ORGANISATION_NOT_UNIQUE'; end if;
  select id into v_organisation_id from public.organisations
  where lower(name) = lower('Fly The Farm') and archived_at is null;

  select count(*) into v_count from auth.users
  where lower(email) = lower('info@flythefarm.com.au');
  if v_count <> 1 then raise exception 'ACCEPTANCE_IDENTITY_NOT_UNIQUE'; end if;
  select id into v_auth_user_id from auth.users
  where lower(email) = lower('info@flythefarm.com.au');

  if exists(select 1 from public.platform_users where auth_user_id=v_auth_user_id and archived_at is null) then
    raise exception 'ACCEPTANCE_PLATFORM_IDENTITY_FORBIDDEN';
  end if;

  select count(*) into v_count from public.internal_users
  where auth_user_id=v_auth_user_id and archived_at is null;
  if v_count > 1 then raise exception 'ACCEPTANCE_ORGANISATION_IDENTITY_AMBIGUOUS'; end if;
  select id into v_internal_user_id from public.internal_users
  where auth_user_id=v_auth_user_id and archived_at is null;
  if v_internal_user_id is not null and not exists(
    select 1 from public.internal_users where id=v_internal_user_id and organisation_id=v_organisation_id
  ) then raise exception 'ACCEPTANCE_WRONG_ORGANISATION'; end if;
  if v_internal_user_id is not null and exists(
    select 1 from public.personnel where organisation_id=v_organisation_id and internal_user_id=v_internal_user_id and archived_at is null
  ) then raise exception 'ACCEPTANCE_PERSONNEL_LINK_FORBIDDEN'; end if;

  insert into public.roles(organisation_id,code,name)
  values(v_organisation_id,'production_beta_acceptance','Production Beta Acceptance')
  on conflict(organisation_id,code) do update set name=excluded.name,archived_at=null
  returning id into v_role_id;

  select count(*) into v_count from public.permissions
  where organisation_id=v_organisation_id and code=any(v_permission_codes) and archived_at is null;
  if v_count <> cardinality(v_permission_codes) then raise exception 'ACCEPTANCE_PERMISSION_CATALOGUE_INCOMPLETE'; end if;

  delete from public.role_permissions
  where organisation_id=v_organisation_id and role_id=v_role_id
    and permission_id not in(select id from public.permissions where organisation_id=v_organisation_id and code=any(v_permission_codes) and archived_at is null);
  insert into public.role_permissions(organisation_id,role_id,permission_id)
  select v_organisation_id,v_role_id,p.id from public.permissions p
  where p.organisation_id=v_organisation_id and p.code=any(v_permission_codes) and p.archived_at is null
  on conflict(organisation_id,role_id,permission_id) do update set archived_at=null;

  if v_internal_user_id is null then
    insert into public.internal_users(organisation_id,auth_user_id,display_name)
    values(v_organisation_id,v_auth_user_id,'Production Beta Acceptance') returning id into v_internal_user_id;
  else
    update public.internal_users set display_name='Production Beta Acceptance',is_active=true,archived_at=null
    where organisation_id=v_organisation_id and id=v_internal_user_id;
  end if;

  select count(*) into v_count from public.memberships
  where organisation_id=v_organisation_id and internal_user_id=v_internal_user_id and archived_at is null;
  if v_count > 1 then raise exception 'ACCEPTANCE_MEMBERSHIP_AMBIGUOUS'; end if;
  select id into v_membership_id from public.memberships
  where organisation_id=v_organisation_id and internal_user_id=v_internal_user_id and archived_at is null;
  if v_membership_id is null then
    insert into public.memberships(organisation_id,internal_user_id,role_id)
    values(v_organisation_id,v_internal_user_id,v_role_id) returning id into v_membership_id;
  else
    update public.memberships set role_id=v_role_id,is_active=true,archived_at=null
    where organisation_id=v_organisation_id and id=v_membership_id;
  end if;

  select count(*) into v_count from public.operating_locations
  where organisation_id=v_organisation_id and name='Fly The Farm Base' and archived_at is null;
  if v_count <> 1 then raise exception 'ACCEPTANCE_LOCATION_REQUIRED'; end if;
  select id into v_location_id from public.operating_locations
  where organisation_id=v_organisation_id and name='Fly The Farm Base' and archived_at is null;

  select id into v_allocation_id from public.organisation_seat_allocations
  where organisation_id=v_organisation_id and archived_at is null for update;
  if v_allocation_id is null then raise exception 'ACCEPTANCE_SEAT_ALLOCATION_REQUIRED'; end if;
  insert into public.internal_user_seat_assignments(organisation_id,organisation_seat_allocation_id,internal_user_id,membership_id,status,assignment_source)
  values(v_organisation_id,v_allocation_id,v_internal_user_id,v_membership_id,'active','production_beta_acceptance')
  on conflict (organisation_id, internal_user_id) do update set organisation_seat_allocation_id=excluded.organisation_seat_allocation_id,membership_id=excluded.membership_id,status='active',assignment_source='production_beta_acceptance',archived_at=null,revoked_at=null;

  update public.organisation_seat_allocations
  set allocated_seats=greatest(allocated_seats,(select count(*) from public.internal_user_seat_assignments where organisation_id=v_organisation_id and status='active' and archived_at is null)),
      allocation_source='production_beta_acceptance'
  where organisation_id=v_organisation_id and id=v_allocation_id;

  update public.membership_operating_location_assignments set is_active=false,archived_at=coalesce(archived_at,now())
  where organisation_id=v_organisation_id and membership_id=v_membership_id and operating_location_id<>v_location_id and archived_at is null;
  insert into public.membership_operating_location_assignments(organisation_id,membership_id,operating_location_id,is_active,assignment_source)
  values(v_organisation_id,v_membership_id,v_location_id,true,'production_beta_acceptance')
  on conflict (organisation_id, membership_id, operating_location_id) do update set is_active=true,assignment_source='production_beta_acceptance',archived_at=null;

  insert into public.audit_events(organisation_id,event_type,entity_type,entity_id,event_payload)
  values(v_organisation_id,'production_beta_acceptance.reconciled','internal_user',v_internal_user_id,jsonb_build_object('role','production_beta_acceptance','membership_id',v_membership_id,'operating_location_id',v_location_id));
  insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload)
  values(v_organisation_id,'organisation.production_beta_acceptance.reconciled','internal_user',v_internal_user_id,jsonb_build_object('role','production_beta_acceptance'));
end $$;

alter function public.ftf_write_operational_resource(uuid,uuid,text,text,uuid,integer,jsonb)
  rename to ftf_write_operational_resource_before_acceptance_scope;

create function public.ftf_write_operational_resource(
  p_organisation_id uuid,
  p_actor_internal_user_id uuid,
  p_resource text,
  p_operation text,
  p_entity_id uuid default null,
  p_expected_version integer default null,
  p_data jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_is_acceptance boolean;
  v_label text;
begin
  select exists(
    select 1 from public.memberships m
    join public.roles r on r.organisation_id=m.organisation_id and r.id=m.role_id
    where m.organisation_id=p_organisation_id and m.internal_user_id=p_actor_internal_user_id
      and m.is_active and m.archived_at is null and r.code='production_beta_acceptance' and r.archived_at is null
  ) into v_is_acceptance;

  if v_is_acceptance then
    if p_operation='create' then
      v_label:=case p_resource when 'jobs' then p_data->>'scope' when 'missions' then p_data->>'title' else p_data->>'name' end;
      if v_label is null or not starts_with(v_label,'SC ACCEPTANCE —') then
        raise exception 'ACCEPTANCE_RECORD_SCOPE_REQUIRED' using errcode='42501';
      end if;
    elsif p_operation='update' then
      raise exception 'ACCEPTANCE_UPDATE_FORBIDDEN' using errcode='42501';
    elsif p_operation='archive' and not exists(
      select 1 from public.audit_events a
      where a.organisation_id=p_organisation_id and a.actor_internal_user_id=p_actor_internal_user_id
        and a.event_type=p_resource||'.create' and a.entity_type=p_resource and a.entity_id=p_entity_id
    ) then
      raise exception 'ACCEPTANCE_ARCHIVE_SCOPE_FORBIDDEN' using errcode='42501';
    end if;
  end if;

  return public.ftf_write_operational_resource_before_acceptance_scope(
    p_organisation_id,p_actor_internal_user_id,p_resource,p_operation,p_entity_id,p_expected_version,p_data
  );
end;
$$;

revoke all on function public.ftf_write_operational_resource_before_acceptance_scope(uuid,uuid,text,text,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.ftf_write_operational_resource_before_acceptance_scope(uuid,uuid,text,text,uuid,integer,jsonb) to service_role;
revoke all on function public.ftf_write_operational_resource(uuid,uuid,text,text,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.ftf_write_operational_resource(uuid,uuid,text,text,uuid,integer,jsonb) to service_role;
