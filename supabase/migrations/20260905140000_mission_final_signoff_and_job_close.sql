-- Multi-day Mission finality extends the canonical immutable completion stream.
-- Daily Fleet readings remain owned by the signed-day command; this boundary
-- freezes their exact sources and publishes one idempotent Financial source.

alter table public.mission_completion_revisions
  add column daily_evidence_manifest jsonb,
  add column daily_evidence_digest text,
  add constraint mission_completion_daily_manifest_shape
    check ((daily_evidence_manifest is null and daily_evidence_digest is null)
      or (jsonb_typeof(daily_evidence_manifest) = 'object'
        and daily_evidence_digest ~ '^[a-f0-9]{64}$'));

create table public.mission_final_projection_sources (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  operating_location_id uuid not null,
  mission_id uuid not null,
  completion_revision_id uuid not null,
  projection_type text not null check (projection_type in ('FLEET', 'FINANCIAL')),
  source_digest text not null check (source_digest ~ '^[a-f0-9]{64}$'),
  source_manifest jsonb not null check (jsonb_typeof(source_manifest) = 'object'),
  created_at timestamptz not null default now(),
  unique (organisation_id, id),
  unique (organisation_id, completion_revision_id, projection_type),
  foreign key (organisation_id, mission_id) references public.missions (organisation_id, id),
  foreign key (organisation_id, completion_revision_id) references public.mission_completion_revisions (organisation_id, id),
  foreign key (organisation_id, operating_location_id) references public.operating_locations (organisation_id, id)
);

alter table public.mission_final_projection_sources enable row level security;
alter table public.mission_final_projection_sources force row level security;
create policy mission_final_projection_sources_tenant_read on public.mission_final_projection_sources
  for select to authenticated using (public.current_user_has_organisation_access(organisation_id));
revoke all on table public.mission_final_projection_sources from public, anon, authenticated, service_role;
create trigger mission_final_projection_sources_immutable before update or delete on public.mission_final_projection_sources
  for each row execute function public.reject_append_only_mutation();

create function public.ftf_build_mission_daily_evidence_manifest(
  p_organisation_id uuid, p_mission_id uuid
) returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'schemaVersion', 1,
    'missionId', p_mission_id,
    'operationalDays', count(distinct day.work_date) filter (
      where extract(epoch from (day.actual_finished_at - day.actual_started_at)) / 3600 > 0
    ),
    'actualWorkHours', coalesce(sum(extract(epoch from (day.actual_finished_at - day.actual_started_at)) / 3600), 0)::numeric(10,4)::text,
    'totalAircraftHours', coalesce((select sum(actual.total_flight_hours) from public.mission_aircraft_day_actuals actual
      where actual.organisation_id = p_organisation_id and actual.mission_id = p_mission_id and actual.signed_off_at is not null), 0)::numeric(10,4)::text,
    'days', coalesce(jsonb_agg(jsonb_build_object(
      'id', day.id, 'workDate', day.work_date::text, 'timezone', day.timezone,
      'state', day.state, 'packageRevisionId', day.mission_pack_revision_id,
      'jsaRevisionId', day.jsa_revision_id, 'startedAt', day.actual_started_at,
      'finishedAt', day.actual_finished_at,
      'jsaReview', (select to_jsonb(review) - 'organisation_id' from public.mission_day_jsa_reviews review
        where review.organisation_id = day.organisation_id and review.mission_id = day.mission_id
          and review.operating_day_id = day.id and review.jsa_revision_id = day.jsa_revision_id),
      'fieldActivities', (select coalesce(jsonb_agg(to_jsonb(activity) - 'organisation_id' order by activity.field_id), '[]'::jsonb)
        from public.mission_day_field_activity activity where activity.organisation_id = day.organisation_id
          and activity.mission_id = day.mission_id and activity.operating_day_id = day.id),
      'aircraftActuals', (select coalesce(jsonb_agg((to_jsonb(actual) - 'organisation_id') || jsonb_build_object(
          'flights', (select coalesce(jsonb_agg(to_jsonb(flight) - 'organisation_id' order by flight.flight_index), '[]'::jsonb)
            from public.mission_flight_actuals flight where flight.organisation_id = actual.organisation_id
              and flight.aircraft_day_actual_id = actual.id)) order by actual.aircraft_id), '[]'::jsonb)
        from public.mission_aircraft_day_actuals actual where actual.organisation_id = day.organisation_id
          and actual.mission_id = day.mission_id and actual.operating_day_id = day.id),
      'chemicalActual', (select (to_jsonb(chemical) - 'organisation_id') || jsonb_build_object(
          'lines', (select coalesce(jsonb_agg(to_jsonb(line) - 'organisation_id' order by line.line_number), '[]'::jsonb)
            from public.mission_day_chemical_lines line where line.organisation_id = chemical.organisation_id and line.revision_id = chemical.id))
        from public.mission_day_chemical_revisions chemical where chemical.organisation_id = day.organisation_id
          and chemical.mission_id = day.mission_id and chemical.operating_day_id = day.id
        order by chemical.revision_number desc limit 1),
      'weatherReport', (select to_jsonb(weather) - 'organisation_id' from public.mission_day_weather_reports weather
        where weather.organisation_id = day.organisation_id and weather.mission_id = day.mission_id
          and weather.operating_day_id = day.id),
      'flightLineAttributions', (select coalesce(jsonb_agg(to_jsonb(attribution) - 'organisation_id' order by attribution.operational_import_id), '[]'::jsonb)
        from public.mission_operational_import_attributions attribution where attribution.organisation_id = day.organisation_id
          and attribution.mission_id = day.mission_id and attribution.operating_day_id = day.id)
    ) order by day.work_date, day.id), '[]'::jsonb)
  )
  from public.mission_operating_days day
  where day.organisation_id = p_organisation_id and day.mission_id = p_mission_id
