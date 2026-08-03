-- NEW-MIS-002: additive Customer Outcome evolution. Historical Customer Acceptance
-- evidence is preserved; new submissions use the expanded immutable contract.

create table public.customer_outcome_satisfaction_levels(
 id uuid primary key default gen_random_uuid(),
 code text unique not null,
 display_name text not null,
 description text not null,
 version integer not null default 1,
 display_order integer not null,
 is_active boolean not null default true
);
insert into public.customer_outcome_satisfaction_levels(code,display_name,description,display_order) values
 ('VERY_SATISFIED','Very satisfied','The customer reports a very positive outcome.',10),
 ('SATISFIED','Satisfied','The customer reports a positive outcome.',20),
 ('NEUTRAL','Neutral','The customer reports a neutral outcome.',30),
 ('DISSATISFIED','Dissatisfied','The customer reports a negative outcome.',40),
 ('VERY_DISSATISFIED','Very dissatisfied','The customer reports a very negative outcome.',50);

alter table public.customer_acceptance_records
 add column outcome_summary text,
 add column satisfaction_code text references public.customer_outcome_satisfaction_levels(code),
 add column follow_up_requested boolean,
 add column follow_up_date date,
 add column correction_reason text,
 add constraint customer_outcome_summary_nonblank check(outcome_summary is null or length(trim(outcome_summary))>0),
 add constraint customer_outcome_follow_up_date_required check(follow_up_requested is null or not follow_up_requested or follow_up_date is not null),
 add constraint customer_outcome_correction_reason_required check(supersedes_acceptance_id is null or length(trim(coalesce(correction_reason,'')))>0);

-- The signature is optional for every channel. Secure-link consent remains mandatory.
do $$declare c record;begin
 for c in select conname from pg_constraint where conrelid='public.customer_acceptance_records'::regclass and contype='c' and pg_get_constraintdef(oid) ilike ('%signature_file_id is not'||' null%') loop
  execute format('alter table public.customer_acceptance_records drop constraint %I',c.conname);
 end loop;
end$$;
alter table public.customer_acceptance_records add constraint customer_outcome_customer_consent_required
 check(submission_channel='OPERATOR' or (consent_declaration is not null and consented_at is not null));

do $$declare c record;begin
 for c in select conname from pg_constraint where conrelid='public.customer_acceptance_files'::regclass and contype='c' and pg_get_constraintdef(oid) ilike '%SIGNATURE%ATTACHMENT%' loop
  execute format('alter table public.customer_acceptance_files drop constraint %I',c.conname);
 end loop;
end$$;
alter table public.customer_acceptance_files
 add column capture_timestamp timestamptz,
 add column caption text,
 add column access_classification text not null default 'MISSION_AUTHORISED_USERS',
 add constraint customer_outcome_file_kind check(kind in('OUTCOME_PHOTO','SIGNATURE','ATTACHMENT'));

-- Staging is mutable until the trusted command claims a file. Authoritative files
-- are inserted into customer_acceptance_files and protected by reject_append_only_mutation.
create table public.customer_outcome_pending_files(
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null references public.organisations(id),
 mission_id uuid not null references public.missions(id),internal_file_id uuid not null default gen_random_uuid(),
 kind text not null check(kind in('OUTCOME_PHOTO','SIGNATURE','ATTACHMENT')),original_filename text not null,
 content_type text not null,byte_size integer not null check(byte_size>0 and byte_size<=3145728),
 sha256_checksum text not null,storage_provider text not null,storage_bucket text not null,provider_key text not null,
 provenance jsonb not null,capture_timestamp timestamptz,caption text,access_classification text not null default 'MISSION_AUTHORISED_USERS',
 uploaded_by_internal_user_id uuid references public.internal_users(id),upload_token_hash text,created_at timestamptz not null default now(),
 expires_at timestamptz not null default(now()+interval '24 hours'),claimed_at timestamptz,
 unique(organisation_id,internal_file_id)
);
alter table public.customer_outcome_pending_files enable row level security;
alter table public.customer_outcome_pending_files force row level security;
create policy customer_outcome_pending_files_tenant_read on public.customer_outcome_pending_files for select to authenticated using(public.current_user_has_organisation_access(organisation_id));
revoke all on table public.customer_outcome_pending_files from public,anon,authenticated;
grant select,insert,update on table public.customer_outcome_pending_files to service_role;

