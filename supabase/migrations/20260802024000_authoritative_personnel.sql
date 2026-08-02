-- Authoritative hybrid Personnel and versioned Mission assignments.
create table public.personnel (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null,
  internal_user_id uuid, membership_id uuid, full_name text not null, preferred_name text,
  email text, phone text, engagement_status text not null default 'employee'
    check(engagement_status in ('employee','contractor','trainee','external','other')),
  is_active boolean not null default true, emergency_contact jsonb, private_notes text, notes text,
  start_date date, end_date date, archived_at timestamptz, archived_by_internal_user_id uuid,
  row_version integer not null default 1 check(row_version>0), created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), created_by_internal_user_id uuid not null, updated_by_internal_user_id uuid not null,
  unique(organisation_id,id), unique(organisation_id,internal_user_id), unique(organisation_id,membership_id),
  foreign key(organisation_id) references public.organisations(id),
  foreign key(organisation_id,internal_user_id) references public.internal_users(organisation_id,id),
  foreign key(organisation_id,membership_id) references public.memberships(organisation_id,id),
  foreign key(organisation_id,created_by_internal_user_id) references public.internal_users(organisation_id,id),
  foreign key(organisation_id,updated_by_internal_user_id) references public.internal_users(organisation_id,id),
  foreign key(organisation_id,archived_by_internal_user_id) references public.internal_users(organisation_id,id)
);
create table public.personnel_operating_locations (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, personnel_id uuid not null, operating_location_id uuid not null,
  created_at timestamptz not null default now(), created_by_internal_user_id uuid not null,
  unique(organisation_id,personnel_id,operating_location_id),
  foreign key(organisation_id,personnel_id) references public.personnel(organisation_id,id) on delete cascade,
  foreign key(organisation_id,operating_location_id) references public.operating_locations(organisation_id,id),
  foreign key(organisation_id,created_by_internal_user_id) references public.internal_users(organisation_id,id)
);
create table public.personnel_operational_roles (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, personnel_id uuid not null,
  role_code text not null check(role_code in ('pilot_in_command','pilot','observer','ground_crew','chemical_operator','loader','supervisor','maintenance_support','other')),
  active_from date, active_to date, created_at timestamptz not null default now(), created_by_internal_user_id uuid not null,
  unique(organisation_id,personnel_id,role_code),
  foreign key(organisation_id,personnel_id) references public.personnel(organisation_id,id) on delete cascade,
  foreign key(organisation_id,created_by_internal_user_id) references public.internal_users(organisation_id,id)
);
create table public.personnel_credentials (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, personnel_id uuid not null,
  credential_type text not null, credential_kind text not null check(credential_kind in ('licence','competency','authorisation','training','other')),
  identifier text, issuer text, issue_date date, expiry_date date, status text not null default 'current'
    check(status in ('current','expired','suspended','revoked','superseded','pending')),
  verification_state text not null default 'unverified' check(verification_state in ('unverified','verified','rejected','requires_review')),
  jurisdiction text, notes text, supersedes_credential_id uuid, row_version integer not null default 1 check(row_version>0),
  archived_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by_internal_user_id uuid not null, updated_by_internal_user_id uuid not null,
  unique(organisation_id,id), foreign key(organisation_id,personnel_id) references public.personnel(organisation_id,id),
  foreign key(organisation_id,supersedes_credential_id) references public.personnel_credentials(organisation_id,id),
  foreign key(organisation_id,created_by_internal_user_id) references public.internal_users(organisation_id,id),
  foreign key(organisation_id,updated_by_internal_user_id) references public.internal_users(organisation_id,id)
);
create table public.personnel_evidence (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, personnel_id uuid not null, credential_id uuid,
  internal_file_id uuid not null, file_version integer not null check(file_version>0), sha256_checksum text not null check(sha256_checksum~'^[a-f0-9]{64}$'),
  evidence_type text not null, access_classification text not null check(access_classification in ('operational','restricted','private')),
  provenance jsonb not null default '{}'::jsonb, retention_state text not null default 'active' check(retention_state in ('active','legal_hold','expired','archived')),
  created_at timestamptz not null default now(), created_by_internal_user_id uuid not null,
  unique(organisation_id,id), foreign key(organisation_id,personnel_id) references public.personnel(organisation_id,id),
  foreign key(organisation_id,credential_id) references public.personnel_credentials(organisation_id,id),
  foreign key(organisation_id,created_by_internal_user_id) references public.internal_users(organisation_id,id)
);
create table public.mission_personnel_revisions (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, operating_location_id uuid not null, mission_id uuid not null,
  version_number integer not null check(version_number>0), created_at timestamptz not null default now(), created_by_internal_user_id uuid not null,
  unique(organisation_id,id), unique(organisation_id,mission_id,version_number),
  foreign key(organisation_id,mission_id) references public.missions(organisation_id,id),
  foreign key(organisation_id,operating_location_id) references public.operating_locations(organisation_id,id),
  foreign key(organisation_id,created_by_internal_user_id) references public.internal_users(organisation_id,id)
);
create table public.mission_personnel_assignments (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, operating_location_id uuid not null,
  mission_id uuid not null, revision_id uuid not null, personnel_id uuid not null,
  assignment_role text not null check(assignment_role in ('pilot_in_command','additional_pilot','observer','ground_crew','chemical_operator','loader','supervisor','maintenance_support','other')),
  personnel_snapshot jsonb not null check(jsonb_typeof(personnel_snapshot)='object'), created_at timestamptz not null default now(),
  unique(organisation_id,revision_id,personnel_id,assignment_role),
  foreign key(organisation_id,mission_id) references public.missions(organisation_id,id),
  foreign key(organisation_id,revision_id) references public.mission_personnel_revisions(organisation_id,id),
  foreign key(organisation_id,personnel_id) references public.personnel(organisation_id,id),
  foreign key(organisation_id,operating_location_id) references public.operating_locations(organisation_id,id)
);

