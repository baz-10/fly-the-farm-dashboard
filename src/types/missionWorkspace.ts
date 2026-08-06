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

export type MissionWorkspaceStageDefinition = {
  id: MissionWorkspaceStageId;
  label: string;
  question: string;
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
