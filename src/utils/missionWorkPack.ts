import { MissionRecord } from '../types/mission';
import {
  DeploymentAsset,
  MissionDeploymentWorkPack,
  MissionWorkPackDraft,
  UnavailableDeploymentAssetReference,
  WorkPackTemplate,
} from '../types/workPack';

function copyAsset(asset: DeploymentAsset): DeploymentAsset {
  return { ...asset, costs: { ...asset.costs } };
}

export function applyWorkPackTemplate(
  template: WorkPackTemplate,
  assets: DeploymentAsset[],
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
  return {
    sourceTemplateId: template.id,
    assets: assets.map(copyAsset),
    aircraftAssignments: template.aircraftAssignments.map((assignment) => ({ ...assignment })),
    supportingEquipment: (template.supportingEquipment ?? []).map((item) => ({ ...item })),
    unavailableAssetReferences,
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