create index personnel_org_active_idx on public.personnel(organisation_id,is_active) where archived_at is null;
create index personnel_credentials_person_idx on public.personnel_credentials(organisation_id,personnel_id,expiry_date);
create index mission_personnel_mission_idx on public.mission_personnel_revisions(organisation_id,mission_id,version_number desc);

do $$ declare t text; begin foreach t in array array['personnel','personnel_operating_locations','personnel_operational_roles','personnel_credentials','personnel_evidence','mission_personnel_revisions','mission_personnel_assignments'] loop
  execute format('alter table public.%I enable row level security',t); execute format('alter table public.%I force row level security',t);
  execute format('create policy %I on public.%I for select to authenticated using(public.current_user_has_organisation_access(organisation_id))',t||'_tenant_read',t);
  execute format('revoke all on table public.%I from public,anon,authenticated',t); execute format('grant select,insert,update,delete on table public.%I to service_role',t);
end loop; end $$;

create or replace function public.ftf_provision_personnel_permissions() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into public.permissions(organisation_id,code,description) select new.organisation_id,v.code,v.description from (values
 ('personnel.read','View operational Personnel'),('personnel.create','Create Personnel'),('personnel.update','Update Personnel'),
 ('personnel.archive','Archive Personnel'),('personnel.assign','Assign Personnel to Missions'),('personnel.private.read','View restricted Personnel fields'))v(code,description)
 on conflict(organisation_id,code) do nothing;
 if new.code='admin' then insert into public.role_permissions(organisation_id,role_id,permission_id)
 select new.organisation_id,new.id,p.id from public.permissions p where p.organisation_id=new.organisation_id and p.code like 'personnel.%'
 on conflict(organisation_id,role_id,permission_id) do nothing; end if; return new;
