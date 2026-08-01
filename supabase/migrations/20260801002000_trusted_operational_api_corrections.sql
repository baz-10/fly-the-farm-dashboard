-- Corrective forward migration: browser table access must not bypass trusted API checks.
revoke all on table public.organisations from anon, authenticated;
revoke all on table public.operating_locations from anon, authenticated;
revoke all on table public.clients from anon, authenticated;
revoke all on table public.properties from anon, authenticated;
revoke all on table public.field_boundary_versions from anon, authenticated;
revoke all on table public.fields from anon, authenticated;
revoke all on table public.jobs from anon, authenticated;
revoke all on table public.job_fields from anon, authenticated;
revoke all on table public.missions from anon, authenticated;
revoke all on table public.mission_versions from anon, authenticated;

grant select, insert, update, delete on table public.organisations to service_role;
grant select, insert, update, delete on table public.operating_locations to service_role;
grant select, insert, update, delete on table public.clients to service_role;
grant select, insert, update, delete on table public.properties to service_role;
grant select, insert, update, delete on table public.field_boundary_versions to service_role;
grant select, insert, update, delete on table public.fields to service_role;
grant select, insert, update, delete on table public.jobs to service_role;
grant select, insert, update, delete on table public.job_fields to service_role;
grant select, insert, update, delete on table public.missions to service_role;
grant select, insert, update, delete on table public.mission_versions to service_role;

