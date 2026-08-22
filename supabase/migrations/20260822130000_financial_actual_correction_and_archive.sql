-- Financial Actual correction lifecycle, immutable revision history and
-- stable-aggregate archive authority. No Draft abandonment or hard delete.

create function public.ftf_create_financial_actual_correction(
  p_organisation_id uuid,p_actor_internal_user_id uuid,p_financial_actual_id uuid,
  p_expected_aggregate_version integer,p_expected_final_revision_id uuid,
  p_expected_final_revision_version integer,p_correction_reason text
)returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  a public.financial_actuals%rowtype;f public.financial_actual_revisions%rowtype;
  d public.financial_actual_revisions%rowtype;v_number integer;v_map jsonb='{}'::jsonb;v_cost_map jsonb='{}'::jsonb;
begin
  if not public.ftf_financial_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'financial_actuals.update')then raise exception using errcode='42501',message='FINANCIAL_ACTUAL_FORBIDDEN';end if;
  if p_correction_reason is null or length(btrim(p_correction_reason))not between 1 and 1000 then raise exception using errcode='22023',message='FINANCIAL_ACTUAL_CORRECTION_REASON_INVALID';end if;
  select*into a from public.financial_actuals where organisation_id=p_organisation_id and id=p_financial_actual_id and archived_at is null for update;
  if not found then return jsonb_build_object('not_found',true);end if;
  if not public.ftf_financial_actor_has_location(p_organisation_id,p_actor_internal_user_id,a.operating_location_id)then raise exception using errcode='42501',message='FINANCIAL_ACTUAL_LOCATION_FORBIDDEN';end if;
  if a.row_version<>p_expected_aggregate_version then return jsonb_build_object('conflict',true,'current_version',a.row_version);end if;
  if a.active_draft_revision_id is not null then return jsonb_build_object('active_draft_conflict',true,'code','ACTIVE_DRAFT_CONFLICT','revision_id',a.active_draft_revision_id);end if;
  if a.current_final_revision_id is distinct from p_expected_final_revision_id then return jsonb_build_object('conflict',true,'current_final_revision_id',a.current_final_revision_id);end if;
  select*into f from public.financial_actual_revisions where organisation_id=p_organisation_id and financial_actual_id=a.id and id=p_expected_final_revision_id and status='FINAL'for update;
  if not found then return jsonb_build_object('not_found',true);end if;
  if f.row_version<>p_expected_final_revision_version then return jsonb_build_object('conflict',true,'current_final_revision_version',f.row_version);end if;
  select coalesce(max(revision_number),0)+1 into v_number from public.financial_actual_revisions where organisation_id=p_organisation_id and financial_actual_id=a.id;
  insert into public.financial_actual_revisions(organisation_id,financial_actual_id,revision_number,status,predecessor_revision_id,correction_reason,currency_code,calculation_version,start_date,end_date,source_manifest,created_by_internal_user_id,updated_by_internal_user_id)
  values(p_organisation_id,a.id,v_number,'DRAFT',f.id,btrim(p_correction_reason),f.currency_code,f.calculation_version,f.start_date,f.end_date,f.source_manifest,p_actor_internal_user_id,p_actor_internal_user_id)returning*into d;
  select coalesce(jsonb_object_agg(p.id::text,gen_random_uuid()::text),'{}'::jsonb)into v_map from public.financial_actual_value_provenance p where p.organisation_id=p_organisation_id and p.financial_actual_id=a.id and p.financial_actual_revision_id=f.id;
  select coalesce(jsonb_object_agg(c.id::text,gen_random_uuid()::text),'{}'::jsonb)into v_cost_map from public.financial_actual_cost_lines c where c.organisation_id=p_organisation_id and c.financial_actual_id=a.id and c.financial_actual_revision_id=f.id;
  insert into public.financial_actual_value_provenance(id,organisation_id,financial_actual_id,financial_actual_revision_id,field_path,provenance_class,predecessor_provenance_id,source_entity_type,source_entity_id,source_version,source_recorded_at,original_value,effective_value,unit_code,override_reason,created_by_internal_user_id)
  select(v_map->>p.id::text)::uuid,p.organisation_id,p.financial_actual_id,d.id,case when p.field_path~'^costLines/[0-9a-f-]{36}/amount$'and v_cost_map?(split_part(p.field_path,'/',2))then'costLines/'||(v_cost_map->>split_part(p.field_path,'/',2))||'/amount'else p.field_path end,p.provenance_class,case when p.predecessor_provenance_id is null then null else(v_map->>p.predecessor_provenance_id::text)::uuid end,p.source_entity_type,p.source_entity_id,p.source_version,p.source_recorded_at,p.original_value,p.effective_value,p.unit_code,p.override_reason,p_actor_internal_user_id from public.financial_actual_value_provenance p where p.organisation_id=p_organisation_id and p.financial_actual_id=a.id and p.financial_actual_revision_id=f.id;
  insert into public.financial_actual_work_entries(id,organisation_id,financial_actual_id,financial_actual_revision_id,work_date,actual_work_hours,provenance_id,created_by_internal_user_id)
  select gen_random_uuid(),w.organisation_id,w.financial_actual_id,d.id,w.work_date,w.actual_work_hours,(v_map->>w.provenance_id::text)::uuid,p_actor_internal_user_id from public.financial_actual_work_entries w where w.organisation_id=p_organisation_id and w.financial_actual_id=a.id and w.financial_actual_revision_id=f.id;
  insert into public.financial_actual_cost_lines(id,organisation_id,financial_actual_id,financial_actual_revision_id,category,subtype,description,incurred_on,quantity,unit_code,unit_cost,amount,provenance_id,source_entity_type,source_entity_id,source_version,display_order,created_by_internal_user_id)
  select(v_cost_map->>c.id::text)::uuid,c.organisation_id,c.financial_actual_id,d.id,c.category,c.subtype,c.description,c.incurred_on,c.quantity,c.unit_code,c.unit_cost,c.amount,(v_map->>c.provenance_id::text)::uuid,c.source_entity_type,c.source_entity_id,c.source_version,c.display_order,p_actor_internal_user_id from public.financial_actual_cost_lines c where c.organisation_id=p_organisation_id and c.financial_actual_id=a.id and c.financial_actual_revision_id=f.id;
  update public.financial_actuals set active_draft_revision_id=d.id,updated_by_internal_user_id=p_actor_internal_user_id where organisation_id=p_organisation_id and id=a.id returning*into a;
  insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload)values(p_organisation_id,p_actor_internal_user_id,'financial_actual.correction_created','financial_actual',a.id,jsonb_build_object('revision_id',d.id,'revision_number',d.revision_number,'predecessor_revision_id',f.id,'aggregate_version',a.row_version,'correction_reason',d.correction_reason));
  insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload)values(p_organisation_id,'financial.actual.correction_created','financial_actual',a.id,jsonb_build_object('revision_id',d.id,'revision_number',d.revision_number,'predecessor_revision_id',f.id,'aggregate_version',a.row_version));
  return jsonb_build_object('schemaVersion','FINANCIAL_ACTUAL_CORRECTION_V1','record',jsonb_build_object('id',a.id,'reference',a.reference,'rowVersion',a.row_version,'currentFinalRevisionId',a.current_final_revision_id,'activeDraftRevisionId',a.active_draft_revision_id),'revision',jsonb_build_object('id',d.id,'revisionNumber',d.revision_number,'status',d.status,'rowVersion',d.row_version,'predecessorRevisionId',d.predecessor_revision_id,'correctionReason',d.correction_reason));
