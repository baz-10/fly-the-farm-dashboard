function get(value, ...paths) {
  for (const path of paths) {
    let current = value;
    for (const part of path.split('.')) current = current == null ? undefined : current[part];
    if (current !== undefined && current !== null) return current;
  }
  return undefined;
}

function list(value) { return Array.isArray(value) ? value : value ? [value] : []; }
function text(value, fallback = 'Not recorded') { return value === undefined || value === null || value === '' ? fallback : String(value); }
function snapshot(value) { return value?.snapshot || value?.state_snapshot || value || {}; }

function packEvidence(input) {
  const revision = get(input, 'evidence.missionPackRevision', 'evidence.mission_pack_revision') || {};
  const pack = get(revision, 'pack_snapshot', 'packSnapshot') || revision;
  return { pack, evidence: get(pack, 'evidence', 'authorisation.evidence_manifest', 'authorisation.evidenceManifest') || {} };
}

function identity(authorised, input) {
  const mission = snapshot(get(authorised, 'mission.snapshot', 'mission'));
  const context = get(authorised, 'businessContext', 'business_context') || get(input, 'evidence.businessContext', 'evidence.business_context') || {};
  return {
    missionNumber: text(mission.mission_number || mission.missionNumber || get(input, 'evidence.mission.mission_number'), 'Mission'),
    missionStatus: text(mission.status || get(input, 'evidence.mission.status')),
    client: text(get(context, 'client.name', 'client.snapshot.name')),
    property: text(get(context, 'property.name', 'property.snapshot.name')),
    field: text(get(context, 'fields.0.name', 'field.name')),
    title: text(mission.title, ''),
  };
}

function buildMissionPackViewModel(input) {
  const { pack, evidence } = packEvidence(input);
  const planning = evidence.planning || {};
  const preflight = evidence.preflight || {};
  const id = identity(evidence, input);
  const personnel = get(planning, 'personnel.assignments') || list(planning.personnel);
  const pic = personnel.find(item => /pilot_in_command|\bpic\b/i.test(item.assignment_role || item.role || '')) || personnel[0];
  const aircraft = list(planning.aircraft).map(snapshot);
  const equipment = list(get(planning, 'equipmentKits', 'equipment_kits')).map(snapshot);
  const chemicalPlan = get(planning, 'chemicals.lines', 'chemicalPlan.lines', 'chemical_plan.lines') || [];
  const forecast = get(planning, 'forecastWeather', 'forecast_weather') || {};
  const observed = get(preflight, 'observedWeather', 'observed_weather', 'weather') || {};
  const jsa = preflight.jsa || {};
  const readiness = pack.readiness || get(pack, 'authorisation.readiness_snapshot', 'authorisation.readinessSnapshot') || {};
  const authorisation = pack.authorisation || {};
  const authorisationSummary = {
    version: authorisation.version_number || authorisation.version,
    authorisedAt: authorisation.authorised_at || authorisation.authorisedAt,
    authorisedBy: get(authorisation, 'authorised_personnel_snapshot.name', 'authorisedPersonnelSnapshot.name'),
    declaration: authorisation.declaration,
  };
  return {
    identity: id,
    footer: { ...id, reportVersion: Number(input.artefact?.version || input.artefact?.version_number || 1) },
    pages: [
      { key: 'summary', title: 'Mission Summary', rows: [['Mission Number', id.missionNumber], ['Mission Status', id.missionStatus], ['Client', id.client], ['Property', id.property], ['Field', id.field], ['Aircraft', aircraft.map(x => x.registration || x.name || x.model).filter(Boolean).join(', ')], ['Pilot in Command', text(snapshot(pic).name || pic?.personnel_snapshot?.name)], ['Equipment', equipment.map(x => x.name || x.code).filter(Boolean).join(', ')]] },
      { key: 'map', title: 'Mission Map', map: get(planning, 'map'), rows: [['Boundary Area', text(get(planning, 'map.area_hectares', 'map.areaHectares', 'map.geometries.0.area_hectares', 'map.geometries.0.areaHectares')) + ' ha'], ['Operational Features', text(list(get(planning, 'map.geometries')).map(x => x.role || x.feature_type).filter(Boolean).join(', '))]] },
      { key: 'weather', title: 'Planning and Observed Weather', groups: [{ title: 'Planning Forecast', value: forecast }, { title: 'Observed Pre-flight Weather', value: observed }] },
      { key: 'chemicals', title: 'Chemical Plan', chemicals: list(chemicalPlan), rows: [['Planned Water', text(get(planning, 'chemicals.total_water_litres', 'chemicals.totalWaterLitres'))], ['Planned Loads', text(get(planning, 'chemicals.load_count', 'chemicals.loadCount'))]] },
      { key: 'jsa', title: 'JSA and Risk Assessment', hazards: list(jsa.hazards), controls: list(jsa.controls || jsa.triggered_controls), emergencyContacts: list(jsa.emergency_contacts || preflight.emergencyContacts) },
      { key: 'preflight', title: 'Pre-flight', readiness, approvals: list(jsa.approvals || authorisation.approvals), authorisation: authorisationSummary },
    ],
  };
}

