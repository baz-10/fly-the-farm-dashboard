-- IMP-PER-004: evidence-backed CASA credentials extend authoritative Personnel.

alter table public.personnel add column arn text;
create unique index personnel_org_arn_unique on public.personnel(organisation_id,arn)where arn is not null and archived_at is null;

alter table public.personnel_credentials
 add column lifecycle_type text not null default'EXPIRING'check(lifecycle_type in('NON_EXPIRING','EXPIRING','EVIDENCE_DRIVEN')),
 add column credential_state text not null default'CURRENT'check(credential_state in('CURRENT','SUSPENDED','CANCELLED','SUPERSEDED','UNVERIFIED')),
 add column categories text[] not null default'{}',add column ratings text[] not null default'{}',add column aircraft_types text[] not null default'{}',
 add column minimum_weight_kg numeric,add column maximum_weight_kg numeric,add column conditions text,add column limitations text,
 add column verified_by_internal_user_id uuid,add column verified_at timestamptz,add column review_due_date date,
 add foreign key(organisation_id,verified_by_internal_user_id)references public.internal_users(organisation_id,id),
 add constraint personnel_credential_weight_range check(minimum_weight_kg is null or maximum_weight_kg is null or minimum_weight_kg<=maximum_weight_kg),
 add constraint personnel_credential_expiry_semantics check(lifecycle_type<>'NON_EXPIRING'or expiry_date is null);

update public.personnel_credentials set lifecycle_type='NON_EXPIRING',expiry_date=null where upper(credential_type)='REPL';
update public.personnel_credentials set lifecycle_type='EVIDENCE_DRIVEN'where upper(credential_type)='AROC';

create trigger personnel_evidence_immutable before update or delete on public.personnel_evidence for each row execute function public.reject_append_only_mutation();

create function public.ftf_write_personnel_casa_credential(p_organisation_id uuid,p_actor_internal_user_id uuid,p_personnel_id uuid,p_payload jsonb)returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.personnel_credentials%rowtype;e public.personnel_evidence%rowtype;kind text;life text;expiry date;begin
 if not public.ftf_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'personnel.update')then return jsonb_build_object('forbidden',true);end if;
 if not exists(select 1 from public.personnel where organisation_id=p_organisation_id and id=p_personnel_id and archived_at is null)then return jsonb_build_object('not_found',true);end if;
 kind=upper(p_payload->>'credentialType');if kind not in('REPL','AROC')then return jsonb_build_object('validation_error','Unsupported CASA credential type');end if;
 life=case when kind='REPL'then'NON_EXPIRING'else'EVIDENCE_DRIVEN'end;expiry=case when kind='REPL'then null else nullif(p_payload->>'expiryDate','')::date end;
 update public.personnel_credentials set credential_state='SUPERSEDED',status='superseded',row_version=row_version+1,updated_at=now(),updated_by_internal_user_id=p_actor_internal_user_id where organisation_id=p_organisation_id and id=nullif(p_payload->>'supersedesCredentialId','')::uuid and personnel_id=p_personnel_id;
 insert into public.personnel_credentials(organisation_id,personnel_id,credential_type,credential_kind,identifier,issuer,issue_date,expiry_date,status,verification_state,jurisdiction,notes,supersedes_credential_id,lifecycle_type,credential_state,categories,ratings,aircraft_types,minimum_weight_kg,maximum_weight_kg,conditions,limitations,created_by_internal_user_id,updated_by_internal_user_id)
 values(p_organisation_id,p_personnel_id,kind,'licence',nullif(p_payload->>'identifier',''),'CASA',nullif(p_payload->>'issueDate','')::date,expiry,'current','unverified','AU',nullif(p_payload->>'notes',''),nullif(p_payload->>'supersedesCredentialId','')::uuid,life,'UNVERIFIED',coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'categories','[]'))),'{}'),coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'ratings','[]'))),'{}'),coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'aircraftTypes','[]'))),'{}'),nullif(p_payload->>'minimumWeightKg','')::numeric,nullif(p_payload->>'maximumWeightKg','')::numeric,nullif(p_payload->>'conditions',''),nullif(p_payload->>'limitations',''),p_actor_internal_user_id,p_actor_internal_user_id)returning*into v;
 if p_payload?'evidence'then insert into public.personnel_evidence(organisation_id,personnel_id,credential_id,internal_file_id,file_version,sha256_checksum,evidence_type,access_classification,provenance,retention_state,created_by_internal_user_id)
 values(p_organisation_id,p_personnel_id,v.id,(p_payload#>>'{evidence,internalFileId}')::uuid,(p_payload#>>'{evidence,fileVersion}')::integer,p_payload#>>'{evidence,checksum}',lower(kind)||'_certificate','private',coalesce(p_payload#>'{evidence,provenance}','{}'),'active',p_actor_internal_user_id)returning*into e;end if;
 insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload)values(p_organisation_id,p_actor_internal_user_id,'personnel.casa_credential.created','personnel_credential',v.id,jsonb_build_object('personnel_id',p_personnel_id,'credential_type',kind,'evidence_id',e.id));
 insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload)values(p_organisation_id,'compliance.credential.created','personnel',p_personnel_id,jsonb_build_object('credential_id',v.id,'credential_type',kind,'evidence_id',e.id));
 return jsonb_build_object('record',to_jsonb(v)||jsonb_build_object('evidence',case when e.id is null then null else to_jsonb(e)end,'expiryDisplay',case when life='EVIDENCE_DRIVEN'and expiry is null then'No expiry recorded'when life='NON_EXPIRING'then'Non-expiring'else expiry::text end));end$$;

