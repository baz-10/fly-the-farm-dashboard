import { MissionRecord } from '../types/mission';
import { Aircraft, EquipmentKit } from '../types/aircraft';
import {
  DeploymentAsset,
  MissionDeploymentWorkPack,
  MissionWorkPackDraft,
  UnavailableDeploymentAssetReference,
  UnavailableAircraftReference,
  UnavailableKitReference,
  WorkPackTemplate,
} from '../types/workPack';
import { getKitCompatibility } from './aircraftKitCompatibility';

function copyAsset(asset: DeploymentAsset): DeploymentAsset {
  return { ...asset, costs: { ...asset.costs } };
}

export function applyWorkPackTemplate(
  template: WorkPackTemplate,
  assets: DeploymentAsset[],
  aircraft: Aircraft[] = [],
  equipmentKits: EquipmentKit[] = [],
): MissionWorkPackDraft {
  const requestedAssetIds = template.assetIds || (template.truckId ? [template.truckId] : []);
  const suppliedAssetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const unavailableAssetReferences: UnavailableDeploymentAssetReference[] = [];
  requestedAssetIds.forEach((sourceAssetId) => {
    const source = suppliedAssetsById.get(sourceAssetId);
    if (!source) {
      unavailableAssetReferences.push({ sourceAssetId, label: sourceAssetId, reason: 'missing' });
    } else if (source.status !== 'available') {
      unavailableAssetReferences.push({
        sourceAssetId,
        label: source.name || source.registration || sourceAssetId,
        reason: source.status,
      });
    }
  });
  const aircraftById = new Map(aircraft.map((item) => [item.id, item]));
  const kitsById = new Map(equipmentKits.map((item) => [item.id, item]));
  const unavailableAircraftReferences: UnavailableAircraftReference[] = [];
  const unavailableKitReferences: UnavailableKitReference[] = [];
  template.aircraftAssignments.forEach((assignment) => {
    const source = aircraftById.get(assignment.aircraftId);
    if (!source) {
      unavailableAircraftReferences.push({ assignmentId: assignment.id, sourceAircraftId: assignment.aircraftId, label: assignment.aircraftId, reason: 'missing' });
    } else if (source.status !== 'operational') {
      unavailableAircraftReferences.push({ assignmentId: assignment.id, sourceAircraftId: source.id, label: source.registration || source.model, reason: source.status });
    }
    if (!assignment.kitId) return;
    const kit = kitsById.get(assignment.kitId);
    if (!kit) {
      unavailableKitReferences.push({ assignmentId: assignment.id, sourceKitId: assignment.kitId, label: assignment.kitId, reason: 'missing' });
      return;
    }
    const sourceAircraft = aircraftById.get(assignment.aircraftId);
    if (!sourceAircraft || !getKitCompatibility(sourceAircraft, kit).compatible) {
      unavailableKitReferences.push({
        assignmentId: assignment.id,
        sourceKitId: kit.id,
        label: kit.name,
        reason: kit.operationalData.status === 'available' ? 'incompatible' : 'unavailable',
      });
    }
  });
  return {
    sourceTemplateId: template.id,
    assets: assets.map(copyAsset),
    aircraftAssignments: template.aircraftAssignments.map((assignment) => ({ ...assignment })),
    supportingEquipment: (template.supportingEquipment ?? []).map((item) => ({ ...item })),
    unavailableAssetReferences,
    unavailableAircraftReferences,
    unavailableKitReferences,
    crewRequirements: template.crewRequirements.map((requirement) => ({ ...requirement })),
    checklist: [...template.checklist],
    notes: template.notes,
    costingComplete: false,
  };
}

function hasTowDetails(draft: MissionWorkPackDraft): boolean {
  const towVehicle = draft.towVehicle;
  return Boolean(towVehicle?.registration || towVehicle?.driver || towVehicle?.notes);
}

function isEmpty(draft: MissionWorkPackDraft): boolean {
  return !draft.sourceTemplateId
    && !(draft.assets?.length)
    && !hasTowDetails(draft)
    && !(draft.aircraftAssignments?.length)
    && !(draft.supportingEquipment?.length)
    && !(draft.unavailableAssetReferences?.length)
    && !(draft.unavailableAircraftReferences?.length)
    && !(draft.unavailableKitReferences?.length)
    && !(draft.crewRequirements?.length)
    && !(draft.checklist?.length)
    && !draft.notes
    && draft.estimatedDeploymentCost === undefined
    && !draft.costingComplete;
}

export function buildMissionWorkPack(
  draft: MissionWorkPackDraft,
): MissionDeploymentWorkPack | undefined {
  if ((draft.aircraftAssignments?.length ?? 0) > 3) {
    throw new Error('A mission work pack supports up to 3 aircraft.');
  }
  if (isEmpty(draft)) return undefined;

  return {
    sourceTemplateId: draft.sourceTemplateId,
    assets: (draft.assets ?? []).map(copyAsset),
    ...(hasTowDetails(draft) ? { towVehicle: { ...draft.towVehicle } } : {}),
    aircraftAssignments: (draft.aircraftAssignments ?? []).map((assignment) => ({ ...assignment })),
    supportingEquipment: (draft.supportingEquipment ?? []).map((item) => ({ ...item })),
    unavailableAssetReferences: (draft.unavailableAssetReferences ?? []).map((item) => ({ ...item })),
    unavailableAircraftReferences: (draft.unavailableAircraftReferences ?? []).map((item) => ({ ...item })),
    unavailableKitReferences: (draft.unavailableKitReferences ?? []).map((item) => ({ ...item })),
    crewRequirements: (draft.crewRequirements ?? []).map((requirement) => ({ ...requirement })),
    checklist: [...(draft.checklist ?? [])],
    notes: draft.notes ?? '',
    estimatedDeploymentCost: draft.estimatedDeploymentCost,
    costingComplete: draft.costingComplete ?? false,
    createdAt: new Date().toISOString(),
  };
}

export function syncPrimaryAircraftConfiguration(
  workPack: MissionDeploymentWorkPack | undefined,
  fallback: MissionRecord['aircraftConfiguration'],
): MissionRecord['aircraftConfiguration'] {
  const primary = workPack?.aircraftAssignments.find((assignment) => assignment.aircraftId && assignment.kitId);
  if (!primary) return fallback;
  return { ...fallback, aircraftId: primary.aircraftId, kitId: primary.kitId };
}
