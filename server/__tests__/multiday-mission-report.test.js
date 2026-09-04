/* eslint-disable testing-library/render-result-naming-convention */
const { buildMissionSummaryViewModel } = require('../report-view-models');
const { renderMissionSummaryPdf } = require('../mission-summary-renderer');
const { renderReportPdf } = require('../report-renderer');

const reportEvidence = {
  schemaVersion: 1,
  scope: { mission: { id: 'm1', missionNumber: 'M-77' }, job: { id: 'j1', reference: 'J-44' }, client: { id: 'c1', name: 'Grower' }, properties: [
    { id: 'p2', name: 'West', fields: [{ id: 'f2', name: 'Bravo', fieldOrder: 2, areaHectares: '20.0000' }] },
    { id: 'p1', name: 'East', fields: [{ id: 'f1', name: 'Alpha', fieldOrder: 1, areaHectares: '12.7000' }] },
  ] },
  governance: { effectivePackage: { id: 'pack4', revisionNumber: 4, evidenceDigest: 'a'.repeat(64) }, effectiveApproval: { id: 'approval7', revisionNumber: 7, personnelId: 'crp1', decidedAt: '2026-09-04T20:00:00Z' }, governingJsa: { id: 'jsa3', versionNumber: 3 }, packageHistory: [{ id: 'pack4', revisionNumber: 4 }], decisionHistory: [{ id: 'approval7', revisionNumber: 7, decision: 'AUTHORISED' }], jsaHistory: [{ id: 'jsa3', versionNumber: 3 }] },
  aircraft: [{ id: 'a1', registration: 'FTF-1', manufacturer: 'DJI', model: 'T100' }],
  plannedChemicals: [{ revisionId: 'chem-plan', revisionNumber: 2, lines: [{ id: 'plan-line', lineNumber: 1, productName: 'Product A', rate: '2.000000', rateUnit: 'L/HA' }] }],
  flightLineEvidence: [{ id: 'import1', filename: 'lines.kml', digest: 'c'.repeat(64), format: 'KML' }],
  exceptionHistory: [{ id: 'exception1', classification: 'ADMINISTRATIVE', reason: 'Weather note' }],
};
const completion = { id: 'final2', version_number: 2, declaration: 'Evidence reconciled.', completed_at: '2026-09-06T10:00:00Z', daily_evidence_digest: 'b'.repeat(64), daily_evidence_manifest: { schemaVersion: 1, reportEvidence, operationalDays: 2, actualWorkHours: '18.0000', totalAircraftHours: '18.0000', days: [
  { id: 'd2', workDate: '2026-09-06', state: 'SIGNED_OFF', packageRevisionId: 'pack4', jsaRevisionId: 'jsa3', jsaReview: { outcome: 'CONDITIONS_COVERED' }, fieldActivities: [{ field_id: 'f2', completed_hectares: '20.000000', status: 'COMPLETED' }], aircraftActuals: [{ aircraft_id: 'a1', total_flight_hours: '8.0000', flights: [] }], chemicalActual: { planned_chemical_revision_id: 'chem-plan', lines: [{ line_number: 1, field_id: 'f2', planned_line_id: 'plan-line', actual_rate: '2.100000', rate_unit: 'L/HA' }] }, weatherReport: { source_type: 'MANUAL', coverage_status: 'COMPLETE' }, flightLineAttributions: [] },
  { id: 'd1', workDate: '2026-09-05', state: 'SIGNED_OFF', packageRevisionId: 'pack4', jsaRevisionId: 'jsa3', notes: 'Weather hold', jsaReview: { outcome: 'CONDITIONS_COVERED' }, fieldActivities: [{ field_id: 'f1', completed_hectares: '12.700000', status: 'COMPLETED' }], aircraftActuals: [{ aircraft_id: 'a1', total_flight_hours: '10.0000', flights: [{ flight_index: 2, duration_hours: '4.0000' }, { flight_index: 1, duration_hours: '6.0000' }] }], chemicalActual: { planned_chemical_revision_id: 'chem-plan', lines: [{ line_number: 1, field_id: 'f1', planned_line_id: 'plan-line', actual_rate: '2.000000', rate_unit: 'L/HA' }] }, weatherReport: { source_type: 'PROVIDER', coverage_status: 'GAPS_RECORDED', coverage_gaps: [{ reason: 'Provider gap' }] }, flightLineAttributions: [{ operational_import_id: 'import1', aircraft_id: 'a1' }] },
] } };
const input = { artefact: { version: 1, createdAt: '2026-09-06T11:00:00Z' }, branding: { displayName: 'Operator' }, evidence: { missionId: 'm1', completionRevision: completion, operationalRevision: { notes: 'LIVE' }, currentMission: { name: 'MUTATED' } } };