$$;

create function public.ftf_mission_final_signoff_blockers(
  p_organisation_id uuid, p_mission_id uuid
) returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_blockers jsonb := '[]'::jsonb; v_day public.mission_operating_days%rowtype;
begin
  if not exists (select 1 from public.mission_operating_days where organisation_id=p_organisation_id and mission_id=p_mission_id) then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','MISSION_DAY_INCOMPLETE','message','No operating days have been recorded.'));
  end if;
  for v_day in select * from public.mission_operating_days where organisation_id=p_organisation_id and mission_id=p_mission_id order by work_date,id loop
    if v_day.state <> 'SIGNED_OFF' then v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','MISSION_DAY_INCOMPLETE','message',v_day.work_date::text||': operating work is not signed off.')); end if;
    if exists (select 1 from public.mission_day_field_activity activity where activity.organisation_id=p_organisation_id
      and activity.mission_id=p_mission_id and activity.operating_day_id=v_day.id and activity.status not in ('COMPLETED','NOT_WORKED')) then
      v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','MISSION_DAY_INCOMPLETE','message',v_day.work_date::text||': Field activity remains incomplete.'));
    end if;
    if not exists (select 1 from public.mission_day_jsa_reviews r where r.organisation_id=p_organisation_id and r.mission_id=p_mission_id and r.operating_day_id=v_day.id and r.jsa_revision_id=v_day.jsa_revision_id and r.outcome='CONDITIONS_COVERED') then
      v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','MISSION_JSA_REVIEW_REQUIRED','message',v_day.work_date::text||': JSA review is incomplete.'));
    end if;
    if exists (select 1 from unnest(public.ftf_expected_mission_day_aircraft_ids(p_organisation_id,p_mission_id,v_day.id)) expected(id)
      where not exists (select 1 from public.mission_aircraft_day_actuals a where a.organisation_id=p_organisation_id and a.operating_day_id=v_day.id and a.aircraft_id=expected.id and a.signed_off_at is not null)) then
      v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','MISSION_AIRCRAFT_DAY_REQUIRED','message',v_day.work_date::text||': aircraft totals are incomplete.'));
    end if;
    if exists (select 1 from public.mission_aircraft_day_actuals a where a.organisation_id=p_organisation_id and a.operating_day_id=v_day.id and a.reconciliation_status='MISMATCH') then
      v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','MISSION_EVIDENCE_UNRECONCILED','message',v_day.work_date::text||': aircraft totals do not reconcile.'));
    end if;
    if public.ftf_mission_day_planned_chemical_revision_id(p_organisation_id,p_mission_id,v_day.id) is not null and not exists
      (select 1 from public.mission_day_chemical_revisions c where c.organisation_id=p_organisation_id and c.mission_id=p_mission_id and c.operating_day_id=v_day.id) then
      v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','MISSION_DAY_CHEMICAL_REQUIRED','message',v_day.work_date::text||': chemical actuals are not confirmed.'));
    end if;
    if not exists (select 1 from public.mission_day_weather_reports w where w.organisation_id=p_organisation_id and w.mission_id=p_mission_id and w.operating_day_id=v_day.id) then
      v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','MISSION_DAY_WEATHER_REQUIRED','message',v_day.work_date::text||': actual weather evidence is missing.'));
    end if;
  end loop;
  if exists (select 1 from public.mission_pack_revisions p join public.missions m on m.organisation_id=p.organisation_id and m.id=p.mission_id
    where p.organisation_id=p_organisation_id and p.mission_id=p_mission_id and p.package_state in ('PREPARING','AWAITING_CRP_APPROVAL')
      and p.version_number > coalesce((select version_number from public.mission_pack_revisions e where e.organisation_id=m.organisation_id and e.id=m.current_authorised_pack_revision_id),0)) then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','MISSION_REAUTHORISATION_REQUIRED','message','A prospective material amendment is awaiting CRP authority.'));
  end if;
  if not exists (select 1 from public.mission_operational_revisions o where o.organisation_id=p_organisation_id and o.mission_id=p_mission_id) then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','MISSION_EVIDENCE_UNRECONCILED','message','Operational closeout evidence is incomplete.'));
  end if;
  return v_blockers;
