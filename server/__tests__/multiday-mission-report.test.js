/* eslint-disable testing-library/render-result-naming-convention */
const { buildMissionSummaryViewModel } = require('../report-view-models');
const { renderMissionSummaryPdf } = require('../mission-summary-renderer');
const { renderReportPdf } = require('../report-renderer');
const crypto = require('crypto');

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
  { id: 'd2', workDate: '2026-09-06', state: 'SIGNED_OFF', packageRevisionId: 'pack4', jsaRevisionId: 'jsa3', jsaReview: { outcome: 'CONDITIONS_COVERED' }, fieldActivities: [{ field_id: 'f2', completed_hectares: '20.000000', status: 'COMPLETED' }], aircraftActuals: [{ aircraft_id: 'a1', total_flight_hours: '8.0000', flights: [] }], chemicalActual: { planned_chemical_revision_id: 'chem-plan', lines: [{ line_number: 1, field_id: 'f2', planned_line_id: 'plan-line', actual_rate: '2.100000', rate_unit: 'L_HA', quantity_applied: '42.000000', batch_lot: null }] }, weatherReport: { source_type: 'MANUAL', coverage_status: 'COMPLETE', hourly_observations: [], coverage_gaps: [] }, flightLineAttributions: [] },
  { id: 'd1', workDate: '2026-09-05', state: 'SIGNED_OFF', packageRevisionId: 'pack4', jsaRevisionId: 'jsa3', notes: 'Weather hold', jsaReview: { outcome: 'CONDITIONS_COVERED' }, fieldActivities: [{ field_id: 'f1', completed_hectares: '12.700000', status: 'COMPLETED' }], aircraftActuals: [{ aircraft_id: 'a1', total_flight_hours: '10.0000', flights: [{ flight_index: 2, duration_hours: '4.0000', started_at: '2026-09-05T04:00:00Z', finished_at: '2026-09-05T08:00:00Z', field_id: 'f1', source_import_id: 'import1' }, { flight_index: 1, duration_hours: '6.0000', started_at: '2026-09-04T22:00:00Z', finished_at: '2026-09-05T04:00:00Z', field_id: 'f1', source_import_id: 'import1' }] }], chemicalActual: { planned_chemical_revision_id: 'chem-plan', lines: [{ line_number: 1, field_id: 'f1', planned_line_id: 'plan-line', actual_rate: '2.000000', rate_unit: 'L_HA', quantity_applied: '25.400000', batch_lot: 'LOT-7' }] }, weatherReport: { source_type: 'PROVIDER', coverage_status: 'GAPS_RECORDED', hourly_observations: [], coverage_gaps: [{ reason: 'Provider gap' }] }, flightLineAttributions: [{ operational_import_id: 'import1', aircraft_id: 'a1' }] },
] } };
reportEvidence.governance.packageHistory[0]= {...reportEvidence.governance.packageHistory[0],state:'AUTHORISED',evidenceDigest:'a'.repeat(64),generatedAt:'2026-09-04T19:00:00Z',jsaRevisionId:'jsa3'};
Object.assign(reportEvidence.governance.effectivePackage,{jsaRevisionId:'jsa3'});Object.assign(reportEvidence.governance.effectiveApproval,{packageRevisionId:'pack4'});
reportEvidence.governance.decisionHistory[0]={...reportEvidence.governance.decisionHistory[0],packageRevisionId:'pack4',personnelId:'crp1',decidedAt:'2026-09-04T20:00:00Z'};
reportEvidence.governance.jsaHistory[0]={...reportEvidence.governance.jsaHistory[0],createdAt:'2026-09-04T18:00:00Z'};
completion.daily_evidence_manifest.days.forEach(day=>{day.jsaReview={...day.jsaReview,operating_day_id:day.id,jsa_revision_id:day.jsaRevisionId,mission_id:'m1'};day.fieldActivities.forEach((row,index)=>Object.assign(row,{id:`${day.id}-field-${index}`,operating_day_id:day.id,mission_id:'m1'}));day.aircraftActuals.forEach((actual,index)=>{Object.assign(actual,{id:`${day.id}-aircraft-${index}`,operating_day_id:day.id,mission_id:'m1'});actual.flights.forEach((flight,flightIndex)=>Object.assign(flight,{id:`${day.id}-flight-${flightIndex}`,aircraft_day_actual_id:actual.id,mission_id:'m1',aircraft_id:actual.aircraft_id}));});if(day.chemicalActual){Object.assign(day.chemicalActual,{id:`${day.id}-chemical`,operating_day_id:day.id,mission_id:'m1'});day.chemicalActual.lines.forEach((line,index)=>Object.assign(line,{id:`${day.id}-chemical-line-${index}`,revision_id:day.chemicalActual.id,operating_day_id:day.id,mission_id:'m1'}));}Object.assign(day.weatherReport,{operating_day_id:day.id,mission_id:'m1',mission_pack_revision_id:day.packageRevisionId});day.flightLineAttributions.forEach((link,index)=>Object.assign(link,{id:`${day.id}-import-${index}`,operating_day_id:day.id,mission_id:'m1'}));});
const document={schemaVersion:2,reportEvidence,dailyEvidence:completion.daily_evidence_manifest,finalCompletion:{id:'final2',missionId:'m1',versionNumber:2,authorisationRevisionId:'approval7',operationalRevisionId:'op1',declaration:'Evidence reconciled.',completedByInternalUserId:'signer1',completedAt:'2026-09-06T10:00:00Z',dailyEvidenceDigest:'b'.repeat(64)}};
const transportFor=value=>{const text=JSON.stringify(value);return{status:'AVAILABLE',completionRevisionId:'final2',documentText:text,documentDigest:crypto.createHash('sha256').update(text).digest('hex')}};
const clone=value=>JSON.parse(JSON.stringify(value));
const {documentText,documentDigest}=transportFor(document);
const input = { artefact: { version: 1, createdAt: '2026-09-06T11:00:00Z' }, branding: { displayName: 'Operator' }, frozenReportDocument:{status:'AVAILABLE',completionRevisionId:'final2',documentText,documentDigest}, evidence: { missionId: 'm1', completionRevision: completion, operationalRevision: { notes: 'LIVE' }, currentMission: { name: 'MUTATED' } } };

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
  const model = buildMissionSummaryViewModel({ frozenReportDocument:null,evidence: { completionRevision: { ...completion, daily_evidence_manifest: { days: [] } }, operationalRevision: { days: [{ workDate: 'LIVE' }] } } });
  expect(model).toMatchObject({ source: 'FROZEN_FINAL_SIGNOFF', evidenceStatus: 'MISSING_FROZEN_EVIDENCE', operatingDays: [] });
  expect(model.evidenceGaps).toContain('Frozen report evidence is unavailable.');
  expect(JSON.stringify(model)).not.toContain('LIVE');
});

