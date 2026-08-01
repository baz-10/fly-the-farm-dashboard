-- Service-role-only provisioning for additional users in an existing beta tenant.

create or replace function public.ftf_provision_production_beta_member(
  p_auth_user_id uuid,
  p_organisation_id uuid,
  p_display_name text,
  p_operating_location_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_internal_user_id uuid;
  v_membership_id uuid;
  v_role_id uuid;
  v_allocation_id uuid;
  v_existing_count integer;
begin
  if p_auth_user_id is null or p_organisation_id is null or p_operating_location_id is null
     or length(btrim(coalesce(p_display_name, ''))) = 0 then
    raise exception 'auth user, organisation, display name and operating location are required'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_auth_user_id::text, 0));
  perform 1 from public.organisations
    where id = p_organisation_id and archived_at is null for update;
  if not found then
    raise exception 'active organisation does not exist' using errcode = '23503';
  end if;
  if not exists (select 1 from auth.users where id = p_auth_user_id) then
    raise exception 'auth user does not exist' using errcode = '23503';
  end if;
  if not exists (
    select 1 from public.operating_locations
    where organisation_id = p_organisation_id and id = p_operating_location_id and archived_at is null
  ) then
    raise exception 'active operating location does not exist in organisation' using errcode = '23503';
  end if;

  select iu.id into v_internal_user_id
  from public.internal_users iu
  where iu.auth_user_id = p_auth_user_id
  order by iu.created_at limit 1;

  if v_internal_user_id is not null then
    select count(*)
      into v_existing_count
    from public.internal_users iu
    join public.memberships m on m.organisation_id = iu.organisation_id
      and m.internal_user_id = iu.id and m.is_active = true and m.archived_at is null
    join public.roles r on r.organisation_id = m.organisation_id
      and r.id = m.role_id and r.code = 'admin' and r.archived_at is null
    join public.internal_user_seat_assignments isa on isa.organisation_id = m.organisation_id
      and isa.internal_user_id = iu.id and isa.membership_id = m.id
      and isa.status = 'active' and isa.archived_at is null
    join public.membership_operating_location_assignments mla on mla.organisation_id = m.organisation_id
      and mla.membership_id = m.id and mla.operating_location_id = p_operating_location_id
      and mla.is_active = true and mla.archived_at is null
    join public.ftf_profiles fp on fp.tenant_id = iu.organisation_id and fp.user_id = iu.auth_user_id
    where iu.id = v_internal_user_id and iu.organisation_id = p_organisation_id
      and iu.is_active = true and iu.archived_at is null;

    if v_existing_count <> 1 then
      raise exception 'existing user provisioning is incomplete or belongs to another organisation'
        using errcode = '55000';
    end if;
    select m.id into v_membership_id
    from public.memberships m
    where m.organisation_id = p_organisation_id
      and m.internal_user_id = v_internal_user_id
      and m.is_active = true and m.archived_at is null
    order by m.created_at limit 1;
    return jsonb_build_object(
      'organisation_id', p_organisation_id,
      'operating_location_id', p_operating_location_id,
      'internal_user_id', v_internal_user_id,
      'membership_id', v_membership_id,
      'already_provisioned', true
    );
  end if;

  select id into v_role_id from public.roles
  where organisation_id = p_organisation_id and code = 'admin' and archived_at is null;
  if v_role_id is null then
    raise exception 'administrator role is not configured' using errcode = '55000';
  end if;

  select id into v_allocation_id from public.organisation_seat_allocations
  where organisation_id = p_organisation_id and archived_at is null for update;
  if v_allocation_id is null then
    raise exception 'seat allocation is not configured' using errcode = '55000';
  end if;

  update public.organisation_seat_allocations
  set allocated_seats = allocated_seats + 1
  where organisation_id = p_organisation_id and id = v_allocation_id;

  insert into public.internal_users (organisation_id, auth_user_id, display_name)
  values (p_organisation_id, p_auth_user_id, btrim(p_display_name))
  returning id into v_internal_user_id;

  insert into public.memberships (organisation_id, internal_user_id, role_id)
  values (p_organisation_id, v_internal_user_id, v_role_id)
  returning id into v_membership_id;

  insert into public.internal_user_seat_assignments (
    organisation_id, organisation_seat_allocation_id, internal_user_id,
    membership_id, status, assignment_source
  ) values (
    p_organisation_id, v_allocation_id, v_internal_user_id,
    v_membership_id, 'active', 'production_beta_member_provisioning'
  );

  insert into public.membership_operating_location_assignments (
    organisation_id, membership_id, operating_location_id, assignment_source
  ) values (
    p_organisation_id, v_membership_id, p_operating_location_id,
    'production_beta_member_provisioning'
  );

  insert into public.ftf_profiles (user_id, tenant_id, role, name, tier)
  values (p_auth_user_id, p_organisation_id, 'admin', btrim(p_display_name), 'beta');

  insert into public.audit_events (
    organisation_id, actor_internal_user_id, event_type, entity_type, entity_id, event_payload
  ) values (
    p_organisation_id, v_internal_user_id, 'beta_member.provisioned',
    'internal_user', v_internal_user_id,
    jsonb_build_object('auth_user_id', p_auth_user_id, 'operating_location_id', p_operating_location_id)
  );
  insert into public.transactional_outbox (
    organisation_id, topic, aggregate_type, aggregate_id, payload
  ) values (
    p_organisation_id, 'platform.beta_member.provisioned', 'internal_user', v_internal_user_id,
    jsonb_build_object('auth_user_id', p_auth_user_id, 'operating_location_id', p_operating_location_id)
  );

  return jsonb_build_object(
    'organisation_id', p_organisation_id,
    'operating_location_id', p_operating_location_id,
    'internal_user_id', v_internal_user_id,
    'membership_id', v_membership_id,
    'already_provisioned', false
  );
end;
$$;

revoke all on function public.ftf_provision_production_beta_member(uuid, uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.ftf_provision_production_beta_member(uuid, uuid, text, uuid)
  to service_role;