end $$;

create function public.ftf_read_mission_final_signoff_readiness(
  p_organisation_id uuid, p_actor_internal_user_id uuid, p_mission_id uuid
) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_mission public.missions%rowtype; v_blockers jsonb; v_current integer;
begin
  if not public.ftf_actor_has_active_beta_seat(p_organisation_id,p_actor_internal_user_id)
    or not public.ftf_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'mission.operational.read') then return jsonb_build_object('forbidden',true); end if;
  select * into v_mission from public.missions where organisation_id=p_organisation_id and id=p_mission_id and archived_at is null;
  if not found then return jsonb_build_object('error','MISSION_NOT_FOUND'); end if;
  if not public.ftf_operational_location_allowed(p_organisation_id,p_actor_internal_user_id,v_mission.operating_location_id) then return jsonb_build_object('location_forbidden',true); end if;
  v_blockers := public.ftf_mission_final_signoff_blockers(p_organisation_id,p_mission_id);
  select coalesce(max(version_number),0) into v_current from public.mission_completion_revisions where organisation_id=p_organisation_id and mission_id=p_mission_id;
  return jsonb_build_object('mission_id',p_mission_id,'operational_work_completed',not exists(select 1 from public.mission_operating_days d where d.organisation_id=p_organisation_id and d.mission_id=p_mission_id and d.state not in ('COMPLETED','SIGNED_OFF')),
    'final_signed_off',exists(select 1 from public.mission_completion_revisions c where c.organisation_id=p_organisation_id and c.mission_id=p_mission_id and c.daily_evidence_digest is not null),
    'ready_for_final_signoff',jsonb_array_length(v_blockers)=0 and not exists(select 1 from public.mission_completion_revisions c where c.organisation_id=p_organisation_id and c.mission_id=p_mission_id and c.daily_evidence_digest is not null),
    'current_completion_revision',v_current,'blockers',v_blockers);
end $$;

