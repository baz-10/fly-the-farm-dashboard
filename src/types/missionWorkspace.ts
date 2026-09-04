import type { MissionStepState } from '../utils/missionStepper';

export type MissionWorkspaceStageId =
  | 'mission'
  | 'map'
  | 'resources'
  | 'weather-chemicals'
  | 'jsa'
  | 'review'
  | 'operational-closeout'
  | 'mission-outcomes'
  | 'customer-outcome';

/** The review stage only presents an immutable Mission package revision for decision. */
export type MissionReviewAuthority = 'MISSION_PACKAGE_REVISION';

export type MissionWorkspaceStageDefinition = {
  id: MissionWorkspaceStageId;
  label: string;
  question: string;
  authority?: MissionReviewAuthority;
};

export type MissionWorkspaceStage = MissionWorkspaceStageDefinition & {
  state: MissionStepState;
  reason: string;
  available: boolean;
};

export type MissionStatusItem = {
  stageId: MissionWorkspaceStageId;
  label: string;
  reason: string;
};

export type MissionStatusGroups = {
  needsAttention: MissionStatusItem[];
  needsReview: MissionStatusItem[];
  complete: MissionStatusItem[];
};
