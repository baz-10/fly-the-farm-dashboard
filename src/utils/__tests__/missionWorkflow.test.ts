import { getMissionWorkflowState } from '../missionWorkflow';

const baseInput = {
  hasMission: true,
  status: 'Planning' as const,
  jsaApproved: false,
  environmentalReviewComplete: false,
  hasFlightPlan: false,
  hasFlightAuthorization: false,
  hasFlightExecution: false,
};

describe('mission workflow state', () => {
  test('starts with saving a mission before compliance or flight actions', () => {
    expect(getMissionWorkflowState({ ...baseInput, hasMission: false, status: undefined })).toMatchObject({
      action: 'save-draft',
      actionLabel: 'Save Mission Draft',
      activeStep: 0,
    });
  });

  test('orders planning prerequisites before mission authorization', () => {
    expect(getMissionWorkflowState(baseInput).action).toBe('complete-jsa');
    expect(getMissionWorkflowState({ ...baseInput, jsaApproved: true }).action).toBe('review-environment');
    expect(getMissionWorkflowState({
      ...baseInput,
      jsaApproved: true,
      environmentalReviewComplete: true,
    }).action).toBe('authorize-mission');
  });

  test('orders flight planning and authorization after mission authorization', () => {
    const approved = {
      ...baseInput,
      status: 'Approved' as const,
      jsaApproved: true,
      environmentalReviewComplete: true,
    };

    expect(getMissionWorkflowState(approved).action).toBe('generate-flight-plan');
    expect(getMissionWorkflowState({ ...approved, hasFlightPlan: true }).action).toBe('authorize-flight');
    expect(getMissionWorkflowState({
      ...approved,
      hasFlightPlan: true,
      hasFlightAuthorization: true,
    }).action).toBe('start-flying');
  });

  test('requires execution capture before completion', () => {
    const flying = { ...baseInput, status: 'Flying' as const };
    expect(getMissionWorkflowState(flying).action).toBe('record-completion');
    expect(getMissionWorkflowState({ ...flying, hasFlightExecution: true }).action).toBe('mark-completed');
  });

  test('has no destructive next action for completed or locked missions', () => {
    expect(getMissionWorkflowState({ ...baseInput, status: 'Completed' }).action).toBe('none');
    expect(getMissionWorkflowState({ ...baseInput, status: 'Locked' }).action).toBe('none');
  });
});
