import type { MissionStatus } from '../types/mission';

export type MissionWorkflowAction =
  | 'save-draft'
  | 'complete-jsa'
  | 'review-environment'
  | 'authorize-mission'
  | 'generate-flight-plan'
  | 'authorize-flight'
  | 'start-flying'
  | 'record-completion'
  | 'mark-completed'
  | 'none';

export interface MissionWorkflowInput {
  hasMission: boolean;
  status?: MissionStatus;
  jsaApproved: boolean;
  environmentalReviewComplete: boolean;
  hasFlightPlan: boolean;
  hasFlightAuthorization: boolean;
  hasFlightExecution: boolean;
}

export interface MissionWorkflowState {
  action: MissionWorkflowAction;
  actionLabel: string;
  guidance: string;
  activeStep: number;
  completedSteps: boolean[];
}

export const MISSION_WORKFLOW_STEPS = [
  { label: 'Mission setup', detail: 'Save mission details' },
  { label: 'Safety review', detail: 'JSA and environment' },
  { label: 'Mission authorization', detail: 'Approve the plan' },
  { label: 'Flight operations', detail: 'Plan, fly, complete' },
] as const;

export function getMissionWorkflowState(input: MissionWorkflowInput): MissionWorkflowState {
  const missionAuthorized = Boolean(input.status && input.status !== 'Planning');
  const missionFinished = input.status === 'Completed' || input.status === 'Locked';
  const completedSteps = [
    input.hasMission,
    input.hasMission && input.jsaApproved && input.environmentalReviewComplete,
    missionAuthorized,
    missionFinished,
  ];

  if (!input.hasMission) {
    return {
      action: 'save-draft',
      actionLabel: 'Save Mission Draft',
      guidance: 'Enter the mission details and boundary, then save the draft.',
      activeStep: 0,
      completedSteps,
    };
  }

  if (input.status === 'Planning') {
    if (!input.jsaApproved) {
      return {
        action: 'complete-jsa',
        actionLabel: 'Complete CASA JSA',
        guidance: 'Complete and approve the CASA JSA before mission authorization.',
        activeStep: 1,
        completedSteps,
      };
    }

    if (!input.environmentalReviewComplete) {
      return {
        action: 'review-environment',
        actionLabel: 'Review Environmental Clearance',
        guidance: 'Review the environmental evidence and acknowledge the outcome.',
        activeStep: 1,
        completedSteps,
      };
    }

    // Mission authorization is governed only by the established safety and
    // compliance checks above. Optional deployment packs and their costing
    // completeness must never block authorization.
    return {
      action: 'authorize-mission',
      actionLabel: 'Authorize Mission',
      guidance: 'Safety checks are complete. Authorize the mission plan to unlock flight operations.',
      activeStep: 2,
      completedSteps,
    };
  }

  if (input.status === 'Approved') {
    if (!input.hasFlightPlan) {
      return {
        action: 'generate-flight-plan',
        actionLabel: 'Generate Flight Plan',
        guidance: 'The mission is authorized. Set the flight parameters and generate the flight plan.',
        activeStep: 3,
        completedSteps,
      };
    }

    if (!input.hasFlightAuthorization) {
      return {
        action: 'authorize-flight',
        actionLabel: 'Authorize Flight',
        guidance: 'The plan is ready. Record the final go/no-go flight authorization.',
        activeStep: 3,
        completedSteps,
      };
    }

    return {
      action: 'start-flying',
      actionLabel: 'Start Flying',
      guidance: 'Flight authorization is recorded. Start the mission when the aircraft is ready.',
      activeStep: 3,
      completedSteps,
    };
  }

  if (input.status === 'Flying') {
    if (!input.hasFlightExecution) {
      return {
        action: 'record-completion',
        actionLabel: 'Record Completion',
        guidance: 'Enter the actual area, flight time, result, and notes after landing.',
        activeStep: 3,
        completedSteps,
      };
    }

    return {
      action: 'mark-completed',
      actionLabel: 'Mark Mission Completed',
      guidance: 'Review the captured execution record, then mark the mission completed.',
      activeStep: 3,
      completedSteps,
    };
  }

  if (input.status === 'Completed') {
    return {
      action: 'none',
      actionLabel: 'Mission Completed',
      guidance: 'Mission completed. The execution record is saved.',
      activeStep: 3,
      completedSteps,
    };
  }

  return {
    action: 'none',
    actionLabel: 'Mission Locked',
    guidance: 'This mission is locked and cannot be changed.',
    activeStep: 3,
    completedSteps,
  };
}