create or replace function public.ftf_write_operational_resource(
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
  v_current_version integer;
  v_archived_at timestamptz;
  v_record jsonb;
  v_table text;
begin
  if p_resource not in ('clients', 'properties', 'fields', 'jobs', 'missions')
    or p_operation not in ('create', 'update', 'archive') then
    raise exception 'unsupported operational resource write';
  end if;
  if not exists (
    select 1 from public.internal_users iu join public.memberships m
      on m.organisation_id = iu.organisation_id and m.internal_user_id = iu.id
    where iu.organisation_id = p_organisation_id and iu.id = p_actor_internal_user_id
      and iu.is_active and iu.archived_at is null and m.is_active and m.archived_at is null
  ) then
    raise exception 'active organisation actor required' using errcode = '42501';
  end if;

  v_table := p_resource;
  if p_operation <> 'create' then
    if p_entity_id is null or p_expected_version is null or p_expected_version < 1 then
      raise exception 'entity id and expected version are required';
    end if;
    execute format('select row_version, archived_at from public.%I where organisation_id = $1 and id = $2 for update', v_table)
      into v_current_version, v_archived_at using p_organisation_id, p_entity_id;
    if v_current_version is null or v_archived_at is not null then
      return jsonb_build_object('not_found', true);
    end if;
    if v_current_version <> p_expected_version then
      return jsonb_build_object('conflict', true, 'current_version', v_current_version);
    end if;
    if p_operation = 'archive' then
      if (p_resource = 'clients' and (exists (select 1 from public.properties where organisation_id = p_organisation_id and client_id = p_entity_id and archived_at is null) or exists (select 1 from public.jobs where organisation_id = p_organisation_id and client_id = p_entity_id and archived_at is null)))
       or (p_resource = 'properties' and (exists (select 1 from public.fields where organisation_id = p_organisation_id and property_id = p_entity_id and archived_at is null) or exists (select 1 from public.field_boundary_versions where organisation_id = p_organisation_id and property_id = p_entity_id and archived_at is null) or exists (select 1 from public.jobs where organisation_id = p_organisation_id and property_id = p_entity_id and archived_at is null)))
       or (p_resource = 'fields' and exists (select 1 from public.job_fields where organisation_id = p_organisation_id and field_id = p_entity_id and archived_at is null))
       or (p_resource = 'jobs' and (exists (select 1 from public.job_fields where organisation_id = p_organisation_id and job_id = p_entity_id and archived_at is null) or exists (select 1 from public.missions where organisation_id = p_organisation_id and job_id = p_entity_id and archived_at is null)))
       or (p_resource = 'missions' and exists (select 1 from public.mission_versions where organisation_id = p_organisation_id and mission_id = p_entity_id and archived_at is null)) then
        return jsonb_build_object('archive_conflict', true);
      end if;
    end if;
  end if;

  if p_operation = 'archive' then
    execute format('update public.%I set archived_at = now(), archived_by_internal_user_id = $1 where organisation_id = $2 and id = $3 and row_version = $4 and archived_at is null returning to_jsonb(%I)', v_table, v_table)
      into v_record using p_actor_internal_user_id, p_organisation_id, p_entity_id, p_expected_version;
  elsif p_resource = 'clients' and p_operation = 'create' then
    insert into public.clients (organisation_id, name, contact_name, contact_email, contact_phone) values (p_organisation_id, p_data->>'name', p_data->>'contact_name', p_data->>'contact_email', p_data->>'contact_phone') returning to_jsonb(clients) into v_record;
  elsif p_resource = 'clients' then
    update public.clients c set name = p_data->>'name', contact_name = p_data->>'contact_name', contact_email = p_data->>'contact_email', contact_phone = p_data->>'contact_phone' where c.organisation_id = p_organisation_id and c.id = p_entity_id and c.row_version = p_expected_version and c.archived_at is null returning to_jsonb(c) into v_record;
  elsif p_resource = 'properties' and p_operation = 'create' then
    insert into public.properties (organisation_id, client_id, name, address) values (p_organisation_id, (p_data->>'client_id')::uuid, p_data->>'name', p_data->>'address') returning to_jsonb(properties) into v_record;
  elsif p_resource = 'properties' then
    update public.properties p set client_id = (p_data->>'client_id')::uuid, name = p_data->>'name', address = p_data->>'address' where p.organisation_id = p_organisation_id and p.id = p_entity_id and p.row_version = p_expected_version and p.archived_at is null returning to_jsonb(p) into v_record;
  elsif p_resource = 'fields' and p_operation = 'create' then
    insert into public.fields (organisation_id, property_id, field_boundary_version_id, name, area_hectares) values (p_organisation_id, (p_data->>'property_id')::uuid, nullif(p_data->>'field_boundary_version_id', '')::uuid, p_data->>'name', nullif(p_data->>'area_hectares', '')::numeric) returning to_jsonb(fields) into v_record;
  elsif p_resource = 'fields' then
    update public.fields f set property_id = (p_data->>'property_id')::uuid, field_boundary_version_id = nullif(p_data->>'field_boundary_version_id', '')::uuid, name = p_data->>'name', area_hectares = nullif(p_data->>'area_hectares', '')::numeric where f.organisation_id = p_organisation_id and f.id = p_entity_id and f.row_version = p_expected_version and f.archived_at is null returning to_jsonb(f) into v_record;
  elsif p_resource = 'jobs' and p_operation = 'create' then
    insert into public.jobs (organisation_id, client_id, property_id, reference, status) values (p_organisation_id, (p_data->>'client_id')::uuid, (p_data->>'property_id')::uuid, p_data->>'reference', coalesce(p_data->>'status', 'draft')) returning to_jsonb(jobs) into v_record;
  elsif p_resource = 'jobs' then
    update public.jobs j set client_id = (p_data->>'client_id')::uuid, property_id = (p_data->>'property_id')::uuid, reference = p_data->>'reference', status = coalesce(p_data->>'status', 'draft') where j.organisation_id = p_organisation_id and j.id = p_entity_id and j.row_version = p_expected_version and j.archived_at is null returning to_jsonb(j) into v_record;
  elsif p_resource = 'missions' and p_operation = 'create' then
    if coalesce(lower(p_data->>'status'), 'planning') <> 'planning' then raise exception 'mission API writes may only create Planning records'; end if;
    insert into public.missions (organisation_id, job_id, operating_location_id, mission_number, status, scheduled_start_at) values (p_organisation_id, (p_data->>'job_id')::uuid, (p_data->>'operating_location_id')::uuid, p_data->>'mission_number', 'planning', nullif(p_data->>'scheduled_start_at', '')::timestamptz) returning to_jsonb(missions) into v_record;
  elsif p_resource = 'missions' then
    if coalesce(lower(p_data->>'status'), 'planning') <> 'planning' then raise exception 'mission API writes may only create Planning records'; end if;
    update public.missions m set job_id = (p_data->>'job_id')::uuid, operating_location_id = (p_data->>'operating_location_id')::uuid, mission_number = p_data->>'mission_number', status = 'planning', scheduled_start_at = nullif(p_data->>'scheduled_start_at', '')::timestamptz where m.organisation_id = p_organisation_id and m.id = p_entity_id and m.row_version = p_expected_version and m.archived_at is null returning to_jsonb(m) into v_record;
  end if;

  if v_record is null then
    execute format('select row_version, archived_at from public.%I where organisation_id = $1 and id = $2', v_table) into v_current_version, v_archived_at using p_organisation_id, p_entity_id;
    if v_current_version is null or v_archived_at is not null then return jsonb_build_object('not_found', true); end if;
    return jsonb_build_object('conflict', true, 'current_version', v_current_version);
  end if;
  insert into public.audit_events (organisation_id, actor_internal_user_id, event_type, entity_type, entity_id, event_payload) values (p_organisation_id, p_actor_internal_user_id, p_resource || '.' || p_operation, p_resource, (v_record->>'id')::uuid, jsonb_build_object('record', v_record));
  insert into public.transactional_outbox (organisation_id, topic, aggregate_type, aggregate_id, payload) values (p_organisation_id, 'operational.' || p_resource || '.' || p_operation, p_resource, (v_record->>'id')::uuid, jsonb_build_object('record', v_record));
  return jsonb_build_object('record', v_record);
end;
$$;

revoke all on function public.ftf_write_operational_resource(uuid, uuid, text, text, uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.ftf_write_operational_resource(uuid, uuid, text, text, uuid, integer, jsonb) to service_role;
