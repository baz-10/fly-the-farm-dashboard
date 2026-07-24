import type {
  ChemicalEntry,
  Client,
  Field,
  JobRecord,
  Property,
} from '../types/fieldManagement';
import type { MissionRecord } from '../types/mission';
import type {
  SafetyPlan,
  SafetyPlanActor,
  SafetyPlanFieldValue,
  SafetyPlanSourceItem,
  SafetyPlanSourceSnapshot,
  SafetyPlanTemplate,
} from '../types/safetyPlan';

export interface SafetyPlanPrefillCompany {
  id: string;
  name: string;
}

export interface SafetyPlanPrefillPerson {
  id: string;
  name: string;
  role: string;
}

export interface SafetyPlanPrefillAsset {
  id: string;
  name: string;
  type: string;
}

export interface SafetyPlanPrefillEmergencyContact {
  name: string;
  phone: string;
  role?: string;
}

export interface SafetyPlanPrefillChemical {
  product: string;
  activeIngredient?: string;
  ratePerHa?: string;
  quantity?: string;
  sdsReference?: string;
}

export interface BuildJobSafetyPlanInput {
  tenantId: string;
  job: JobRecord;
  missions: MissionRecord[];
  template: SafetyPlanTemplate;
  actor: SafetyPlanActor;
  now: string;
  company?: SafetyPlanPrefillCompany;
  client?: Pick<Client, 'id' | 'name' | 'phone' | 'email'>;
  property?: Pick<Property, 'id' | 'name' | 'address'>;
  field?: Pick<Field, 'id' | 'name' | 'sizeHa' | 'boundary' | 'boundaryCoords'>;
  crew?: SafetyPlanPrefillPerson[];
  assets?: SafetyPlanPrefillAsset[];
  chemicals?: SafetyPlanPrefillChemical[];
  emergencyContacts?: SafetyPlanPrefillEmergencyContact[];
}

function cloneTemplate(template: SafetyPlanTemplate): SafetyPlanTemplate {
  return {
    ...template,
    sections: template.sections.map((section) => ({
      ...section,
      fields: section.fields.map((field) => ({ ...field })),
    })),
  };
}

function itemId(
  sourceType: SafetyPlanSourceItem['sourceType'],
  sourceId: string,
  sourceItemId: string
): string {
  return `${sourceType}:${sourceId}:${sourceItemId}`;
}

function collectMissionHazards(mission: MissionRecord): SafetyPlanSourceItem[] {
  const jsa = mission.jsaRecord;
  if (!jsa) return [];
  const sourceUpdatedAt = jsa.updatedAt || mission.updatedAt;
  const hazards: SafetyPlanSourceItem[] = (jsa.hazardIdentification ?? []).map((hazard) => ({
    id: itemId('jsa', mission.id, hazard.id),
    sourceType: 'jsa',
    sourceId: mission.id,
    sourceRecordId: jsa.id,
    sourceItemId: hazard.id,
    sourceUpdatedAt,
    label: hazard.description,
    value: hazard.description,
    companyValue: hazard.controlMeasures.join('; ') || hazard.description,
  }));

  const riskControls = jsa.missionChecks?.riskControls ?? [];
  for (const control of riskControls) {
    const matchingAnswer = jsa.missionChecks?.answers.find(
      (answer) => answer.questionId === control.questionId
    );
    if (matchingAnswer?.answer !== true) continue;
    hazards.push({
      id: itemId('risk_assessment', mission.id, control.questionId),
      sourceType: 'risk_assessment',
      sourceId: mission.id,
      sourceRecordId: jsa.id,
      sourceItemId: control.questionId,
      sourceUpdatedAt,
      label: matchingAnswer.notes || control.questionId,
      value: control.mitigation,
      companyValue: control.mitigation,
    });
  }
  return hazards.sort((left, right) => left.id.localeCompare(right.id));
}

function chemicalSnapshot(
  chemicals: SafetyPlanPrefillChemical[] | undefined,
  fallback: ChemicalEntry[]
): SafetyPlanPrefillChemical[] {
  return (chemicals ?? fallback).map((chemical) => ({ ...chemical }));
}