end$$;

create function public.ftf_read_financial_actual_revision_history(
  p_organisation_id uuid,p_actor_internal_user_id uuid,p_financial_actual_id uuid,
  p_before_revision_number integer default null,p_page_size integer default 25
)returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare a public.financial_actuals%rowtype;v_rows jsonb;v_count integer;v_next integer;
begin
  if not public.ftf_financial_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'financial_actuals.read')then raise exception using errcode='42501',message='FINANCIAL_ACTUAL_FORBIDDEN';end if;
  if p_page_size is null or p_page_size not between 1 and 100 or p_before_revision_number is not null and p_before_revision_number<1 then raise exception using errcode='22023',message='FINANCIAL_ACTUAL_PAGE_INVALID';end if;
  select*into a from public.financial_actuals where organisation_id=p_organisation_id and id=p_financial_actual_id;
  if not found or not public.ftf_financial_actor_has_location(p_organisation_id,p_actor_internal_user_id,a.operating_location_id)then return jsonb_build_object('not_found',true);end if;
  with page as(select r.* from public.financial_actual_revisions r where r.organisation_id=p_organisation_id and r.financial_actual_id=a.id and(p_before_revision_number is null or r.revision_number<p_before_revision_number)order by r.revision_number desc limit p_page_size+1),numbered as(select p.*,row_number()over(order by p.revision_number desc)rn from page p)
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'revisionNumber',revision_number,'status',status,'rowVersion',row_version,'predecessorRevisionId',predecessor_revision_id,'correctionReason',correction_reason,'formulaVersion',calculation_version,'finalisedAt',finalised_at,'finalisedByInternalUserId',finalised_by_internal_user_id,'current',id=a.current_final_revision_id,'activeDraft',id=a.active_draft_revision_id)order by revision_number desc)filter(where rn<=p_page_size),'[]'::jsonb),count(*),min(revision_number)filter(where rn=p_page_size)into v_rows,v_count,v_next from numbered;
  return jsonb_build_object('schemaVersion','FINANCIAL_ACTUAL_REVISION_HISTORY_V1','financialActualId',a.id,'reference',a.reference,'archivedAt',a.archived_at,'currentFinalRevisionId',a.current_final_revision_id,'activeDraftRevisionId',a.active_draft_revision_id,'rows',v_rows,'nextBeforeRevisionNumber',case when v_count>p_page_size then v_next else null end);
