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
  const operational = evidence.operationalRevision || evidence.operational_revision || completionSnapshot.operationalEvidence || completionSnapshot.operational_evidence || evidence.operationalEvidence || {};
  const authorisation = completionSnapshot.planningAndPreflightAuthorisation || completionSnapshot.planning_and_preflight_authorisation || {};
  const authorised = authorisation.evidence_manifest || authorisation.evidenceManifest || {};
  const id = identity(authorised, input);
  const events = list(evidence.events || operational.events || operational.operational_events);
  const exception = Boolean(completion.flight_lines_override || completion.override_reason || events.some(item => /incident|issue|exception|delay|hold|near miss/i.test(item.type || item.event_type || item.category || '')));
  const actualRecord = evidence.actualResources || evidence.actual_resources || {};
  const chemicalRecord = evidence.actualChemicals || evidence.actual_chemicals || {};
  const actual = actualRecord.actual_resources || actualRecord.actualResources || operational.actual_resources || operational.actualResources || actualRecord;
  const chemicals = chemicalRecord.actual_usage || chemicalRecord.actualUsage || operational.actual_chemical_usage || operational.actualChemicalUsage || chemicalRecord;
  const imports = list(evidence.imports || operational.imports);
  const operationalImport = imports[0] || operational.import || {};
  const outcomes = list(evidence.customerOutcomes || evidence.customer_outcomes);
  return {
    identity: id,
    footer: { ...id, reportVersion: Number(input.artefact?.version || input.artefact?.version_number || 1) },
    completionStatus: exception ? 'Mission completed with operational exceptions.' : 'Mission completed successfully.',
    actual: {
      weather: operational.actual_weather || operational.weather || get(authorised, 'preflight.observedWeather', 'preflight.observed_weather'),
      aircraft: actual.aircraft || actual.aircraft_snapshot,
      personnel: actual.personnel || actual.personnel_snapshots,
      equipment: actual.equipment || actual.equipment_kits,
      chemicals,
      water: chemicals.actual_water_litres || chemicals.water_litres || operational.actual_water_litres,
      area: operational.actual_treatment_area_hectares || get(operationalImport, 'derived_statistics.area_hectares', 'derivedStatistics.areaHectares'),
      start: operational.actual_start_at || operational.started_at,
      finish: operational.actual_finish_at || completion.completed_at || completionSnapshot.completedAt,
      notes: operational.notes || completion.declaration,
    },
    coverage: {
      map: operational.operational_geometry || operationalImport.operational_geometry || operationalImport.operationalGeometry,
      flightLines: operational.flight_lines || operationalImport.flight_lines || operationalImport.flightLines,
      summary: operational.coverage_summary || operationalImport.derived_statistics || operationalImport.derivedStatistics,
      finalKml: operationalImport.original_filename || operationalImport.originalFilename || get(operational, 'final_kml.original_filename'),
    },
    customerOutcome: outcomes[outcomes.length - 1] || null,
    missionRecordPath: `/missions/${evidence.missionId || evidence.mission_id || input.artefact?.mission_id || ''}#mission-record`,
  };
}

module.exports = { buildMissionPackViewModel, buildMissionSummaryViewModel };
