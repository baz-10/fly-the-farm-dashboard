-- NEW-CMP-002: authoritative Australian CASA compliance foundation.

create table public.compliance_country_packs(
 code text not null,version integer not null check(version>0),name text not null,jurisdiction text not null,
 status text not null check(status in('DRAFT','PUBLISHED','SUPERSEDED')),effective_from date not null,effective_to date,
 source_manifest jsonb not null default'[]',created_at timestamptz not null default now(),primary key(code,version)
);

create table public.compliance_regulatory_rules(
 id uuid primary key default gen_random_uuid(),country_pack_code text not null,country_pack_version integer not null,
 rule_code text not null,rule_version integer not null check(rule_version>0),title text not null,record_class text not null,
 retention_years integer check(retention_years is null or retention_years>0),
 retention_start_event text check(retention_start_event in('RECORD_CREATED_AT','EMPLOYMENT_CEASED_AT','LAST_AIRCRAFT_OPERATION_AT','NOT_APPLICABLE')),
 warning_days integer[] not null default'{}',source_title text not null,source_url text not null,jurisdiction text not null,
 effective_from date not null,review_due_date date,status text not null check(status in('PUBLISHED','SUPERSEDED')),
 created_at timestamptz not null default now(),unique(country_pack_code,country_pack_version,rule_code,rule_version),
 foreign key(country_pack_code,country_pack_version)references public.compliance_country_packs(code,version)
);

insert into public.compliance_country_packs(code,version,name,jurisdiction,status,effective_from,source_manifest)values
('AU_PART_101',1,'Australian Part 101 CASA Compliance Pack','AU','PUBLISHED','2026-08-05',jsonb_build_array(
 jsonb_build_object('title','Part 101 Manual of Standards 2019','url','https://www.legislation.gov.au/F2019L00593/latest'),
 jsonb_build_object('title','CASA Record keeping','url','https://www.casa.gov.au/drones/remotely-piloted-aircraft-operators-certificate/record-keeping')
));

insert into public.compliance_regulatory_rules(country_pack_code,country_pack_version,rule_code,rule_version,title,record_class,retention_years,retention_start_event,warning_days,source_title,source_url,jurisdiction,effective_from,status)values
('AU_PART_101',1,'REOC_RENEWAL',1,'ReOC renewal','REOC',null,'NOT_APPLICABLE',array[90,60,30,14,7],'CASA Renew your ReOC','https://www.casa.gov.au/drones/remotely-piloted-aircraft-operators-certificate/renew-your-reoc','AU','2026-08-05','PUBLISHED'),
('AU_PART_101',1,'CRP_DUTY_RECORDS',1,'Chief Remote Pilot duty records','OPERATIONAL_RECORD',7,'RECORD_CREATED_AT','{}','Part 101 MOS','https://www.legislation.gov.au/F2019L00593/latest','AU','2026-08-05','PUBLISHED'),
('AU_PART_101',1,'CREW_QUALIFICATION',1,'Crew qualification and competency','PERSONNEL_TRAINING',7,'EMPLOYMENT_CEASED_AT','{}','Part 101 MOS','https://www.legislation.gov.au/F2019L00593/latest','AU','2026-08-05','PUBLISHED'),
('AU_PART_101',1,'TECHNICAL_LOG',1,'RPA technical log','AIRCRAFT_TECHNICAL',7,'LAST_AIRCRAFT_OPERATION_AT','{}','Part 101 MOS','https://www.legislation.gov.au/F2019L00593/latest','AU','2026-08-05','PUBLISHED');

