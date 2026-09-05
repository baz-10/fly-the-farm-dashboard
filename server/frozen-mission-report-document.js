const crypto = require('crypto');
const SHA256=/^[a-f0-9]{64}$/,DECIMAL=/^(?:0|[1-9]\d{0,11})\.\d{1,6}$/,DATE=/^\d{4}-\d{2}-\d{2}$/,TIMESTAMP=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
function invalid(message='Frozen report evidence is invalid.'){return{status:'INVALID',message};}
function bounded(value,depth=0,counter={nodes:0}){if(depth>12||++counter.nodes>50000)return false;if(value===null||typeof value==='boolean')return true;if(typeof value==='number')return Number.isSafeInteger(value);if(typeof value==='string')return value.length<=10000&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);if(Array.isArray(value))return value.length<=10000&&value.every(item=>bounded(item,depth+1,counter));if(!value||typeof value!=='object'||Object.keys(value).length>100)return false;return Object.entries(value).every(([key,item])=>key.length<=100&&bounded(item,depth+1,counter));}
function unique(items,key='id'){const values=items.map(item=>item?.[key]);return values.every(value=>typeof value==='string'&&value.length>0&&value.length<=128)&&new Set(values).size===values.length;}
function string(value,max=1000){return typeof value==='string'&&value.length>0&&value.length<=max;}
function decimal(value){return typeof value==='string'&&DECIMAL.test(value);}
function timestamp(value){return value===null||(typeof value==='string'&&TIMESTAMP.test(value)&&Number.isFinite(Date.parse(value)));}
function decode(transport){
  if(transport?.status==='HISTORICAL_REPORT_DOCUMENT_UNAVAILABLE')return{status:'HISTORICAL'};
  if(!transport||transport.status!=='AVAILABLE'||typeof transport.documentText!=='string'||Buffer.byteLength(transport.documentText,'utf8')>1048576||!SHA256.test(transport.documentDigest||''))return invalid('Frozen report document is unavailable.');
  if(crypto.createHash('sha256').update(transport.documentText,'utf8').digest('hex')!==transport.documentDigest)return invalid('Frozen report document digest does not match.');
  let document;try{document=JSON.parse(transport.documentText);}catch{return invalid();}
  if(!bounded(document)||document?.schemaVersion!==2)return invalid();
  const report=document.reportEvidence,daily=document.dailyEvidence,final=document.finalCompletion;
  if(report?.schemaVersion!==1||daily?.schemaVersion!==1||!final||!string(final.id,128)||!string(final.missionId,128)||!string(final.authorisationRevisionId,128)||!string(final.operationalRevisionId,128)||!Number.isInteger(final.versionNumber)||!string(final.declaration,4000)||!SHA256.test(final.dailyEvidenceDigest||'')||!timestamp(final.completedAt)
    ||!string(final.completedByInternalUserId,128)||!report.scope?.mission||!report.scope?.job||!report.scope?.client
    ||!Array.isArray(report.scope.properties)||!Array.isArray(report.aircraft)||!Array.isArray(report.plannedChemicals)||!Array.isArray(report.flightLineEvidence)||!Array.isArray(report.exceptionHistory)
    ||!Array.isArray(daily.days)||daily.days.length>366||!decimal(daily.actualWorkHours)||!decimal(daily.totalAircraftHours)||!Number.isInteger(daily.operationalDays))return invalid();
  const properties=report.scope.properties,fields=properties.flatMap(property=>Array.isArray(property.fields)?property.fields:[]),aircraft=report.aircraft,plans=report.plannedChemicals,imports=report.flightLineEvidence;
  const allLines=plans.flatMap(plan=>plan.lines||[]);
  if(!unique(properties)||!unique(fields)||!unique(aircraft)||!unique(plans,'revisionId')||!unique(imports)||!unique(daily.days)||!unique(allLines)
    ||!string(report.scope.mission.id,128)||!string(report.scope.job.id,128)||!string(report.scope.client.id,128)
    ||properties.some(property=>!Array.isArray(property.fields)||!string(property.name))
    ||fields.some(field=>!string(field.name)||((field.areaHectares!==undefined)&&!decimal(field.areaHectares))||((field.targetHectares!==undefined)&&!decimal(field.targetHectares)))
    ||aircraft.some(item=>!string(item.registration)||((item.manufacturer!==undefined)&&typeof item.manufacturer!=='string')||((item.model!==undefined)&&typeof item.model!=='string'))
    ||plans.some(plan=>!Number.isInteger(plan.revisionNumber)||!Array.isArray(plan.lines)||!unique(plan.lines)||plan.lines.some(line=>!Number.isInteger(line.lineNumber)||!string(line.productName)||!decimal(line.rate)||!string(line.rateUnit)))
    ||imports.some(item=>typeof item.format!=='string'||!item.format||!SHA256.test(item.digest||'')))return invalid();
  const fieldIds=new Set(fields.map(item=>item.id)),aircraftIds=new Set(aircraft.map(item=>item.id)),planIds=new Set(plans.map(item=>item.revisionId)),importIds=new Set(imports.map(item=>item.id));
  const governance=report.governance;
  if(!governance?.effectivePackage||!governance?.effectiveApproval||!governance?.governingJsa||!Array.isArray(governance.packageHistory)||!Array.isArray(governance.decisionHistory)||!Array.isArray(governance.jsaHistory)
    ||governance.packageHistory.length>64||governance.decisionHistory.length>64||governance.jsaHistory.length>64||!unique(governance.packageHistory)||!unique(governance.decisionHistory)||!unique(governance.jsaHistory))return invalid();
  const packIds=new Set(governance.packageHistory.map(item=>item.id)),jsaIds=new Set(governance.jsaHistory.map(item=>item.id));
  const decisionIds=new Set(governance.decisionHistory.map(item=>item.id));
  if(!packIds.has(governance.effectivePackage.id)||!jsaIds.has(governance.governingJsa.id)||!decisionIds.has(governance.effectiveApproval.id)
    ||governance.decisionHistory.some(item=>!packIds.has(item.packageRevisionId)||!Number.isInteger(item.revisionNumber)||!string(item.decision)||!timestamp(item.decidedAt))
    ||governance.packageHistory.some(item=>!Number.isInteger(item.revisionNumber)||!string(item.state)||!SHA256.test(item.evidenceDigest||'')||!timestamp(item.generatedAt))
    ||governance.jsaHistory.some(item=>!Number.isInteger(item.versionNumber)||!timestamp(item.createdAt))
    ||governance.effectiveApproval.packageRevisionId&&governance.effectiveApproval.packageRevisionId!==governance.effectivePackage.id
    ||final.missionId!==report.scope.mission.id||final.authorisationRevisionId!==governance.effectiveApproval.id)return invalid();
  for(const day of daily.days){
    if(!DATE.test(day.workDate||'')||!string(day.state)||(day.timezone!==undefined&&!string(day.timezone))||!timestamp(day.startedAt??null)||!timestamp(day.finishedAt??null)||!packIds.has(day.packageRevisionId)||!jsaIds.has(day.jsaRevisionId)||!day.jsaReview||typeof day.jsaReview!=='object'||!Array.isArray(day.fieldActivities)||!Array.isArray(day.aircraftActuals)||!day.weatherReport||!Array.isArray(day.flightLineAttributions))return invalid();
    if(day.jsaReview.operating_day_id!==day.id||day.jsaReview.jsa_revision_id!==day.jsaRevisionId||day.jsaReview.mission_id!==final.missionId)return invalid();
    if(!unique(day.fieldActivities)||day.fieldActivities.some(row=>row.operating_day_id!==day.id||row.mission_id!==final.missionId||!fieldIds.has(row.field_id)||(!decimal(row.completed_hectares)&&row.completed_hectares!==null)||(row.attempted_hectares!==undefined&&!decimal(row.attempted_hectares))||!string(row.status)))return invalid();
    if(!unique(day.aircraftActuals))return invalid();
    for(const actual of day.aircraftActuals){if(actual.operating_day_id!==day.id||actual.mission_id!==final.missionId||!aircraftIds.has(actual.aircraft_id)||!decimal(actual.total_flight_hours)||!Array.isArray(actual.flights)||!unique(actual.flights))return invalid();for(const flight of actual.flights){if(flight.aircraft_day_actual_id!==actual.id||flight.mission_id!==final.missionId||flight.aircraft_id!==actual.aircraft_id||!Number.isInteger(flight.flight_index)||!decimal(flight.duration_hours)||!timestamp(flight.started_at??null)||!timestamp(flight.finished_at??null)||(flight.field_id&&!fieldIds.has(flight.field_id))||(flight.source_import_id&&!importIds.has(flight.source_import_id)))return invalid();}}
    const chemical=day.chemicalActual;if(chemical){const plan=plans.find(item=>item.revisionId===chemical.planned_chemical_revision_id),scopedLines=new Set((plan?.lines||[]).map(item=>item.id));if(!plan||chemical.operating_day_id!==day.id||chemical.mission_id!==final.missionId||!Array.isArray(chemical.lines)||!unique(chemical.lines))return invalid();for(const line of chemical.lines){if(line.revision_id!==chemical.id||line.operating_day_id!==day.id||line.mission_id!==final.missionId||!fieldIds.has(line.field_id)||(line.aircraft_id&&!aircraftIds.has(line.aircraft_id))||(line.planned_line_id&&!scopedLines.has(line.planned_line_id))||!decimal(line.actual_rate)||!decimal(line.quantity_applied)||(line.batch_lot!==null&&line.batch_lot!==undefined&&typeof line.batch_lot!=='string'))return invalid();}}
    const weather=day.weatherReport;if(weather.operating_day_id!==day.id||weather.mission_id!==final.missionId||weather.mission_pack_revision_id!==day.packageRevisionId||!string(weather.source_type)||!string(weather.coverage_status)||!Array.isArray(weather.hourly_observations)||!Array.isArray(weather.coverage_gaps)||weather.hourly_observations.length>48||weather.coverage_gaps.length>48||weather.hourly_observations.some(item=>!item||typeof item!=='object'||Array.isArray(item))||weather.coverage_gaps.some(item=>!item||typeof item!=='object'||Array.isArray(item)))return invalid();
    if(!unique(day.flightLineAttributions)||day.flightLineAttributions.some(link=>link.operating_day_id!==day.id||link.mission_id!==final.missionId||!importIds.has(link.operational_import_id)||(link.aircraft_id&&!aircraftIds.has(link.aircraft_id))))return invalid();
  }
  return{status:'AVAILABLE',document};
}
module.exports={decodeFrozenMissionReportDocument:decode};
