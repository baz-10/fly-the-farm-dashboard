-- Authoritative organisation operating-authority register and direct-upload ledger.

create table public.compliance_authority_types(
 code text primary key,label text not null,category text not null,display_order integer not null,active boolean not null default true
);
insert into public.compliance_authority_types(code,label,category,display_order)values
 ('REOC_CERTIFICATE','ReOC certificate','REOC',10),
 ('REOC_VARIATION','ReOC variation','REOC',20),
 ('INSTRUMENT','Instrument','APPROVAL',30),
 ('SPECIAL_APPROVAL','Special approval','APPROVAL',40),
 ('EXEMPTION','Exemption','OTHER',50),
 ('OTHER_CASA_AUTHORITY','Other CASA authority','OTHER',60)
on conflict(code)do update set label=excluded.label,category=excluded.category,display_order=excluded.display_order,active=true;

alter table public.organisation_compliance_instruments add column if not exists authority_type_code text references public.compliance_authority_types(code);
alter table public.organisation_compliance_instruments add column if not exists legal_holder text;
alter table public.organisation_compliance_instruments add column if not exists organisation_arn text;
alter table public.organisation_compliance_instruments add column if not exists notes text;
alter table public.organisation_compliance_instruments add column if not exists operating_location_id uuid;
update public.organisation_compliance_instruments set authority_type_code='REOC_CERTIFICATE'where authority_type_code is null and instrument_type='REOC';
alter table public.organisation_compliance_instruments add constraint organisation_compliance_instruments_location_fk foreign key(organisation_id,operating_location_id)references public.operating_locations(organisation_id,id)not valid;

alter table public.compliance_instrument_evidence add column if not exists evidence_role text not null default'DOCUMENT';
alter table public.compliance_instrument_evidence add column if not exists description text;
alter table public.compliance_instrument_evidence add column if not exists authority_row_version integer not null default 1;
alter table public.compliance_instrument_evidence add column if not exists storage_bucket text;
alter table public.compliance_instrument_evidence add column if not exists provider_key text;

create table public.compliance_pending_uploads(
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,actor_internal_user_id uuid not null,internal_file_id uuid not null default gen_random_uuid(),
 storage_bucket text not null default'compliance-evidence',provider_key text not null,original_filename text not null,content_type text not null,declared_byte_size bigint not null check(declared_byte_size between 1 and 20971520),
 evidence_role text not null default'DOCUMENT',description text,state text not null default'PENDING'check(state in('PENDING','CONSUMED','EXPIRED','CANCELLED')),
 expires_at timestamptz not null default(now()+interval'15 minutes'),consumed_at timestamptz,created_at timestamptz not null default now(),
 unique(organisation_id,id),unique(organisation_id,internal_file_id),unique(storage_bucket,provider_key),
 foreign key(organisation_id)references public.organisations(id),foreign key(organisation_id,actor_internal_user_id)references public.internal_users(organisation_id,id)
);

alter table public.compliance_authority_types enable row level security;
alter table public.compliance_pending_uploads enable row level security;
revoke all on public.compliance_authority_types,public.compliance_pending_uploads from public,anon,authenticated;
grant select on public.compliance_authority_types to service_role;
grant select,insert,update on public.compliance_pending_uploads to service_role;

create or replace function public.ftf_read_operating_authority_register(p_organisation_id uuid)returns jsonb language sql security definer stable set search_path=public,pg_temp as $$
 select jsonb_build_object(
  'authorityTypes',(select coalesce(jsonb_agg(to_jsonb(t)order by t.display_order),'[]')from public.compliance_authority_types t where t.active),
  'authorities',(select coalesce(jsonb_agg(to_jsonb(i)||jsonb_build_object('evidence',coalesce((select jsonb_agg(to_jsonb(e)order by e.created_at)from public.compliance_instrument_evidence e where e.organisation_id=i.organisation_id and e.instrument_id=i.id),'[]'::jsonb))order by i.created_at desc),'[]')from public.organisation_compliance_instruments i where i.organisation_id=p_organisation_id and i.archived_at is null)
 )
$$;