create or replace function public.ftf_read_customer_acceptance(p_organisation_id uuid,p_mission_id uuid)returns jsonb language sql security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('context',public.ftf_customer_acceptance_context(p_organisation_id,p_mission_id),'records',coalesce((select jsonb_agg(to_jsonb(r)order by r.sequence_number)from public.customer_acceptance_records r where r.organisation_id=p_organisation_id and r.mission_id=p_mission_id),'[]'),'links',coalesce((select jsonb_agg(to_jsonb(l)-'token_hash'order by l.issued_at desc)from public.customer_acceptance_links l where l.organisation_id=p_organisation_id and l.mission_id=p_mission_id),'[]'),'catalogues',jsonb_build_object('states',(select jsonb_agg(to_jsonb(s)order by s.display_order)from public.customer_acceptance_states s where s.is_active),'methods',(select jsonb_agg(to_jsonb(m)order by m.display_order)from public.customer_acceptance_methods m where m.is_active),'satisfactionLevels',(select jsonb_agg(to_jsonb(x)order by x.display_order)from public.customer_outcome_satisfaction_levels x where x.is_active)))
$$;

create or replace function public.ftf_create_customer_acceptance(p_organisation_id uuid,p_actor_internal_user_id uuid,p_mission_id uuid,p_payload jsonb)returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.missions%rowtype;c public.mission_completion_revisions%rowtype;j public.jobs%rowtype;cl public.clients%rowtype;p public.personnel%rowtype;s public.customer_acceptance_states%rowtype;md public.customer_acceptance_methods%rowtype;r public.customer_acceptance_records%rowtype;n integer;f uuid;begin
 select*into m from public.missions where organisation_id=p_organisation_id and id=p_mission_id and archived_at is null;select*into c from public.mission_completion_revisions where organisation_id=p_organisation_id and mission_id=p_mission_id order by version_number desc limit 1;if c.id is null then return jsonb_build_object('completion_required',true);end if;
 select*into j from public.jobs where organisation_id=p_organisation_id and id=m.job_id;select*into cl from public.clients where organisation_id=p_organisation_id and id=j.client_id;select*into p from public.personnel where organisation_id=p_organisation_id and internal_user_id=p_actor_internal_user_id and archived_at is null;select*into s from public.customer_acceptance_states where code=p_payload->>'stateCode'and is_active;select*into md from public.customer_acceptance_methods where code=p_payload->>'methodCode'and is_active;
 if p.id is null or s.id is null or md.id is null or length(trim(coalesce(p_payload->>'outcomeSummary','')))=0 or not exists(select 1 from public.customer_outcome_satisfaction_levels where code=p_payload->>'satisfactionCode'and is_active) or (coalesce((p_payload->>'followUpRequested')::boolean,false)and nullif(p_payload->>'followUpDate','')is null) or (nullif(p_payload->>'supersedesAcceptanceId','')is not null and length(trim(coalesce(p_payload->>'correctionReason','')))=0) then return jsonb_build_object('validation_error',true);end if;
 select coalesce(max(sequence_number),0)+1 into n from public.customer_acceptance_records where organisation_id=p_organisation_id and mission_id=p_mission_id;
 insert into public.customer_acceptance_records(organisation_id,operating_location_id,mission_id,completion_revision_id,sequence_number,state_id,state_snapshot,method_id,method_snapshot,submission_channel,customer_id,customer_snapshot,customer_contact_name,customer_contact_role,customer_contact_email,customer_contact_phone,customer_comments,outcome_summary,satisfaction_code,follow_up_requested,follow_up_date,acknowledged_at,operator_personnel_id,operator_personnel_snapshot,supersedes_acceptance_id,correction_reason,created_by_internal_user_id)
 values(p_organisation_id,m.operating_location_id,m.id,c.id,n,s.id,to_jsonb(s),md.id,to_jsonb(md),'OPERATOR',cl.id,to_jsonb(cl)-'organisation_id',trim(p_payload->>'customerContactName'),p_payload->>'customerContactRole',p_payload->>'customerContactEmail',p_payload->>'customerContactPhone',p_payload->>'comments',trim(p_payload->>'outcomeSummary'),p_payload->>'satisfactionCode',coalesce((p_payload->>'followUpRequested')::boolean,false),nullif(p_payload->>'followUpDate','')::date,(p_payload->>'acknowledgedAt')::timestamptz,p.id,jsonb_build_object('id',p.id,'name',p.full_name),nullif(p_payload->>'supersedesAcceptanceId','')::uuid,p_payload->>'correctionReason',p_actor_internal_user_id)returning*into r;
 for f in select jsonb_array_elements_text(coalesce(p_payload->'pendingFileIds','[]'::jsonb))::uuid loop
  insert into public.customer_acceptance_files(organisation_id,mission_id,acceptance_id,internal_file_id,kind,original_filename,content_type,byte_size,sha256_checksum,storage_provider,storage_bucket,provider_key,provenance,capture_timestamp,caption,access_classification,uploaded_by_internal_user_id,claimed_at)
  select organisation_id,mission_id,r.id,internal_file_id,kind,original_filename,content_type,byte_size,sha256_checksum,storage_provider,storage_bucket,provider_key,provenance,capture_timestamp,caption,access_classification,uploaded_by_internal_user_id,now() from public.customer_outcome_pending_files where id=f and organisation_id=p_organisation_id and mission_id=p_mission_id and uploaded_by_internal_user_id=p_actor_internal_user_id and claimed_at is null and expires_at>now();if not found then raise exception'Invalid Customer Outcome file';end if;update public.customer_outcome_pending_files set claimed_at=now()where id=f;
 end loop;
 insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload)values(p_organisation_id,p_actor_internal_user_id,'customer_outcome.recorded','customer_acceptance',r.id,jsonb_build_object('mission_id',m.id));insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload)values(p_organisation_id,'post_mission.customer_outcome.recorded','mission',m.id,jsonb_build_object('customer_outcome_id',r.id));return jsonb_build_object('record',to_jsonb(r));