end $$;
create trigger roles_provision_personnel_permissions after insert on public.roles for each row execute function public.ftf_provision_personnel_permissions();
insert into public.permissions(organisation_id,code,description) select o.id,v.code,v.description from public.organisations o cross join (values
 ('personnel.read','View operational Personnel'),('personnel.create','Create Personnel'),('personnel.update','Update Personnel'),
 ('personnel.archive','Archive Personnel'),('personnel.assign','Assign Personnel to Missions'),('personnel.private.read','View restricted Personnel fields'))v(code,description)
on conflict(organisation_id,code) do nothing;
insert into public.role_permissions(organisation_id,role_id,permission_id) select r.organisation_id,r.id,p.id from public.roles r join public.permissions p on p.organisation_id=r.organisation_id and p.code like 'personnel.%' where r.code='admin' on conflict do nothing;

create function public.ftf_write_personnel(p_organisation_id uuid,p_actor_internal_user_id uuid,p_operation text,p_personnel_id uuid,p_expected_version integer,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_person public.personnel%rowtype;v_location text;v_role text;v_internal uuid;v_membership uuid;
begin
 if p_operation='create' then
  v_internal=nullif(p_payload->>'internalUserId','')::uuid;v_membership=nullif(p_payload->>'membershipId','')::uuid;
  if v_membership is not null and not exists(select 1 from public.memberships m where m.organisation_id=p_organisation_id and m.id=v_membership and m.internal_user_id=v_internal and m.is_active and m.archived_at is null) then return jsonb_build_object('relationship_conflict',true);end if;
  insert into public.personnel(organisation_id,internal_user_id,membership_id,full_name,preferred_name,email,phone,engagement_status,is_active,emergency_contact,private_notes,notes,start_date,end_date,created_by_internal_user_id,updated_by_internal_user_id)
  values(p_organisation_id,v_internal,v_membership,p_payload->>'fullName',nullif(p_payload->>'preferredName',''),nullif(p_payload->>'email',''),nullif(p_payload->>'phone',''),coalesce(p_payload->>'engagementStatus','employee'),coalesce((p_payload->>'isActive')::boolean,true),p_payload->'emergencyContact',nullif(p_payload->>'privateNotes',''),nullif(p_payload->>'notes',''),nullif(p_payload->>'startDate','')::date,nullif(p_payload->>'endDate','')::date,p_actor_internal_user_id,p_actor_internal_user_id) returning * into v_person;
 elsif p_operation='update' then
  select * into v_person from public.personnel where organisation_id=p_organisation_id and id=p_personnel_id and archived_at is null for update;
  if not found then return jsonb_build_object('not_found',true);end if;if v_person.row_version<>p_expected_version then return jsonb_build_object('conflict',true,'current_version',v_person.row_version);end if;
  update public.personnel set full_name=p_payload->>'fullName',preferred_name=nullif(p_payload->>'preferredName',''),email=nullif(p_payload->>'email',''),phone=nullif(p_payload->>'phone',''),engagement_status=coalesce(p_payload->>'engagementStatus',engagement_status),is_active=coalesce((p_payload->>'isActive')::boolean,is_active),emergency_contact=p_payload->'emergencyContact',private_notes=nullif(p_payload->>'privateNotes',''),notes=nullif(p_payload->>'notes',''),start_date=nullif(p_payload->>'startDate','')::date,end_date=nullif(p_payload->>'endDate','')::date,row_version=row_version+1,updated_at=now(),updated_by_internal_user_id=p_actor_internal_user_id where organisation_id=p_organisation_id and id=p_personnel_id returning * into v_person;
 elsif p_operation='archive' then
  select * into v_person from public.personnel where organisation_id=p_organisation_id and id=p_personnel_id and archived_at is null for update;
  if not found then return jsonb_build_object('not_found',true);end if;if v_person.row_version<>p_expected_version then return jsonb_build_object('conflict',true,'current_version',v_person.row_version);end if;
  update public.personnel set archived_at=now(),archived_by_internal_user_id=p_actor_internal_user_id,is_active=false,row_version=row_version+1,updated_at=now(),updated_by_internal_user_id=p_actor_internal_user_id where organisation_id=p_organisation_id and id=p_personnel_id returning * into v_person;
 else return jsonb_build_object('unsupported_operation',true);end if;
 if p_operation in ('create','update') then
  delete from public.personnel_operating_locations where organisation_id=p_organisation_id and personnel_id=v_person.id;
  for v_location in select jsonb_array_elements_text(coalesce(p_payload->'operatingLocationIds','[]'::jsonb)) loop
   if not exists(select 1 from public.operating_locations l where l.organisation_id=p_organisation_id and l.id=v_location::uuid and l.archived_at is null) then raise exception 'Invalid Personnel operating location';end if;
   if not exists(select 1 from public.memberships m join public.membership_operating_location_assignments a on a.organisation_id=m.organisation_id and a.membership_id=m.id where m.organisation_id=p_organisation_id and m.internal_user_id=p_actor_internal_user_id and m.is_active and m.archived_at is null and a.operating_location_id=v_location::uuid and a.is_active and a.archived_at is null) then raise exception 'Personnel operating location is outside actor scope';end if;
   insert into public.personnel_operating_locations(organisation_id,personnel_id,operating_location_id,created_by_internal_user_id) values(p_organisation_id,v_person.id,v_location::uuid,p_actor_internal_user_id);
  end loop;
  delete from public.personnel_operational_roles where organisation_id=p_organisation_id and personnel_id=v_person.id;
  for v_role in select jsonb_array_elements_text(coalesce(p_payload->'operationalRoles','[]'::jsonb)) loop insert into public.personnel_operational_roles(organisation_id,personnel_id,role_code,created_by_internal_user_id) values(p_organisation_id,v_person.id,v_role,p_actor_internal_user_id);end loop;
 end if;
 insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload) values(p_organisation_id,p_actor_internal_user_id,'personnel.'||p_operation,'personnel',v_person.id,jsonb_build_object('version',v_person.row_version));
 insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload) values(p_organisation_id,'operational.personnel.'||p_operation,'personnel',v_person.id,jsonb_build_object('version',v_person.row_version));
 return jsonb_build_object('record',to_jsonb(v_person));