create table public.organisation_compliance_profiles(
 organisation_id uuid primary key references public.organisations(id),country_pack_code text not null,country_pack_version integer not null,
 organisation_arn text,reoc_holder_name text,warning_days integer[] not null default array[90,60,30,14,7],
 row_version integer not null default 1 check(row_version>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 updated_by_internal_user_id uuid not null,foreign key(country_pack_code,country_pack_version)references public.compliance_country_packs(code,version),
 foreign key(organisation_id,updated_by_internal_user_id)references public.internal_users(organisation_id,id)
);

create table public.organisation_compliance_instruments(
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,instrument_type text not null,
 instrument_number text,issuer text not null default'CASA',issue_date date,expiry_date date,status text not null
 check(status in('CURRENT','DUE_90','DUE_30','EXPIRED','MISSING','UNDER_REVIEW','SUPERSEDED','NOT_APPLICABLE')),
 conditions jsonb not null default'[]',scope jsonb not null default'{}',supersedes_instrument_id uuid,row_version integer not null default 1 check(row_version>0),
 archived_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 created_by_internal_user_id uuid not null,updated_by_internal_user_id uuid not null,unique(organisation_id,id),
 foreign key(organisation_id)references public.organisations(id),
 foreign key(organisation_id,supersedes_instrument_id)references public.organisation_compliance_instruments(organisation_id,id),
 foreign key(organisation_id,created_by_internal_user_id)references public.internal_users(organisation_id,id),
 foreign key(organisation_id,updated_by_internal_user_id)references public.internal_users(organisation_id,id)
);

create table public.compliance_instrument_evidence(
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,instrument_id uuid not null,internal_file_id uuid not null,file_version integer not null check(file_version>0),
 original_filename text not null,content_type text not null,byte_size bigint not null check(byte_size>0),sha256_checksum text not null check(sha256_checksum~'^[a-f0-9]{64}$'),
 provenance jsonb not null default'{}',access_classification text not null check(access_classification in('OPERATIONAL','RESTRICTED','PRIVATE')),
 created_at timestamptz not null default now(),created_by_internal_user_id uuid not null,unique(organisation_id,id),unique(organisation_id,internal_file_id,file_version),
 foreign key(organisation_id,instrument_id)references public.organisation_compliance_instruments(organisation_id,id),
 foreign key(organisation_id,created_by_internal_user_id)references public.internal_users(organisation_id,id)
);

create table public.controlled_documents(
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,document_type text not null,title text not null,status text not null default'DRAFT'
 check(status in('DRAFT','ACTIVE','SUPERSEDED','ARCHIVED')),row_version integer not null default 1 check(row_version>0),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),created_by_internal_user_id uuid not null,updated_by_internal_user_id uuid not null,
 unique(organisation_id,id),foreign key(organisation_id)references public.organisations(id),
 foreign key(organisation_id,created_by_internal_user_id)references public.internal_users(organisation_id,id),
 foreign key(organisation_id,updated_by_internal_user_id)references public.internal_users(organisation_id,id)
);

create table public.controlled_document_versions(
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,document_id uuid not null,version_number integer not null check(version_number>0),
 effective_date date not null,review_due_date date,status text not null check(status in('PUBLISHED','SUPERSEDED')),
 internal_file_id uuid not null,file_version integer not null check(file_version>0),original_filename text not null,sha256_checksum text not null check(sha256_checksum~'^[a-f0-9]{64}$'),
 provenance jsonb not null default'{}',approved_by_personnel_id uuid,approver_snapshot jsonb,approved_at timestamptz not null default now(),
 supersedes_version_id uuid,created_by_internal_user_id uuid not null,unique(organisation_id,id),unique(organisation_id,document_id,version_number),unique(organisation_id,internal_file_id,file_version),
 foreign key(organisation_id,document_id)references public.controlled_documents(organisation_id,id),
 foreign key(organisation_id,supersedes_version_id)references public.controlled_document_versions(organisation_id,id),
 foreign key(organisation_id,approved_by_personnel_id)references public.personnel(organisation_id,id),
 foreign key(organisation_id,created_by_internal_user_id)references public.internal_users(organisation_id,id)
);

create table public.controlled_document_acknowledgements(
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,document_version_id uuid not null,personnel_id uuid not null,personnel_snapshot jsonb not null,
 acknowledged_at timestamptz not null,created_at timestamptz not null default now(),unique(organisation_id,id),unique(organisation_id,document_version_id,personnel_id),
 foreign key(organisation_id,document_version_id)references public.controlled_document_versions(organisation_id,id),
 foreign key(organisation_id,personnel_id)references public.personnel(organisation_id,id)
);