end$$;

create function public.ftf_read_financial_actual_historical_revision(
  p_organisation_id uuid,p_actor_internal_user_id uuid,p_financial_actual_id uuid,p_revision_id uuid
)returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare a public.financial_actuals%rowtype;r public.financial_actual_revisions%rowtype;
begin
  if not public.ftf_financial_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'financial_actuals.read')then raise exception using errcode='42501',message='FINANCIAL_ACTUAL_FORBIDDEN';end if;
  select*into a from public.financial_actuals where organisation_id=p_organisation_id and id=p_financial_actual_id;
  if not found or not public.ftf_financial_actor_has_location(p_organisation_id,p_actor_internal_user_id,a.operating_location_id)then return jsonb_build_object('not_found',true);end if;
  select*into r from public.financial_actual_revisions where organisation_id=p_organisation_id and financial_actual_id=a.id and id=p_revision_id and status='FINAL';
  if not found then return jsonb_build_object('not_found',true);end if;
  if jsonb_array_length(coalesce(r.input_snapshot->'workEntryEvidence','[]'::jsonb))>366 or jsonb_array_length(coalesce(r.input_snapshot->'costLineEvidence','[]'::jsonb))>500 or jsonb_array_length(coalesce(r.provenance_snapshot->'rows','[]'::jsonb))>1000 then raise exception using errcode='22023',message='FINANCIAL_ACTUAL_DETAIL_LIMIT_EXCEEDED';end if;
  return jsonb_build_object('schemaVersion','FINANCIAL_ACTUAL_HISTORICAL_REVISION_V1','financialActualId',a.id,'reference',a.reference,'archivedAt',a.archived_at,'current',r.id=a.current_final_revision_id,'revision',jsonb_build_object('id',r.id,'revisionNumber',r.revision_number,'status',r.status,'rowVersion',r.row_version,'predecessorRevisionId',r.predecessor_revision_id,'correctionReason',r.correction_reason,'currencyCode',r.currency_code,'formulaVersion',r.calculation_version,'startDate',r.start_date::text,'endDate',r.end_date::text,'input',r.input_snapshot,'provenance',r.provenance_snapshot,'calculation',r.calculation_snapshot,'sourceManifest',r.source_manifest,'inputDigest',r.input_digest,'finalisedAt',r.finalised_at,'finalisedByInternalUserId',r.finalised_by_internal_user_id));
