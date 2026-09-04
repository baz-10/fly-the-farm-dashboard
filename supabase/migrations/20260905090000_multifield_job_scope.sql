-- Checked cross-Property Job scope authority. public.job_fields remains the
-- sole Job-to-Field relation; jobs.property_id is a legacy first-Property
-- compatibility projection only.

-- The foundation composite parent required every Job Field to share the
-- compatibility projection. Keep public.job_fields, but bind it to the Job
-- aggregate directly so a single Client's Properties can coexist in scope.
alter table public.job_fields
  drop constraint job_fields_organisation_id_property_id_job_id_fkey;
alter table public.job_fields
  add constraint job_fields_job_fk
  foreign key (organisation_id, job_id) references public.jobs (organisation_id, id);

create function public.ftf_write_job_scope(
  p_organisation_id uuid,
  p_actor_internal_user_id uuid,
  p_job_id uuid,
  p_expected_version integer,
  p_field_ids jsonb
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
  v_record jsonb;
  v_fields jsonb := '[]'::jsonb;
begin
  -- One organisation-scoped lock orders the aggregate and all parent locks.
  perform pg_advisory_xact_lock(hashtext(p_organisation_id::text)::bigint);

  if not public.ftf_actor_has_active_beta_seat(p_organisation_id, p_actor_internal_user_id) then
    raise exception 'active organisation actor seat required' using errcode = '42501';
  end if;

  select * into v_job
  from public.jobs
  where organisation_id = p_organisation_id
    and id = p_job_id
    and archived_at is null
  for update;
  if not found then
    return jsonb_build_object('error', 'JOB_SCOPE_NOT_FOUND');
  end if;
  if p_expected_version is null or p_expected_version < 1 or v_job.row_version <> p_expected_version then
    return jsonb_build_object(
      'error', 'JOB_SCOPE_VERSION_CONFLICT',
      'current_version', v_job.row_version
    );
  end if;
  if jsonb_typeof(p_field_ids) <> 'array' or jsonb_array_length(p_field_ids) = 0 then
    return jsonb_build_object('error', 'JOB_SCOPE_EMPTY');
  end if;

  select
    count(*)::integer,
    count(distinct requested.raw_id)::integer,
    bool_and(requested.raw_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
  into v_field_count, v_distinct_field_count, v_valid_field_ids
  from jsonb_array_elements_text(p_field_ids) with ordinality as requested(raw_id, ordinality);
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
  from jsonb_array_elements_text(p_field_ids) with ordinality as requested(raw_id, ordinality);

  -- Resolve each requested Field through its active Property and Client under
  -- the same lock. The Job client cannot be broadened by a browser payload.
  for v_field in
    select requested.ordinality, f.id as field_id, p.id as property_id, c.id as client_id
    from unnest(v_field_ids) with ordinality as requested(field_id, ordinality)
    join public.fields f
      on f.organisation_id = p_organisation_id
     and f.id = requested.field_id
     and f.archived_at is null
    join public.properties p
      on p.organisation_id = f.organisation_id
     and p.id = f.property_id
     and p.archived_at is null
    join public.clients c
      on c.organisation_id = p.organisation_id
     and c.id = p.client_id
     and c.archived_at is null
    order by requested.ordinality
    for update of f, p, c
  loop
    v_resolved_field_count := v_resolved_field_count + 1;
    if v_field.client_id <> v_job.client_id then
      return jsonb_build_object('error', 'JOB_SCOPE_CLIENT_MISMATCH');
    end if;
    if v_first_property_id is null then v_first_property_id := v_field.property_id; end if;
    if not v_field.property_id = any(v_property_ids) then
      v_property_ids := array_append(v_property_ids, v_field.property_id);
    end if;
    v_fields := v_fields || jsonb_build_array(jsonb_build_object(
      'id', v_field.field_id,
      'property_id', v_field.property_id
    ));
  end loop;
  if v_resolved_field_count <> v_field_count then
    return jsonb_build_object('error', 'JOB_SCOPE_FIELD_NOT_FOUND');
  end if;

  update public.jobs
  set property_id = v_first_property_id,
      row_version = v_job.row_version + 1
  where organisation_id = p_organisation_id
    and id = p_job_id
    and row_version = p_expected_version
    and archived_at is null
  returning to_jsonb(jobs) into v_record;
  if v_record is null then
    return jsonb_build_object('error', 'JOB_SCOPE_VERSION_CONFLICT');
  end if;

  -- Retain historical links as archived evidence and re-activate selected
  -- links; this reuses public.job_fields rather than introducing another join.
  update public.job_fields
  set archived_at = now(), archived_by_internal_user_id = p_actor_internal_user_id
  where organisation_id = p_organisation_id
    and job_id = p_job_id
    and archived_at is null
    and not (field_id = any(v_field_ids));

  insert into public.job_fields (organisation_id, property_id, job_id, field_id)
  select p_organisation_id, v_field.property_id, p_job_id, v_field.field_id
  from jsonb_to_recordset(v_fields) as v_field(id uuid, property_id uuid)
  on conflict (organisation_id, job_id, field_id) do update
    set property_id = excluded.property_id,
        archived_at = null,
        archived_by_internal_user_id = null;

  insert into public.audit_events (
    organisation_id, actor_internal_user_id, event_type, entity_type, entity_id, event_payload
  ) values (
    p_organisation_id, p_actor_internal_user_id, 'job.scope_changed', 'jobs', p_job_id,
    jsonb_build_object('job_id', p_job_id, 'field_ids', to_jsonb(v_field_ids), 'property_ids', to_jsonb(v_property_ids), 'row_version', v_record->'row_version')
  );
  insert into public.transactional_outbox (
    organisation_id, topic, aggregate_type, aggregate_id, payload
  ) values (
    p_organisation_id, 'operational.job.scope_changed', 'jobs', p_job_id,
    jsonb_build_object('job_id', p_job_id, 'field_ids', to_jsonb(v_field_ids), 'property_ids', to_jsonb(v_property_ids), 'row_version', v_record->'row_version')
  );

  return jsonb_build_object(
    'record', v_record || jsonb_build_object('field_ids', to_jsonb(v_field_ids), 'property_ids', to_jsonb(v_property_ids)),
    'fields', v_fields
  );
end;
$$;

revoke all on function public.ftf_write_job_scope(uuid, uuid, uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.ftf_write_job_scope(uuid, uuid, uuid, integer, jsonb) to service_role;
