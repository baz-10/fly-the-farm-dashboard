create table public.mission_setup_drafts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  operating_location_id uuid references public.operating_locations(id),
  created_by_internal_user_id uuid not null references public.internal_users(id),
  current_step integer not null default 0 check (current_step between 0 and 9),
  furthest_step integer not null default 0 check (furthest_step between 0 and 9),
  client_id uuid references public.clients(id),
  property_id uuid references public.properties(id),
  field_id uuid references public.fields(id),
  job_id uuid references public.jobs(id),
  mission_id uuid references public.missions(id),
  form_state jsonb not null default '{}'::jsonb,
  row_version integer not null default 1 check (row_version > 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index mission_setup_drafts_active_idx on public.mission_setup_drafts(organisation_id, updated_at desc) where archived_at is null;
alter table public.mission_setup_drafts enable row level security;
alter table public.mission_setup_drafts force row level security;
create policy mission_setup_drafts_tenant_read on public.mission_setup_drafts for select to authenticated
  using (public.current_user_has_organisation_access(organisation_id));
revoke all on table public.mission_setup_drafts from public, anon, authenticated;
grant select, insert, update, delete on table public.mission_setup_drafts to service_role;

create function public.ftf_write_mission_setup_draft(
  p_organisation_id uuid,
  p_actor_internal_user_id uuid,
  p_operation text,
  p_draft_id uuid,
  p_expected_version integer,
  p_payload jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.mission_setup_drafts%rowtype; location_id uuid;
begin
  if p_operation in ('create','update') then
    location_id := nullif(p_payload->>'operatingLocationId','')::uuid;
    if location_id is not null and not exists(
      select 1 from public.memberships m join public.membership_operating_location_assignments a on a.organisation_id=m.organisation_id and a.membership_id=m.id
      where m.organisation_id=p_organisation_id and m.internal_user_id=p_actor_internal_user_id and m.is_active and m.archived_at is null and a.operating_location_id=location_id and a.is_active and a.archived_at is null
    ) then return jsonb_build_object('location_forbidden',true); end if;
    if (nullif(p_payload->>'clientId','') is not null and not exists(select 1 from public.clients where id=(p_payload->>'clientId')::uuid and organisation_id=p_organisation_id and archived_at is null))
      or (nullif(p_payload->>'propertyId','') is not null and not exists(select 1 from public.properties where id=(p_payload->>'propertyId')::uuid and organisation_id=p_organisation_id and archived_at is null))
      or (nullif(p_payload->>'fieldId','') is not null and not exists(select 1 from public.fields where id=(p_payload->>'fieldId')::uuid and organisation_id=p_organisation_id and archived_at is null))
      or (nullif(p_payload->>'jobId','') is not null and not exists(select 1 from public.jobs where id=(p_payload->>'jobId')::uuid and organisation_id=p_organisation_id and archived_at is null))
      or (nullif(p_payload->>'missionId','') is not null and not exists(select 1 from public.missions where id=(p_payload->>'missionId')::uuid and organisation_id=p_organisation_id and archived_at is null))
    then return jsonb_build_object('relationship_conflict',true); end if;
  end if;
  if p_operation = 'create' then
    insert into public.mission_setup_drafts(organisation_id,operating_location_id,created_by_internal_user_id,current_step,furthest_step,client_id,property_id,field_id,job_id,mission_id,form_state)
    values(p_organisation_id,location_id,p_actor_internal_user_id,coalesce((p_payload->>'currentStep')::integer,0),coalesce((p_payload->>'furthestStep')::integer,0),nullif(p_payload->>'clientId','')::uuid,nullif(p_payload->>'propertyId','')::uuid,nullif(p_payload->>'fieldId','')::uuid,nullif(p_payload->>'jobId','')::uuid,nullif(p_payload->>'missionId','')::uuid,coalesce(p_payload->'formState','{}')) returning * into d;
  elsif p_operation = 'update' then
    update public.mission_setup_drafts set
      operating_location_id=nullif(p_payload->>'operatingLocationId','')::uuid,
      current_step=(p_payload->>'currentStep')::integer, furthest_step=(p_payload->>'furthestStep')::integer,
      client_id=nullif(p_payload->>'clientId','')::uuid, property_id=nullif(p_payload->>'propertyId','')::uuid,
      field_id=nullif(p_payload->>'fieldId','')::uuid, job_id=nullif(p_payload->>'jobId','')::uuid,
      mission_id=nullif(p_payload->>'missionId','')::uuid, form_state=coalesce(p_payload->'formState','{}'),
      row_version=row_version+1, updated_at=now()
    where id=p_draft_id and organisation_id=p_organisation_id and archived_at is null and row_version=p_expected_version returning * into d;
    if not found then
      if exists(select 1 from public.mission_setup_drafts where id=p_draft_id and organisation_id=p_organisation_id and archived_at is null) then
        return jsonb_build_object('conflict',true,'current_version',(select row_version from public.mission_setup_drafts where id=p_draft_id));
      end if;
      return jsonb_build_object('not_found',true);
    end if;
  elsif p_operation = 'archive' then
    update public.mission_setup_drafts set archived_at=now(),row_version=row_version+1,updated_at=now()
      where id=p_draft_id and organisation_id=p_organisation_id and archived_at is null and row_version=p_expected_version returning * into d;
    if not found then return jsonb_build_object('conflict',true); end if;
  else raise exception 'Unsupported operation'; end if;
  insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload)
    values(p_organisation_id,p_actor_internal_user_id,'mission.setup_draft_'||p_operation,'mission_setup_draft',d.id,jsonb_build_object('current_step',d.current_step,'mission_id',d.mission_id));
  insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload)
    values(p_organisation_id,'operational.mission.setup_draft_'||p_operation,'mission_setup_draft',d.id,jsonb_build_object('current_step',d.current_step,'mission_id',d.mission_id));
  return jsonb_build_object('record',to_jsonb(d));
end$$;

revoke all on function public.ftf_write_mission_setup_draft(uuid,uuid,text,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.ftf_write_mission_setup_draft(uuid,uuid,text,uuid,integer,jsonb) to service_role;