export function safetyPlanFieldValue(
  fieldId: string,
  snapshot: SafetyPlanSourceSnapshot
): SafetyPlanFieldValue | undefined {
  switch (fieldId) {
    case 'plan_reference':
      return `SP-${snapshot.job.id}`;
    case 'plan_scope':
    case 'job_details':
      return snapshot.job.name;
    case 'controlled_version':
      return '1.0';
    case 'client_property_location':
      return [
        snapshot.job.clientName,
        snapshot.job.propertyName,
        snapshot.job.fieldName,
        snapshot.job.location,
      ].filter(Boolean).join(' · ');
    case 'operating_dates':
      return snapshot.job.operatingDates;
    case 'assigned_crew':
      return snapshot.crew?.map(({ name, role }) => `${name} — ${role}`);
    case 'operational_assets':
      return snapshot.assets?.map(({ name, type }) => `${name} — ${type}`);
    case 'chemicals_payloads':
      return snapshot.chemicals
        ?.map(({ product, ratePerHa, quantity }) => [product, ratePerHa, quantity].filter(Boolean).join(' · '))
        .join('\n');
    case 'site_access_controls':
      return snapshot.job.siteNotes;
    case 'hazards_and_risk_scores':
      return snapshot.hazards?.map(({ label }) => label).join('\n');
    case 'mitigations_and_controls':
      return snapshot.hazards?.map(({ companyValue }) => companyValue).join('\n');
    case 'emergency_response':
      return snapshot.emergencyContacts
        ?.map(({ name, phone, role }) => [name, role, phone].filter(Boolean).join(' · '))
        .join('\n');
    default:
      return undefined;
  }
}

export function buildJobSafetyPlan(input: BuildJobSafetyPlanInput): SafetyPlan {
  const linkedMissions = input.missions
    .filter((mission) => mission.jobId === input.job.id)
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id));
  const hazards = linkedMissions.flatMap(collectMissionHazards);
  const jobName = [
    input.job.weedTarget || 'Job',
    input.field?.name,
  ].filter(Boolean).join(' — ');
  const snapshot: SafetyPlanSourceSnapshot = {
    capturedAt: input.now,
    company: input.company ? { ...input.company } : undefined,
    job: {
      id: input.job.id,
      name: jobName,
      clientName: input.client?.name,
      propertyName: input.property?.name,
      fieldName: input.field?.name,
      location: input.property?.address,
      operatingDates: input.job.dateSprayed || undefined,
      siteNotes: input.job.notes || undefined,
    },
    client: input.client ? { ...input.client } : undefined,
    property: input.property ? { ...input.property } : undefined,
    field: input.field
      ? { id: input.field.id, name: input.field.name, sizeHa: input.field.sizeHa }
      : undefined,
    missions: linkedMissions.map((mission) => ({
      id: mission.id,
      name: mission.missionName,
    })),
    crew: input.crew?.map((person) => ({ ...person })),
    assets: input.assets?.map((asset) => ({ ...asset })),
    chemicals: chemicalSnapshot(input.chemicals, input.job.chemicals),
    emergencyContacts: input.emergencyContacts?.map((contact) => ({ ...contact })),
    siteMap: input.field && (input.field.boundary || input.field.boundaryCoords?.length)
      ? {
        boundary: input.field.boundary
          ? {
            fileName: input.field.boundary.fileName,
            fileType: input.field.boundary.fileType,
            sizeBytes: input.field.boundary.sizeBytes,
            boundingBox: input.field.boundary.boundingBox
              ? { ...input.field.boundary.boundingBox }
              : undefined,
            uploadedAt: input.field.boundary.uploadedAt,
          }
          : undefined,
        boundaryCoords: (input.field.boundaryCoords ?? []).map(
          ([latitude, longitude]) => [latitude, longitude] as [number, number]
        ),
      }
      : undefined,
    hazards,
    sourceLinks: [
      ...linkedMissions.map((mission) => ({
        sourceType: 'mission' as const,
        sourceId: mission.id,
        sourceUpdatedAt: mission.updatedAt,
      })),
      ...hazards.map((hazard) => ({
        sourceType: hazard.sourceType,
        sourceId: hazard.sourceId,
        sourceItemId: hazard.sourceItemId,
        sourceUpdatedAt: hazard.sourceUpdatedAt,
      })),
    ],
  };
  const templateSnapshot = cloneTemplate(input.template);
  const sections = templateSnapshot.sections.map((section) => ({
    ...section,
    fields: [
      ...section.fields.map((field) => ({
        ...field,
        value: safetyPlanFieldValue(field.id, snapshot),
      })),
      ...(section.id === 'consolidated_jsa_hazards_controls'
        ? hazards.map((hazard) => ({
          id: hazard.id,
          label: hazard.label,
          helpText: `Imported from ${hazard.sourceType.replace('_', ' ')} ${hazard.sourceRecordId ?? hazard.sourceId}.`,
          type: 'textarea' as const,
          required: false,
          companyEditable: true,
          value: hazard.companyValue,
        }))
        : []),
    ],
  }));
  const planId = `safety-plan-${input.job.id}`;
  const versionId = `${planId}-v1`;

  return {
    id: planId,
    jobId: input.job.id,
    tenantId: input.tenantId,
    revision: 1,
    status: 'draft',
    currentVersionId: versionId,
    versions: [{
      id: versionId,
      planId,
      version: '1.0',
      status: 'draft',
      templateSnapshot,
      sections,
      sourceSnapshot: snapshot,
      attachments: [],
      acknowledgements: [],
      createdAt: input.now,
      updatedAt: input.now,
      revision: 1,
      createdBy: { ...input.actor },
    }],
    createdAt: input.now,
    updatedAt: input.now,
  };
}
