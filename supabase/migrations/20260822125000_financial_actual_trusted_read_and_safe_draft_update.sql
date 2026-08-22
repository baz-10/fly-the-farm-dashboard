-- Pre-Slice-4 additive authority correction.
-- Checked reads expose bounded customer workflow state. Ordinary Draft saves
-- replace only financial-input authority and preserve operational provenance.

alter function public.ftf_create_financial_actual(uuid,uuid,jsonb)
  rename to ftf_create_financial_actual_before_trusted_bounds;

revoke all on function public.ftf_create_financial_actual_before_trusted_bounds(uuid,uuid,jsonb)
  from public,anon,authenticated,service_role;

create function public.ftf_create_financial_actual(
  p_organisation_id uuid,p_actor_internal_user_id uuid,p_payload jsonb
)returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if jsonb_typeof(p_payload)<>'object'
    or jsonb_typeof(coalesce(p_payload->'provenance','[]'::jsonb))<>'array'
    or jsonb_typeof(coalesce(p_payload->'workEntries','[]'::jsonb))<>'array'
    or jsonb_typeof(coalesce(p_payload->'costLines','[]'::jsonb))<>'array'
    or jsonb_array_length(coalesce(p_payload->'provenance','[]'::jsonb))>1000
    or jsonb_array_length(coalesce(p_payload->'workEntries','[]'::jsonb))>366
    or jsonb_array_length(coalesce(p_payload->'costLines','[]'::jsonb))>500
  then raise exception using errcode='22023',message='FINANCIAL_ACTUAL_DRAFT_LIMIT_EXCEEDED';end if;
  return public.ftf_create_financial_actual_before_trusted_bounds(p_organisation_id,p_actor_internal_user_id,p_payload);
end$$;

create function public.ftf_guard_financial_actual_provenance_cardinality()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  -- The revision row is the shared serialization boundary for every provenance
  -- writer, including ordinary saves and reviewed operational acceptance.
  perform 1 from public.financial_actual_revisions r
    where r.organisation_id=new.organisation_id and r.id=new.financial_actual_revision_id
    for update;
  if not found then raise exception using errcode='23503',message='FINANCIAL_ACTUAL_REVISION_NOT_FOUND';end if;
  if(select count(*) from public.financial_actual_value_provenance p where p.organisation_id=new.organisation_id and p.financial_actual_revision_id=new.financial_actual_revision_id)>=1000
  then raise exception using errcode='22023',message='FINANCIAL_ACTUAL_DRAFT_LIMIT_EXCEEDED';end if;
  return new;
end$$;

create trigger financial_actual_provenance_cardinality_guard
before insert on public.financial_actual_value_provenance
for each row execute function public.ftf_guard_financial_actual_provenance_cardinality();

revoke all on function public.ftf_guard_financial_actual_provenance_cardinality()
  from public,anon,authenticated,service_role;

