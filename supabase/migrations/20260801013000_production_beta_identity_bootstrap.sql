-- Service-role-only bootstrap for the first user of a Production Beta tenant.
-- Creates a complete, tenant-scoped identity and access chain atomically.

create or replace function public.ftf_bootstrap_production_beta_organisation(
  p_auth_user_id uuid,
  p_organisation_name text,
  p_display_name text,
  p_operating_location_name text,
  p_operating_location_address text default null,
  p_timezone text default 'Australia/Brisbane'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organisation_id uuid;
  v_location_id uuid;
  v_internal_user_id uuid;
  v_role_id uuid;
  v_membership_id uuid;
  v_allocation_id uuid;
  v_existing_count integer;
begin
  if p_auth_user_id is null then
    raise exception 'auth user is required' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_organisation_name, ''))) = 0
     or length(btrim(coalesce(p_display_name, ''))) = 0
     or length(btrim(coalesce(p_operating_location_name, ''))) = 0
     or length(btrim(coalesce(p_timezone, ''))) = 0 then
    raise exception 'organisation, user, location and timezone names are required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_auth_user_id::text, 0));

  if not exists (select 1 from auth.users where id = p_auth_user_id) then
    raise exception 'auth user does not exist' using errcode = '23503';
  end if;

  select iu.organisation_id, iu.id
    into v_organisation_id, v_internal_user_id
  from public.internal_users iu
  where iu.auth_user_id = p_auth_user_id
    and iu.is_active = true
    and iu.archived_at is null
  order by iu.created_at
  limit 1;

  if v_internal_user_id is not null then
    select count(*) into v_existing_count
    from public.internal_users iu
    join public.organisations o on o.id = iu.organisation_id and o.archived_at is null
    join public.memberships m on m.organisation_id = iu.organisation_id
      and m.internal_user_id = iu.id and m.is_active = true and m.archived_at is null
    join public.roles r on r.organisation_id = m.organisation_id
      and r.id = m.role_id and r.code = 'admin' and r.archived_at is null
    join public.internal_user_seat_assignments isa on isa.organisation_id = m.organisation_id
      and isa.internal_user_id = iu.id and isa.membership_id = m.id
      and isa.status = 'active' and isa.archived_at is null
    join public.organisation_seat_allocations osa on osa.organisation_id = isa.organisation_id
      and osa.id = isa.organisation_seat_allocation_id and osa.archived_at is null
    join public.membership_operating_location_assignments mla on mla.organisation_id = m.organisation_id
      and mla.membership_id = m.id and mla.is_active = true and mla.archived_at is null
    join public.operating_locations ol on ol.organisation_id = mla.organisation_id
      and ol.id = mla.operating_location_id and ol.archived_at is null
    join public.ftf_profiles fp on fp.tenant_id = iu.organisation_id and fp.user_id = iu.auth_user_id
    where iu.id = v_internal_user_id;

    if v_existing_count <> 1 then
      raise exception 'existing user provisioning is incomplete' using errcode = '55000';
    end if;

    select mla.operating_location_id, m.id
      into v_location_id, v_membership_id
    from public.memberships m
    join public.membership_operating_location_assignments mla
      on mla.organisation_id = m.organisation_id and mla.membership_id = m.id
    where m.organisation_id = v_organisation_id and m.internal_user_id = v_internal_user_id
      and m.is_active = true and m.archived_at is null
      and mla.is_active = true and mla.archived_at is null
    order by mla.created_at limit 1;

    return jsonb_build_object(
      'organisation_id', v_organisation_id,
      'operating_location_id', v_location_id,
      'internal_user_id', v_internal_user_id,
      'membership_id', v_membership_id,
      'already_provisioned', true
    );
  end if;

  v_organisation_id := gen_random_uuid();
  insert into public.organisations (id, organisation_id, name)
  values (v_organisation_id, v_organisation_id, btrim(p_organisation_name));

  insert into public.operating_locations (organisation_id, name, address, timezone)
  values (v_organisation_id, btrim(p_operating_location_name), nullif(btrim(p_operating_location_address), ''), btrim(p_timezone))
  returning id into v_location_id;

  insert into public.roles (organisation_id, code, name)
  values (v_organisation_id, 'admin', 'Administrator')
  returning id into v_role_id;

  insert into public.permissions (organisation_id, code, description)
  select v_organisation_id, permission_code, permission_description
  from (values
    ('operating_locations.read', 'View operating locations'),
    ('operating_locations.create', 'Create operating locations'),
    ('operating_locations.update', 'Update operating locations'),
    ('operating_locations.archive', 'Archive operating locations'),
    ('clients.read', 'View clients'), ('clients.create', 'Create clients'),
    ('clients.update', 'Update clients'), ('clients.archive', 'Archive clients'),
    ('properties.read', 'View properties'), ('properties.create', 'Create properties'),
    ('properties.update', 'Update properties'), ('properties.archive', 'Archive properties'),
    ('fields.read', 'View fields'), ('fields.create', 'Create fields'),
    ('fields.update', 'Update fields'), ('fields.archive', 'Archive fields'),
    ('jobs.read', 'View jobs'), ('jobs.create', 'Create jobs'),
    ('jobs.update', 'Update jobs'), ('jobs.archive', 'Archive jobs'),
    ('missions.read', 'View missions'), ('missions.create', 'Create missions'),
    ('missions.update', 'Update missions'), ('missions.archive', 'Archive missions'),
    ('field_boundary_versions.read', 'View field boundary versions'),
    ('field_boundary_versions.create', 'Create field boundary versions')
  ) as required_permissions(permission_code, permission_description);

  insert into public.role_permissions (organisation_id, role_id, permission_id)
  select v_organisation_id, v_role_id, p.id
  from public.permissions p where p.organisation_id = v_organisation_id;

  insert into public.internal_users (organisation_id, auth_user_id, display_name)
  values (v_organisation_id, p_auth_user_id, btrim(p_display_name))
  returning id into v_internal_user_id;

  insert into public.memberships (organisation_id, internal_user_id, role_id)
  values (v_organisation_id, v_internal_user_id, v_role_id)
  returning id into v_membership_id;

  insert into public.organisation_seat_allocations (organisation_id, allocated_seats, allocation_source)
  values (v_organisation_id, 1, 'production_beta_bootstrap')
  returning id into v_allocation_id;

  insert into public.internal_user_seat_assignments (
    organisation_id, organisation_seat_allocation_id, internal_user_id,
    membership_id, status, assignment_source
  ) values (
    v_organisation_id, v_allocation_id, v_internal_user_id,
    v_membership_id, 'active', 'production_beta_bootstrap'
  );

  insert into public.membership_operating_location_assignments (
    organisation_id, membership_id, operating_location_id, assignment_source
  ) values (v_organisation_id, v_membership_id, v_location_id, 'production_beta_bootstrap');

  insert into public.ftf_profiles (user_id, tenant_id, role, name, tier)
  values (p_auth_user_id, v_organisation_id, 'admin', btrim(p_display_name), 'beta');

  insert into public.audit_events (
    organisation_id, actor_internal_user_id, event_type, entity_type, entity_id, event_payload
  ) values (
    v_organisation_id, v_internal_user_id, 'beta_identity.provisioned',
    'organisation', v_organisation_id,
    jsonb_build_object('auth_user_id', p_auth_user_id, 'operating_location_id', v_location_id)
  );

  insert into public.transactional_outbox (
    organisation_id, topic, aggregate_type, aggregate_id, payload
  ) values (
    v_organisation_id, 'platform.beta_identity.provisioned', 'organisation', v_organisation_id,
    jsonb_build_object('auth_user_id', p_auth_user_id, 'internal_user_id', v_internal_user_id)
  );

  return jsonb_build_object(
    'organisation_id', v_organisation_id,
    'operating_location_id', v_location_id,
    'internal_user_id', v_internal_user_id,
    'membership_id', v_membership_id,
    'already_provisioned', false
  );
end;
$$;

revoke all on function public.ftf_bootstrap_production_beta_organisation(uuid, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.ftf_bootstrap_production_beta_organisation(uuid, text, text, text, text, text)
  to service_role;