create or replace function public.ftf_authorise_compliance_upload(p_organisation_id uuid,p_actor_internal_user_id uuid,p_payload jsonb)returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.compliance_pending_uploads%rowtype;v_safe text;begin
 if not public.ftf_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'compliance.manage')then return jsonb_build_object('forbidden',true);end if;
 if coalesce(p_payload->>'originalFilename','')=''or(p_payload->>'contentType')not in('application/pdf','image/png','image/jpeg','image/webp')or coalesce((p_payload->>'sizeBytes')::bigint,0)not between 1 and 20971520 then return jsonb_build_object('validation_error',true);end if;
 v_safe=regexp_replace(p_payload->>'originalFilename','[^A-Za-z0-9._-]','_','g');
 insert into public.compliance_pending_uploads(organisation_id,actor_internal_user_id,provider_key,original_filename,content_type,declared_byte_size,evidence_role,description)
 values(p_organisation_id,p_actor_internal_user_id,p_organisation_id::text||'/'||gen_random_uuid()::text||'/'||gen_random_uuid()::text||'/v1/'||v_safe,p_payload->>'originalFilename',p_payload->>'contentType',(p_payload->>'sizeBytes')::bigint,coalesce(nullif(p_payload->>'evidenceRole',''),'DOCUMENT'),nullif(p_payload->>'description',''))returning*into v;
 return jsonb_build_object('record',to_jsonb(v));end$$;

create or replace function public.ftf_finalize_operating_authority(p_organisation_id uuid,p_actor_internal_user_id uuid,p_payload jsonb)returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.organisation_compliance_instruments%rowtype;u jsonb;p public.compliance_pending_uploads%rowtype;e public.compliance_instrument_evidence%rowtype;manifest jsonb='[]';atype text;begin
 if not public.ftf_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'compliance.manage')then return jsonb_build_object('forbidden',true);end if;
 atype=p_payload->>'authorityTypeCode';if not exists(select 1 from public.compliance_authority_types where code=atype and active)then return jsonb_build_object('validation_error',true);end if;
 for u in select*from jsonb_array_elements(coalesce(p_payload->'uploads','[]'))loop select*into p from public.compliance_pending_uploads where organisation_id=p_organisation_id and id=(u->>'uploadId')::uuid for update;if not found or p.actor_internal_user_id<>p_actor_internal_user_id or p.state<>'PENDING'or p.expires_at<=now()then return jsonb_build_object('upload_invalid',true);end if;end loop;
 insert into public.organisation_compliance_instruments(organisation_id,instrument_type,authority_type_code,instrument_number,issuer,issue_date,expiry_date,status,conditions,scope,legal_holder,organisation_arn,notes,operating_location_id,supersedes_instrument_id,created_by_internal_user_id,updated_by_internal_user_id)
 values(p_organisation_id,case when atype='REOC_CERTIFICATE'then'REOC'else atype end,atype,nullif(p_payload->>'authorityNumber',''),coalesce(nullif(p_payload->>'issuer',''),'CASA'),nullif(p_payload->>'issueDate','')::date,nullif(p_payload->>'expiryDate','')::date,coalesce(p_payload->>'status','CURRENT'),coalesce(p_payload->'conditions','[]'),coalesce(p_payload->'scope','{}'),nullif(p_payload->>'legalHolder',''),nullif(p_payload->>'organisationArn',''),nullif(p_payload->>'notes',''),nullif(p_payload->>'operatingLocationId','')::uuid,nullif(p_payload->>'supersedesAuthorityId','')::uuid,p_actor_internal_user_id,p_actor_internal_user_id)returning*into v;
 for u in select*from jsonb_array_elements(coalesce(p_payload->'uploads','[]'))loop select*into p from public.compliance_pending_uploads where organisation_id=p_organisation_id and id=(u->>'uploadId')::uuid for update;
  insert into public.compliance_instrument_evidence(organisation_id,instrument_id,internal_file_id,file_version,original_filename,content_type,byte_size,sha256_checksum,provenance,access_classification,created_by_internal_user_id,evidence_role,description,authority_row_version,storage_bucket,provider_key)
  values(p_organisation_id,v.id,p.internal_file_id,1,p.original_filename,p.content_type,p.declared_byte_size,u->>'checksumSha256',jsonb_build_object('source','OPERATOR_DIRECT_UPLOAD','uploadedAt',p.created_at,'uploadedByInternalUserId',p_actor_internal_user_id),'RESTRICTED',p_actor_internal_user_id,p.evidence_role,p.description,v.row_version,p.storage_bucket,p.provider_key)returning*into e;
  update public.compliance_pending_uploads set state='CONSUMED',consumed_at=now()where id=p.id;manifest=manifest||to_jsonb(e);end loop;
 insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload)values(p_organisation_id,p_actor_internal_user_id,'compliance.authority.created','compliance_instrument',v.id,jsonb_build_object('authorityTypeCode',atype,'version',v.row_version,'evidenceCount',jsonb_array_length(manifest)));
 insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload)values(p_organisation_id,'compliance.authority.created','compliance_instrument',v.id,jsonb_build_object('authorityTypeCode',atype,'version',v.row_version,'evidenceCount',jsonb_array_length(manifest)));
 return jsonb_build_object('record',to_jsonb(v),'evidence',manifest);end$$;