end$$;

create function public.ftf_archive_financial_actual(
  p_organisation_id uuid,p_actor_internal_user_id uuid,p_financial_actual_id uuid,
  p_expected_aggregate_version integer,p_archive_reason text
)returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.financial_actuals%rowtype;
begin
  if not public.ftf_financial_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'financial_actuals.archive')then raise exception using errcode='42501',message='FINANCIAL_ACTUAL_FORBIDDEN';end if;
  if p_archive_reason is null or length(btrim(p_archive_reason))not between 1 and 500 then raise exception using errcode='22023',message='FINANCIAL_ACTUAL_ARCHIVE_REASON_INVALID';end if;
  select*into a from public.financial_actuals where organisation_id=p_organisation_id and id=p_financial_actual_id and archived_at is null for update;
  if not found then return jsonb_build_object('not_found',true);end if;
  if not public.ftf_financial_actor_has_location(p_organisation_id,p_actor_internal_user_id,a.operating_location_id)then raise exception using errcode='42501',message='FINANCIAL_ACTUAL_LOCATION_FORBIDDEN';end if;
  if a.row_version<>p_expected_aggregate_version then return jsonb_build_object('conflict',true,'current_version',a.row_version);end if;
  if a.active_draft_revision_id is not null then return jsonb_build_object('active_draft_conflict',true,'code','ACTIVE_DRAFT_CONFLICT','revision_id',a.active_draft_revision_id);end if;
  if a.current_final_revision_id is null then raise exception using errcode='23514',message='FINANCIAL_ACTUAL_ARCHIVE_FINAL_REQUIRED';end if;
  update public.financial_actuals set archived_at=now(),archived_by_internal_user_id=p_actor_internal_user_id,archive_reason=btrim(p_archive_reason),updated_by_internal_user_id=p_actor_internal_user_id where organisation_id=p_organisation_id and id=a.id returning*into a;
  insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload)values(p_organisation_id,p_actor_internal_user_id,'financial_actual.archived','financial_actual',a.id,jsonb_build_object('current_final_revision_id',a.current_final_revision_id,'aggregate_version',a.row_version,'archive_reason',btrim(p_archive_reason)));
  insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload)values(p_organisation_id,'financial.actual.archived','financial_actual',a.id,jsonb_build_object('current_final_revision_id',a.current_final_revision_id,'aggregate_version',a.row_version));
  return jsonb_build_object('schemaVersion','FINANCIAL_ACTUAL_ARCHIVE_V1','record',jsonb_build_object('id',a.id,'reference',a.reference,'rowVersion',a.row_version,'archivedAt',a.archived_at,'currentFinalRevisionId',a.current_final_revision_id));
end$$;

