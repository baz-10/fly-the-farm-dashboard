-- FINANCIAL_ACTUAL_V1 deterministic calculation and atomic finalisation.
-- Operational prefill, correction drafts and archive completion are intentionally excluded.

create function public.ftf_financial_actual_parse_decimal(p_value text,p_precision integer,p_scale integer)
returns numeric language plpgsql immutable security definer set search_path=public,pg_temp as $$
declare v_fraction text;v_digits text;
begin
  if p_value is null or p_value!~'^(0|[1-9][0-9]*)(\.[0-9]+)?$'then raise exception using errcode='22023',message='FINANCIAL_ACTUAL_NUMERIC_INVALID';end if;
  v_fraction:=coalesce(split_part(p_value,'.',2),'');v_digits:=replace(p_value,'.','');
  if length(v_fraction)>p_scale or length(v_digits)>p_precision then raise exception using errcode='22023',message='FINANCIAL_ACTUAL_NUMERIC_INVALID';end if;
  return p_value::numeric;
exception when numeric_value_out_of_range or invalid_text_representation then raise exception using errcode='22023',message='FINANCIAL_ACTUAL_NUMERIC_INVALID';
end$$;

create function public.ftf_financial_actual_money_text(p_value numeric)
returns text language sql immutable security definer set search_path=public,pg_temp as $$
select to_char(round(p_value,2)::numeric(19,4),'FM9999999999999990.0000')
$$;

create function public.ftf_financial_actual_bound(p_value numeric,p_precision integer,p_scale integer)
returns numeric language plpgsql immutable security definer set search_path=public,pg_temp as $$
declare v_result numeric;
begin
  execute format('select $1::numeric(%s,%s)',p_precision,p_scale)into v_result using p_value;
  return v_result;
exception when numeric_value_out_of_range then raise exception using errcode='22023',message='FINANCIAL_ACTUAL_NUMERIC_INVALID';
end$$;

create function public.ftf_calculate_financial_actual_v1(p_input jsonb)
returns jsonb language plpgsql immutable security definer set search_path=public,pg_temp as $$
declare
  v_work jsonb;v_line jsonb;v_revenue_input jsonb;v_mode text;v_currency text;v_id text;v_category text;
  v_hours numeric:=0;v_hours_value numeric;v_quantity numeric;v_rate numeric;v_amount numeric;v_revenue numeric;v_total numeric:=0;v_profit numeric;
  v_operational_dates jsonb:='{}'::jsonb;v_line_amounts jsonb:='{}'::jsonb;
  v_labour numeric:=0;v_product numeric:=0;v_travel numeric:=0;v_aircraft numeric:=0;v_other numeric:=0;
  v_margin text;v_hourly text;