end $$;

create function public.ftf_link_personnel_member(p_organisation_id uuid,p_actor_internal_user_id uuid,p_personnel_id uuid,p_expected_version integer,p_internal_user_id uuid,p_membership_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ declare v_person public.personnel%rowtype;begin
 select * into v_person from public.personnel where organisation_id=p_organisation_id and id=p_personnel_id and archived_at is null for update;
 if not found then return jsonb_build_object('not_found',true);end if;if v_person.row_version<>p_expected_version then return jsonb_build_object('conflict',true,'current_version',v_person.row_version);end if;
 if not exists(select 1 from public.memberships m where m.organisation_id=p_organisation_id and m.id=p_membership_id and m.internal_user_id=p_internal_user_id and m.is_active and m.archived_at is null) then return jsonb_build_object('relationship_conflict',true);end if;
 if exists(select 1 from public.personnel p where p.organisation_id=p_organisation_id and p.id<>p_personnel_id and (p.internal_user_id=p_internal_user_id or p.membership_id=p_membership_id)) then return jsonb_build_object('duplicate_conflict',true);end if;
 update public.personnel set internal_user_id=p_internal_user_id,membership_id=p_membership_id,row_version=row_version+1,updated_at=now(),updated_by_internal_user_id=p_actor_internal_user_id where organisation_id=p_organisation_id and id=p_personnel_id returning * into v_person;
 insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload) values(p_organisation_id,p_actor_internal_user_id,'personnel.member_linked','personnel',v_person.id,jsonb_build_object('version',v_person.row_version));
 insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload) values(p_organisation_id,'operational.personnel.member_linked','personnel',v_person.id,jsonb_build_object('version',v_person.row_version));return jsonb_build_object('record',to_jsonb(v_person));end $$;

