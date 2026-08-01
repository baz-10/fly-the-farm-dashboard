-- Forward-only replacement making boundary migration issue resolution,
-- audit, and outbox inserts one atomic trusted command.

create or replace function public.ftf_record_boundary_migration_issue_resolution(
  p_organisation_id uuid,
  p_actor_internal_user_id uuid,
  p_issue_id uuid,
  p_resolution_details jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record jsonb;
  v_event_payload jsonb;
begin
  perform pg_advisory_xact_lock(hashtext(p_organisation_id::text)::bigint);
  perform public.ftf_lock_active_organisation(p_organisation_id);
  if not public.ftf_actor_has_active_beta_seat(p_organisation_id, p_actor_internal_user_id) then
    raise exception 'active organisation actor seat required' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_resolution_details, '{}'::jsonb)) <> 'object' then
    raise exception 'resolution details must be an object' using errcode = '22023';
  end if;
  perform 1
  from public.operational_migration_issues issue
  where issue.organisation_id = p_organisation_id
    and issue.id = p_issue_id
    and issue.source_entity_type = 'field_boundary_version'
  for share;
  if not found then
    return jsonb_build_object('not_found', true);
  end if;
  if exists (
    select 1 from public.boundary_migration_issue_resolutions resolution
    where resolution.organisation_id = p_organisation_id
      and resolution.issue_id = p_issue_id
  ) then
    return jsonb_build_object('conflict', true);
  end if;

  insert into public.boundary_migration_issue_resolutions (
    organisation_id, issue_id, resolved_by_internal_user_id, resolution_details
  ) values (
    p_organisation_id, p_issue_id, p_actor_internal_user_id,
    coalesce(p_resolution_details, '{}'::jsonb)
  ) returning to_jsonb(boundary_migration_issue_resolutions) into v_record;

  v_event_payload := jsonb_build_object('record', v_record, 'issue_id', p_issue_id);
  insert into public.audit_events (
    organisation_id, actor_internal_user_id, event_type,
    entity_type, entity_id, event_payload
  ) values (
    p_organisation_id, p_actor_internal_user_id,
    'boundary_migration_issue_resolutions.create',
    'boundary_migration_issue_resolutions', (v_record->>'id')::uuid,
    v_event_payload
  );
  insert into public.transactional_outbox (
    organisation_id, topic, aggregate_type, aggregate_id, payload
  ) values (
    p_organisation_id,
    'operational.boundary_migration_issue_resolutions.create',
    'boundary_migration_issue_resolutions', (v_record->>'id')::uuid,
    v_event_payload
  );

  return jsonb_build_object('record', v_record);
end;
$$;

revoke all on function public.ftf_record_boundary_migration_issue_resolution(uuid, uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.ftf_record_boundary_migration_issue_resolution(uuid, uuid, uuid, jsonb)
  to service_role;
