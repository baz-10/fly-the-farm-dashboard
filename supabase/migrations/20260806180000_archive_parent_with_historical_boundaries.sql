-- IMP-OPS-001: immutable Field boundary revisions are historical evidence, not
-- active operational dependants. Once Fields and Jobs are archived, retaining
-- those revisions must not prevent the parent Property from being archived.

alter function public.ftf_write_operational_resource(uuid,uuid,text,text,uuid,integer,jsonb)
  rename to ftf_write_operational_resource_before_historical_boundary_archive;

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
declare
  v_result jsonb;
  v_record jsonb;
begin
  v_result := public.ftf_write_operational_resource_before_historical_boundary_archive(
    p_organisation_id,
    p_actor_internal_user_id,
    p_resource,
    p_operation,
    p_entity_id,
    p_expected_version,
    p_data
  );

  if p_resource <> 'properties'
    or p_operation <> 'archive'
    or coalesce((v_result->>'archive_conflict')::boolean, false) is not true then
    return v_result;
  end if;

  -- The previous authoritative writer has already validated the actor,
  -- organisation, entity, row version and lock protocol. Preserve the conflict
  -- whenever a genuinely active operational child still exists.
  if exists (
      select 1 from public.fields
       where organisation_id = p_organisation_id
         and property_id = p_entity_id
         and archived_at is null
    ) or exists (
      select 1 from public.jobs
       where organisation_id = p_organisation_id
         and property_id = p_entity_id
         and archived_at is null
    ) then
    return v_result;
  end if;

  update public.properties p
     set archived_at = now(),
         archived_by_internal_user_id = p_actor_internal_user_id
   where p.organisation_id = p_organisation_id
     and p.id = p_entity_id
     and p.row_version = p_expected_version
     and p.archived_at is null
  returning to_jsonb(p) into v_record;

  if v_record is null then return v_result; end if;

  insert into public.audit_events (
    organisation_id, actor_internal_user_id, event_type, entity_type, entity_id, event_payload
  ) values (
    p_organisation_id, p_actor_internal_user_id, 'properties.archive', 'properties', p_entity_id,
    jsonb_build_object('record', v_record, 'retainedHistoricalBoundaryEvidence', true)
  );
  insert into public.transactional_outbox (
    organisation_id, topic, aggregate_type, aggregate_id, payload
  ) values (
    p_organisation_id, 'operational.properties.archive', 'properties', p_entity_id,
    jsonb_build_object('record', v_record, 'retainedHistoricalBoundaryEvidence', true)
  );

  return jsonb_build_object('record', v_record);
end;
$$;

revoke all on function public.ftf_write_operational_resource_before_historical_boundary_archive(uuid,uuid,text,text,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.ftf_write_operational_resource_before_historical_boundary_archive(uuid,uuid,text,text,uuid,integer,jsonb) to service_role;
revoke all on function public.ftf_write_operational_resource(uuid,uuid,text,text,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.ftf_write_operational_resource(uuid,uuid,text,text,uuid,integer,jsonb) to service_role;