end$$;

create or replace function public.ftf_submit_customer_acceptance_link(p_token_hash text,p_access_fingerprint text,p_payload jsonb)returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare l public.customer_acceptance_links%rowtype;s public.customer_acceptance_states%rowtype;md public.customer_acceptance_methods%rowtype;r public.customer_acceptance_records%rowtype;n integer;f uuid;signature_id uuid;begin
 select*into l from public.customer_acceptance_links where token_hash=p_token_hash for update;if l.id is null or l.revoked_at is not null or l.expires_at<=now()or l.consumed_at is not null then return jsonb_build_object('unavailable',true);end if;
 if coalesce((p_payload->>'consent')::boolean,false)is not true or length(trim(coalesce(p_payload->>'consentDeclaration','')))<10 or length(trim(coalesce(p_payload->>'outcomeSummary','')))=0 or not exists(select 1 from public.customer_outcome_satisfaction_levels where code=p_payload->>'satisfactionCode'and is_active) or (coalesce((p_payload->>'followUpRequested')::boolean,false)and nullif(p_payload->>'followUpDate','')is null) then return jsonb_build_object('validation_error',true);end if;
 select*into s from public.customer_acceptance_states where code=p_payload->>'stateCode'and is_active;select*into md from public.customer_acceptance_methods where code='SECURE_LINK';select coalesce(max(sequence_number),0)+1 into n from public.customer_acceptance_records where organisation_id=l.organisation_id and mission_id=l.mission_id;
 signature_id=nullif(p_payload->>'signatureFileId','')::uuid;
 insert into public.customer_acceptance_records(organisation_id,operating_location_id,mission_id,completion_revision_id,sequence_number,state_id,state_snapshot,method_id,method_snapshot,submission_channel,customer_id,customer_snapshot,customer_contact_name,customer_contact_role,customer_contact_email,customer_comments,outcome_summary,satisfaction_code,follow_up_requested,follow_up_date,acknowledged_at,consent_declaration,consented_at,signature_file_id,secure_link_id)
 values(l.organisation_id,l.operating_location_id,l.mission_id,l.completion_revision_id,n,s.id,to_jsonb(s),md.id,to_jsonb(md),'SECURE_LINK',l.customer_id,l.customer_snapshot,trim(p_payload->>'customerContactName'),p_payload->>'customerContactRole',p_payload->>'customerContactEmail',p_payload->>'comments',trim(p_payload->>'outcomeSummary'),p_payload->>'satisfactionCode',coalesce((p_payload->>'followUpRequested')::boolean,false),nullif(p_payload->>'followUpDate','')::date,now(),p_payload->>'consentDeclaration',now(),signature_id,l.id)returning*into r;
 for f in select jsonb_array_elements_text(coalesce(p_payload->'pendingFileIds','[]'::jsonb))::uuid loop
  insert into public.customer_acceptance_files(organisation_id,mission_id,acceptance_id,internal_file_id,kind,original_filename,content_type,byte_size,sha256_checksum,storage_provider,storage_bucket,provider_key,provenance,capture_timestamp,caption,access_classification,upload_token_hash,claimed_at)
  select organisation_id,mission_id,r.id,internal_file_id,kind,original_filename,content_type,byte_size,sha256_checksum,storage_provider,storage_bucket,provider_key,provenance,capture_timestamp,caption,access_classification,upload_token_hash,now() from public.customer_outcome_pending_files where id=f and organisation_id=l.organisation_id and mission_id=l.mission_id and upload_token_hash=p_token_hash and claimed_at is null and expires_at>now();if not found then raise exception'Invalid Customer Outcome file';end if;update public.customer_outcome_pending_files set claimed_at=now()where id=f;
 end loop;
 update public.customer_acceptance_links set consumed_at=now(),resulting_acceptance_id=r.id,row_version=row_version+1 where id=l.id;insert into public.audit_events(organisation_id,event_type,entity_type,entity_id,event_payload)values(l.organisation_id,'customer_outcome.customer_submitted','customer_acceptance',r.id,jsonb_build_object('mission_id',l.mission_id,'link_id',l.id));insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload)values(l.organisation_id,'post_mission.customer_outcome.customer_submitted','mission',l.mission_id,jsonb_build_object('customer_outcome_id',r.id,'link_id',l.id));return jsonb_build_object('record',jsonb_build_object('id',r.id,'state',s.code,'acknowledgedAt',r.acknowledged_at));