create table public.compliance_training_records(
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,course_code text,course_title text not null,course_version text,
 started_at timestamptz,completed_at timestamptz,outcome text not null,participant_personnel_id uuid not null,participant_snapshot jsonb not null,
 instructor_personnel_id uuid,instructor_snapshot jsonb,evidence_manifest jsonb not null default'[]',regulatory_rule_id uuid,
 created_at timestamptz not null default now(),created_by_internal_user_id uuid not null,unique(organisation_id,id),
 foreign key(organisation_id,participant_personnel_id)references public.personnel(organisation_id,id),
 foreign key(organisation_id,instructor_personnel_id)references public.personnel(organisation_id,id),
 foreign key(regulatory_rule_id)references public.compliance_regulatory_rules(id),
 foreign key(organisation_id,created_by_internal_user_id)references public.internal_users(organisation_id,id)
);

create table public.compliance_renewal_actions(
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,source_entity_type text not null,source_entity_id uuid not null,
 due_date date not null,status text not null check(status in('OPEN','ACKNOWLEDGED','IN_PROGRESS','COMPLETED','CANCELLED','OVERDUE')),
 assigned_personnel_id uuid,notes text,completed_at timestamptz,row_version integer not null default 1 check(row_version>0),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),created_by_internal_user_id uuid not null,updated_by_internal_user_id uuid not null,
 unique(organisation_id,id),foreign key(organisation_id)references public.organisations(id),
 foreign key(organisation_id,assigned_personnel_id)references public.personnel(organisation_id,id),
 foreign key(organisation_id,created_by_internal_user_id)references public.internal_users(organisation_id,id),
 foreign key(organisation_id,updated_by_internal_user_id)references public.internal_users(organisation_id,id)
);

create table public.compliance_legal_holds(
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,record_type text not null,record_id uuid not null,reason text not null,
 imposed_at timestamptz not null default now(),released_at timestamptz,imposed_by_internal_user_id uuid not null,released_by_internal_user_id uuid,
 unique(organisation_id,id),foreign key(organisation_id)references public.organisations(id),
 foreign key(organisation_id,imposed_by_internal_user_id)references public.internal_users(organisation_id,id),
 foreign key(organisation_id,released_by_internal_user_id)references public.internal_users(organisation_id,id)
);

do $$declare t text;begin foreach t in array array[
 'organisation_compliance_profiles','organisation_compliance_instruments','compliance_instrument_evidence','controlled_documents',
 'controlled_document_versions','controlled_document_acknowledgements','compliance_training_records','compliance_renewal_actions','compliance_legal_holds'
]loop execute format('alter table public.%I enable row level security',t);execute format('alter table public.%I force row level security',t);
 execute format('create policy %I on public.%I for select to authenticated using(public.current_user_has_organisation_access(organisation_id))',t||'_tenant_read',t);
 execute format('revoke all on table public.%I from public,anon,authenticated',t);execute format('grant select,insert,update on table public.%I to service_role',t);end loop;end$$;

create trigger compliance_instrument_evidence_immutable before update or delete on public.compliance_instrument_evidence for each row execute function public.reject_append_only_mutation();
create trigger controlled_document_versions_immutable before update or delete on public.controlled_document_versions for each row execute function public.reject_append_only_mutation();
create trigger controlled_document_acknowledgements_immutable before update or delete on public.controlled_document_acknowledgements for each row execute function public.reject_append_only_mutation();
create trigger compliance_training_records_immutable before update or delete on public.compliance_training_records for each row execute function public.reject_append_only_mutation();