create function public.ftf_replace_financial_actual_financial_inputs(
  p_organisation_id uuid,p_actor_internal_user_id uuid,p_actual_id uuid,p_revision_id uuid,p_payload jsonb
)returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v jsonb;
begin
  if jsonb_typeof(coalesce(p_payload->'provenance','[]'::jsonb))<>'array'or jsonb_typeof(coalesce(p_payload->'workEntries','[]'::jsonb))<>'array'or jsonb_typeof(coalesce(p_payload->'costLines','[]'::jsonb))<>'array'then raise exception using errcode='22023',message='FINANCIAL_ACTUAL_DRAFT_PAYLOAD_INVALID';end if;
  if jsonb_array_length(coalesce(p_payload->'provenance','[]'::jsonb))>1000 or jsonb_array_length(coalesce(p_payload->'workEntries','[]'::jsonb))>366 or jsonb_array_length(coalesce(p_payload->'costLines','[]'::jsonb))>500 then raise exception using errcode='22023',message='FINANCIAL_ACTUAL_DRAFT_LIMIT_EXCEEDED';end if;
  -- Operational facts and their override descendants are owned exclusively by
  -- the reviewed prefill command. A normal financial save cannot submit them.
  if exists(select 1 from jsonb_array_elements(coalesce(p_payload->'provenance','[]'::jsonb))x where x->>'provenanceClass'='AUTHORITATIVE_OPERATIONAL_INPUT'or x->>'sourceEntityType'is not null or x->>'sourceEntityId'is not null or x->>'sourceVersion'is not null)then raise exception using errcode='22023',message='FINANCIAL_ACTUAL_OPERATIONAL_PROVENANCE_COMMAND_REQUIRED';end if;
  if exists(select 1 from jsonb_array_elements(coalesce(p_payload->'provenance','[]'::jsonb))x where x->>'provenanceClass'='MANUAL_OVERRIDE'and not exists(select 1 from jsonb_array_elements(coalesce(p_payload->'provenance','[]'::jsonb))parent where parent->>'id'=x->>'predecessorProvenanceId'and parent->>'provenanceClass'<>'AUTHORITATIVE_OPERATIONAL_INPUT'))then raise exception using errcode='22023',message='FINANCIAL_ACTUAL_OPERATIONAL_PROVENANCE_COMMAND_REQUIRED';end if;
  if exists(
    with recursive preserved(id,field_path)as(
      select p.id,p.field_path from public.financial_actual_value_provenance p where p.organisation_id=p_organisation_id and p.financial_actual_revision_id=p_revision_id and p.provenance_class='AUTHORITATIVE_OPERATIONAL_INPUT'
      union all
      select child.id,child.field_path from public.financial_actual_value_provenance child join preserved parent on parent.id=child.predecessor_provenance_id where child.organisation_id=p_organisation_id and child.financial_actual_revision_id=p_revision_id
    )select 1 from preserved p join jsonb_array_elements(coalesce(p_payload->'provenance','[]'::jsonb))x on btrim(x->>'fieldPath')=p.field_path
  )then raise exception using errcode='22023',message='FINANCIAL_ACTUAL_OPERATIONAL_FIELD_OWNED';end if;

  delete from public.financial_actual_work_entries where organisation_id=p_organisation_id and financial_actual_revision_id=p_revision_id;
  delete from public.financial_actual_cost_lines where organisation_id=p_organisation_id and financial_actual_revision_id=p_revision_id;
  with recursive preserved(id)as(
    select p.id from public.financial_actual_value_provenance p where p.organisation_id=p_organisation_id and p.financial_actual_revision_id=p_revision_id and p.provenance_class='AUTHORITATIVE_OPERATIONAL_INPUT'
    union all
    select child.id from public.financial_actual_value_provenance child join preserved parent on parent.id=child.predecessor_provenance_id where child.organisation_id=p_organisation_id and child.financial_actual_revision_id=p_revision_id
  )delete from public.financial_actual_value_provenance p where p.organisation_id=p_organisation_id and p.financial_actual_revision_id=p_revision_id and not exists(select 1 from preserved where preserved.id=p.id);

  for v in select value from jsonb_array_elements(coalesce(p_payload->'provenance','[]'::jsonb))loop
    if v->>'provenanceClass'not in('MANUAL_FINANCIAL_INPUT','SYSTEM_DERIVED','MANUAL_OVERRIDE')then raise exception using errcode='22023',message='FINANCIAL_ACTUAL_DRAFT_PROVENANCE_INVALID';end if;
    insert into public.financial_actual_value_provenance(id,organisation_id,financial_actual_id,financial_actual_revision_id,field_path,provenance_class,predecessor_provenance_id,original_value,effective_value,unit_code,override_reason,created_by_internal_user_id)values(
      (v->>'id')::uuid,p_organisation_id,p_actual_id,p_revision_id,btrim(v->>'fieldPath'),v->>'provenanceClass',nullif(v->>'predecessorProvenanceId','')::uuid,v->'originalValue',v->'effectiveValue',nullif(btrim(v->>'unitCode'),''),nullif(btrim(v->>'overrideReason'),''),p_actor_internal_user_id);
  end loop;
  for v in select value from jsonb_array_elements(coalesce(p_payload->'workEntries','[]'::jsonb))loop
    insert into public.financial_actual_work_entries(id,organisation_id,financial_actual_id,financial_actual_revision_id,work_date,actual_work_hours,provenance_id,created_by_internal_user_id)values((v->>'id')::uuid,p_organisation_id,p_actual_id,p_revision_id,(v->>'workDate')::date,(v->>'actualWorkHours')::numeric,(v->>'provenanceId')::uuid,p_actor_internal_user_id);
  end loop;
  for v in select value from jsonb_array_elements(coalesce(p_payload->'costLines','[]'::jsonb))loop
    insert into public.financial_actual_cost_lines(id,organisation_id,financial_actual_id,financial_actual_revision_id,category,subtype,description,incurred_on,quantity,unit_code,unit_cost,amount,provenance_id,display_order,created_by_internal_user_id)values((v->>'id')::uuid,p_organisation_id,p_actual_id,p_revision_id,v->>'category',v->>'subtype',btrim(v->>'description'),nullif(v->>'incurredOn','')::date,(v->>'quantity')::numeric,v->>'unitCode',(v->>'unitCost')::numeric,(v->>'amount')::numeric,(v->>'provenanceId')::uuid,coalesce((v->>'displayOrder')::integer,0),p_actor_internal_user_id);
  end loop;