test('fails closed on malformed frozen report evidence and digest', () => {
  const malformed = buildMissionSummaryViewModel({...input,frozenReportDocument:{...input.frozenReportDocument,documentDigest:'0'.repeat(64)}});
  expect(malformed).toMatchObject({ evidenceStatus: 'MISSING_FROZEN_EVIDENCE', operatingDays: [] });
  expect(malformed.evidenceGaps).toContain('Frozen report evidence is invalid.');
});

test.each([
  ['unknown field reference',draft=>{draft.dailyEvidence.days[0].fieldActivities[0].field_id='foreign-field';}],
  ['missing weather completeness',draft=>{delete draft.dailyEvidence.days[0].weatherReport.hourly_observations;}],
  ['unknown flight-line reference',draft=>{draft.dailyEvidence.days[1].aircraftActuals[0].flights[0].source_import_id='foreign-import';}],
  ['duplicate canonical aircraft identity',draft=>{draft.reportEvidence.aircraft.push({...draft.reportEvidence.aircraft[0]});}],
  ['decision to package lineage mismatch',draft=>{draft.reportEvidence.governance.decisionHistory[0].packageRevisionId='foreign-pack';}],
  ['effective approval differs from history',draft=>{draft.reportEvidence.governance.effectiveApproval.personnelId='foreign-crp';}],
  ['effective package differs from history',draft=>{draft.reportEvidence.governance.effectivePackage.evidenceDigest='f'.repeat(64);}],
  ['effective package JSA differs from governing JSA',draft=>{draft.reportEvidence.governance.effectivePackage.jsaRevisionId='foreign-jsa';}],
  ['JSA review parent mismatch',draft=>{draft.dailyEvidence.days[0].jsaReview.operating_day_id='foreign-day';}],
  ['flight to aircraft actual parent mismatch',draft=>{draft.dailyEvidence.days[1].aircraftActuals[0].flights[0].aircraft_day_actual_id='foreign-actual';}],
  ['chemical line revision parent mismatch',draft=>{draft.dailyEvidence.days[0].chemicalActual.lines[0].revision_id='foreign-chemical';}],
  ['weather package lineage mismatch',draft=>{draft.dailyEvidence.days[0].weatherReport.mission_pack_revision_id='foreign-pack';}],
  ['flight-line attribution day mismatch',draft=>{draft.dailyEvidence.days[1].flightLineAttributions[0].operating_day_id='foreign-day';}],
])('rejects recursively invalid frozen evidence: %s',(_label,mutate)=>{
  const draft=clone(document);mutate(draft);
  expect(()=>buildMissionSummaryViewModel({...input,frozenReportDocument:transportFor(draft)})).not.toThrow();
  const model=buildMissionSummaryViewModel({...input,frozenReportDocument:transportFor(draft)});
  expect(model).toMatchObject({evidenceStatus:'MISSING_FROZEN_EVIDENCE',operatingDays:[]});
});