-- A correction Draft does not replace the current FINAL. The compact list keeps
-- FINAL as the lifecycle authority and reports the Draft as an explicit adjunct.
create or replace function public.ftf_list_financial_actual_summaries(p_organisation_id uuid,p_actor_internal_user_id uuid,p_operating_location_id uuid default null,p_after_id uuid default null,p_page_size integer default 25)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare rows_json jsonb;next_cursor uuid;row_count integer;
begin
  if not public.ftf_financial_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'financial_actuals.read')then raise exception using errcode='42501',message='FINANCIAL_ACTUAL_FORBIDDEN';end if;
  if p_page_size is null or p_page_size not between 1 and 100 then raise exception using errcode='22023',message='FINANCIAL_ACTUAL_PAGE_INVALID';end if;
  if p_operating_location_id is not null and not public.ftf_financial_actor_has_location(p_organisation_id,p_actor_internal_user_id,p_operating_location_id)then raise exception using errcode='42501',message='FINANCIAL_ACTUAL_LOCATION_FORBIDDEN';end if;
  with page as(select a.* from public.financial_actuals a where a.organisation_id=p_organisation_id and a.archived_at is null and(p_operating_location_id is null and public.ftf_financial_actor_has_location(p_organisation_id,p_actor_internal_user_id,a.operating_location_id)or a.operating_location_id=p_operating_location_id)and(p_after_id is null or a.id>p_after_id)order by a.id limit p_page_size+1),projected as(select a.id,jsonb_build_object('id',a.id,'reference',a.reference,'operatingLocation',jsonb_build_object('id',l.id,'label',l.name),'client',jsonb_build_object('id',c.id,'label',c.name),'job',jsonb_build_object('id',j.id,'label',j.reference),'mission',case when m.id is null then null else jsonb_build_object('id',m.id,'label',m.mission_number)end,'lifecycle',case when a.current_final_revision_id is not null then'FINAL'when a.active_draft_revision_id is not null then'DRAFT'else'UNINITIALISED'end,'correctionDraftInProgress',a.current_final_revision_id is not null and a.active_draft_revision_id is not null,'activeDraft',case when d.id is null then null else jsonb_build_object('id',d.id,'revisionNumber',d.revision_number,'rowVersion',d.row_version)end,'currentFinalRevisionNumber',f.revision_number,'finalCalculation',case when f.id is null then null else jsonb_build_object('revenue',f.calculation_snapshot->>'revenue','totalCost',f.calculation_snapshot->>'totalCost','grossProfit',f.calculation_snapshot->>'grossProfit','grossMarginPercentage',f.calculation_snapshot->>'grossMarginPercentage')end,'sourceDrift',case when coalesce(f.source_manifest,d.source_manifest)->'operationalSources'is null then'NONE'when(coalesce(f.source_manifest,d.source_manifest)#>>'{operationalSources,completion,id}')=(select x.id::text from public.mission_completion_revisions x where x.organisation_id=a.organisation_id and x.mission_id=a.mission_id order by x.version_number desc limit 1)then'UNCHANGED'else'CHANGED'end,'archived',false)row_json,row_number()over(order by a.id)rn from page a join public.operating_locations l on l.organisation_id=a.organisation_id and l.id=a.operating_location_id join public.clients c on c.organisation_id=a.organisation_id and c.id=a.client_id join public.jobs j on j.organisation_id=a.organisation_id and j.id=a.job_id left join public.missions m on m.organisation_id=a.organisation_id and m.id=a.mission_id left join public.financial_actual_revisions d on d.organisation_id=a.organisation_id and d.id=a.active_draft_revision_id left join public.financial_actual_revisions f on f.organisation_id=a.organisation_id and f.id=a.current_final_revision_id)
  select coalesce(jsonb_agg(row_json order by id)filter(where rn<=p_page_size),'[]'::jsonb),(max(id::text)filter(where rn=p_page_size))::uuid,count(*)into rows_json,next_cursor,row_count from projected;
  return jsonb_build_object('schemaVersion','FINANCIAL_ACTUAL_LIST_V1','rows',rows_json,'nextCursor',case when row_count>p_page_size then next_cursor else null end);
end$$;

revoke all on function public.ftf_create_financial_actual_correction(uuid,uuid,uuid,integer,uuid,integer,text),public.ftf_read_financial_actual_revision_history(uuid,uuid,uuid,integer,integer),public.ftf_read_financial_actual_historical_revision(uuid,uuid,uuid,uuid),public.ftf_archive_financial_actual(uuid,uuid,uuid,integer,text)from public,anon,authenticated;
grant execute on function public.ftf_create_financial_actual_correction(uuid,uuid,uuid,integer,uuid,integer,text),public.ftf_read_financial_actual_revision_history(uuid,uuid,uuid,integer,integer),public.ftf_read_financial_actual_historical_revision(uuid,uuid,uuid,uuid),public.ftf_archive_financial_actual(uuid,uuid,uuid,integer,text)to service_role;