create function public.ftf_final_signoff_mission(
  p_organisation_id uuid, p_actor_internal_user_id uuid, p_mission_id uuid,
  p_expected_revision integer, p_declaration text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_mission public.missions%rowtype; v_job public.jobs%rowtype; v_pack public.mission_pack_revisions%rowtype;
  v_auth public.mission_authorisation_revisions%rowtype; v_operational public.mission_operational_revisions%rowtype;
  v_completion public.mission_completion_revisions%rowtype; v_manifest jsonb; v_digest text; v_blockers jsonb; v_current integer;
begin
  perform public.ftf_lock_active_organisation(p_organisation_id);
  perform public.ftf_lock_mission_package_aggregate(p_organisation_id,p_mission_id);
  if not public.ftf_actor_has_active_beta_seat(p_organisation_id,p_actor_internal_user_id)
    or not public.ftf_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'mission.completion.complete') then return jsonb_build_object('forbidden',true); end if;
  select * into v_mission from public.missions where organisation_id=p_organisation_id and id=p_mission_id and archived_at is null for update;
  if not found then return jsonb_build_object('error','MISSION_NOT_FOUND'); end if;
  if not public.ftf_operational_location_allowed(p_organisation_id,p_actor_internal_user_id,v_mission.operating_location_id) then return jsonb_build_object('location_forbidden',true); end if;
  select * into v_pack from public.mission_pack_revisions where organisation_id=p_organisation_id and mission_id=p_mission_id and id=v_mission.current_authorised_pack_revision_id for update;
  perform 1 from public.mission_operating_days where organisation_id=p_organisation_id and mission_id=p_mission_id order by work_date,id for update;
  select * into v_job from public.jobs where organisation_id=p_organisation_id and id=v_mission.job_id and archived_at is null for update;
  select coalesce(max(version_number),0) into v_current from public.mission_completion_revisions where organisation_id=p_organisation_id and mission_id=p_mission_id;
  if v_current > 0 then
    select * into v_completion from public.mission_completion_revisions where organisation_id=p_organisation_id and mission_id=p_mission_id and version_number=v_current;
    if v_completion.daily_evidence_digest is not null and v_completion.declaration=p_declaration
      and p_expected_revision in (v_current,v_current-1) then
      return jsonb_build_object('record',to_jsonb(v_completion),'idempotent',true);
    end if;
  end if;
  if p_expected_revision is null or p_expected_revision <> v_current then return jsonb_build_object('error','MISSION_COMPLETION_VERSION_CONFLICT','current_version',v_current); end if;
  if p_declaration is null or p_declaration<>btrim(p_declaration) or length(p_declaration) not between 1 and 2000 then return jsonb_build_object('error','MISSION_FINAL_DECLARATION_INVALID'); end if;
  v_blockers := public.ftf_mission_final_signoff_blockers(p_organisation_id,p_mission_id);
  if jsonb_array_length(v_blockers)>0 then return jsonb_build_object('error',(v_blockers->0->>'code'),'readiness',jsonb_build_object('blockers',v_blockers)); end if;
  select * into v_auth from public.mission_authorisation_revisions where organisation_id=p_organisation_id and mission_id=p_mission_id and mission_pack_revision_id=v_pack.id and decision='AUTHORISED' order by version_number desc limit 1;
  select * into v_operational from public.mission_operational_revisions where organisation_id=p_organisation_id and mission_id=p_mission_id order by version_number desc limit 1;
  v_manifest := public.ftf_build_mission_daily_evidence_manifest(p_organisation_id,p_mission_id);
  v_digest := encode(digest(convert_to(v_manifest::text,'UTF8'),'sha256'),'hex');
  insert into public.mission_completion_revisions(organisation_id,operating_location_id,mission_id,version_number,authorisation_revision_id,operational_revision_id,completion_snapshot,declaration,completed_by_internal_user_id,daily_evidence_manifest,daily_evidence_digest)
  values(p_organisation_id,v_mission.operating_location_id,p_mission_id,v_current+1,v_auth.id,v_operational.id,
    jsonb_build_object('schemaVersion',2,'planningAndPreflightAuthorisation',to_jsonb(v_auth),'operationalEvidence',to_jsonb(v_operational),'dailyEvidenceDigest',v_digest,'completedAt',now()),
    p_declaration,p_actor_internal_user_id,v_manifest,v_digest) returning * into v_completion;
  insert into public.mission_final_projection_sources(organisation_id,operating_location_id,mission_id,completion_revision_id,projection_type,source_digest,source_manifest)
    values(p_organisation_id,v_mission.operating_location_id,p_mission_id,v_completion.id,'FLEET',v_digest,jsonb_build_object('dailyEvidenceDigest',v_digest,'days',v_manifest->'days')),
      (p_organisation_id,v_mission.operating_location_id,p_mission_id,v_completion.id,'FINANCIAL',v_digest,jsonb_build_object('dailyEvidenceDigest',v_digest,'operationalDays',v_manifest->'operationalDays','actualWorkHours',v_manifest->'actualWorkHours','totalAircraftHours',v_manifest->'totalAircraftHours'))
    on conflict (organisation_id,completion_revision_id,projection_type) do nothing;
  update public.missions set status='completed',row_version=row_version+1,updated_at=now() where organisation_id=p_organisation_id and id=p_mission_id;
  update public.jobs set status='completion_review',row_version=row_version+1,updated_at=now() where organisation_id=p_organisation_id and id=v_job.id and lower(status)<>'closed';
  insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload) values
    (p_organisation_id,p_actor_internal_user_id,'mission.final_signed_off','mission',p_mission_id,jsonb_build_object('completion_revision_id',v_completion.id,'version',v_completion.version_number,'daily_evidence_digest',v_digest));
  insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload) values
    (p_organisation_id,'completion.mission.final_signed_off','mission',p_mission_id,jsonb_build_object('completion_revision_id',v_completion.id,'version',v_completion.version_number,'daily_evidence_digest',v_digest));
  return jsonb_build_object('record',to_jsonb(v_completion));
