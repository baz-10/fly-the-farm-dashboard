import { MissionRecord } from '../types/mission';
import {
  DeploymentAsset,
  MissionDeploymentWorkPack,
  MissionWorkPackDraft,
  WorkPackTemplate,
} from '../types/workPack';

function copyAsset(asset: DeploymentAsset): DeploymentAsset {
  return { ...asset, costs: { ...asset.costs } };
}

export function applyWorkPackTemplate(
  template: WorkPackTemplate,
  assets: DeploymentAsset[],
): MissionWorkPackDraft {
  return {
    sourceTemplateId: template.id,
    assets: assets.map(copyAsset),
    aircraftAssignments: template.aircraftAssignments.map((assignment) => ({ ...assignment })),
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
  const primary = workPack?.aircraftAssignments[0];
  if (!primary?.aircraftId || !primary.kitId) return fallback;
  return { ...fallback, aircraftId: primary.aircraftId, kitId: primary.kitId };
}