begin
  if p_input is null or jsonb_typeof(p_input)<>'object'or p_input->>'formulaVersion'<>'FINANCIAL_ACTUAL_V1'theN raise exception using errcode='22023',message='FINANCIAL_ACTUAL_FORMULA_UNSUPPORTED';end if;
  v_currency:=p_input->>'currencyCode';if v_currency<>'AUD'then raise exception using errcode='22023',message='FINANCIAL_ACTUAL_CURRENCY_UNSUPPORTED';end if;
  if jsonb_typeof(p_input->'workEntries')<>'array'or jsonb_typeof(p_input->'costLines')<>'array'or jsonb_typeof(p_input->'revenue')<>'object'then raise exception using errcode='22023',message='FINANCIAL_ACTUAL_INPUT_INVALID';end if;

  for v_work in select value from jsonb_array_elements(p_input->'workEntries')loop
    if (v_work->>'workDate')!~'^\d{4}-\d{2}-\d{2}$'then raise exception using errcode='22023',message='FINANCIAL_ACTUAL_DATE_INVALID';end if;
    begin perform(v_work->>'workDate')::date;exception when others then raise exception using errcode='22023',message='FINANCIAL_ACTUAL_DATE_INVALID';end;
    v_hours_value:=public.ftf_financial_actual_parse_decimal(v_work->>'actualWorkHours',10,4);v_hours:=public.ftf_financial_actual_bound(v_hours+v_hours_value,10,4);
    if v_hours_value>0 then v_operational_dates:=v_operational_dates||jsonb_build_object(v_work->>'workDate',true);end if;
  end loop;

  v_revenue_input:=p_input->'revenue';v_mode:=v_revenue_input->>'mode';
  if v_mode='HOURLY'then
    v_revenue:=round(public.ftf_financial_actual_parse_decimal(v_revenue_input->>'hourlyRate',19,6)*v_hours,2);
  elsif v_mode='AREA'then
    v_revenue:=round(public.ftf_financial_actual_parse_decimal(v_revenue_input->>'actualHectares',18,6)*public.ftf_financial_actual_parse_decimal(v_revenue_input->>'ratePerHectare',19,6),2);
  elsif v_mode='MANUAL'then
    if jsonb_typeof(v_revenue_input->'provenance')<>'object'or v_revenue_input#>>'{provenance,fieldPath}'<>'revenue/manualRevenue'or v_revenue_input#>>'{provenance,provenanceClass}'not in('MANUAL_FINANCIAL_INPUT','MANUAL_OVERRIDE')or v_revenue_input#>>'{provenance,unitCode}'<>v_currency or v_revenue_input#>>'{provenance,effectiveValue}'is distinct from v_revenue_input->>'manualRevenue'then raise exception using errcode='23514',message='FINANCIAL_ACTUAL_REVENUE_PROVENANCE_REQUIRED';end if;
    v_revenue:=public.ftf_financial_actual_parse_decimal(v_revenue_input->>'manualRevenue',19,4);
    if v_revenue<>round(v_revenue,2)then raise exception using errcode='22023',message='FINANCIAL_ACTUAL_MONEY_MINOR_UNIT_INVALID';end if;
  else raise exception using errcode='22023',message='FINANCIAL_ACTUAL_REVENUE_MODE_INVALID';end if;
  v_revenue:=public.ftf_financial_actual_bound(v_revenue,19,4);

  for v_line in select value from jsonb_array_elements(p_input->'costLines')loop
    v_id:=v_line->>'id';v_category:=v_line->>'category';
    if v_id is null or v_id=''or v_line_amounts?v_id or v_category not in('LABOUR','PRODUCT','TRAVEL','AIRCRAFT_EQUIPMENT','OTHER')then raise exception using errcode='22023',message='FINANCIAL_ACTUAL_COST_LINE_INVALID';end if;
    v_quantity:=public.ftf_financial_actual_parse_decimal(v_line->>'quantity',18,6);v_rate:=public.ftf_financial_actual_parse_decimal(v_line->>'unitCost',19,6);v_amount:=public.ftf_financial_actual_bound(round(v_quantity*v_rate,2),19,4);
    v_line_amounts:=v_line_amounts||jsonb_build_object(v_id,public.ftf_financial_actual_money_text(v_amount));
    if v_category='LABOUR'then v_labour:=public.ftf_financial_actual_bound(v_labour+v_amount,19,4);elsif v_category='PRODUCT'then v_product:=public.ftf_financial_actual_bound(v_product+v_amount,19,4);elsif v_category='TRAVEL'then v_travel:=public.ftf_financial_actual_bound(v_travel+v_amount,19,4);elsif v_category='AIRCRAFT_EQUIPMENT'then v_aircraft:=public.ftf_financial_actual_bound(v_aircraft+v_amount,19,4);else v_other:=public.ftf_financial_actual_bound(v_other+v_amount,19,4);end if;
  end loop;
  v_total:=public.ftf_financial_actual_bound(v_labour+v_product+v_travel+v_aircraft+v_other,19,4);v_profit:=public.ftf_financial_actual_bound(v_revenue-v_total,19,4);
  v_margin:=case when v_revenue=0 then null else to_char(public.ftf_financial_actual_bound(round(v_profit/v_revenue*100,4),19,4),'FM9999999999999990.0000')end;
  v_hourly:=case when v_hours=0 then null else public.ftf_financial_actual_money_text(public.ftf_financial_actual_bound(round(v_revenue/v_hours,2),19,4))end;
  return jsonb_build_object(
    'formulaVersion','FINANCIAL_ACTUAL_V1','currencyCode','AUD','operationalDays',(select count(*) from jsonb_object_keys(v_operational_dates)),
    'totalHours',to_char(v_hours::numeric(10,4),'FM999990.0000'),'revenue',public.ftf_financial_actual_money_text(v_revenue),'lineAmounts',v_line_amounts,
    'categoryTotals',jsonb_build_object('LABOUR',public.ftf_financial_actual_money_text(v_labour),'PRODUCT',public.ftf_financial_actual_money_text(v_product),'TRAVEL',public.ftf_financial_actual_money_text(v_travel),'AIRCRAFT_EQUIPMENT',public.ftf_financial_actual_money_text(v_aircraft),'OTHER',public.ftf_financial_actual_money_text(v_other)),
    'totalCost',public.ftf_financial_actual_money_text(v_total),'grossProfit',public.ftf_financial_actual_money_text(v_profit),'grossMarginPercentage',v_margin,'effectiveHourlyRevenue',v_hourly);