test('preserves legacy reports without inventing historical days', () => {
  const model = buildMissionSummaryViewModel({ frozenReportDocument:{status:'HISTORICAL_REPORT_DOCUMENT_UNAVAILABLE',completionRevisionId:'old'},evidence: { completionRevision: { id: 'old', completion_snapshot: { operationalEvidence: { actual_start_at: '2026-08-01T01:00:00Z', actual_finish_at: '2026-08-01T02:00:00Z' } } } } });
  expect(model).toMatchObject({ source: 'LEGACY_COMPLETION', evidenceStatus: 'LEGACY_DETAIL_UNAVAILABLE', operatingDays: [] });
  expect(model.evidenceGaps).toContain('Historical operating-day detail is unavailable; no day records were fabricated.');
});

test('renders deterministic Summary and Record sections from the frozen model', () => {
  const summary = renderMissionSummaryPdf(input), record = renderReportPdf({ ...input, reportType: 'MISSION_RECORD' });
  expect(summary.equals(renderMissionSummaryPdf(input))).toBe(true);
  for (const token of ['Signed-off Mission Evidence', 'Frozen Aggregate Totals','Operational days','18.0000','2026-09-05', 'FTF-1', 'Product A', 'Final Sign-off']) expect(summary.toString('latin1')).toContain(token);
  for (const token of ['Frozen Mission Scope','Frozen Aggregate Totals','Operational Days','Actual Work Hours','Total Aircraft Hours', 'Operating Day - 2026-09-05', 'Final Sign-off']) expect(record.toString('latin1')).toContain(token);
  for (const token of ['field f1','2026-09-04T22:00:00Z','quantity 25.400000','LOT-7','import1','KML','signer1']) expect(summary.toString('latin1')).toContain(token);
  expect(record.toString('latin1')).not.toContain('MUTABLE-LEAK');
});

test('paginates maximum-bound frozen histories and weather without dropping boundary evidence',()=>{
  const draft=clone(document);
  draft.reportEvidence.governance.packageHistory=Array.from({length:64},(_,i)=>({id:`pack-${i}`,revisionNumber:i+1,state:'AUTHORISED',evidenceDigest:'a'.repeat(64),generatedAt:'2026-09-04T19:00:00Z',jsaRevisionId:'jsa3',note:`BOUNDARY-PACK-${i}-`+'x'.repeat(80)}));
  draft.reportEvidence.governance.effectivePackage={...draft.reportEvidence.governance.packageHistory[63]};
  draft.reportEvidence.governance.decisionHistory[0].packageRevisionId='pack-63';
  draft.reportEvidence.governance.effectiveApproval.packageRevisionId='pack-63';
  draft.dailyEvidence.days.forEach(day=>{day.packageRevisionId='pack-63';day.weatherReport.mission_pack_revision_id='pack-63';day.weatherReport.hourly_observations=Array.from({length:48},(_,i)=>({observedAt:`2026-09-05T${String(i%24).padStart(2,'0')}:00:00Z`,note:`BOUNDARY-WEATHER-${i}-`+'y'.repeat(80)}));});
  const pdf=renderMissionSummaryPdf({...input,frozenReportDocument:transportFor(draft)}).toString('latin1');
  expect((pdf.match(/\/Type \/Page\b/g)||[]).length).toBeGreaterThan(2);
  expect(pdf).toContain('BOUNDARY-PACK-63');expect(pdf).toContain('BOUNDARY-WEATHER-47');expect(pdf).toContain('Page 1 of');
});

test('mission record never renders mutable caller evidence identifiers',()=>{
  const pdf=renderReportPdf({...input,reportType:'MISSION_RECORD',evidence:{...input.evidence,mutableCallerEvidenceId:'MUTABLE-LEAK'}}).toString('latin1');
  expect(pdf).not.toContain('MUTABLE-LEAK');
  expect(pdf).toContain('Evidence Digest');
});

module.exports = { input };