insert into public.permissions(organisation_id,code,description)select o.id,v.code,v.description from public.organisations o cross join(values
 ('compliance.read','View authoritative compliance records'),('compliance.manage','Manage organisation compliance records'),
 ('compliance.verify','Verify compliance evidence'),('compliance.publish','Publish controlled compliance versions'),
 ('compliance.export','Generate compliance packs'),('compliance.restricted.read','View restricted compliance evidence')
)v(code,description)on conflict(organisation_id,code)do nothing;
insert into public.role_permissions(organisation_id,role_id,permission_id)select r.organisation_id,r.id,p.id from public.roles r join public.permissions p on p.organisation_id=r.organisation_id where r.code='admin'and p.code like'compliance.%'on conflict do nothing;

create function public.ftf_provision_compliance_permissions()returns trigger language plpgsql security definer set search_path=public,pg_temp as $$begin
 insert into public.permissions(organisation_id,code,description)select new.organisation_id,v.code,v.description from(values
  ('compliance.read','View authoritative compliance records'),('compliance.manage','Manage organisation compliance records'),
  ('compliance.verify','Verify compliance evidence'),('compliance.publish','Publish controlled compliance versions'),
  ('compliance.export','Generate compliance packs'),('compliance.restricted.read','View restricted compliance evidence')
 )v(code,description)on conflict(organisation_id,code)do nothing;
 if new.code='admin'then insert into public.role_permissions(organisation_id,role_id,permission_id)select new.organisation_id,new.id,p.id from public.permissions p where p.organisation_id=new.organisation_id and p.code like'compliance.%'on conflict do nothing;end if;return new;end$$;
create trigger roles_provision_compliance_permissions after insert on public.roles for each row execute function public.ftf_provision_compliance_permissions();

create function public.ftf_read_casa_compliance_overview(p_organisation_id uuid,p_evaluated_at timestamptz default now())returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 with reoc as(select*from public.organisation_compliance_instruments where organisation_id=p_organisation_id and instrument_type='REOC'and archived_at is null order by created_at desc limit 1),
 manual as(select v.*from public.controlled_document_versions v join public.controlled_documents d on d.organisation_id=v.organisation_id and d.id=v.document_id where v.organisation_id=p_organisation_id and d.document_type='OPERATIONS_MANUAL'order by v.version_number desc limit 1)
 select jsonb_build_object('evaluatedAt',p_evaluated_at,'reoc',(select to_jsonb(x)||jsonb_build_object('daysRemaining',x.expiry_date-current_date)from reoc x),
 'operationsManual',(select to_jsonb(x)from manual x),'warnings',jsonb_build_object(
 'renewalsOverdue',(select count(*)from public.compliance_renewal_actions where organisation_id=p_organisation_id and status in('OPEN','IN_PROGRESS')and due_date<current_date),
 'legalHolds',(select count(*)from public.compliance_legal_holds where organisation_id=p_organisation_id and released_at is null),
 'missingEvidence',(select count(*)from public.organisation_compliance_instruments i where i.organisation_id=p_organisation_id and i.archived_at is null and not exists(select 1 from public.compliance_instrument_evidence e where e.organisation_id=i.organisation_id and e.instrument_id=i.id))))
$$;

