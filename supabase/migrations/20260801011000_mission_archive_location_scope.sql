-- Forward-only hardening: mission archives require an active assignment to the
-- mission's active operating location inside the trusted write transaction.

alter function public.ftf_write_operational_resource(uuid, uuid, text, text, uuid, integer, jsonb)
  rename to ftf_write_operational_resource_before_mission_archive_location_scope;

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
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext(p_organisation_id::text)::bigint);
  perform public.ftf_lock_active_organisation(p_organisation_id);
  if not public.ftf_actor_has_active_beta_seat(p_organisation_id, p_actor_internal_user_id) then
    raise exception 'active organisation actor seat required' using errcode = '42501';
  end if;

  if p_resource = 'missions' and p_operation = 'archive' then
    perform 1
    from public.missions mission
    join public.operating_locations location
      on location.organisation_id = mission.organisation_id
     and location.id = mission.operating_location_id
     and location.archived_at is null
    join public.membership_operating_location_assignments assignment
      on assignment.organisation_id = mission.organisation_id
     and assignment.operating_location_id = mission.operating_location_id
     and assignment.is_active = true
     and assignment.archived_at is null
    join public.memberships membership
      on membership.organisation_id = assignment.organisation_id
     and membership.id = assignment.membership_id
     and membership.internal_user_id = p_actor_internal_user_id
     and membership.is_active = true
     and membership.archived_at is null
    where mission.organisation_id = p_organisation_id
      and mission.id = p_entity_id
      and mission.archived_at is null
    for update of mission, location, assignment, membership;
    if not found then
      return jsonb_build_object('not_found', true);
    end if;
  end if;

  return public.ftf_write_operational_resource_before_mission_archive_location_scope(
    p_organisation_id, p_actor_internal_user_id, p_resource, p_operation,
    p_entity_id, p_expected_version, p_data
  );
end;
$$;

revoke all on function public.ftf_write_operational_resource_before_mission_archive_location_scope(uuid, uuid, text, text, uuid, integer, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.ftf_write_operational_resource(uuid, uuid, text, text, uuid, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.ftf_write_operational_resource(uuid, uuid, text, text, uuid, integer, jsonb)
  to service_role;