create function public.ftf_write_personnel_credential(p_organisation_id uuid,p_actor_internal_user_id uuid,p_personnel_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ declare v_credential public.personnel_credentials%rowtype;begin
 if not exists(select 1 from public.personnel where organisation_id=p_organisation_id and id=p_personnel_id and archived_at is null) then return jsonb_build_object('not_found',true);end if;
 insert into public.personnel_credentials(organisation_id,personnel_id,credential_type,credential_kind,identifier,issuer,issue_date,expiry_date,status,verification_state,jurisdiction,notes,supersedes_credential_id,created_by_internal_user_id,updated_by_internal_user_id)
 values(p_organisation_id,p_personnel_id,p_payload->>'credentialType',p_payload->>'credentialKind',nullif(p_payload->>'identifier',''),nullif(p_payload->>'issuer',''),nullif(p_payload->>'issueDate','')::date,nullif(p_payload->>'expiryDate','')::date,coalesce(p_payload->>'status','current'),coalesce(p_payload->>'verificationState','unverified'),nullif(p_payload->>'jurisdiction',''),nullif(p_payload->>'notes',''),nullif(p_payload->>'supersedesCredentialId','')::uuid,p_actor_internal_user_id,p_actor_internal_user_id) returning * into v_credential;
 insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload) values(p_organisation_id,p_actor_internal_user_id,'personnel.credential_created','personnel_credential',v_credential.id,jsonb_build_object('personnel_id',p_personnel_id,'version',1));
 insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload) values(p_organisation_id,'operational.personnel.credential_created','personnel',p_personnel_id,jsonb_build_object('credential_id',v_credential.id,'version',1));return jsonb_build_object('record',to_jsonb(v_credential));end $$;

create function public.ftf_write_personnel_evidence(p_organisation_id uuid,p_actor_internal_user_id uuid,p_personnel_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ declare v_evidence public.personnel_evidence%rowtype;begin
 if not exists(select 1 from public.personnel where organisation_id=p_organisation_id and id=p_personnel_id and archived_at is null) then return jsonb_build_object('not_found',true);end if;
 insert into public.personnel_evidence(organisation_id,personnel_id,credential_id,internal_file_id,file_version,sha256_checksum,evidence_type,access_classification,provenance,retention_state,created_by_internal_user_id)
 values(p_organisation_id,p_personnel_id,nullif(p_payload->>'credentialId','')::uuid,(p_payload->>'internalFileId')::uuid,(p_payload->>'fileVersion')::integer,p_payload->>'checksum',p_payload->>'evidenceType',p_payload->>'accessClassification',coalesce(p_payload->'provenance','{}'::jsonb),coalesce(p_payload->>'retentionState','active'),p_actor_internal_user_id) returning * into v_evidence;
 insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload) values(p_organisation_id,p_actor_internal_user_id,'personnel.evidence_created','personnel_evidence',v_evidence.id,jsonb_build_object('personnel_id',p_personnel_id));
 insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload) values(p_organisation_id,'operational.personnel.evidence_created','personnel',p_personnel_id,jsonb_build_object('evidence_id',v_evidence.id));return jsonb_build_object('record',to_jsonb(v_evidence));end $$;

create function public.ftf_list_personnel(p_organisation_id uuid,p_operating_location_id uuid,p_include_private boolean default false)
returns setof jsonb language sql security definer set search_path=public,pg_temp as $$
 select to_jsonb(p)-'emergency_contact'-'private_notes'||jsonb_build_object('emergency_contact',case when p_include_private then p.emergency_contact else null end,'private_notes',case when p_include_private then p.private_notes else null end,
 'operating_location_ids',coalesce((select jsonb_agg(l.operating_location_id) from public.personnel_operating_locations l where l.organisation_id=p.organisation_id and l.personnel_id=p.id),'[]'::jsonb),
 'operational_roles',coalesce((select jsonb_agg(r.role_code) from public.personnel_operational_roles r where r.organisation_id=p.organisation_id and r.personnel_id=p.id),'[]'::jsonb),
 'credentials',coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at) from public.personnel_credentials c where c.organisation_id=p.organisation_id and c.personnel_id=p.id and c.archived_at is null),'[]'::jsonb))
 from public.personnel p where p.organisation_id=p_organisation_id and p.archived_at is null and (p_operating_location_id is null or exists(select 1 from public.personnel_operating_locations l where l.organisation_id=p.organisation_id and l.personnel_id=p.id and l.operating_location_id=p_operating_location_id)) order by p.full_name;