end$$;

create or replace function public.ftf_update_financial_actual_draft(p_organisation_id uuid,p_actor_internal_user_id uuid,p_financial_actual_id uuid,p_revision_id uuid,p_expected_version integer,p_payload jsonb)returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actual public.financial_actuals%rowtype;v_revision public.financial_actual_revisions%rowtype;
begin
  if not public.ftf_financial_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'financial_actuals.update')then raise exception using errcode='42501',message='FINANCIAL_ACTUAL_FORBIDDEN';end if;
  select*into v_actual from public.financial_actuals where organisation_id=p_organisation_id and id=p_financial_actual_id and archived_at is null for update;
  if not found or not public.ftf_financial_actor_has_location(p_organisation_id,p_actor_internal_user_id,v_actual.operating_location_id)then return jsonb_build_object('not_found',true);end if;
  select*into v_revision from public.financial_actual_revisions where organisation_id=p_organisation_id and financial_actual_id=v_actual.id and id=p_revision_id for update;
  if not found or v_revision.status<>'DRAFT'or v_actual.active_draft_revision_id is distinct from v_revision.id then return jsonb_build_object('not_found',true);end if;
  if v_revision.row_version<>p_expected_version then return jsonb_build_object('conflict',true,'current_version',v_revision.row_version);end if;
  if jsonb_typeof(p_payload)<>'object'or p_payload->>'formulaVersion'<>'FINANCIAL_ACTUAL_V1'or p_payload->>'currencyCode'<>'AUD'then raise exception using errcode='22023',message='FINANCIAL_ACTUAL_DRAFT_PAYLOAD_INVALID';end if;
  update public.financial_actual_revisions set currency_code=p_payload->>'currencyCode',calculation_version=p_payload->>'formulaVersion',start_date=(p_payload->>'startDate')::date,end_date=(p_payload->>'endDate')::date,updated_by_internal_user_id=p_actor_internal_user_id where organisation_id=p_organisation_id and id=v_revision.id returning*into v_revision;
  perform public.ftf_replace_financial_actual_financial_inputs(p_organisation_id,p_actor_internal_user_id,v_actual.id,v_revision.id,p_payload);
  insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload)values(p_organisation_id,p_actor_internal_user_id,'financial_actual.draft_updated','financial_actual_revision',v_revision.id,jsonb_build_object('financial_actual_id',v_actual.id,'revision_number',v_revision.revision_number,'row_version',v_revision.row_version));
  insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload)values(p_organisation_id,'financial.actual.draft_updated','financial_actual',v_actual.id,jsonb_build_object('revision_id',v_revision.id,'revision_number',v_revision.revision_number,'row_version',v_revision.row_version));
  return jsonb_build_object('record',to_jsonb(v_actual),'revision',to_jsonb(v_revision));
end$$;

