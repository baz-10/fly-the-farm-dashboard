import jsPDF from 'jspdf';

import type { MissionRecord } from '../types/mission';
import {
  calculateRiskScore,
  MISSION_CHECKS,
} from './missionSafety';

const PAGE_WIDTH = 210;
const MARGIN = 18;
const CONTENT_WIDTH = PAGE_WIDTH - (MARGIN * 2);
const CONTENT_BOTTOM = 276;
const FOOTER_Y = 287;
const PRIMARY: [number, number, number] = [30, 77, 43];
const GREY: [number, number, number] = [90, 100, 94];
const NOT_RECORDED = 'Not recorded';

export interface MissionPackPdfOptions {
  generatedAt?: Date;
}

type InstrumentedDocument = jsPDF & {
  __missionPackText?: string[];
  __missionPackBodyY?: number[];
};

function sanitisePdfText(value: unknown): string {
  return String(value ?? '')
    .replace(/[\u2014\u2013]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '')
    .replace(/ {2,}/g, ' ')
    .trim();
}

function sanitiseFilename(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9.-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || 'Mission';
}

function recorded(value: unknown): string {
  const text = sanitisePdfText(value);
  return text || NOT_RECORDED;
}

function formatDate(value: unknown): string {
  if (!value) return NOT_RECORDED;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return NOT_RECORDED;
  return date.toLocaleString('en-AU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Australia/Brisbane',
  });
}

function formatDuration(minutes: unknown): string {
  const numeric = Number(minutes);
  if (!Number.isFinite(numeric) || numeric < 0) return NOT_RECORDED;
  const hours = Math.floor(numeric / 60);
  const remainder = Math.round(numeric % 60);
  return `${hours}h ${String(remainder).padStart(2, '0')}m`;
}

function answerLabel(value: boolean | null | undefined): string {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  return 'Not answered';
}

function yesNo(value: boolean | null | undefined): string {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  return NOT_RECORDED;
}

function listText(values: unknown[] | undefined): string {
  if (!values?.length) return NOT_RECORDED;
  return values.map(recorded).join('; ');
}

export function missionPackPdfFilename(
  mission: Pick<MissionRecord, 'missionNumber' | 'missionName'>
): string {
  return `Mission_Pack_${sanitiseFilename(mission.missionNumber)}_${sanitiseFilename(mission.missionName)}.pdf`;
}