create function public.ftf_verify_personnel_credential(p_organisation_id uuid,p_actor_internal_user_id uuid,p_credential_id uuid,p_expected_version integer,p_decision text)returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare v public.personnel_credentials%rowtype;begin
 if not public.ftf_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'compliance.verify')then return jsonb_build_object('forbidden',true);end if;
 update public.personnel_credentials set verification_state=case when p_decision='VERIFY'then'verified'else'rejected'end,credential_state=case when p_decision='VERIFY'then'CURRENT'else'UNVERIFIED'end,verified_by_internal_user_id=p_actor_internal_user_id,verified_at=now(),row_version=row_version+1,updated_at=now(),updated_by_internal_user_id=p_actor_internal_user_id where organisation_id=p_organisation_id and id=p_credential_id and row_version=p_expected_version returning*into v;
 if not found then return jsonb_build_object('conflict',true);end if;insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload)values(p_organisation_id,p_actor_internal_user_id,'personnel.credential.verified','personnel_credential',v.id,jsonb_build_object('decision',p_decision,'version',v.row_version));insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload)values(p_organisation_id,'compliance.credential.verified','personnel_credential',v.id,jsonb_build_object('decision',p_decision,'version',v.row_version));return jsonb_build_object('record',to_jsonb(v));end$$;

create function public.ftf_evaluate_personnel_mission_eligibility(p_organisation_id uuid,p_personnel_id uuid,p_operation_date date,p_required_category text,p_required_rating text,p_aircraft_type text,p_aircraft_weight_kg numeric,p_aroc_required boolean default false)returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare repl public.personnel_credentials%rowtype;aroc public.personnel_credentials%rowtype;blockers jsonb='[]';begin
 select*into repl from public.personnel_credentials where organisation_id=p_organisation_id and personnel_id=p_personnel_id and upper(credential_type)='REPL'and credential_state<>'SUPERSEDED'and archived_at is null order by created_at desc limit 1;
 if not found then blockers=blockers||jsonb_build_array(jsonb_build_object('code','CERTIFICATE_MISSING','message','A current RePL certificate is required.'));else
  if repl.verification_state<>'verified'then blockers=blockers||jsonb_build_array(jsonb_build_object('code','EVIDENCE_UNVERIFIED','message','RePL certificate evidence has not been verified.'));end if;
  if repl.credential_state='SUSPENDED'then blockers=blockers||jsonb_build_array(jsonb_build_object('code','CREDENTIAL_SUSPENDED','message','The RePL is suspended.'));end if;
  if repl.credential_state='CANCELLED'then blockers=blockers||jsonb_build_array(jsonb_build_object('code','CREDENTIAL_CANCELLED','message','The RePL is cancelled.'));end if;
  if p_required_category is not null and not(p_required_category=any(repl.categories))then blockers=blockers||jsonb_build_array(jsonb_build_object('code','CATEGORY_INELIGIBLE','message','The RePL category does not cover this Mission.'));end if;
  if p_required_rating is not null and not(p_required_rating=any(repl.ratings))then blockers=blockers||jsonb_build_array(jsonb_build_object('code','RATING_INELIGIBLE','message','The RePL rating does not cover this Mission.'));end if;
  if p_aircraft_type is not null and cardinality(repl.aircraft_types)>0 and not(p_aircraft_type=any(repl.aircraft_types))then blockers=blockers||jsonb_build_array(jsonb_build_object('code','AIRCRAFT_TYPE_INELIGIBLE','message','The RePL does not cover this aircraft type.'));end if;
  if(repl.minimum_weight_kg is not null and p_aircraft_weight_kg<repl.minimum_weight_kg)or(repl.maximum_weight_kg is not null and p_aircraft_weight_kg>repl.maximum_weight_kg)then blockers=blockers||jsonb_build_array(jsonb_build_object('code','WEIGHT_INELIGIBLE','message','The aircraft weight is outside the credential eligibility.'));end if;
  if repl.lifecycle_type='EXPIRING'and repl.expiry_date<p_operation_date then blockers=blockers||jsonb_build_array(jsonb_build_object('code','CREDENTIAL_EXPIRED','message','The time-limited credential expires before the Mission.'));end if;
 end if;
 if p_aroc_required then select*into aroc from public.personnel_credentials where organisation_id=p_organisation_id and personnel_id=p_personnel_id and upper(credential_type)='AROC'and credential_state='CURRENT'and verification_state='verified'and archived_at is null order by created_at desc limit 1;if not found then blockers=blockers||jsonb_build_array(jsonb_build_object('code','AROC_REQUIRED','message','A verified AROC is required for this Mission.'));elsif aroc.expiry_date is not null and aroc.expiry_date<p_operation_date then blockers=blockers||jsonb_build_array(jsonb_build_object('code','CREDENTIAL_EXPIRED','message','The AROC expires before the Mission.'));end if;end if;
 return jsonb_build_object('eligible',jsonb_array_length(blockers)=0,'blockers',blockers);end$$;

revoke all on function public.ftf_write_personnel_casa_credential(uuid,uuid,uuid,jsonb),public.ftf_verify_personnel_credential(uuid,uuid,uuid,integer,text),public.ftf_evaluate_personnel_mission_eligibility(uuid,uuid,date,text,text,text,numeric,boolean)from public,anon,authenticated;
grant execute on function public.ftf_write_personnel_casa_credential(uuid,uuid,uuid,jsonb),public.ftf_verify_personnel_credential(uuid,uuid,uuid,integer,text),public.ftf_evaluate_personnel_mission_eligibility(uuid,uuid,date,text,text,text,numeric,boolean)to service_role;