function buildMissionSummaryViewModel(input) {
  const evidence = input.evidence || {};
  const completion = evidence.completionRevision || evidence.completion_revision || {};
  const completionSnapshot = completion.completion_snapshot || completion.completionSnapshot || {};
  const daily = completion.daily_evidence_manifest || completion.dailyEvidenceManifest;
  const report = daily?.reportEvidence || daily?.report_evidence;
  const canonical = Boolean(completion.daily_evidence_digest || completion.dailyEvidenceDigest);
  const frozenAuthorisation = completionSnapshot.planningAndPreflightAuthorisation || completionSnapshot.planning_and_preflight_authorisation || {};
  const frozenManifest = frozenAuthorisation.evidence_manifest || frozenAuthorisation.evidenceManifest || {};
  const legacyOperational = completionSnapshot.operationalEvidence || completionSnapshot.operational_evidence || {};
  if (!canonical) {
    const legacyId = identity(frozenManifest, input);
    return {
      source: 'LEGACY_COMPLETION', evidenceStatus: 'LEGACY_DETAIL_UNAVAILABLE', evidenceGaps: ['Historical operating-day detail is unavailable; no day records were fabricated.'],
      identity: legacyId, footer: { ...legacyId, reportVersion: Number(input.artefact?.version || input.artefact?.version_number || 1) }, scope: { mission: {}, job: {}, client: {}, properties: [] }, approval: {},
      operatingDays: [], totals: {}, finalSignoff: { id: completion.id, revisionNumber: completion.version_number || completion.version, declaration: completion.declaration, completedAt: completion.completed_at || completionSnapshot.completedAt },
      legacyActual: { start: legacyOperational.actual_start_at || legacyOperational.started_at, finish: legacyOperational.actual_finish_at || legacyOperational.finished_at, area: legacyOperational.actual_treatment_area_hectares },
      completionStatus: 'Mission completed; detailed operating-day evidence is unavailable.', missionRecordPath: `/missions/${evidence.missionId || evidence.mission_id || input.artefact?.mission_id || ''}#mission-record`,
    };
  }
  const frozenDigest = completion.daily_evidence_digest || completion.dailyEvidenceDigest;
  const validReport = report?.schemaVersion === 1 && report.scope?.mission && report.scope?.job && report.scope?.client
    && Array.isArray(report.scope.properties) && report.governance?.effectivePackage && report.governance?.effectiveApproval
    && report.governance?.governingJsa && Array.isArray(report.aircraft) && Array.isArray(report.plannedChemicals)
    && Array.isArray(report.flightLineEvidence) && Array.isArray(report.exceptionHistory) && Array.isArray(daily?.days)
    && typeof frozenDigest === 'string' && /^[a-f0-9]{64}$/.test(frozenDigest);
  if (!daily || !report || !validReport) {
    const unavailable = identity({}, input);
    const missing = !daily || !report;
    return {
      source: 'FROZEN_FINAL_SIGNOFF', evidenceStatus: 'MISSING_FROZEN_EVIDENCE', evidenceGaps: [missing ? 'Frozen report evidence is unavailable.' : 'Frozen report evidence is invalid.'], identity: unavailable,
      footer: { ...unavailable, reportVersion: Number(input.artefact?.version || input.artefact?.version_number || 1) }, scope: { mission: {}, job: {}, client: {}, properties: [] }, approval: {}, operatingDays: [], totals: {},
      finalSignoff: { id: completion.id, revisionNumber: completion.version_number || completion.version, evidenceDigest: frozenDigest, declaration: completion.declaration, completedAt: completion.completed_at || completionSnapshot.completedAt },
      completionStatus: 'Mission report unavailable: frozen evidence is incomplete.', missionRecordPath: `/missions/${evidence.missionId || evidence.mission_id || input.artefact?.mission_id || ''}#mission-record`,
    };
  }
  const rawProperties = list(report.scope?.properties)
    .map(property => ({
      ...property,
      fields: list(property.fields).slice().sort((a,b) => Number(a.fieldOrder || 0)-Number(b.fieldOrder || 0) || String(a.name || '').localeCompare(String(b.name || ''))),
    }))
    .sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''))||String(a.id||'').localeCompare(String(b.id||'')));
  const fields = new Map(rawProperties.flatMap(property => property.fields.map(field => [field.id, { ...field, propertyId: property.id, propertyName: property.name }])));
  const aircraft = new Map(list(report.aircraft).map(item => [item.id,item]));
  const plannedRevisions = new Map(list(report.plannedChemicals).map(item => [item.revisionId,item]));
  const flightLines = new Map(list(report.flightLineEvidence).map(item => [item.id,item]));
  const days = list(daily.days).slice().sort((a,b)=>String(a.workDate||a.work_date||'').localeCompare(String(b.workDate||b.work_date||''))||String(a.id||'').localeCompare(String(b.id||''))).map(day => {
    const plan = plannedRevisions.get(day.chemicalActual?.planned_chemical_revision_id || day.chemicalActual?.plannedChemicalRevisionId) || {};
    const plannedLines = new Map(list(plan.lines).map(line => [line.id,line]));
    const dayFields = list(day.fieldActivities || day.field_activities).map(activity => { const field=fields.get(activity.field_id || activity.fieldId)||{}; return { fieldId: activity.field_id || activity.fieldId, name: field.name || 'Unavailable', propertyName: field.propertyName || 'Unavailable', attemptedHectares: activity.attempted_hectares || activity.attemptedHectares, completedHectares: activity.completed_hectares || activity.completedHectares, status: activity.status }; }).sort((a,b)=>String(a.propertyName).localeCompare(String(b.propertyName))||String(a.name).localeCompare(String(b.name)));
    const dayAircraft = list(day.aircraftActuals || day.aircraft_actuals).map(actual => { const frozen=aircraft.get(actual.aircraft_id || actual.aircraftId)||{}; return { aircraftId: actual.aircraft_id || actual.aircraftId, registration: frozen.registration || 'Unavailable', manufacturer: frozen.manufacturer, model: frozen.model, flightHours: actual.total_flight_hours || actual.totalFlightHours, reconciliationStatus: actual.reconciliation_status || actual.reconciliationStatus, flights: list(actual.flights).map(flight=>({ index: flight.flight_index || flight.flightIndex, durationHours: flight.duration_hours || flight.durationHours, fieldId: flight.field_id || flight.fieldId, startedAt: flight.started_at || flight.startedAt, finishedAt: flight.finished_at || flight.finishedAt })).sort((a,b)=>Number(a.index)-Number(b.index)) }; }).sort((a,b)=>String(a.registration).localeCompare(String(b.registration))||String(a.aircraftId).localeCompare(String(b.aircraftId)));
    const chemicals = list(day.chemicalActual?.lines).map(line => { const planned=plannedLines.get(line.planned_line_id || line.plannedLineId)||{}; const field=fields.get(line.field_id || line.fieldId)||{}; return { lineNumber: line.line_number || line.lineNumber, fieldId: line.field_id || line.fieldId, fieldName: field.name || 'Unavailable', productName: planned.productName || line.product_name_snapshot || line.productNameSnapshot || 'Unavailable', plannedRate: planned.rate, actualRate: line.actual_rate || line.actualRate, rateUnit: line.rate_unit || line.rateUnit || planned.rateUnit, quantityApplied: line.quantity_applied || line.quantityApplied, batchLot: line.batch_lot || line.batchLot }; }).sort((a,b)=>Number(a.lineNumber)-Number(b.lineNumber));
    const weather = day.weatherReport || day.weather_report || {};
    const attributions = list(day.flightLineAttributions || day.flight_line_attributions).map(link => ({ ...(flightLines.get(link.operational_import_id || link.operationalImportId)||{}), referenceId: link.operational_import_id || link.operationalImportId, aircraftId: link.aircraft_id || link.aircraftId })).sort((a,b)=>String(a.filename||'').localeCompare(String(b.filename||''))||String(a.referenceId).localeCompare(String(b.referenceId)));
    const exceptions=[]; if(day.interruptions) exceptions.push(...list(day.interruptions).map(value=>({type:'INTERRUPTION',value}))); if(day.notes) exceptions.push({type:'NOTE',value:day.notes}); for(const gap of list(weather.coverage_gaps || weather.coverageGaps)) exceptions.push({type:'WEATHER_GAP',value:gap});
    return { id: day.id, workDate: day.workDate || day.work_date, timezone: day.timezone, state: day.state, startedAt: day.startedAt || day.started_at, finishedAt: day.finishedAt || day.finished_at, packageRevisionId: day.packageRevisionId || day.package_revision_id, jsaRevisionId: day.jsaRevisionId || day.jsa_revision_id, jsaReview: day.jsaReview || day.jsa_review, fields: dayFields, aircraft: dayAircraft, chemicals, weather: { sourceType: weather.source_type || weather.sourceType, coverageStatus: weather.coverage_status || weather.coverageStatus, timezone: weather.timezone, observations: weather.hourly_observations || weather.hourlyObservations || [], gaps: weather.coverage_gaps || weather.coverageGaps || [] }, flightLines: attributions, exceptions };
  });
  const scope={ mission: report.scope?.mission || {}, job: report.scope?.job || {}, client: report.scope?.client || {}, properties: rawProperties };
  const id={ missionNumber:text(scope.mission.missionNumber,'Mission'), missionStatus:'Finally signed off', client:text(scope.client.name), property:rawProperties.map(x=>x.name).join(', ')||'Not recorded', field:rawProperties.flatMap(x=>x.fields).map(x=>x.name).join(', ')||'Not recorded', title:'' };
  const governance=report.governance||{};
  return {
    source:'FROZEN_FINAL_SIGNOFF', evidenceStatus:'COMPLETE', evidenceGaps:[], identity:id, scope,
    footer: { ...id, reportVersion: Number(input.artefact?.version || input.artefact?.version_number || 1) },
    approval:{ packageRevisionId:governance.effectivePackage?.id, packageRevisionNumber:governance.effectivePackage?.revisionNumber, approvalRevisionNumber:governance.effectiveApproval?.revisionNumber, approvedAt:governance.effectiveApproval?.decidedAt, jsaRevisionId:governance.governingJsa?.id, jsaRevisionNumber:governance.governingJsa?.versionNumber, packageHistory:list(governance.packageHistory), decisionHistory:list(governance.decisionHistory), jsaHistory:list(governance.jsaHistory) },
    operatingDays:days, totals:{ operationalDays:daily.operationalDays, actualWorkHours:daily.actualWorkHours, totalAircraftHours:daily.totalAircraftHours }, exceptions:list(report.exceptionHistory), flightLineEvidence:list(report.flightLineEvidence),
    finalSignoff:{ id:completion.id, revisionNumber:completion.version_number||completion.version, evidenceDigest:completion.daily_evidence_digest||completion.dailyEvidenceDigest, declaration:completion.declaration, completedAt:completion.completed_at||completionSnapshot.completedAt, completedBy:completion.completed_by_internal_user_id||completion.completedByInternalUserId },
    completionStatus:list(report.exceptionHistory).length?'Mission finally signed off with recorded exceptions.':'Mission finally signed off.',
    missionRecordPath: `/missions/${evidence.missionId || evidence.mission_id || input.artefact?.mission_id || ''}#mission-record`,
  };
}

module.exports = { buildMissionPackViewModel, buildMissionSummaryViewModel };