create function public.ftf_write_compliance_instrument(p_organisation_id uuid,p_actor_internal_user_id uuid,p_operation text,p_instrument_id uuid,p_expected_version integer,p_payload jsonb)returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare v public.organisation_compliance_instruments%rowtype;begin
 if not public.ftf_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'compliance.manage')then return jsonb_build_object('forbidden',true);end if;
 if p_operation='CREATE'then insert into public.organisation_compliance_instruments(organisation_id,instrument_type,instrument_number,issuer,issue_date,expiry_date,status,conditions,scope,supersedes_instrument_id,created_by_internal_user_id,updated_by_internal_user_id)values(p_organisation_id,p_payload->>'instrumentType',nullif(p_payload->>'instrumentNumber',''),coalesce(nullif(p_payload->>'issuer',''),'CASA'),nullif(p_payload->>'issueDate','')::date,nullif(p_payload->>'expiryDate','')::date,coalesce(p_payload->>'status','UNDER_REVIEW'),coalesce(p_payload->'conditions','[]'),coalesce(p_payload->'scope','{}'),nullif(p_payload->>'supersedesInstrumentId','')::uuid,p_actor_internal_user_id,p_actor_internal_user_id)returning*into v;
 elsif p_operation='UPDATE'then update public.organisation_compliance_instruments set instrument_number=nullif(p_payload->>'instrumentNumber',''),issue_date=nullif(p_payload->>'issueDate','')::date,expiry_date=nullif(p_payload->>'expiryDate','')::date,status=p_payload->>'status',conditions=coalesce(p_payload->'conditions',conditions),scope=coalesce(p_payload->'scope',scope),row_version=row_version+1,updated_at=now(),updated_by_internal_user_id=p_actor_internal_user_id where organisation_id=p_organisation_id and id=p_instrument_id and row_version=p_expected_version returning*into v;if not found then return jsonb_build_object('conflict',true);end if;
 else return jsonb_build_object('unsupported_operation',true);end if;
 insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload)values(p_organisation_id,p_actor_internal_user_id,'compliance.instrument.'||lower(p_operation),'compliance_instrument',v.id,jsonb_build_object('version',v.row_version));
 insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload)values(p_organisation_id,'compliance.instrument.'||lower(p_operation),'compliance_instrument',v.id,jsonb_build_object('version',v.row_version));return jsonb_build_object('record',to_jsonb(v));end$$;

create function public.ftf_publish_controlled_document_version(p_organisation_id uuid,p_actor_internal_user_id uuid,p_document_id uuid,p_expected_version integer,p_payload jsonb)returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare d public.controlled_documents%rowtype;v public.controlled_document_versions%rowtype;n integer;previous_version uuid;begin
 if not public.ftf_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'compliance.publish')then return jsonb_build_object('forbidden',true);end if;select*into d from public.controlled_documents where organisation_id=p_organisation_id and id=p_document_id and row_version=p_expected_version for update;if not found then return jsonb_build_object('conflict',true);end if;select coalesce(max(version_number),0)+1 into n from public.controlled_document_versions where organisation_id=p_organisation_id and document_id=p_document_id;
 select id into previous_version from public.controlled_document_versions where organisation_id=p_organisation_id and document_id=p_document_id order by version_number desc limit 1;
 insert into public.controlled_document_versions(organisation_id,document_id,version_number,effective_date,review_due_date,status,internal_file_id,file_version,original_filename,sha256_checksum,provenance,approved_by_personnel_id,approver_snapshot,supersedes_version_id,created_by_internal_user_id)values(p_organisation_id,p_document_id,n,(p_payload->>'effectiveDate')::date,nullif(p_payload->>'reviewDueDate','')::date,'PUBLISHED',(p_payload->>'internalFileId')::uuid,(p_payload->>'fileVersion')::integer,p_payload->>'originalFilename',p_payload->>'checksum',coalesce(p_payload->'provenance','{}'),nullif(p_payload->>'approvedByPersonnelId','')::uuid,p_payload->'approverSnapshot',previous_version,p_actor_internal_user_id)returning*into v;
 update public.controlled_documents set status='ACTIVE',row_version=row_version+1,updated_at=now(),updated_by_internal_user_id=p_actor_internal_user_id where organisation_id=p_organisation_id and id=p_document_id;
 insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload)values(p_organisation_id,p_actor_internal_user_id,'compliance.document.published','controlled_document_version',v.id,jsonb_build_object('document_id',p_document_id,'version',n));insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload)values(p_organisation_id,'compliance.document.published','controlled_document',p_document_id,jsonb_build_object('version_id',v.id,'version',n));return jsonb_build_object('record',to_jsonb(v));end$$;