end $$;

create function public.ftf_close_job(
  p_organisation_id uuid,p_actor_internal_user_id uuid,p_job_id uuid,p_expected_version integer
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_job public.jobs%rowtype; v_mission record;
begin
  perform public.ftf_lock_active_organisation(p_organisation_id);
  select * into v_job from public.jobs where organisation_id=p_organisation_id and id=p_job_id and archived_at is null for update;
  if not found then return jsonb_build_object('error','JOB_NOT_FOUND'); end if;
  if not public.ftf_actor_has_active_beta_seat(p_organisation_id,p_actor_internal_user_id)
    or not public.ftf_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'jobs.write') then return jsonb_build_object('forbidden',true); end if;
  if not exists(select 1 from public.missions where organisation_id=p_organisation_id and job_id=p_job_id and archived_at is null) then return jsonb_build_object('error','JOB_MISSIONS_REQUIRED'); end if;
  if exists(select 1 from public.missions m where m.organisation_id=p_organisation_id and m.job_id=p_job_id and m.archived_at is null
    and not public.ftf_operational_location_allowed(p_organisation_id,p_actor_internal_user_id,m.operating_location_id)) then return jsonb_build_object('location_forbidden',true); end if;
  if p_expected_version is null or v_job.row_version<>p_expected_version then return jsonb_build_object('error','JOB_VERSION_CONFLICT','current_version',v_job.row_version); end if;
  for v_mission in select id from public.missions where organisation_id=p_organisation_id and job_id=p_job_id and archived_at is null and lower(status) not in ('cancelled','canceled') order by id for update loop null; end loop;
  if exists(select 1 from public.missions m where m.organisation_id=p_organisation_id and m.job_id=p_job_id and m.archived_at is null and lower(m.status) not in ('cancelled','canceled')
    and not exists(select 1 from public.mission_completion_revisions c where c.organisation_id=m.organisation_id and c.mission_id=m.id and c.daily_evidence_digest is not null)) then
    return jsonb_build_object('error','JOB_MISSIONS_NOT_SIGNED_OFF'); end if;
  update public.jobs set status='closed',row_version=row_version+1,updated_at=now() where organisation_id=p_organisation_id and id=p_job_id returning * into v_job;
  insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload) values(p_organisation_id,p_actor_internal_user_id,'job.closed','job',p_job_id,jsonb_build_object('version',v_job.row_version));
  insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload) values(p_organisation_id,'job.closed','job',p_job_id,jsonb_build_object('version',v_job.row_version));
  return jsonb_build_object('record',to_jsonb(v_job),'state','JOB_CLOSED');
