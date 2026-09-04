export type MissionAmendmentClassification = 'ADMINISTRATIVE' | 'MATERIAL';

export type MissionAmendmentReason =
  | 'FIELD_SCOPE_CHANGED'
  | 'TARGET_AREA_CHANGED'
  | 'AIRCRAFT_ASSIGNMENT_CHANGED'
  | 'REGULATED_CREW_CHANGED'
  | 'CHEMICAL_PRODUCT_CHANGED'
  | 'APPLICATION_METHOD_CHANGED'
  | 'GOVERNED_RATE_CHANGED'
  | 'JSA_HAZARDS_CHANGED'
  | 'JSA_CONTROLS_CHANGED'
  | 'SAFETY_MAP_CHANGED'
  | 'OPERATIONAL_PERMISSION_CHANGED'
  | 'UNRECOGNISED_CHANGE';

type AmendmentValues = Record<string, unknown>;

const ADMINISTRATIVE_KEYS = new Set([
  'actualFlightHours', 'flightBreakdown', 'actualHectares', 'actualChemicalQuantity',
  'actualWeatherEvidence', 'flightLineEvidenceId', 'receipts', 'completionNotes',
  'nonSafetyCorrections',
]);

const MATERIAL_REASONS: Readonly<Record<string, MissionAmendmentReason>> = Object.freeze({
  fieldIds: 'FIELD_SCOPE_CHANGED', targetAreaHectares: 'TARGET_AREA_CHANGED',
  aircraftIds: 'AIRCRAFT_ASSIGNMENT_CHANGED', regulatedCrewIds: 'REGULATED_CREW_CHANGED',
  chemicalProductIds: 'CHEMICAL_PRODUCT_CHANGED', applicationMethod: 'APPLICATION_METHOD_CHANGED',
  governedRate: 'GOVERNED_RATE_CHANGED', jsaHazards: 'JSA_HAZARDS_CHANGED',
  jsaControls: 'JSA_CONTROLS_CHANGED', safetyMapFeatures: 'SAFETY_MAP_CHANGED',
  operationalPermissions: 'OPERATIONAL_PERMISSION_CHANGED',
});

function isPlainObject(value: unknown): value is AmendmentValues {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isPlainObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export function classifyMissionAmendment(input: { before: AmendmentValues; after: AmendmentValues }): {
  classification: MissionAmendmentClassification;
  reasons: MissionAmendmentReason[];
  changedKeys: string[];
} {
  if (!input || !isPlainObject(input.before) || !isPlainObject(input.after)) throw new Error('MISSION_AMENDMENT_INPUT_INVALID');
  const allKeys = Array.from(new Set([...Object.keys(input.before), ...Object.keys(input.after)]));
  if (allKeys.length > 64) throw new Error('MISSION_AMENDMENT_INPUT_INVALID');
  const changedKeys = allKeys
    .filter((key) => canonical(input.before[key]) !== canonical(input.after[key])).sort();
  const reasons = Array.from(new Set(changedKeys.filter((key) => !ADMINISTRATIVE_KEYS.has(key))
    .map((key) => MATERIAL_REASONS[key] || 'UNRECOGNISED_CHANGE' as MissionAmendmentReason)));
  return { classification: reasons.length ? 'MATERIAL' : 'ADMINISTRATIVE', reasons, changedKeys };
}
