import type { MissionStepStatus } from './missionStepper';
import type {
  MissionStatusGroups,
  MissionWorkspaceStage,
  MissionWorkspaceStageDefinition,
  MissionWorkspaceStageId,
} from '../types/missionWorkspace';

export const MISSION_WORKSPACE_STAGES: readonly MissionWorkspaceStageDefinition[] = [
  { id: 'mission', label: 'Mission', question: 'What am I doing?' },
  { id: 'map', label: 'Map', question: 'Where am I working?' },
  { id: 'resources', label: 'Resources', question: 'What am I taking?' },
  { id: 'weather-chemicals', label: 'Weather & Chemicals', question: 'What conditions am I expecting and what am I applying?' },
  { id: 'jsa', label: 'JSA', question: 'Is it safe?' },
  { id: 'review', label: 'Review', question: 'Am I ready to fly?' },
  { id: 'operational-closeout', label: 'Operational Closeout', question: 'What actually happened?' },
  { id: 'mission-outcomes', label: 'Mission Outcomes', question: 'How effective was the work?' },
  { id: 'customer-outcome', label: 'Customer Outcome', question: 'What did the customer think?' },
] as const;

const stateRank = { CURRENT: 0, NEEDS_REVIEW: 1, INCOMPLETE: 2, BLOCKED: 3, OPTIONAL: 4, COMPLETE: 5 } as const;

function combineMissionSteps(steps: MissionStepStatus[]): MissionStepStatus {
  const incomplete = steps.filter((step) => step.state !== 'COMPLETE').sort((a, b) => stateRank[a.state] - stateRank[b.state]);
  return incomplete[0] || { state: 'COMPLETE', reason: 'Mission details and authoritative parent context are saved.' };
}

export function deriveMissionWorkspaceStages(input: {
  planningSteps: MissionStepStatus[];
  authorised: boolean;
  completed: boolean;
}): MissionWorkspaceStage[] {
  if (input.planningSteps.length < 10) throw new Error('Ten authoritative planning step states are required.');
  const planning = [
    combineMissionSteps(input.planningSteps.slice(0, 5)),
    input.planningSteps[5],
    input.planningSteps[6],
    input.planningSteps[7],
    input.planningSteps[8],
    input.planningSteps[9],
  ];
  const lifecycle: Array<Pick<MissionWorkspaceStage, 'state' | 'reason' | 'available'>> = [
    input.completed
      ? { state: 'COMPLETE', reason: 'Operational Closeout and Completion Evidence are authoritative.', available: true }
      : input.authorised
        ? { state: 'INCOMPLETE', reason: 'Record what actually happened during operations.', available: true }
        : { state: 'BLOCKED', reason: 'Available after Mission Authorisation', available: false },
    input.completed
      ? { state: 'OPTIONAL', reason: 'Optional follow-up observations may be recorded after Completion.', available: true }
      : { state: 'BLOCKED', reason: 'Available after Completion', available: false },
    input.completed
      ? { state: 'OPTIONAL', reason: 'Optional Customer Outcome evidence may be recorded after Completion.', available: true }
      : { state: 'BLOCKED', reason: 'Available after Completion', available: false },
  ];
  return MISSION_WORKSPACE_STAGES.map((definition, index) => index < 6
    ? { ...definition, ...planning[index], available: true }
    : { ...definition, ...lifecycle[index - 6] });
}

export function isMissionWorkspaceStageId(value: string | null): value is MissionWorkspaceStageId {
  return MISSION_WORKSPACE_STAGES.some((stage) => stage.id === value);
}

export function selectInitialMissionStage(stages: MissionWorkspaceStage[]): MissionWorkspaceStageId {
  return stages.find((stage) => stage.available && ['CURRENT', 'NEEDS_REVIEW', 'INCOMPLETE'].includes(stage.state))?.id
    || stages.find((stage) => stage.available)?.id
    || 'mission';
}

export function groupMissionStatusItems(stages: MissionWorkspaceStage[]): MissionStatusGroups {
  const groups: MissionStatusGroups = { needsAttention: [], needsReview: [], complete: [] };
  stages.forEach((stage) => {
    const item = { stageId: stage.id, label: stage.label, reason: stage.reason };
    if (stage.state === 'COMPLETE') groups.complete.push(item);
    else if (stage.state === 'NEEDS_REVIEW') groups.needsReview.push(item);
    else if (stage.available && stage.state !== 'OPTIONAL') groups.needsAttention.push(item);
  });
  return groups;
}