create function public.ftf_read_financial_actual_authority(p_organisation_id uuid,p_actor_internal_user_id uuid,p_financial_actual_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare a public.financial_actuals%rowtype;d public.financial_actual_revisions%rowtype;f public.financial_actual_revisions%rowtype;hierarchy jsonb;draft_json jsonb;final_json jsonb;drift jsonb;work_count integer;cost_count integer;provenance_count integer;
begin
  if not public.ftf_financial_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'financial_actuals.read')then raise exception using errcode='42501',message='FINANCIAL_ACTUAL_FORBIDDEN';end if;
  select*into a from public.financial_actuals where organisation_id=p_organisation_id and id=p_financial_actual_id;
  if not found or not public.ftf_financial_actor_has_location(p_organisation_id,p_actor_internal_user_id,a.operating_location_id)then return jsonb_build_object('not_found',true);end if;
  select jsonb_build_object('operatingLocation',jsonb_build_object('id',l.id,'label',l.name),'client',jsonb_build_object('id',c.id,'label',c.name),'property',jsonb_build_object('id',p.id,'label',p.name),'field',jsonb_build_object('id',fi.id,'label',fi.name),'job',jsonb_build_object('id',j.id,'label',j.reference),'mission',case when m.id is null then null else jsonb_build_object('id',m.id,'label',m.mission_number)end)into hierarchy from public.operating_locations l join public.clients c on c.organisation_id=a.organisation_id and c.id=a.client_id join public.properties p on p.organisation_id=a.organisation_id and p.id=a.property_id join public.fields fi on fi.organisation_id=a.organisation_id and fi.id=a.field_id join public.jobs j on j.organisation_id=a.organisation_id and j.id=a.job_id left join public.missions m on m.organisation_id=a.organisation_id and m.id=a.mission_id where l.organisation_id=a.organisation_id and l.id=a.operating_location_id;
  if a.active_draft_revision_id is not null then
    select*into d from public.financial_actual_revisions where organisation_id=p_organisation_id and financial_actual_id=a.id and id=a.active_draft_revision_id and status='DRAFT';
    select count(*) into work_count from public.financial_actual_work_entries where organisation_id=p_organisation_id and financial_actual_revision_id=d.id;
    select count(*) into cost_count from public.financial_actual_cost_lines where organisation_id=p_organisation_id and financial_actual_revision_id=d.id;
    select count(*) into provenance_count from public.financial_actual_value_provenance where organisation_id=p_organisation_id and financial_actual_revision_id=d.id;
    if work_count>366 or cost_count>500 or provenance_count>1000 then raise exception using errcode='22023',message='FINANCIAL_ACTUAL_DETAIL_LIMIT_EXCEEDED';end if;
    draft_json:=jsonb_build_object('id',d.id,'revisionNumber',d.revision_number,'status',d.status,'rowVersion',d.row_version,'currencyCode',d.currency_code,'formulaVersion',d.calculation_version,'startDate',d.start_date::text,'endDate',d.end_date::text,'operationalSources',coalesce(d.source_manifest->'operationalSources','{}'::jsonb),
      'revenueInputs',coalesce((select jsonb_object_agg(p.field_path,p.effective_value order by p.field_path)from public.financial_actual_value_provenance p where p.organisation_id=p_organisation_id and p.financial_actual_revision_id=d.id and p.field_path like'revenue/%'),'{}'::jsonb),
      'workEntries',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'workDate',w.work_date::text,'actualWorkHours',to_char(w.actual_work_hours,'FM999990.0000'),'provenanceId',w.provenance_id)order by w.work_date,w.id)from public.financial_actual_work_entries w where w.organisation_id=p_organisation_id and w.financial_actual_revision_id=d.id),'[]'::jsonb),
      'costLines',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'category',c.category,'subtype',c.subtype,'description',c.description,'incurredOn',c.incurred_on::text,'quantity',to_char(c.quantity,'FM999999999999.000000'),'unitCode',c.unit_code,'unitCost',to_char(c.unit_cost,'FM9999999999990.000000'),'amount',to_char(c.amount,'FM9999999999999990.0000'),'provenanceId',c.provenance_id,'displayOrder',c.display_order)order by c.display_order,c.id)from public.financial_actual_cost_lines c where c.organisation_id=p_organisation_id and c.financial_actual_revision_id=d.id),'[]'::jsonb),
      'provenance',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'fieldPath',p.field_path,'provenanceClass',p.provenance_class,'predecessorProvenanceId',p.predecessor_provenance_id,'sourceEntityType',p.source_entity_type,'sourceEntityId',p.source_entity_id,'sourceVersion',p.source_version,'sourceRecordedAt',p.source_recorded_at,'originalValue',p.original_value,'effectiveValue',p.effective_value,'unitCode',p.unit_code,'overrideReason',p.override_reason,'acceptedByInternalUserId',p.created_by_internal_user_id,'acceptedAt',p.created_at)order by p.field_path,p.predecessor_provenance_id nulls first,p.id)from public.financial_actual_value_provenance p where p.organisation_id=p_organisation_id and p.financial_actual_revision_id=d.id),'[]'::jsonb));
  else draft_json:=null;end if;
  if a.current_final_revision_id is not null then
    select*into f from public.financial_actual_revisions where organisation_id=p_organisation_id and financial_actual_id=a.id and id=a.current_final_revision_id and status='FINAL';
    if jsonb_array_length(coalesce(f.input_snapshot->'workEntryEvidence','[]'::jsonb))>366 or jsonb_array_length(coalesce(f.input_snapshot->'costLineEvidence','[]'::jsonb))>500 or jsonb_array_length(coalesce(f.provenance_snapshot->'rows','[]'::jsonb))>1000 then raise exception using errcode='22023',message='FINANCIAL_ACTUAL_DETAIL_LIMIT_EXCEEDED';end if;
    final_json:=jsonb_build_object('id',f.id,'revisionNumber',f.revision_number,'status',f.status,'rowVersion',f.row_version,'currencyCode',f.currency_code,'formulaVersion',f.calculation_version,'startDate',f.start_date::text,'endDate',f.end_date::text,'input',f.input_snapshot,'provenance',f.provenance_snapshot,'calculation',f.calculation_snapshot,'sourceManifest',f.source_manifest,'inputDigest',f.input_digest,'finalisedAt',f.finalised_at,'finalisedByInternalUserId',f.finalised_by_internal_user_id);
  else final_json:=null;end if;
  if(a.active_draft_revision_id is not null or a.current_final_revision_id is not null)then drift:=public.ftf_read_financial_actual_source_drift(p_organisation_id,p_actor_internal_user_id,a.id);else drift:=jsonb_build_object('status','NO_ACCEPTED_OPERATIONAL_SOURCE');end if;
  return jsonb_build_object('schemaVersion','FINANCIAL_ACTUAL_AUTHORITY_DETAIL_V1','record',jsonb_build_object('id',a.id,'reference',a.reference,'organisationId',a.organisation_id,'operatingLocationId',a.operating_location_id,'clientId',a.client_id,'propertyId',a.property_id,'fieldId',a.field_id,'jobId',a.job_id,'missionId',a.mission_id,'rowVersion',a.row_version,'archivedAt',a.archived_at,'currentFinalRevisionId',a.current_final_revision_id,'activeDraftRevisionId',a.active_draft_revision_id),'hierarchy',hierarchy,'draft',draft_json,'final',final_json,'sourceDrift',drift);