export function buildMissionPackPdf(
  mission: MissionRecord,
  options: MissionPackPdfOptions = {}
): jsPDF {
  const generatedAt = options.generatedAt ?? new Date();
  const doc = new jsPDF('p', 'mm', 'a4') as InstrumentedDocument;
  const captured: string[] = [];
  const bodyPositions: number[] = [];
  Object.defineProperty(doc, '__missionPackText', { value: captured, enumerable: false });
  Object.defineProperty(doc, '__missionPackBodyY', { value: bodyPositions, enumerable: false });
  doc.setCreationDate(generatedAt);
  doc.setProperties({
    title: `Mission Pack ${recorded(mission.missionNumber)} - ${recorded(mission.missionName)}`,
    subject: 'Operational mission pack',
    creator: 'Mission Command',
  });
  let y = 20;

  const addPage = () => {
    doc.addPage();
    y = 20;
  };
  const ensureSpace = (height: number) => {
    if (y + height > CONTENT_BOTTOM) addPage();
  };
  const text = (
    raw: unknown,
    settings: {
      size?: number;
      bold?: boolean;
      color?: [number, number, number];
      indent?: number;
    } = {}
  ) => {
    const value = sanitisePdfText(raw);
    if (!value) return;
    captured.push(value);
    const size = settings.size ?? 9;
    const indent = settings.indent ?? 0;
    doc.setFont('helvetica', settings.bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...(settings.color ?? [33, 33, 33]));
    const lines = doc.splitTextToSize(value, CONTENT_WIDTH - indent) as string[];
    const lineHeight = size * 0.42;
    for (const line of lines) {
      ensureSpace(lineHeight + 2);
      bodyPositions.push(y);
      doc.text(line, MARGIN + indent, y);
      y += lineHeight;
    }
    y += 2;
  };
  const heading = (value: string) => {
    ensureSpace(12);
    y += 3;
    text(value, { size: 12, bold: true, color: PRIMARY });
    doc.setDrawColor(...PRIMARY);
    doc.line(MARGIN, y - 1, PAGE_WIDTH - MARGIN, y - 1);
    y += 2;
  };

  text('MISSION PACK', { size: 20, bold: true, color: PRIMARY });
  text('Operational record - financial information excluded', {
    size: 10,
    bold: true,
    color: GREY,
  });
  text(recorded(mission.missionName), { size: 15, bold: true });
  text(`Mission number: ${recorded(mission.missionNumber)}`);
  text(`Status: ${recorded(mission.status)}`);
  text(`Scheduled: ${formatDate(mission.scheduledDate)}`);
  text(`Generated: ${formatDate(generatedAt.toISOString())}`);

  heading('Mission and site');
  text(`Type: ${recorded(mission.missionType)}`);
  text(`Priority: ${recorded(mission.priority)}`);
  text(`Description: ${recorded(mission.description)}`);
  text(`Client reference: ${recorded(mission.clientId)}`);
  text(`Location: ${recorded(mission.location?.name)}`);
  text(`Address: ${recorded(mission.location?.address)}`);
  text(`Coordinates: ${mission.location?.coordinates
    ? `${mission.location.coordinates.latitude}, ${mission.location.coordinates.longitude}`
    : NOT_RECORDED}`);
  text(`Elevation: ${mission.location?.elevation == null
    ? NOT_RECORDED
    : `${mission.location.elevation} m`}`);
  text(`Estimated duration: ${formatDuration(mission.estimatedDuration)}`);

  heading('Aircraft and deployment work pack');
  text(`Assigned aircraft: ${recorded(mission.aircraftConfiguration?.aircraftId)}`);
  text(`Assigned kit: ${recorded(mission.aircraftConfiguration?.kitId)}`);
  text(`Configuration: ${recorded(mission.aircraftConfiguration?.configurationId)}`);
  text(`Estimated flight time: ${formatDuration(mission.aircraftConfiguration?.estimatedFlightTime)}`);
  text(`Maximum payload: ${mission.aircraftConfiguration?.maxPayloadWeight == null
    ? NOT_RECORDED
    : `${mission.aircraftConfiguration.maxPayloadWeight} kg`}`);
  const workPack = mission.deploymentWorkPack;
  if (!workPack) {
    text('No deployment work pack recorded.');
  } else {
    text('Deployment assets', { bold: true });
    if (!workPack.assets.length) text('No deployment assets recorded.', { indent: 4 });
    for (const asset of workPack.assets) {
      text(
        `${recorded(asset.name)} - ${recorded(asset.assetType)} - Registration: ${recorded(asset.registration)} - Status: ${recorded(asset.status)}`,
        { indent: 4 }
      );
      if (asset.operationalNotes) text(`Notes: ${asset.operationalNotes}`, { indent: 8 });
    }
    text('Aircraft and kit allocations', { bold: true });
    if (!workPack.aircraftAssignments.length) text('No aircraft allocations recorded.', { indent: 4 });
    for (const assignment of workPack.aircraftAssignments) {
      text(
        `${recorded(assignment.label)} - Aircraft: ${recorded(assignment.aircraftId)} - Kit: ${recorded(assignment.kitId)} - Carrying asset: ${recorded(assignment.carryingAssetId)}`,
        { indent: 4 }
      );
    }
    text('Supporting equipment', { bold: true });
    if (!workPack.supportingEquipment?.length) text('No supporting equipment recorded.', { indent: 4 });
    for (const equipment of workPack.supportingEquipment ?? []) {
      text(`${recorded(equipment.note)} - Carrying asset: ${recorded(equipment.carryingAssetId)}`, { indent: 4 });
    }
    text('Crew requirements', { bold: true });
    if (!workPack.crewRequirements.length) text('No crew requirements recorded.', { indent: 4 });
    for (const requirement of workPack.crewRequirements) {
      text(`${recorded(requirement.role)} x ${requirement.quantity} - ${recorded(requirement.notes)}`, { indent: 4 });
    }
    text(`Checklist: ${listText(workPack.checklist)}`);
    text(`Work-pack notes: ${recorded(workPack.notes)}`);
    if (workPack.towVehicle) {
      text(`Tow vehicle: Registration ${recorded(workPack.towVehicle.registration)} - Driver ${recorded(workPack.towVehicle.driver)} - Notes ${recorded(workPack.towVehicle.notes)}`);
    }
  }

  heading('Planned operation');
  const planning = mission.planningState;
  text(`Client: ${recorded(planning?.clientName)}`);
  text(`Property: ${recorded(planning?.propertyName)}`);
  text(`Field: ${recorded(planning?.fieldName)}`);
  text(`Site address: ${recorded(planning?.siteAddress)}`);
  text(`Mission notes: ${recorded(planning?.missionNotes)}`);
  text(`Application rate: ${planning?.operation?.applicationRateLHa == null
    ? NOT_RECORDED
    : `${planning.operation.applicationRateLHa} L/ha`}`);
  text(`Perimeter: ${planning?.operation?.perimeterKm == null
    ? NOT_RECORDED
    : `${planning.operation.perimeterKm} km`}`);
  text(`Buffer zones: ${planning?.operation?.bufferZones ?? NOT_RECORDED}`);
  text(`Exclusion zones: ${planning?.operation?.exclusionZones ?? NOT_RECORDED}`);
  text(`Estimated battery changes: ${planning?.operation?.estimatedBatteryChanges ?? NOT_RECORDED}`);
  text(`Flight lines: ${planning?.operation?.flightLines ?? NOT_RECORDED}`);
  text('Chemicals', { bold: true });
  if (!planning?.chemicals?.length) text('No chemicals recorded.', { indent: 4 });
  for (const chemical of planning?.chemicals ?? []) {
    text(
      `${recorded(chemical.product)} - Rate: ${chemical.ratePerHa} ${chemical.unit}/ha - Total: ${chemical.totalRequired} ${chemical.unit}`,
      { indent: 4 }
    );
  }

  heading('Weather');
  text(`Maximum wind: ${mission.weatherRequirements?.maxWindSpeed == null
    ? NOT_RECORDED
    : `${mission.weatherRequirements.maxWindSpeed} km/h`}`);
  text(`Minimum visibility: ${mission.weatherRequirements?.minVisibility == null
    ? NOT_RECORDED
    : `${mission.weatherRequirements.minVisibility} m`}`);
  text(`Maximum precipitation chance: ${mission.weatherRequirements?.maxPrecipitationChance == null
    ? NOT_RECORDED
    : `${mission.weatherRequirements.maxPrecipitationChance}%`}`);
  text(`Allowed cloud cover: ${mission.weatherRequirements?.allowedCloudCover == null
    ? NOT_RECORDED
    : `${mission.weatherRequirements.allowedCloudCover}%`}`);
  const weatherWindow = planning?.weatherWindow;
  text(`Planned weather window: ${weatherWindow
    ? `${recorded(weatherWindow.startTime)} to ${recorded(weatherWindow.endTime)}`
    : NOT_RECORDED}`);
  if (weatherWindow) {
    text(`Window conditions: ${weatherWindow.temperatureC} C; wind ${weatherWindow.windSpeedKmh} km/h ${recorded(weatherWindow.windDirection)}; gusts ${weatherWindow.windGustKmh} km/h; rain chance ${weatherWindow.rainChancePercent}%`);
  }
  const snapshot = planning?.weatherSnapshot;
  text(`Forecast source: ${recorded(snapshot?.source)}`);
  text(`Forecast fetched: ${formatDate(snapshot?.fetchedAt)}`);
  if (snapshot) {
    text(`Forecast: ${snapshot.temperatureC} C; humidity ${snapshot.humidityPercent}%; wind ${snapshot.windSpeedKmh} km/h ${recorded(snapshot.windDirection)}; gusts ${snapshot.windGustKmh} km/h`);
  }
  const actualWeather = mission.weatherConditions;
  text(`Recorded conditions: ${actualWeather
    ? `${actualWeather.temperature} C; humidity ${actualWeather.humidity}%; wind ${actualWeather.windSpeed} km/h at ${actualWeather.windDirection} degrees; visibility ${actualWeather.visibility} m`
    : NOT_RECORDED}`);

  heading('Boundary, map and flight plan');
  if (!mission.boundaryFiles?.length) text('No boundary files recorded.');
  for (const boundary of mission.boundaryFiles ?? []) {
    text(`${recorded(boundary.fileName)} - ${recorded(boundary.fileType)} - Analysis: ${recorded(boundary.analysis?.status)}`, { bold: true });
    text(`Area: ${boundary.analysis?.geometry?.totalArea == null ? NOT_RECORDED : `${boundary.analysis.geometry.totalArea} ha`}`, { indent: 4 });
    text(`Perimeter: ${boundary.analysis?.geometry?.perimeter == null ? NOT_RECORDED : `${boundary.analysis.geometry.perimeter} m`}`, { indent: 4 });
    for (const risk of boundary.analysis?.riskFactors ?? []) {
      text(`Boundary risk: ${recorded(risk.description)} - ${recorded(risk.severity)} - Buffer ${risk.bufferZoneRequired} m`, { indent: 4 });
    }
  }
  text('Boundary register', { bold: true });
  if (!planning?.boundaryMetadata?.length) text('No boundary annotations recorded.', { indent: 4 });
  for (const boundary of planning?.boundaryMetadata ?? []) {
    text(`${recorded(boundary.name)} - ${recorded(boundary.notes)}`, { indent: 4 });
  }
  text('Map feature register', { bold: true });
  if (!planning?.mapFeatures?.length) text('No map features recorded.', { indent: 4 });
  for (const feature of planning?.mapFeatures ?? []) {
    text(`${recorded(feature.name || feature.label)} - ${recorded(feature.type)} - ${recorded(feature.geometry?.type)} - ${recorded(feature.notes)}`, { indent: 4 });
  }
  const flightPlan = mission.flightPlan;
  text(`Flight plan: ${recorded(flightPlan?.planName)}`);
  text(`Plan type: ${recorded(flightPlan?.planType)}`);
  if (flightPlan?.flightParameters) {
    text(`Parameters: ${flightPlan.flightParameters.altitude} m AGL; ${flightPlan.flightParameters.groundSpeed} km/h; ${recorded(flightPlan.flightParameters.flightPattern)} pattern; ${flightPlan.flightParameters.overlapForward}% forward overlap; ${flightPlan.flightParameters.overlapSide}% side overlap`);
  }
  text(`Contingency procedures: ${listText(flightPlan?.safetyPlanning?.contingencyProcedures)}`);

  heading('Mission Checks / JSA');
  const jsa = mission.jsaRecord;
  text(`JSA number: ${recorded(jsa?.jsaNumber)}`);
  text(`JSA type: ${recorded(jsa?.jsaType)}`);
  text(`JSA status: ${recorded(jsa?.status)}`);
  text(`Completed by: ${recorded(jsa?.completedBy)}`);
  text(`Completed date: ${formatDate(jsa?.completedDate)}`);
  const answers = new Map(jsa?.missionChecks?.answers?.map((answer) => [answer.questionId, answer]) ?? []);
  for (const [index, check] of MISSION_CHECKS.entries()) {
    const answer = answers.get(check.id);
    text(`${index + 1}. ${check.question}`, { bold: true });
    text(`Answer: ${answerLabel(answer?.answer)}`, { indent: 4 });
    text(`Notes: ${recorded(answer?.notes)}`, { indent: 4 });
  }
  text(`Additional comments: ${recorded(jsa?.missionChecks?.generalComments)}`);
  text(`Pilot sign-off: ${recorded(jsa?.signOffs?.pilot?.signature)} - ${formatDate(jsa?.signOffs?.pilot?.signedAt)}`);
  if (jsa?.signOffs?.crp) {
    text(`CRP sign-off: ${recorded(jsa.signOffs.crp.signature)} - ${formatDate(jsa.signOffs.crp.signedAt)} - ${recorded(jsa.signOffs.crp.comments)}`);
  }

  heading('Risk Assessment');
  const riskControls = jsa?.missionChecks?.riskControls ?? [];
  if (!riskControls.length) text('No triggered risk controls recorded.');
  for (const control of riskControls) {
    const check = MISSION_CHECKS.find((candidate) => candidate.id === control.questionId);
    const initial = calculateRiskScore(control.likelihood, control.consequence);
    const residual = calculateRiskScore(control.residualLikelihood, control.residualConsequence);
    text(recorded(check?.question || control.questionId), { bold: true });
    text(`Initial likelihood: ${control.likelihood ?? NOT_RECORDED}`, { indent: 4 });
    text(`Initial consequence: ${control.consequence ?? NOT_RECORDED}`, { indent: 4 });
    text(`Initial score: ${initial ?? NOT_RECORDED}`, { indent: 4 });
    text(`Mitigation: ${recorded(control.mitigation)}`, { indent: 4 });
    text(`Residual likelihood: ${control.residualLikelihood ?? NOT_RECORDED}`, { indent: 4 });
    text(`Residual consequence: ${control.residualConsequence ?? NOT_RECORDED}`, { indent: 4 });
    text(`Residual score: ${residual ?? NOT_RECORDED}`, { indent: 4 });
  }
  text('Legacy hazard register', { bold: true });
  if (!jsa?.hazardIdentification?.length) text('No additional hazards recorded.', { indent: 4 });
  for (const hazard of jsa?.hazardIdentification ?? []) {
    text(`${recorded(hazard.description)} - Initial: ${recorded(hazard.riskLevel)} - Residual: ${recorded(hazard.residualRisk)}`, { indent: 4 });
    text(`Controls: ${listText(hazard.controlMeasures)}`, { indent: 8 });
  }
  text(`Required qualifications: ${listText(jsa?.safetyRequirements?.personnelRequirements?.requiredQualifications)}`);
  text(`Required training: ${listText(jsa?.safetyRequirements?.personnelRequirements?.requiredTraining)}`);
  text(`Required safety equipment: ${listText(jsa?.safetyRequirements?.equipmentRequirements?.requiredSafetyEquipment)}`);
  text(`Emergency equipment: ${listText(jsa?.safetyRequirements?.equipmentRequirements?.emergencyEquipment)}`);
  text(`Weather limitations: ${listText(jsa?.safetyRequirements?.operationalConstraints?.weatherLimitations)}`);
  text(`Emergency communication: ${recorded(jsa?.emergencyProcedures?.communicationPlan?.primaryContact)}`);
  text(`Evacuation plan: ${recorded(jsa?.emergencyProcedures?.evacuationPlan)}`);
  text(`Medical emergency plan: ${recorded(jsa?.emergencyProcedures?.medicalEmergencyPlan)}`);

  heading('Compliance and authorisations');
  text(`CASA notification: ${yesNo(mission.complianceChecks?.casaNotification)}`);
  text(`Airspace approval: ${yesNo(mission.complianceChecks?.airspaceApproval)}`);
  text(`Local permits: ${yesNo(mission.complianceChecks?.localPermits)}`);
  text(`Environmental clearance: ${yesNo(mission.complianceChecks?.environmentalClearance)}`);
  text(`Insurance coverage: ${yesNo(mission.complianceChecks?.insuranceCoverage)}`);
  const approvalEntries = [
    {
      label: 'Planning approval',
      approval: mission.approvals?.planningApproval,
      actor: mission.approvals?.planningApproval?.approvedBy,
      date: mission.approvals?.planningApproval?.approvedAt,
    },
    {
      label: 'Flying authorisation',
      approval: mission.approvals?.flyingAuthorization,
      actor: mission.approvals?.flyingAuthorization?.authorizedBy,
      date: mission.approvals?.flyingAuthorization?.authorizedAt,
    },
    {
      label: 'Completion approval',
      approval: mission.approvals?.completionApproval,
      actor: mission.approvals?.completionApproval?.approvedBy,
      date: mission.approvals?.completionApproval?.approvedAt,
    },
    {
      label: 'Final approval',
      approval: mission.approvals?.finalApproval,
      actor: mission.approvals?.finalApproval?.approvedBy,
      date: mission.approvals?.finalApproval?.approvedAt,
    },
  ];
  for (const entry of approvalEntries) {
    text(entry.label, { bold: true });
    if (!entry.approval) {
      text(NOT_RECORDED, { indent: 4 });
      continue;
    }
    text(`By: ${recorded(entry.actor)}`, { indent: 4 });
    text(`At: ${formatDate(entry.date)}`, { indent: 4 });
    text(`Signature: ${recorded(entry.approval.digitalSignature)}`, { indent: 4 });
    if ('conditions' in entry.approval) text(`Conditions: ${listText(entry.approval.conditions)}`, { indent: 4 });
    text(`Comments: ${recorded(entry.approval.comments)}`, { indent: 4 });
  }

  heading('Audit and execution');
  if (!mission.auditTrail?.length) text('No mission audit entries recorded.');
  for (const entry of mission.auditTrail ?? []) {
    text(`${formatDate(entry.timestamp)} - ${recorded(entry.action)} - User ${recorded(entry.userId)} - ${recorded(entry.comments)}`);
    if (entry.statusTransition) {
      text(`Status: ${recorded(entry.statusTransition.fromStatus)} to ${recorded(entry.statusTransition.toStatus)} - ${recorded(entry.statusTransition.reason)}`, { indent: 4 });
    }
  }
  const execution = mission.flightExecution;
  if (!execution) {
    text('No flight execution record.');
  } else {
    text(`Execution date: ${formatDate(execution.executionDate)}`);
    text(`Result: ${recorded(execution.results?.missionStatus)}`);
    text(`Area completed: ${execution.results?.areaCompleted ?? NOT_RECORDED} ha`);
    text(`Actual flight time: ${formatDuration(execution.actualFlightData?.totalFlightTime)}`);
    text(`Issues recorded: ${execution.issues?.length ?? 0}`);
    for (const issue of execution.issues ?? []) {
      text(`${recorded(issue.type)} - ${recorded(issue.severity)} - ${recorded(issue.description)} - Action: ${recorded(issue.actionTaken)}`, { indent: 4 });
    }
  }

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GREY);
    doc.text(`Mission ${recorded(mission.missionNumber)} | Page ${page} of ${pageCount}`, MARGIN, FOOTER_Y);
  }
  return doc;
}

export function downloadMissionPackPdf(mission: MissionRecord): void {
  buildMissionPackPdf(mission).save(missionPackPdfFilename(mission));
}