end$$;

revoke all on table public.customer_outcome_satisfaction_levels from public,anon,authenticated;
grant select on table public.customer_outcome_satisfaction_levels to service_role;
create or replace function public.ftf_resolve_customer_acceptance_link(p_token_hash text,p_access_fingerprint text)returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare l public.customer_acceptance_links%rowtype;ctx jsonb;begin select*into l from public.customer_acceptance_links where token_hash=p_token_hash for update;if l.id is null then return jsonb_build_object('invalid',true);end if;if l.revoked_at is not null then return jsonb_build_object('revoked',true);end if;if l.consumed_at is not null then return jsonb_build_object('consumed',true);end if;if l.expires_at<=now()then return jsonb_build_object('expired',true);end if;if l.access_count>=50 then return jsonb_build_object('rate_limited',true);end if;update public.customer_acceptance_links set access_count=access_count+1,last_access_at=now()where id=l.id;ctx=public.ftf_customer_acceptance_context(l.organisation_id,l.mission_id);return jsonb_build_object('linkId',l.id,'organisationId',l.organisation_id,'missionId',l.mission_id,'rowVersion',l.row_version,'expiresAt',l.expires_at,'organisationName',ctx#>>'{organisation,name}','missionReference',ctx->>'missionReference','completedAt',ctx->>'completedAt','customerName',l.customer_snapshot->>'name','intendedContactName',l.intended_contact_name,'states',(select jsonb_agg(jsonb_build_object('code',s.code,'displayName',s.display_name,'description',s.description)order by s.display_order)from public.customer_acceptance_states s where s.is_active),'satisfactionLevels',(select jsonb_agg(jsonb_build_object('code',x.code,'displayName',x.display_name,'description',x.description)order by x.display_order)from public.customer_outcome_satisfaction_levels x where x.is_active));end$$;
-- Existing RLS, audit, outbox, immutable evidence and API grants remain authoritative.