end $$;

-- Preserve the established single-closeout proposal and augment only canonical
-- multi-day completions. The immutable completion remains the source of truth.
alter function public.ftf_financial_actual_operational_proposal(uuid,uuid,uuid)
  rename to ftf_financial_actual_operational_proposal_single_closeout;
create or replace function public.ftf_financial_actual_operational_proposal(
  p_organisation_id uuid,p_actor_internal_user_id uuid,p_financial_actual_id uuid
) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_base jsonb; v_completion public.mission_completion_revisions%rowtype; v_fact jsonb; v_facts jsonb; v_projection jsonb;
begin
  v_base := public.ftf_financial_actual_operational_proposal_single_closeout(p_organisation_id,p_actor_internal_user_id,p_financial_actual_id);
  if v_base is null or v_base ? 'not_found' or v_base ? 'source_unavailable' then return v_base; end if;
  select c.* into v_completion from public.financial_actuals a join public.mission_completion_revisions c
    on c.organisation_id=a.organisation_id and c.mission_id=a.mission_id
    where a.organisation_id=p_organisation_id and a.id=p_financial_actual_id and c.daily_evidence_digest is not null
    order by c.version_number desc limit 1;
  if not found then return v_base; end if;
  v_facts := coalesce(v_base->'facts','[]'::jsonb);
  for v_fact in select value from jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('fieldPath','operations/operationalDays','value',v_completion.daily_evidence_manifest->>'operationalDays','unitCode','DAY'),
    jsonb_build_object('fieldPath','operations/totalHours','value',v_completion.daily_evidence_manifest->>'actualWorkHours','unitCode','HOUR'),
    jsonb_build_object('fieldPath','operational/aircraft/totalHours','value',v_completion.daily_evidence_manifest->>'totalAircraftHours','unitCode','HOUR')
  )) loop
    v_fact := v_fact || jsonb_build_object('sourceClass','AUTHORITATIVE_OPERATIONAL_INPUT','sourceEntityType','mission_completion_revision','sourceEntityId',v_completion.id,
      'sourceVersion',v_completion.version_number::text,'sourceRecordedAt',v_completion.completed_at,'comparison','NEW_SOURCE_EVIDENCE',
      'evidenceIdentity',encode(digest(convert_to(jsonb_build_object('fieldPath',v_fact->>'fieldPath','sourceEntityId',v_completion.id,'sourceVersion',v_completion.version_number::text,'value',v_fact->>'value','unitCode',v_fact->>'unitCode')::text,'UTF8'),'sha256'),'hex'));
    v_facts := v_facts || jsonb_build_array(v_fact);
  end loop;
  v_projection := jsonb_set(v_base,'{facts}',v_facts);
  v_projection := jsonb_set(v_projection,'{proposalDigest}',to_jsonb(encode(digest(convert_to((v_projection-'proposalDigest')::text,'UTF8'),'sha256'),'hex')));
  return v_projection;
end $$;

-- ALTER FUNCTION preserves the original ACL on the renamed implementation, while
-- a newly created function would otherwise inherit PostgreSQL's PUBLIC EXECUTE.
-- Keep both layers private and expose only the checked server-side wrapper.
revoke all on function public.ftf_financial_actual_operational_proposal_single_closeout(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.ftf_financial_actual_operational_proposal(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.ftf_financial_actual_operational_proposal(uuid,uuid,uuid) to service_role;

revoke all on function public.ftf_build_mission_daily_evidence_manifest(uuid,uuid), public.ftf_mission_final_signoff_blockers(uuid,uuid),
  public.ftf_read_mission_final_signoff_readiness(uuid,uuid,uuid), public.ftf_final_signoff_mission(uuid,uuid,uuid,integer,text),
  public.ftf_close_job(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.ftf_read_mission_final_signoff_readiness(uuid,uuid,uuid),
  public.ftf_final_signoff_mission(uuid,uuid,uuid,integer,text), public.ftf_close_job(uuid,uuid,uuid,integer) to service_role;