$$;

create function public.ftf_read_mission_personnel(p_organisation_id uuid,p_mission_id uuid,p_history boolean default false)
returns setof jsonb language sql security definer set search_path=public,pg_temp as $$ with r as(
 select * from public.mission_personnel_revisions where organisation_id=p_organisation_id and mission_id=p_mission_id order by version_number desc limit case when p_history then 2147483647 else 1 end)
 select to_jsonb(r)||jsonb_build_object('assignments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'personnel_id',a.personnel_id,'assignment_role',a.assignment_role,'snapshot',a.personnel_snapshot) order by a.assignment_role,a.created_at) from public.mission_personnel_assignments a where a.organisation_id=r.organisation_id and a.revision_id=r.id),'[]'::jsonb)) from r;$$;

create function public.ftf_save_mission_personnel(p_organisation_id uuid,p_actor_internal_user_id uuid,p_mission_id uuid,p_expected_version integer,p_assignments jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_mission public.missions%rowtype;v_current integer;v_revision public.mission_personnel_revisions%rowtype;v_item jsonb;v_person public.personnel%rowtype;v_credential public.personnel_credentials%rowtype;v_snapshot jsonb;v_role text;begin
 select * into v_mission from public.missions where organisation_id=p_organisation_id and id=p_mission_id and archived_at is null for update;if not found then return jsonb_build_object('not_found',true);end if;
 if not exists(select 1 from public.memberships m join public.membership_operating_location_assignments a on a.organisation_id=m.organisation_id and a.membership_id=m.id where m.organisation_id=p_organisation_id and m.internal_user_id=p_actor_internal_user_id and m.is_active and m.archived_at is null and a.operating_location_id=v_mission.operating_location_id and a.is_active and a.archived_at is null) then return jsonb_build_object('not_found',true);end if;
 select coalesce(max(version_number),0) into v_current from public.mission_personnel_revisions where organisation_id=p_organisation_id and mission_id=p_mission_id;if v_current<>p_expected_version then return jsonb_build_object('conflict',true,'current_version',v_current);end if;
 if (select count(*) from jsonb_array_elements(p_assignments) x where x->>'assignmentRole'='pilot_in_command')<>1 then return jsonb_build_object('qualification_blockers',jsonb_build_array(jsonb_build_object('code','PIC_REQUIRED','message','Exactly one Pilot in Command is required.')));end if;
 insert into public.mission_personnel_revisions(organisation_id,operating_location_id,mission_id,version_number,created_by_internal_user_id) values(p_organisation_id,v_mission.operating_location_id,p_mission_id,v_current+1,p_actor_internal_user_id) returning * into v_revision;
 for v_item in select value from jsonb_array_elements(p_assignments) loop
  select * into v_person from public.personnel p where p.organisation_id=p_organisation_id and p.id=(v_item->>'personnelId')::uuid and p.archived_at is null and p.is_active and (p.start_date is null or p.start_date<=v_mission.scheduled_start_at::date) and (p.end_date is null or p.end_date>=v_mission.scheduled_start_at::date);
  if not found or not exists(select 1 from public.personnel_operating_locations l where l.organisation_id=p_organisation_id and l.personnel_id=v_person.id and l.operating_location_id=v_mission.operating_location_id) then raise exception using errcode='P0001',message='PERSONNEL_SCOPE_INVALID';end if;
  v_role=v_item->>'assignmentRole';
  if v_role='pilot_in_command' then
   if not exists(select 1 from public.personnel_operational_roles r where r.organisation_id=p_organisation_id and r.personnel_id=v_person.id and r.role_code in ('pilot_in_command','pilot')) then raise exception using errcode='P0001',message='PERSONNEL_ROLE_INVALID';end if;
   select * into v_credential from public.personnel_credentials c where c.organisation_id=p_organisation_id and c.personnel_id=v_person.id and c.archived_at is null and c.credential_type in ('RePL','internal_pilot_authorisation') and c.status='current' and c.verification_state='verified' and (c.expiry_date is null or c.expiry_date>=v_mission.scheduled_start_at::date) order by c.expiry_date desc nulls first limit 1;
   if not found then raise exception using errcode='P0001',message='PIC_CREDENTIAL_INVALID';end if;
  elsif v_role='additional_pilot' and not exists(select 1 from public.personnel_operational_roles r where r.organisation_id=p_organisation_id and r.personnel_id=v_person.id and r.role_code='pilot') then raise exception using errcode='P0001',message='PERSONNEL_ROLE_INVALID';
  elsif v_role='observer' and not exists(select 1 from public.personnel_operational_roles r where r.organisation_id=p_organisation_id and r.personnel_id=v_person.id and r.role_code='observer') then raise exception using errcode='P0001',message='PERSONNEL_ROLE_INVALID';end if;
  v_snapshot=jsonb_build_object('personnelId',v_person.id,'personnelVersion',v_person.row_version,'name',v_person.full_name,'assignmentRole',v_role,'organisationId',p_organisation_id,'operatingLocationId',v_mission.operating_location_id,'credential',case when v_credential.id is null then null else jsonb_build_object('id',v_credential.id,'type',v_credential.credential_type,'identifier',v_credential.identifier,'expiryDate',v_credential.expiry_date,'verificationState',v_credential.verification_state,'version',v_credential.row_version) end);
  insert into public.mission_personnel_assignments(organisation_id,operating_location_id,mission_id,revision_id,personnel_id,assignment_role,personnel_snapshot) values(p_organisation_id,v_mission.operating_location_id,p_mission_id,v_revision.id,v_person.id,v_role,v_snapshot);v_credential=null;
 end loop;
 insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload) values(p_organisation_id,p_actor_internal_user_id,'mission.personnel_saved','mission',p_mission_id,jsonb_build_object('version',v_revision.version_number,'correlation_id',v_revision.id));
 insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload) values(p_organisation_id,'operational.mission.personnel_saved','mission',p_mission_id,jsonb_build_object('version',v_revision.version_number,'correlation_id',v_revision.id));
 return jsonb_build_object('record',(select x from public.ftf_read_mission_personnel(p_organisation_id,p_mission_id,false)x));