end$$;

create function public.ftf_finalise_financial_actual_revision(
  p_organisation_id uuid,p_actor_internal_user_id uuid,p_financial_actual_id uuid,p_revision_id uuid,p_expected_aggregate_version integer,p_expected_draft_version integer
)returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_actual public.financial_actuals%rowtype;v_revision public.financial_actual_revisions%rowtype;v_result jsonb;v_input jsonb;v_work jsonb;v_cost jsonb;v_provenance jsonb;v_revenue jsonb;
  v_mode text;v_rate text;v_area text;v_manual text;v_manual_class text;v_line jsonb;v_calculated_amount text;v_digest text;v_count integer;v_manifest jsonb;
begin
  if not public.ftf_financial_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'financial_actuals.finalise')then raise exception using errcode='42501',message='FINANCIAL_ACTUAL_FORBIDDEN';end if;
  select*into v_actual from public.financial_actuals where organisation_id=p_organisation_id and id=p_financial_actual_id and archived_at is null for update;
  if not found then return jsonb_build_object('not_found',true);end if;
  if not public.ftf_financial_actor_has_location(p_organisation_id,p_actor_internal_user_id,v_actual.operating_location_id)then raise exception using errcode='42501',message='FINANCIAL_ACTUAL_LOCATION_FORBIDDEN';end if;
  if v_actual.row_version<>p_expected_aggregate_version then return jsonb_build_object('conflict',true,'aggregate_version',v_actual.row_version);end if;
  select*into v_revision from public.financial_actual_revisions where organisation_id=p_organisation_id and financial_actual_id=v_actual.id and id=p_revision_id for update;
  if not found or v_revision.status<>'DRAFT'or v_actual.active_draft_revision_id is distinct from v_revision.id then return jsonb_build_object('not_found',true);end if;
  if v_revision.row_version<>p_expected_draft_version then return jsonb_build_object('conflict',true,'draft_version',v_revision.row_version);end if;
  if v_revision.calculation_version<>'FINANCIAL_ACTUAL_V1'or v_revision.currency_code<>'AUD'then raise exception using errcode='22023',message='FINANCIAL_ACTUAL_FORMULA_UNSUPPORTED';end if;
  if not exists(select 1 from public.clients c join public.properties p on p.organisation_id=c.organisation_id and p.client_id=c.id join public.fields f on f.organisation_id=p.organisation_id and f.property_id=p.id join public.jobs j on j.organisation_id=c.organisation_id and j.client_id=c.id and j.property_id=p.id join public.job_fields jf on jf.organisation_id=j.organisation_id and jf.job_id=j.id and jf.field_id=f.id and jf.archived_at is null where c.organisation_id=p_organisation_id and c.id=v_actual.client_id and p.id=v_actual.property_id and f.id=v_actual.field_id and j.id=v_actual.job_id and c.archived_at is null and p.archived_at is null and f.archived_at is null and j.archived_at is null)then raise exception using errcode='23514',message='FINANCIAL_ACTUAL_RELATIONSHIP_CONFLICT';end if;
  if v_actual.mission_id is not null and not exists(select 1 from public.missions m where m.organisation_id=p_organisation_id and m.id=v_actual.mission_id and m.job_id=v_actual.job_id and m.operating_location_id=v_actual.operating_location_id and m.archived_at is null)then raise exception using errcode='23514',message='FINANCIAL_ACTUAL_RELATIONSHIP_CONFLICT';end if;

  select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'workDate',w.work_date::text,'actualWorkHours',to_char(w.actual_work_hours,'FM999990.0000'),'provenanceId',w.provenance_id)order by w.work_date,w.id),'[]'::jsonb)into v_work from public.financial_actual_work_entries w where w.organisation_id=p_organisation_id and w.financial_actual_id=v_actual.id and w.financial_actual_revision_id=v_revision.id;
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'category',c.category,'subtype',c.subtype,'description',c.description,'incurredOn',c.incurred_on,'quantity',to_char(c.quantity,'FM999999999999.000000'),'unitCode',c.unit_code,'unitCost',to_char(c.unit_cost,'FM9999999999990.000000'),'amount',to_char(c.amount,'FM9999999999999990.0000'),'provenanceId',c.provenance_id,'sourceEntityType',c.source_entity_type,'sourceEntityId',c.source_entity_id,'sourceVersion',c.source_version,'displayOrder',c.display_order)order by c.display_order,c.id),'[]'::jsonb)into v_cost from public.financial_actual_cost_lines c where c.organisation_id=p_organisation_id and c.financial_actual_id=v_actual.id and c.financial_actual_revision_id=v_revision.id;
  select coalesce(jsonb_agg(to_jsonb(p)order by p.field_path,p.id),'[]'::jsonb)into v_provenance from public.financial_actual_value_provenance p where p.organisation_id=p_organisation_id and p.financial_actual_id=v_actual.id and p.financial_actual_revision_id=v_revision.id;
  if jsonb_array_length(v_work)=0 then raise exception using errcode='23514',message='FINANCIAL_ACTUAL_WORK_REQUIRED';end if;

  if exists(select 1 from public.financial_actual_value_provenance p where p.organisation_id=p_organisation_id and p.financial_actual_revision_id=v_revision.id and p.provenance_class='QUOTE_DERIVED')then raise exception using errcode='0A000',message='FINANCIAL_ACTUAL_QUOTE_AUTHORITY_UNAVAILABLE';end if;
  select count(*),max(p.effective_value#>>'{}')into v_count,v_mode from public.financial_actual_value_provenance p where p.organisation_id=p_organisation_id and p.financial_actual_revision_id=v_revision.id and p.field_path='revenue/mode'and p.unit_code='REVENUE_MODE'and p.provenance_class in('AUTHORITATIVE_OPERATIONAL_INPUT','SYSTEM_DERIVED','MANUAL_FINANCIAL_INPUT','MANUAL_OVERRIDE')and jsonb_typeof(p.effective_value)='string';
  if v_count<>1 then raise exception using errcode='23514',message='FINANCIAL_ACTUAL_REVENUE_PROVENANCE_INVALID';end if;
  if v_mode='HOURLY'then
    select count(*),max(p.effective_value#>>'{}')into v_count,v_rate from public.financial_actual_value_provenance p where p.organisation_id=p_organisation_id and p.financial_actual_revision_id=v_revision.id and p.field_path='revenue/hourlyRate'and p.unit_code='AUD_PER_HOUR'and p.provenance_class in('AUTHORITATIVE_OPERATIONAL_INPUT','SYSTEM_DERIVED','MANUAL_FINANCIAL_INPUT','MANUAL_OVERRIDE')and jsonb_typeof(p.effective_value)='string';
    if v_count<>1 or(select count(*)from public.financial_actual_value_provenance p where p.organisation_id=p_organisation_id and p.financial_actual_revision_id=v_revision.id and p.field_path like'revenue/%')<>2 then raise exception using errcode='23514',message='FINANCIAL_ACTUAL_REVENUE_PROVENANCE_INVALID';end if;
    v_revenue:=jsonb_build_object('mode','HOURLY','hourlyRate',v_rate);
  elsif v_mode='AREA'then
    select count(*),max(p.effective_value#>>'{}')into v_count,v_area from public.financial_actual_value_provenance p where p.organisation_id=p_organisation_id and p.financial_actual_revision_id=v_revision.id and p.field_path='revenue/actualHectares'and p.unit_code='HECTARE'and p.provenance_class in('AUTHORITATIVE_OPERATIONAL_INPUT','SYSTEM_DERIVED','MANUAL_FINANCIAL_INPUT','MANUAL_OVERRIDE')and jsonb_typeof(p.effective_value)='string';if v_count<>1 then raise exception using errcode='23514',message='FINANCIAL_ACTUAL_REVENUE_PROVENANCE_INVALID';end if;
    select count(*),max(p.effective_value#>>'{}')into v_count,v_rate from public.financial_actual_value_provenance p where p.organisation_id=p_organisation_id and p.financial_actual_revision_id=v_revision.id and p.field_path='revenue/ratePerHectare'and p.unit_code='AUD_PER_HECTARE'and p.provenance_class in('AUTHORITATIVE_OPERATIONAL_INPUT','SYSTEM_DERIVED','MANUAL_FINANCIAL_INPUT','MANUAL_OVERRIDE')and jsonb_typeof(p.effective_value)='string';
    if v_count<>1 or(select count(*)from public.financial_actual_value_provenance p where p.organisation_id=p_organisation_id and p.financial_actual_revision_id=v_revision.id and p.field_path like'revenue/%')<>3 then raise exception using errcode='23514',message='FINANCIAL_ACTUAL_REVENUE_PROVENANCE_INVALID';end if;
    v_revenue:=jsonb_build_object('mode','AREA','actualHectares',v_area,'ratePerHectare',v_rate);
  elsif v_mode='MANUAL'then
    select count(*),max(p.effective_value#>>'{}'),max(p.provenance_class)into v_count,v_manual,v_manual_class from public.financial_actual_value_provenance p where p.organisation_id=p_organisation_id and p.financial_actual_revision_id=v_revision.id and p.field_path='revenue/manualRevenue'and p.unit_code='AUD'and p.provenance_class in('MANUAL_FINANCIAL_INPUT','MANUAL_OVERRIDE')and jsonb_typeof(p.effective_value)='string';
    if v_count<>1 or(select count(*)from public.financial_actual_value_provenance p where p.organisation_id=p_organisation_id and p.financial_actual_revision_id=v_revision.id and p.field_path like'revenue/%')<>2 then raise exception using errcode='23514',message='FINANCIAL_ACTUAL_REVENUE_PROVENANCE_INVALID';end if;
    v_revenue:=jsonb_build_object('mode','MANUAL','manualRevenue',v_manual,'provenance',jsonb_build_object('fieldPath','revenue/manualRevenue','provenanceClass',v_manual_class,'effectiveValue',v_manual,'unitCode','AUD'));
  else raise exception using errcode='23514',message='FINANCIAL_ACTUAL_REVENUE_PROVENANCE_REQUIRED';end if;
  if(v_mode='HOURLY'and v_rate is null)or(v_mode='AREA'and(v_area is null or v_rate is null))or(v_mode='MANUAL'and v_manual is null)then raise exception using errcode='23514',message='FINANCIAL_ACTUAL_REVENUE_PROVENANCE_REQUIRED';end if;

  v_input:=jsonb_build_object('formulaVersion','FINANCIAL_ACTUAL_V1','currencyCode','AUD','revenue',v_revenue,'workEntries',(select coalesce(jsonb_agg(jsonb_build_object('workDate',x->>'workDate','actualWorkHours',x->>'actualWorkHours')order by x->>'workDate',x->>'id'),'[]'::jsonb)from jsonb_array_elements(v_work)x),'costLines',(select coalesce(jsonb_agg(jsonb_build_object('id',x->>'id','category',x->>'category','quantity',x->>'quantity','unitCost',x->>'unitCost')order by x->>'id'),'[]'::jsonb)from jsonb_array_elements(v_cost)x),'workEntryEvidence',v_work,'costLineEvidence',v_cost);
  v_result:=public.ftf_calculate_financial_actual_v1(v_input);
  for v_line in select value from jsonb_array_elements(v_cost)loop
    v_calculated_amount:=v_result->'lineAmounts'->>(v_line->>'id');if v_calculated_amount is distinct from v_line->>'amount'then raise exception using errcode='23514',message='FINANCIAL_ACTUAL_COST_AMOUNT_MISMATCH';end if;
  end loop;
  v_digest:=encode(sha256(convert_to(v_input::text,'UTF8')),'hex');
  v_manifest:=jsonb_build_object(
    'schemaVersion','FINANCIAL_ACTUAL_SOURCE_MANIFEST_V1','financialActualId',v_actual.id,'revisionId',v_revision.id,
    'formulaVersion','FINANCIAL_ACTUAL_V1','revenueMode',v_mode,
    'workEntryIds',(select coalesce(jsonb_agg(x->>'id'order by x->>'id'),'[]'::jsonb)from jsonb_array_elements(v_work)x),
    'costLineIds',(select coalesce(jsonb_agg(x->>'id'order by x->>'id'),'[]'::jsonb)from jsonb_array_elements(v_cost)x),
    'provenanceIds',(select coalesce(jsonb_agg(x->>'id'order by x->>'id'),'[]'::jsonb)from jsonb_array_elements(v_provenance)x));
  perform set_config('app.financial_actual_finalisation','allowed',true);
  update public.financial_actual_revisions set input_snapshot=v_input,provenance_snapshot=jsonb_build_object('rows',v_provenance),source_manifest=v_manifest,calculation_snapshot=v_result,input_digest=v_digest,status='FINAL',finalised_at=now(),finalised_by_internal_user_id=p_actor_internal_user_id,updated_by_internal_user_id=p_actor_internal_user_id where organisation_id=p_organisation_id and id=v_revision.id returning*into v_revision;
  select*into v_actual from public.financial_actuals where organisation_id=p_organisation_id and id=v_actual.id;
  insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload)values(p_organisation_id,p_actor_internal_user_id,'financial_actual.finalised','financial_actual',v_actual.id,jsonb_build_object('revision_id',v_revision.id,'revision_number',v_revision.revision_number,'formula_version','FINANCIAL_ACTUAL_V1','aggregate_version',v_actual.row_version));
  insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload)values(p_organisation_id,'financial.actual.finalised','financial_actual',v_actual.id,jsonb_build_object('revision_id',v_revision.id,'revision_number',v_revision.revision_number,'formula_version','FINANCIAL_ACTUAL_V1','aggregate_version',v_actual.row_version));
  return jsonb_build_object('record',to_jsonb(v_actual),'revision',to_jsonb(v_revision));
end$$;

revoke all on function public.ftf_financial_actual_parse_decimal(text,integer,integer),public.ftf_financial_actual_money_text(numeric),public.ftf_financial_actual_bound(numeric,integer,integer),public.ftf_calculate_financial_actual_v1(jsonb)from public,anon,authenticated,service_role;
revoke all on function public.ftf_finalise_financial_actual_revision(uuid,uuid,uuid,uuid,integer,integer)from public,anon,authenticated;
grant execute on function public.ftf_finalise_financial_actual_revision(uuid,uuid,uuid,uuid,integer,integer)to service_role;
