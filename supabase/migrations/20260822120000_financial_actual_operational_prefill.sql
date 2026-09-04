-- Financial Actuals Slice 3: reviewed Mission operational evidence proposal,
-- explicit Draft-only acceptance, frozen source identity and read-only drift.

create function public.ftf_financial_actual_operational_proposal(
  p_organisation_id uuid,p_actor_internal_user_id uuid,p_financial_actual_id uuid
)returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare
  a public.financial_actuals%rowtype;r public.financial_actual_revisions%rowtype;m public.missions%rowtype;
  c public.mission_completion_revisions%rowtype;o public.mission_operational_revisions%rowtype;
  h public.mission_operational_chemical_revisions%rowtype;s public.mission_operational_resource_revisions%rowtype;
  sources jsonb;facts jsonb='[]'::jsonb;raw jsonb;item jsonb;kind text;identifier text;label text;value_text text;unit_text text;
  field_text text;source_type text;source_id uuid;source_version text;source_recorded timestamptz;evidence text;comparison text;
  existing public.financial_actual_value_provenance%rowtype;source_projection jsonb;
begin
  select * into a from public.financial_actuals where organisation_id=p_organisation_id and id=p_financial_actual_id and archived_at is null;
  if not found then return jsonb_build_object('not_found',true);end if;
  if not public.ftf_financial_actor_has_location(p_organisation_id,p_actor_internal_user_id,a.operating_location_id)then raise exception using errcode='42501',message='FINANCIAL_ACTUAL_LOCATION_FORBIDDEN';end if;
  select * into r from public.financial_actual_revisions where organisation_id=p_organisation_id and financial_actual_id=a.id and id=coalesce(a.active_draft_revision_id,a.current_final_revision_id);
  if not found or a.mission_id is null then return jsonb_build_object('not_found',true);end if;
  select * into m from public.missions where organisation_id=p_organisation_id and id=a.mission_id and job_id=a.job_id and operating_location_id=a.operating_location_id and archived_at is null and status='completed';
  if not found or not exists(select 1 from public.clients cl join public.properties pr on pr.organisation_id=cl.organisation_id and pr.client_id=cl.id join public.fields f on f.organisation_id=pr.organisation_id and f.property_id=pr.id join public.jobs j on j.organisation_id=cl.organisation_id and j.client_id=cl.id and j.property_id=pr.id join public.job_fields jf on jf.organisation_id=j.organisation_id and jf.job_id=j.id and jf.field_id=f.id and jf.archived_at is null where cl.organisation_id=p_organisation_id and cl.id=a.client_id and pr.id=a.property_id and f.id=a.field_id and j.id=a.job_id and cl.archived_at is null and pr.archived_at is null and f.archived_at is null and j.archived_at is null)then raise exception using errcode='23514',message='FINANCIAL_ACTUAL_OPERATIONAL_SOURCE_SCOPE_INVALID';end if;
  select * into c from public.mission_completion_revisions where organisation_id=p_organisation_id and mission_id=m.id and operating_location_id=a.operating_location_id order by version_number desc limit 1;
  if not found then return jsonb_build_object('source_unavailable',true);end if;
  select * into o from public.mission_operational_revisions where organisation_id=p_organisation_id and mission_id=m.id and operating_location_id=a.operating_location_id and id=c.operational_revision_id;
  select * into h from public.mission_operational_chemical_revisions where organisation_id=p_organisation_id and mission_id=m.id and operating_location_id=a.operating_location_id and id=o.chemical_revision_id;
  select * into s from public.mission_operational_resource_revisions where organisation_id=p_organisation_id and mission_id=m.id and operating_location_id=a.operating_location_id and id=o.resource_revision_id;
  if o.id is null or h.id is null or s.id is null then raise exception using errcode='23514',message='FINANCIAL_ACTUAL_OPERATIONAL_SOURCE_SCOPE_INVALID';end if;
  sources:=jsonb_build_object(
    'mission',jsonb_build_object('id',m.id,'version',m.row_version),
    'completion',jsonb_build_object('id',c.id,'version',c.version_number,'recordedAt',to_char(c.completed_at at time zone'UTC','YYYY-MM-DD"T"HH24:MI:SS')||'+00:00'),
    'operational',jsonb_build_object('id',o.id,'version',o.version_number,'recordedAt',to_char(o.submitted_at at time zone'UTC','YYYY-MM-DD"T"HH24:MI:SS')||'+00:00'),
    'chemicals',jsonb_build_object('id',h.id,'version',h.version_number,'recordedAt',to_char(h.recorded_at at time zone'UTC','YYYY-MM-DD"T"HH24:MI:SS')||'+00:00'),
    'resources',jsonb_build_object('id',s.id,'version',s.version_number,'recordedAt',to_char(s.recorded_at at time zone'UTC','YYYY-MM-DD"T"HH24:MI:SS')||'+00:00'));

  -- Only explicitly structured operational values are proposed. Free text is never inferred.
  if jsonb_typeof(h.actual_usage->'actualTreatmentAreaHa')='string' then
    value_text:=h.actual_usage->>'actualTreatmentAreaHa';
    perform public.ftf_financial_actual_parse_decimal(value_text,18,6);
    field_text:='revenue/actualHectares';unit_text:='HECTARE';source_type:='mission_operational_chemical_revision';source_id:=h.id;source_version:=h.version_number::text;source_recorded:=h.recorded_at;
    evidence:=encode(sha256(convert_to(jsonb_build_object('fieldPath',field_text,'sourceEntityId',source_id,'sourceVersion',source_version,'value',value_text,'unitCode',unit_text)::text,'UTF8')),'hex');
    select * into existing from public.financial_actual_value_provenance p where p.organisation_id=p_organisation_id and p.financial_actual_revision_id=r.id and p.field_path=field_text order by p.created_at desc,p.id desc limit 1;
    comparison:=case when existing.id is null then'NEW_SOURCE_EVIDENCE'when existing.source_entity_id=source_id and existing.source_version=source_version and existing.effective_value#>>'{}'=value_text then'UNCHANGED'when existing.provenance_class='MANUAL_OVERRIDE'then'DRAFT_OVERRIDE_EXISTS'else'CHANGED_SOURCE_VALUE'end;
    facts:=facts||jsonb_build_array(jsonb_build_object('fieldPath',field_text,'value',value_text,'unitCode',unit_text,'sourceClass','AUTHORITATIVE_OPERATIONAL_INPUT','sourceEntityType',source_type,'sourceEntityId',source_id,'sourceVersion',source_version,'sourceRecordedAt',source_recorded,'evidenceIdentity',evidence,'comparison',comparison));
  end if;
  if h.actual_usage?'products' then
    if jsonb_typeof(h.actual_usage->'products')<>'array'then raise exception using errcode='22023',message='FINANCIAL_ACTUAL_OPERATIONAL_PRODUCT_INVALID';end if;
    for item in select value from jsonb_array_elements(h.actual_usage->'products') loop
      if jsonb_typeof(item)<>'object'or jsonb_typeof(item->'productId')<>'string'or jsonb_typeof(item->'actualQuantity')<>'string'or jsonb_typeof(item->'unit')<>'string'or(item->>'productId')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'then raise exception using errcode='22023',message='FINANCIAL_ACTUAL_OPERATIONAL_PRODUCT_INVALID';end if;
      identifier:=item->>'productId';value_text:=item->>'actualQuantity';unit_text:=upper(item->>'unit');if unit_text not in('L','ML','KG','G')then raise exception using errcode='22023',message='FINANCIAL_ACTUAL_OPERATIONAL_PRODUCT_INVALID';end if;perform public.ftf_financial_actual_parse_decimal(value_text,18,6);
      field_text:='operational/products/'||identifier||'/actualQuantity';source_type:='mission_operational_chemical_revision';source_id:=h.id;source_version:=h.version_number::text;source_recorded:=h.recorded_at;
      evidence:=encode(sha256(convert_to(jsonb_build_object('fieldPath',field_text,'sourceEntityId',source_id,'sourceVersion',source_version,'value',value_text,'unitCode',unit_text)::text,'UTF8')),'hex');
      select * into existing from public.financial_actual_value_provenance p where p.organisation_id=p_organisation_id and p.financial_actual_revision_id=r.id and p.field_path=field_text order by p.created_at desc,p.id desc limit 1;
      comparison:=case when existing.id is null then'NEW_SOURCE_EVIDENCE'when existing.source_entity_id=source_id and existing.source_version=source_version and existing.effective_value#>>'{}'=value_text then'UNCHANGED'when existing.provenance_class='MANUAL_OVERRIDE'then'DRAFT_OVERRIDE_EXISTS'else'CHANGED_SOURCE_VALUE'end;
      facts:=facts||jsonb_build_array(jsonb_build_object('fieldPath',field_text,'value',value_text,'unitCode',unit_text,'sourceClass','AUTHORITATIVE_OPERATIONAL_INPUT','sourceEntityType',source_type,'sourceEntityId',source_id,'sourceVersion',source_version,'sourceRecordedAt',source_recorded,'evidenceIdentity',evidence,'comparison',comparison,'productVersion',item->>'productVersion','productName',left(coalesce(item->>'productName',''),200)));
    end loop;
  end if;
  foreach kind in array array['aircraft','equipmentKits','personnel'] loop
    raw:=s.actual_resources->(case kind when'aircraft'then'aircraftIds'when'equipmentKits'then'equipmentKitIds'else'personnelIds'end);
    if raw is null then continue;end if;if jsonb_typeof(raw)<>'array'then raise exception using errcode='22023',message='FINANCIAL_ACTUAL_OPERATIONAL_RESOURCE_INVALID';end if;
    for item in select value from jsonb_array_elements(raw) loop
      if jsonb_typeof(item)<>'string'or(item#>>'{}')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'then raise exception using errcode='22023',message='FINANCIAL_ACTUAL_OPERATIONAL_RESOURCE_INVALID';end if;
      identifier:=item#>>'{}';
      if(kind='aircraft'and not exists(select 1 from public.aircraft x where x.organisation_id=p_organisation_id and x.operating_location_id=a.operating_location_id and x.id=identifier::uuid))or(kind='equipmentKits'and not exists(select 1 from public.equipment_kits x where x.organisation_id=p_organisation_id and x.operating_location_id=a.operating_location_id and x.id=identifier::uuid))or(kind='personnel'and not exists(select 1 from public.personnel x join public.personnel_operating_locations l on l.organisation_id=x.organisation_id and l.personnel_id=x.id where x.organisation_id=p_organisation_id and x.id=identifier::uuid and l.operating_location_id=a.operating_location_id))then raise exception using errcode='23514',message='FINANCIAL_ACTUAL_OPERATIONAL_RESOURCE_SCOPE_INVALID';end if;
      field_text:='operational/'||kind||'/'||identifier;value_text:=identifier;unit_text:='IDENTITY';source_type:='mission_operational_resource_revision';source_id:=s.id;source_version:=s.version_number::text;source_recorded:=s.recorded_at;
      evidence:=encode(sha256(convert_to(jsonb_build_object('fieldPath',field_text,'sourceEntityId',source_id,'sourceVersion',source_version,'value',value_text,'unitCode',unit_text)::text,'UTF8')),'hex');
      select * into existing from public.financial_actual_value_provenance p where p.organisation_id=p_organisation_id and p.financial_actual_revision_id=r.id and p.field_path=field_text order by p.created_at desc,p.id desc limit 1;
      comparison:=case when existing.id is null then'NEW_SOURCE_EVIDENCE'when existing.source_entity_id=source_id and existing.source_version=source_version and existing.effective_value#>>'{}'=value_text then'UNCHANGED'else'CHANGED_SOURCE_VALUE'end;
      facts:=facts||jsonb_build_array(jsonb_build_object('fieldPath',field_text,'value',value_text,'unitCode',unit_text,'sourceClass','AUTHORITATIVE_OPERATIONAL_INPUT','sourceEntityType',source_type,'sourceEntityId',source_id,'sourceVersion',source_version,'sourceRecordedAt',source_recorded,'evidenceIdentity',evidence,'comparison',comparison));
    end loop;
  end loop;
  if jsonb_array_length(facts)<>(select count(distinct x->>'fieldPath')from jsonb_array_elements(facts)x)or jsonb_array_length(facts)<>(select count(distinct x->>'evidenceIdentity')from jsonb_array_elements(facts)x)then raise exception using errcode='22023',message='FINANCIAL_ACTUAL_OPERATIONAL_FACT_DUPLICATE';end if;
  source_projection:=jsonb_build_object('missionId',m.id,'completionRevisionId',c.id,'completionVersion',c.version_number,'sources',sources,'facts',(select coalesce(jsonb_agg(x order by x->>'fieldPath'),'[]'::jsonb)from jsonb_array_elements(facts)x));
  return source_projection||jsonb_build_object('proposalDigest',encode(sha256(convert_to(source_projection::text,'UTF8')),'hex'),'draftRevisionId',r.id,'draftVersion',r.row_version);
end$$;

create function public.ftf_read_financial_actual_operational_prefill(p_organisation_id uuid,p_actor_internal_user_id uuid,p_financial_actual_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$begin
  if not public.ftf_financial_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'financial_actuals.update')then raise exception using errcode='42501',message='FINANCIAL_ACTUAL_FORBIDDEN';end if;
  if not exists(select 1 from public.financial_actuals a join public.financial_actual_revisions r on r.organisation_id=a.organisation_id and r.financial_actual_id=a.id and r.id=a.active_draft_revision_id and r.status='DRAFT'where a.organisation_id=p_organisation_id and a.id=p_financial_actual_id and a.archived_at is null)then return jsonb_build_object('not_found',true);end if;
  return public.ftf_financial_actual_operational_proposal(p_organisation_id,p_actor_internal_user_id,p_financial_actual_id);
end$$;

create function public.ftf_accept_financial_actual_operational_prefill(p_organisation_id uuid,p_actor_internal_user_id uuid,p_financial_actual_id uuid,p_revision_id uuid,p_expected_version integer,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.financial_actuals%rowtype;r public.financial_actual_revisions%rowtype;proposal jsonb;selection jsonb;fact jsonb;source_row uuid;accepted jsonb='[]'::jsonb;accepted_count integer=0;action text;effective text;reason text;field_text text;
begin
  if not public.ftf_financial_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'financial_actuals.update')then raise exception using errcode='42501',message='FINANCIAL_ACTUAL_FORBIDDEN';end if;
  if jsonb_typeof(p_payload)<>'object'or jsonb_typeof(p_payload->'proposalDigest')<>'string'or(jsonb_typeof(p_payload->'selections')<>'array'and coalesce((p_payload->>'acceptAll')::boolean,false)is not true)then raise exception using errcode='22023',message='FINANCIAL_ACTUAL_PREFILL_SELECTION_INVALID';end if;
  select * into a from public.financial_actuals where organisation_id=p_organisation_id and id=p_financial_actual_id and archived_at is null for update;if not found then return jsonb_build_object('not_found',true);end if;
  if not public.ftf_financial_actor_has_location(p_organisation_id,p_actor_internal_user_id,a.operating_location_id)then raise exception using errcode='42501',message='FINANCIAL_ACTUAL_LOCATION_FORBIDDEN';end if;
  select * into r from public.financial_actual_revisions where organisation_id=p_organisation_id and financial_actual_id=a.id and id=p_revision_id and status='DRAFT'for update;if not found or a.active_draft_revision_id is distinct from r.id then return jsonb_build_object('not_found',true);end if;
  if r.row_version<>p_expected_version then return jsonb_build_object('conflict',true,'current_version',r.row_version);end if;
  proposal:=public.ftf_financial_actual_operational_proposal(p_organisation_id,p_actor_internal_user_id,p_financial_actual_id);
  if proposal->>'proposalDigest'is distinct from p_payload->>'proposalDigest'then return jsonb_build_object('source_conflict',true);end if;
  if coalesce((p_payload->>'acceptAll')::boolean,false)then p_payload:=jsonb_set(p_payload,'{selections}',(select coalesce(jsonb_agg(jsonb_build_object('evidenceIdentity',x->>'evidenceIdentity','action','ACCEPT')),'[]'::jsonb)from jsonb_array_elements(proposal->'facts')x));end if;
  if jsonb_array_length(p_payload->'selections')=0 then raise exception using errcode='22023',message='FINANCIAL_ACTUAL_PREFILL_SELECTION_INVALID';end if;
  if jsonb_array_length(p_payload->'selections')<>(select count(distinct x->>'evidenceIdentity')from jsonb_array_elements(p_payload->'selections')x)then raise exception using errcode='22023',message='FINANCIAL_ACTUAL_PREFILL_SELECTION_DUPLICATE';end if;
  for selection in select value from jsonb_array_elements(p_payload->'selections') loop
    if jsonb_typeof(selection)<>'object'then raise exception using errcode='22023',message='FINANCIAL_ACTUAL_PREFILL_SELECTION_INVALID';end if;
    select value into fact from jsonb_array_elements(proposal->'facts')where value->>'evidenceIdentity'=selection->>'evidenceIdentity';if fact is null then raise exception using errcode='22023',message='FINANCIAL_ACTUAL_PREFILL_SELECTION_INVALID';end if;
    action:=upper(coalesce(selection->>'action',''));if action not in('ACCEPT','OVERRIDE','RETAIN')then raise exception using errcode='22023',message='FINANCIAL_ACTUAL_PREFILL_SELECTION_INVALID';end if;if action='RETAIN'then continue;end if;
    field_text:=fact->>'fieldPath';if exists(select 1 from public.financial_actual_value_provenance p where p.organisation_id=p_organisation_id and p.financial_actual_revision_id=r.id and p.field_path=field_text)then
      if action='ACCEPT'and fact->>'comparison' not in('UNCHANGED','NEW_SOURCE_EVIDENCE')then raise exception using errcode='22023',message='FINANCIAL_ACTUAL_PREFILL_REVIEW_REQUIRED';end if;
      delete from public.financial_actual_value_provenance p where p.organisation_id=p_organisation_id and p.financial_actual_revision_id=r.id and p.field_path=field_text and p.predecessor_provenance_id is not null;
      delete from public.financial_actual_value_provenance p where p.organisation_id=p_organisation_id and p.financial_actual_revision_id=r.id and p.field_path=field_text;
    end if;
    insert into public.financial_actual_value_provenance(organisation_id,financial_actual_id,financial_actual_revision_id,field_path,provenance_class,source_entity_type,source_entity_id,source_version,source_recorded_at,original_value,effective_value,unit_code,created_by_internal_user_id)
    values(p_organisation_id,a.id,r.id,field_text,'AUTHORITATIVE_OPERATIONAL_INPUT',fact->>'sourceEntityType',(fact->>'sourceEntityId')::uuid,fact->>'sourceVersion',(fact->>'sourceRecordedAt')::timestamptz,to_jsonb(fact->>'value'),to_jsonb(fact->>'value'),fact->>'unitCode',p_actor_internal_user_id)returning id into source_row;
    effective:=fact->>'value';
    if action='OVERRIDE'then
      if fact->>'unitCode'='IDENTITY'or jsonb_typeof(selection->'effectiveValue')<>'string'or length(btrim(coalesce(selection->>'overrideReason','')))not between 1 and 1000 then raise exception using errcode='22023',message='FINANCIAL_ACTUAL_PREFILL_OVERRIDE_INVALID';end if;
      effective:=selection->>'effectiveValue';perform public.ftf_financial_actual_parse_decimal(effective,18,6);reason:=btrim(selection->>'overrideReason');
      insert into public.financial_actual_value_provenance(organisation_id,financial_actual_id,financial_actual_revision_id,field_path,provenance_class,predecessor_provenance_id,source_entity_type,source_entity_id,source_version,source_recorded_at,original_value,effective_value,unit_code,override_reason,created_by_internal_user_id)
      values(p_organisation_id,a.id,r.id,field_text,'MANUAL_OVERRIDE',source_row,fact->>'sourceEntityType',(fact->>'sourceEntityId')::uuid,fact->>'sourceVersion',(fact->>'sourceRecordedAt')::timestamptz,to_jsonb(fact->>'value'),to_jsonb(effective),fact->>'unitCode',reason,p_actor_internal_user_id);
    end if;
    accepted:=accepted||jsonb_build_array(jsonb_build_object('fieldPath',field_text,'evidenceIdentity',fact->>'evidenceIdentity','sourceEntityType',fact->>'sourceEntityType','sourceEntityId',fact->>'sourceEntityId','sourceVersion',fact->>'sourceVersion','sourceValue',fact->>'value','effectiveValue',effective,'unitCode',fact->>'unitCode','action',action));accepted_count:=accepted_count+1;
  end loop;
  if accepted_count=0 then raise exception using errcode='22023',message='FINANCIAL_ACTUAL_PREFILL_SELECTION_INVALID';end if;
  accepted:=coalesce((select jsonb_agg(x order by x->>'fieldPath')from jsonb_array_elements(coalesce(r.source_manifest#>'{operationalSources,acceptedEvidence}','[]'::jsonb))x where not exists(select 1 from jsonb_array_elements(accepted)n where n->>'fieldPath'=x->>'fieldPath')),'[]'::jsonb)||accepted;
  update public.financial_actual_revisions set source_manifest=jsonb_set(source_manifest,'{operationalSources}',(proposal->'sources')||jsonb_build_object('schemaVersion','FINANCIAL_ACTUAL_OPERATIONAL_SOURCE_MANIFEST_V1','proposalDigest',proposal->>'proposalDigest','acceptedEvidence',accepted),true),updated_by_internal_user_id=p_actor_internal_user_id,row_version=row_version+1 where organisation_id=p_organisation_id and id=r.id returning * into r;
  insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload)values(p_organisation_id,p_actor_internal_user_id,'financial_actual.operational_prefill_accepted','financial_actual',a.id,jsonb_build_object('revision_id',r.id,'accepted_count',accepted_count,'draft_version',r.row_version));
  insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload)values(p_organisation_id,'financial.actual.operational_prefill_accepted','financial_actual',a.id,jsonb_build_object('revision_id',r.id,'accepted_count',accepted_count,'draft_version',r.row_version));
  return jsonb_build_object('record',to_jsonb(a),'revision',to_jsonb(r),'acceptedCount',accepted_count);
end$$;

-- Preserve accepted operational identities when Slice 2 freezes the complete source manifest.
create function public.ftf_preserve_financial_actual_operational_manifest()returns trigger language plpgsql security definer set search_path=public,pg_temp as $$begin
  if old.status='DRAFT'and new.status='FINAL'and old.source_manifest?'operationalSources'then new.source_manifest:=jsonb_set(new.source_manifest,'{operationalSources}',old.source_manifest->'operationalSources',true);end if;return new;
end$$;
create trigger financial_actual_operational_manifest_preservation before update of status on public.financial_actual_revisions for each row execute function public.ftf_preserve_financial_actual_operational_manifest();

create function public.ftf_read_financial_actual_source_drift(p_organisation_id uuid,p_actor_internal_user_id uuid,p_financial_actual_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare a public.financial_actuals%rowtype;r public.financial_actual_revisions%rowtype;current_proposal jsonb;manifest jsonb;accepted jsonb;fact jsonb;current_fact jsonb;facts jsonb='[]'::jsonb;completion_status text;status text;
begin
  if not public.ftf_financial_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'financial_actuals.read')then raise exception using errcode='42501',message='FINANCIAL_ACTUAL_FORBIDDEN';end if;
  select * into a from public.financial_actuals where organisation_id=p_organisation_id and id=p_financial_actual_id and archived_at is null;if not found then return jsonb_build_object('not_found',true);end if;
  if not public.ftf_financial_actor_has_location(p_organisation_id,p_actor_internal_user_id,a.operating_location_id)then raise exception using errcode='42501',message='FINANCIAL_ACTUAL_LOCATION_FORBIDDEN';end if;
  select * into r from public.financial_actual_revisions where organisation_id=p_organisation_id and financial_actual_id=a.id and id=coalesce(a.active_draft_revision_id,a.current_final_revision_id);if not found then return jsonb_build_object('not_found',true);end if;
  manifest:=r.source_manifest->'operationalSources';if manifest is null then return jsonb_build_object('status','NO_ACCEPTED_OPERATIONAL_SOURCE','facts','[]'::jsonb);end if;
  current_proposal:=public.ftf_financial_actual_operational_proposal(p_organisation_id,p_actor_internal_user_id,p_financial_actual_id);
  if current_proposal->>'completionRevisionId'=manifest->'completion'->>'id'then completion_status:='UNCHANGED';else completion_status:='SUPERSEDED';end if;
  accepted:=coalesce(manifest->'acceptedEvidence','[]'::jsonb);
  for fact in select value from jsonb_array_elements(accepted)loop
    select value into current_fact from jsonb_array_elements(coalesce(current_proposal->'facts','[]'::jsonb))where value->>'fieldPath'=fact->>'fieldPath'limit 1;
    facts:=facts||jsonb_build_array(jsonb_build_object('fieldPath',fact->>'fieldPath','status',case when current_fact is null then'SOURCE_REMOVED_OR_SUPERSEDED'when current_fact->>'value'is distinct from fact->>'sourceValue'then'CHANGED_VALUE'when current_fact->>'sourceVersion'is distinct from fact->>'sourceVersion'then'CHANGED_SOURCE_VERSION'else'UNCHANGED'end));
  end loop;
  status:=case when completion_status='UNCHANGED'and not exists(select 1 from jsonb_array_elements(facts)x where x->>'status'<>'UNCHANGED')then'UNCHANGED'when r.status='FINAL'then'SOURCE_CHANGED_SINCE_FINALISATION'else'SOURCE_CHANGED_SINCE_ACCEPTANCE'end;
  return jsonb_build_object('status',status,'completion',jsonb_build_object('status',completion_status,'acceptedId',manifest->'completion'->>'id','currentId',current_proposal->>'completionRevisionId'),'facts',facts);
end$$;

revoke all on function public.ftf_financial_actual_operational_proposal(uuid,uuid,uuid),public.ftf_preserve_financial_actual_operational_manifest()from public,anon,authenticated,service_role;
revoke all on function public.ftf_read_financial_actual_operational_prefill(uuid,uuid,uuid),public.ftf_accept_financial_actual_operational_prefill(uuid,uuid,uuid,uuid,integer,jsonb),public.ftf_read_financial_actual_source_drift(uuid,uuid,uuid)from public,anon,authenticated;
grant execute on function public.ftf_read_financial_actual_operational_prefill(uuid,uuid,uuid),public.ftf_accept_financial_actual_operational_prefill(uuid,uuid,uuid,uuid,integer,jsonb),public.ftf_read_financial_actual_source_drift(uuid,uuid,uuid)to service_role;
