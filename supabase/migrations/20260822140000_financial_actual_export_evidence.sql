-- Financial Actuals Slice 6: bounded evidence for an exact immutable FINAL export.
-- The FINAL revision remains the sole financial authority; this function creates
-- no export state and returns no financial values.

create function public.ftf_record_financial_actual_export_evidence(
  p_organisation_id uuid,
  p_actor_internal_user_id uuid,
  p_financial_actual_id uuid,
  p_revision_id uuid,
  p_revision_number integer,
  p_input_digest text,
  p_formula_version text,
  p_report_version text,
  p_generated_at timestamptz
) returns jsonb
language plpgsql
security definer set search_path=public,pg_temp
as $$
declare
  v_actual public.financial_actuals%rowtype;
  v_revision public.financial_actual_revisions%rowtype;
  v_recorded_at timestamptz := clock_timestamp();
  v_evidence jsonb;
begin
  if not public.ftf_financial_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'financial_actuals.read')
     or not public.ftf_financial_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'financial_actuals.export') then
    raise exception using errcode='42501',message='FINANCIAL_ACTUAL_FORBIDDEN';
  end if;

  select * into v_actual
  from public.financial_actuals
  where organisation_id=p_organisation_id and id=p_financial_actual_id;

  if not found or not public.ftf_financial_actor_has_location(
    p_organisation_id,p_actor_internal_user_id,v_actual.operating_location_id
  ) then
    return jsonb_build_object('not_found',true);
  end if;

  select * into v_revision
  from public.financial_actual_revisions
  where organisation_id=p_organisation_id
    and financial_actual_id=v_actual.id
    and id=p_revision_id
    and status='FINAL';

  if not found then return jsonb_build_object('not_found',true); end if;

  if p_revision_number is null or p_revision_number<>v_revision.revision_number
     or p_input_digest is null or p_input_digest!~'^[0-9a-f]{64}$' or p_input_digest<>v_revision.input_digest
     or p_formula_version is null or p_formula_version<>v_revision.calculation_version
     or p_formula_version<>'FINANCIAL_ACTUAL_V1'
     or p_report_version is null or p_report_version<>'FINANCIAL_ACTUAL_PNL_V1'
     or p_generated_at is null
     or p_generated_at<v_recorded_at-interval '10 minutes'
     or p_generated_at>v_recorded_at+interval '30 seconds' then
    raise exception using errcode='22023',message='FINANCIAL_ACTUAL_EXPORT_EVIDENCE_MISMATCH';
  end if;

  v_evidence:=jsonb_build_object(
    'financial_actual_id',v_actual.id,
    'revision_id',v_revision.id,
    'revision_number',v_revision.revision_number,
    'input_digest',v_revision.input_digest,
    'formula_version',v_revision.calculation_version,
    'report_version',p_report_version,
    'generated_at',p_generated_at
  );

  insert into public.audit_events(
    organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload
  ) values(
    p_organisation_id,p_actor_internal_user_id,'financial_actual.export_generated',
    'financial_actual',v_actual.id,v_evidence
  );

  insert into public.transactional_outbox(
    organisation_id,topic,aggregate_type,aggregate_id,payload
  ) values(
    p_organisation_id,'financial.actual.export_generated','financial_actual',v_actual.id,v_evidence
  );

  return jsonb_build_object(
    'schemaVersion','FINANCIAL_ACTUAL_EXPORT_EVIDENCE_V1',
    'financialActualId',v_actual.id,
    'revisionId',v_revision.id,
    'revisionNumber',v_revision.revision_number,
    'inputDigest',v_revision.input_digest,
    'formulaVersion',v_revision.calculation_version,
    'reportVersion',p_report_version,
    'generatedAt',p_generated_at,
    'recordedAt',v_recorded_at
  );
end$$;

revoke all on function public.ftf_record_financial_actual_export_evidence(uuid,uuid,uuid,uuid,integer,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.ftf_record_financial_actual_export_evidence(uuid,uuid,uuid,uuid,integer,text,text,text,timestamptz) to service_role;