create or replace function public.ftf_append_operating_authority_evidence(p_organisation_id uuid,p_actor_internal_user_id uuid,p_authority_id uuid,p_expected_version integer,p_payload jsonb)returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.organisation_compliance_instruments%rowtype;u jsonb;p public.compliance_pending_uploads%rowtype;e public.compliance_instrument_evidence%rowtype;manifest jsonb='[]';begin
 if not public.ftf_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'compliance.manage')then return jsonb_build_object('forbidden',true);end if;
 select*into v from public.organisation_compliance_instruments where organisation_id=p_organisation_id and id=p_authority_id and archived_at is null for update;if not found then return jsonb_build_object('not_found',true);end if;if v.row_version<>p_expected_version then return jsonb_build_object('conflict',true);end if;
 for u in select*from jsonb_array_elements(coalesce(p_payload->'uploads','[]'))loop select*into p from public.compliance_pending_uploads where organisation_id=p_organisation_id and id=(u->>'uploadId')::uuid for update;if not found or p.actor_internal_user_id<>p_actor_internal_user_id or p.state<>'PENDING'or p.expires_at<=now()then return jsonb_build_object('upload_invalid',true);end if;
  insert into public.compliance_instrument_evidence(organisation_id,instrument_id,internal_file_id,file_version,original_filename,content_type,byte_size,sha256_checksum,provenance,access_classification,created_by_internal_user_id,evidence_role,description,authority_row_version,storage_bucket,provider_key)
  values(p_organisation_id,v.id,p.internal_file_id,1,p.original_filename,p.content_type,p.declared_byte_size,u->>'checksumSha256',jsonb_build_object('source','OPERATOR_DIRECT_UPLOAD','uploadedAt',p.created_at,'uploadedByInternalUserId',p_actor_internal_user_id),'RESTRICTED',p_actor_internal_user_id,p.evidence_role,p.description,v.row_version,p.storage_bucket,p.provider_key)returning*into e;
  update public.compliance_pending_uploads set state='CONSUMED',consumed_at=now()where id=p.id;manifest=manifest||to_jsonb(e);end loop;
 update public.organisation_compliance_instruments set row_version=row_version+1,updated_at=now(),updated_by_internal_user_id=p_actor_internal_user_id where id=v.id returning*into v;
 insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload)values(p_organisation_id,p_actor_internal_user_id,'compliance.authority.evidence_appended','compliance_instrument',v.id,jsonb_build_object('version',v.row_version,'evidenceCount',jsonb_array_length(manifest)));
 insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload)values(p_organisation_id,'compliance.authority.evidence_appended','compliance_instrument',v.id,jsonb_build_object('version',v.row_version,'evidenceCount',jsonb_array_length(manifest)));
 return jsonb_build_object('record',to_jsonb(v),'evidence',manifest);end$$;

-- Required ReOC compatibility: authority_type_code='REOC_CERTIFICATE' and legacy instrument_type='REOC'.
revoke all on function public.ftf_read_operating_authority_register(uuid),public.ftf_authorise_compliance_upload(uuid,uuid,jsonb),public.ftf_finalize_operating_authority(uuid,uuid,jsonb),public.ftf_append_operating_authority_evidence(uuid,uuid,uuid,integer,jsonb)from public,anon,authenticated;
grant execute on function public.ftf_read_operating_authority_register(uuid),public.ftf_authorise_compliance_upload(uuid,uuid,jsonb),public.ftf_finalize_operating_authority(uuid,uuid,jsonb),public.ftf_append_operating_authority_evidence(uuid,uuid,uuid,integer,jsonb)to service_role;
