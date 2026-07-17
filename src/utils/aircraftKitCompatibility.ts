import { Aircraft, EquipmentKit } from '../types/aircraft';

export interface KitCompatibilityResult {
  compatible: boolean;
  reasons: string[];
}

export function normaliseAircraftModel(value: string): string {
  const compact = value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const agrasModel = compact.match(/t\d+[a-z]?$/);
  if (agrasModel) return agrasModel[0];

  return compact
    .replace(/^dji/, '')
    .replace(/^agras/, '');
}

function kitListsAircraft(aircraft: Aircraft, kit: EquipmentKit): boolean {
  const aircraftId = aircraft.id.trim().toLowerCase();
  const aircraftModel = normaliseAircraftModel(aircraft.model);

  return kit.compatibleAircraft.some((candidate) => {
    const normalisedCandidate = candidate.trim().toLowerCase();
    return normalisedCandidate === aircraftId
      || normaliseAircraftModel(candidate) === aircraftModel;
  });
}

export function getKitCompatibility(
  aircraft: Aircraft,
  kit: EquipmentKit,
): KitCompatibilityResult {
  const reasons: string[] = [];

  if (!kitListsAircraft(aircraft, kit)) {
    reasons.push(`Kit is not compatible with ${aircraft.model}`);
  }
  if (kit.operationalData.status !== 'available') {
    reasons.push('Kit is not available');
  }
  if (kit.specifications.weight > aircraft.operationalLimits.maxPayloadWeight) {
    reasons.push('Kit exceeds aircraft payload limit');
  }

  return { compatible: reasons.length === 0, reasons };
}

export function isKitCompatibleWithAircraft(
  aircraft: Aircraft,
  kit: EquipmentKit,
): boolean {
  return getKitCompatibility(aircraft, kit).compatible;
}

export function getCompatibleAvailableKits(
  aircraft: Aircraft,
  kits: EquipmentKit[],
): EquipmentKit[] {
  return kits.filter((kit) => isKitCompatibleWithAircraft(aircraft, kit));
}