create function public.ftf_write_compliance_training(p_organisation_id uuid,p_actor_internal_user_id uuid,p_payload jsonb)returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare v public.compliance_training_records%rowtype;begin
 if not public.ftf_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'compliance.manage')then return jsonb_build_object('forbidden',true);end if;insert into public.compliance_training_records(organisation_id,course_code,course_title,course_version,started_at,completed_at,outcome,participant_personnel_id,participant_snapshot,instructor_personnel_id,instructor_snapshot,evidence_manifest,regulatory_rule_id,created_by_internal_user_id)values(p_organisation_id,nullif(p_payload->>'courseCode',''),p_payload->>'courseTitle',nullif(p_payload->>'courseVersion',''),nullif(p_payload->>'startedAt','')::timestamptz,nullif(p_payload->>'completedAt','')::timestamptz,p_payload->>'outcome',(p_payload->>'participantPersonnelId')::uuid,p_payload->'participantSnapshot',nullif(p_payload->>'instructorPersonnelId','')::uuid,p_payload->'instructorSnapshot',coalesce(p_payload->'evidenceManifest','[]'),nullif(p_payload->>'regulatoryRuleId','')::uuid,p_actor_internal_user_id)returning*into v;insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload)values(p_organisation_id,p_actor_internal_user_id,'compliance.training.recorded','compliance_training',v.id,'{}');insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload)values(p_organisation_id,'compliance.training.recorded','compliance_training',v.id,'{}');return jsonb_build_object('record',to_jsonb(v));end$$;

create function public.ftf_write_renewal_action(p_organisation_id uuid,p_actor_internal_user_id uuid,p_operation text,p_action_id uuid,p_expected_version integer,p_payload jsonb)returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare v public.compliance_renewal_actions%rowtype;begin
 if not public.ftf_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'compliance.manage')then return jsonb_build_object('forbidden',true);end if;if p_operation='CREATE'then insert into public.compliance_renewal_actions(organisation_id,source_entity_type,source_entity_id,due_date,status,assigned_personnel_id,notes,created_by_internal_user_id,updated_by_internal_user_id)values(p_organisation_id,p_payload->>'sourceEntityType',(p_payload->>'sourceEntityId')::uuid,(p_payload->>'dueDate')::date,'OPEN',nullif(p_payload->>'assignedPersonnelId','')::uuid,nullif(p_payload->>'notes',''),p_actor_internal_user_id,p_actor_internal_user_id)returning*into v;elsif p_operation='UPDATE'then update public.compliance_renewal_actions set status=p_payload->>'status',assigned_personnel_id=nullif(p_payload->>'assignedPersonnelId','')::uuid,notes=nullif(p_payload->>'notes',''),completed_at=case when p_payload->>'status'='COMPLETED'then now()else completed_at end,row_version=row_version+1,updated_at=now(),updated_by_internal_user_id=p_actor_internal_user_id where organisation_id=p_organisation_id and id=p_action_id and row_version=p_expected_version returning*into v;if not found then return jsonb_build_object('conflict',true);end if;else return jsonb_build_object('unsupported_operation',true);end if;insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload)values(p_organisation_id,p_actor_internal_user_id,'compliance.renewal.'||lower(p_operation),'compliance_renewal',v.id,jsonb_build_object('version',v.row_version));insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload)values(p_organisation_id,'compliance.renewal.'||lower(p_operation),'compliance_renewal',v.id,jsonb_build_object('version',v.row_version));return jsonb_build_object('record',to_jsonb(v));end$$;

revoke all on function public.ftf_provision_compliance_permissions(),public.ftf_read_casa_compliance_overview(uuid,timestamptz),public.ftf_write_compliance_instrument(uuid,uuid,text,uuid,integer,jsonb),public.ftf_publish_controlled_document_version(uuid,uuid,uuid,integer,jsonb),public.ftf_write_compliance_training(uuid,uuid,jsonb),public.ftf_write_renewal_action(uuid,uuid,text,uuid,integer,jsonb)from public,anon,authenticated;
grant execute on function public.ftf_read_casa_compliance_overview(uuid,timestamptz),public.ftf_write_compliance_instrument(uuid,uuid,text,uuid,integer,jsonb),public.ftf_publish_controlled_document_version(uuid,uuid,uuid,integer,jsonb),public.ftf_write_compliance_training(uuid,uuid,jsonb),public.ftf_write_renewal_action(uuid,uuid,text,uuid,integer,jsonb)to service_role;