end$$;

create function public.ftf_list_financial_actual_summaries(p_organisation_id uuid,p_actor_internal_user_id uuid,p_operating_location_id uuid default null,p_after_id uuid default null,p_page_size integer default 25)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare rows_json jsonb;next_cursor uuid;row_count integer;
begin
  if not public.ftf_financial_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'financial_actuals.read')then raise exception using errcode='42501',message='FINANCIAL_ACTUAL_FORBIDDEN';end if;
  if p_page_size is null or p_page_size not between 1 and 100 then raise exception using errcode='22023',message='FINANCIAL_ACTUAL_PAGE_INVALID';end if;
  if p_operating_location_id is not null and not public.ftf_financial_actor_has_location(p_organisation_id,p_actor_internal_user_id,p_operating_location_id)then raise exception using errcode='42501',message='FINANCIAL_ACTUAL_LOCATION_FORBIDDEN';end if;
  with page as(select a.* from public.financial_actuals a where a.organisation_id=p_organisation_id and a.archived_at is null and(p_operating_location_id is null and public.ftf_financial_actor_has_location(p_organisation_id,p_actor_internal_user_id,a.operating_location_id)or a.operating_location_id=p_operating_location_id)and(p_after_id is null or a.id>p_after_id)order by a.id limit p_page_size+1),projected as(select a.id,jsonb_build_object('id',a.id,'reference',a.reference,'operatingLocation',jsonb_build_object('id',l.id,'label',l.name),'client',jsonb_build_object('id',c.id,'label',c.name),'job',jsonb_build_object('id',j.id,'label',j.reference),'mission',case when m.id is null then null else jsonb_build_object('id',m.id,'label',m.mission_number)end,'lifecycle',case when a.active_draft_revision_id is not null then'DRAFT'when a.current_final_revision_id is not null then'FINAL'else'UNINITIALISED'end,'activeDraft',case when d.id is null then null else jsonb_build_object('id',d.id,'revisionNumber',d.revision_number,'rowVersion',d.row_version)end,'currentFinalRevisionNumber',f.revision_number,'finalCalculation',case when f.id is null then null else jsonb_build_object('revenue',f.calculation_snapshot->>'revenue','totalCost',f.calculation_snapshot->>'totalCost','grossProfit',f.calculation_snapshot->>'grossProfit','grossMarginPercentage',f.calculation_snapshot->>'grossMarginPercentage')end,'sourceDrift',case when coalesce(f.source_manifest,d.source_manifest)->'operationalSources'is null then'NONE'when(coalesce(f.source_manifest,d.source_manifest)#>>'{operationalSources,completion,id}')=(select x.id::text from public.mission_completion_revisions x where x.organisation_id=a.organisation_id and x.mission_id=a.mission_id order by x.version_number desc limit 1)then'UNCHANGED'else'CHANGED'end,'archived',false)row_json,row_number()over(order by a.id)rn from page a join public.operating_locations l on l.organisation_id=a.organisation_id and l.id=a.operating_location_id join public.clients c on c.organisation_id=a.organisation_id and c.id=a.client_id join public.jobs j on j.organisation_id=a.organisation_id and j.id=a.job_id left join public.missions m on m.organisation_id=a.organisation_id and m.id=a.mission_id left join public.financial_actual_revisions d on d.organisation_id=a.organisation_id and d.id=a.active_draft_revision_id left join public.financial_actual_revisions f on f.organisation_id=a.organisation_id and f.id=a.current_final_revision_id)
  select coalesce(jsonb_agg(row_json order by id)filter(where rn<=p_page_size),'[]'::jsonb),(max(id::text)filter(where rn=p_page_size))::uuid,count(*)into rows_json,next_cursor,row_count from projected;
  return jsonb_build_object('schemaVersion','FINANCIAL_ACTUAL_LIST_V1','rows',rows_json,'nextCursor',case when row_count>p_page_size then next_cursor else null end);
end$$;

revoke all on function public.ftf_replace_financial_actual_financial_inputs(uuid,uuid,uuid,uuid,jsonb)from public,anon,authenticated,service_role;
revoke all on function public.ftf_read_financial_actual_authority(uuid,uuid,uuid),public.ftf_list_financial_actual_summaries(uuid,uuid,uuid,uuid,integer)from public,anon,authenticated;
grant execute on function public.ftf_read_financial_actual_authority(uuid,uuid,uuid),public.ftf_list_financial_actual_summaries(uuid,uuid,uuid,uuid,integer)to service_role;
revoke all on function public.ftf_create_financial_actual(uuid,uuid,jsonb)from public,anon,authenticated;
grant execute on function public.ftf_create_financial_actual(uuid,uuid,jsonb)to service_role;
