-- Atomic Job creation with a checked cross-Property Field scope. job_fields is
-- authoritative; jobs.property_id remains a first-Property compatibility view.
create function public.ftf_create_job_with_scope(
  p_organisation_id uuid,
  p_actor_internal_user_id uuid,
  p_data jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.jobs%rowtype;
  v_field_ids uuid[];
  v_field_count integer;
  v_distinct_field_count integer;
  v_valid_field_ids boolean;
  v_resolved_field_count integer := 0;
  v_first_property_id uuid;
  v_property_ids uuid[] := '{}';
  v_field record;
  v_fields jsonb := '[]'::jsonb;
  v_reference text;
  v_is_acceptance boolean;
begin
  perform pg_advisory_xact_lock(hashtext(p_organisation_id::text)::bigint);

  if not public.ftf_actor_has_permission(
    p_organisation_id, p_actor_internal_user_id, 'jobs.create'
  ) then
    return jsonb_build_object('forbidden', true);
  end if;
  if not public.ftf_actor_has_active_beta_seat(p_organisation_id, p_actor_internal_user_id) then
    return jsonb_build_object('forbidden', true);
  end if;
  select exists(
    select 1
    from public.memberships membership
    join public.roles role
      on role.organisation_id = membership.organisation_id
     and role.id = membership.role_id
    where membership.organisation_id = p_organisation_id
      and membership.internal_user_id = p_actor_internal_user_id
      and membership.is_active
      and membership.archived_at is null
      and role.code = 'production_beta_acceptance'
      and role.archived_at is null
  ) into v_is_acceptance;
  if v_is_acceptance and not starts_with(coalesce(p_data->>'scope', ''), 'SC ACCEPTANCE —') then
    return jsonb_build_object('forbidden', true);
  end if;
  if jsonb_typeof(p_data->'field_ids') <> 'array'
    or jsonb_array_length(p_data->'field_ids') = 0 then
    return jsonb_build_object('error', 'JOB_SCOPE_EMPTY');
  end if;

  select
    count(*)::integer,
    count(distinct requested.raw_id)::integer,
    bool_and(requested.raw_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
  into v_field_count, v_distinct_field_count, v_valid_field_ids
  from jsonb_array_elements_text(p_data->'field_ids') with ordinality as requested(raw_id, ordinality);
  if not coalesce(v_valid_field_ids, false) then
    return jsonb_build_object('error', 'JOB_SCOPE_FIELD_INVALID');
  end if;
  if v_field_count > 100 then
    return jsonb_build_object('error', 'JOB_SCOPE_FIELD_LIMIT');
  end if;
  if v_field_count <> v_distinct_field_count then
    return jsonb_build_object('error', 'JOB_SCOPE_FIELD_DUPLICATE');
  end if;
  select array_agg(requested.raw_id::uuid order by requested.ordinality)
  into v_field_ids
  from jsonb_array_elements_text(p_data->'field_ids') with ordinality as requested(raw_id, ordinality);

  perform 1
  from public.clients
  where organisation_id = p_organisation_id
    and id = (p_data->>'client_id')::uuid
    and archived_at is null
  for update;
  if not found then
    return jsonb_build_object('error', 'JOB_SCOPE_CLIENT_MISMATCH');
  end if;

  for v_field in
    select requested.ordinality, field.id, field.property_id, property.client_id
    from unnest(v_field_ids) with ordinality as requested(field_id, ordinality)
    join public.fields field
      on field.organisation_id = p_organisation_id
     and field.id = requested.field_id
     and field.archived_at is null
    join public.properties property
      on property.organisation_id = field.organisation_id
     and property.id = field.property_id
     and property.archived_at is null
    order by requested.ordinality
    for update of field, property
  loop
    v_resolved_field_count := v_resolved_field_count + 1;
    if v_field.client_id <> (p_data->>'client_id')::uuid then
      return jsonb_build_object('error', 'JOB_SCOPE_CLIENT_MISMATCH');
    end if;
    if v_first_property_id is null then v_first_property_id := v_field.property_id; end if;
    if not v_field.property_id = any(v_property_ids) then
      v_property_ids := array_append(v_property_ids, v_field.property_id);
    end if;
    v_fields := v_fields || jsonb_build_array(jsonb_build_object(
      'id', v_field.id,
      'property_id', v_field.property_id
    ));
  end loop;
  if v_resolved_field_count <> v_field_count then
    return jsonb_build_object('error', 'JOB_SCOPE_FIELD_NOT_FOUND');
  end if;

  if coalesce((p_data->>'auto_generate_reference')::boolean, false) then
    v_reference := public.ftf_allocate_operational_reference(p_organisation_id, 'job');
  else
    v_reference := p_data->>'reference';
  end if;

  insert into public.jobs (
    organisation_id, client_id, property_id, reference, scope, status,
    notes, requested_date, scheduled_date
  ) values (
    p_organisation_id, (p_data->>'client_id')::uuid, v_first_property_id,
    v_reference, p_data->>'scope', coalesce(p_data->>'status', 'draft'),
    coalesce(p_data->>'notes', ''), nullif(p_data->>'requested_date', '')::date,
    nullif(p_data->>'scheduled_date', '')::date
  ) returning * into v_job;

  insert into public.job_fields (organisation_id, property_id, job_id, field_id)
  select p_organisation_id, field.property_id, v_job.id, field.id
  from jsonb_to_recordset(v_fields) as field(id uuid, property_id uuid);

  insert into public.audit_events (
    organisation_id, actor_internal_user_id, event_type, entity_type, entity_id, event_payload
  ) values (
    p_organisation_id, p_actor_internal_user_id, 'jobs.create', 'jobs', v_job.id,
    jsonb_build_object('job_id', v_job.id, 'field_ids', to_jsonb(v_field_ids), 'property_ids', to_jsonb(v_property_ids))
  );
  insert into public.transactional_outbox (
    organisation_id, topic, aggregate_type, aggregate_id, payload
  ) values (
    p_organisation_id, 'operational.jobs.create', 'jobs', v_job.id,
    jsonb_build_object('job_id', v_job.id, 'field_ids', to_jsonb(v_field_ids), 'property_ids', to_jsonb(v_property_ids))
  );

  return jsonb_build_object(
    'record', to_jsonb(v_job) || jsonb_build_object(
      'field_ids', to_jsonb(v_field_ids),
      'property_ids', to_jsonb(v_property_ids)
    ),
    'fields', v_fields
  );
end;
$$;

revoke all on function public.ftf_create_job_with_scope(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.ftf_create_job_with_scope(uuid, uuid, jsonb)
  to service_role;