exception when sqlstate 'P0001' then return jsonb_build_object('qualification_blockers',jsonb_build_array(jsonb_build_object('code',sqlerrm,'message',replace(initcap(replace(sqlerrm,'_',' ')),' Pic ',' PIC '))));end $$;

revoke all on function public.ftf_provision_personnel_permissions() from public,anon,authenticated;
revoke all on function public.ftf_write_personnel(uuid,uuid,text,uuid,integer,jsonb) from public,anon,authenticated;
revoke all on function public.ftf_link_personnel_member(uuid,uuid,uuid,integer,uuid,uuid) from public,anon,authenticated;
revoke all on function public.ftf_write_personnel_credential(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.ftf_write_personnel_evidence(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.ftf_list_personnel(uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function public.ftf_read_mission_personnel(uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function public.ftf_save_mission_personnel(uuid,uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.ftf_write_personnel(uuid,uuid,text,uuid,integer,jsonb),public.ftf_link_personnel_member(uuid,uuid,uuid,integer,uuid,uuid),public.ftf_write_personnel_credential(uuid,uuid,uuid,jsonb),public.ftf_write_personnel_evidence(uuid,uuid,uuid,jsonb),public.ftf_list_personnel(uuid,uuid,boolean),public.ftf_read_mission_personnel(uuid,uuid,boolean),public.ftf_save_mission_personnel(uuid,uuid,uuid,integer,jsonb) to service_role;