test('builds deterministic signed-off days only from frozen evidence', () => {
  const model = buildMissionSummaryViewModel(input);
  expect(model.source).toBe('FROZEN_FINAL_SIGNOFF');
  expect(model.operatingDays.map(x => x.workDate)).toEqual(['2026-09-05', '2026-09-06']);
  expect(model.operatingDays[0].aircraft[0]).toMatchObject({ registration: 'FTF-1', flightHours: '10.0000' });
  expect(model.operatingDays[0].aircraft[0].flights.map(x => x.index)).toEqual([1, 2]);
  expect(model.approval).toMatchObject({ packageRevisionNumber: 4, approvalRevisionNumber: 7, jsaRevisionNumber: 3 });
  expect(JSON.stringify(model)).not.toMatch(/LIVE|MUTATED/);
});

test('groups frozen Properties and Fields and compares planned to actual chemicals', () => {
  const model = buildMissionSummaryViewModel(input);
  expect(model.scope.properties.map(x => x.name)).toEqual(['East', 'West']);
  expect(model.operatingDays[0].fields[0]).toMatchObject({ name: 'Alpha', completedHectares: '12.700000' });
  expect(model.operatingDays[0].chemicals[0]).toMatchObject({ productName: 'Product A', plannedRate: '2.000000', actualRate: '2.000000' });
  expect(model.operatingDays[0].weather).toMatchObject({ coverageStatus: 'GAPS_RECORDED', gaps: [{ reason: 'Provider gap' }] });
  expect(model.operatingDays[0].flightLines[0]).toMatchObject({ filename: 'lines.kml', digest: 'c'.repeat(64) });
});

test('fails closed on missing enriched frozen evidence and never falls back live', () => {
  const model = buildMissionSummaryViewModel({ evidence: { completionRevision: { ...completion, daily_evidence_manifest: { days: [] } }, operationalRevision: { days: [{ workDate: 'LIVE' }] } } });
  expect(model).toMatchObject({ source: 'FROZEN_FINAL_SIGNOFF', evidenceStatus: 'MISSING_FROZEN_EVIDENCE', operatingDays: [] });
  expect(model.evidenceGaps).toContain('Frozen report evidence is unavailable.');
  expect(JSON.stringify(model)).not.toContain('LIVE');
});

test('fails closed on malformed frozen report evidence and digest', () => {
  const malformed = buildMissionSummaryViewModel({ evidence: { completionRevision: { ...completion, daily_evidence_digest: 'unsafe', daily_evidence_manifest: { ...completion.daily_evidence_manifest, reportEvidence: { schemaVersion: 1, scope: {} } } } } });
  expect(malformed).toMatchObject({ evidenceStatus: 'MISSING_FROZEN_EVIDENCE', operatingDays: [] });
  expect(malformed.evidenceGaps).toContain('Frozen report evidence is invalid.');
});

test('preserves legacy reports without inventing historical days', () => {
  const model = buildMissionSummaryViewModel({ evidence: { completionRevision: { id: 'old', completion_snapshot: { operationalEvidence: { actual_start_at: '2026-08-01T01:00:00Z', actual_finish_at: '2026-08-01T02:00:00Z' } } } } });
  expect(model).toMatchObject({ source: 'LEGACY_COMPLETION', evidenceStatus: 'LEGACY_DETAIL_UNAVAILABLE', operatingDays: [] });
  expect(model.evidenceGaps).toContain('Historical operating-day detail is unavailable; no day records were fabricated.');
});

test('renders deterministic Summary and Record sections from the frozen model', () => {
  const summary = renderMissionSummaryPdf(input), record = renderReportPdf({ ...input, reportType: 'MISSION_RECORD' });
  expect(summary.equals(renderMissionSummaryPdf(input))).toBe(true);
  for (const token of ['Signed-off Mission Evidence', '2026-09-05', 'FTF-1', 'Product A', 'Final Sign-off']) expect(summary.toString('latin1')).toContain(token);
  for (const token of ['Frozen Mission Scope', 'Operating Day - 2026-09-05', 'Final Sign-off']) expect(record.toString('latin1')).toContain(token);
});

module.exports = { input };
