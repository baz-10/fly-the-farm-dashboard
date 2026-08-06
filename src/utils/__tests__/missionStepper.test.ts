import { deriveGuidedSetupStepStates, deriveMissionPlannerStepStates } from '../missionStepper';

describe('Mission stepper state derivation', () => {
  test('does not treat visited or prefilled steps as complete without authoritative records', () => {
    expect(deriveGuidedSetupStepStates({ currentStep: 4, clientId: 'client-1', propertyId: null, fieldId: null, jobId: null }))
      .toEqual([
        expect.objectContaining({ state: 'COMPLETE' }),
        expect.objectContaining({ state: 'CURRENT' }),
        expect.objectContaining({ state: 'BLOCKED' }),
        expect.objectContaining({ state: 'BLOCKED' }),
        expect.objectContaining({ state: 'BLOCKED' }),
        expect.objectContaining({ state: 'BLOCKED' }),
        expect.objectContaining({ state: 'BLOCKED' }),
        expect.objectContaining({ state: 'BLOCKED' }),
        expect.objectContaining({ state: 'BLOCKED' }),
        expect.objectContaining({ state: 'BLOCKED' }),
      ]);
  });

  test('selects exactly one current step and distinguishes saved, review and blocked states', () => {
    const states = deriveMissionPlannerStepStates({
      hasClient: true, hasProperty: true, hasField: true, hasJob: true, hasMission: true,
      hasMap: true, hasResources: true,
      readinessCategories: { weather: 'COMPLETE', chemicals: 'COMPLETE', jsa: 'OUTSTANDING' },
      missionReady: false,
    });
    expect(states.filter((step) => step.state === 'CURRENT')).toHaveLength(1);
    expect(states[0].state).toBe('COMPLETE');
    expect(states[5].state).toBe('COMPLETE');
    expect(states[7].state).toBe('COMPLETE');
    expect(states[8]).toEqual(expect.objectContaining({ state: 'CURRENT', reason: expect.stringMatching(/JSA/i) }));
    expect(states[9].state).toBe('BLOCKED');
  });

  test('invalidates only downstream evidence affected by an earlier Field change', () => {
    const states = deriveMissionPlannerStepStates({
      hasClient: true, hasProperty: true, hasField: true, hasJob: true, hasMission: true,
      hasMap: true, hasResources: true,
      readinessCategories: { weather: 'COMPLETE', chemicals: 'COMPLETE', jsa: 'COMPLETE' },
      missionReady: true, invalidatedBy: 'FIELD',
    });
    expect(states.slice(0, 5).every((step) => step.state === 'COMPLETE')).toBe(true);
    expect(states[5]).toEqual(expect.objectContaining({ state: 'CURRENT', reason: 'Map requires review after Field change.' }));
    expect(states[6].state).toBe('COMPLETE');
    expect(states[7]).toEqual(expect.objectContaining({ state: 'NEEDS_REVIEW' }));
    expect(states[8]).toEqual(expect.objectContaining({ state: 'NEEDS_REVIEW' }));
  });

  test('an Aircraft change targets JSA review without invalidating unrelated evidence', () => {
    const states = deriveMissionPlannerStepStates({
      hasClient: true, hasProperty: true, hasField: true, hasJob: true, hasMission: true,
      hasMap: true, hasResources: true,
      readinessCategories: { weather: 'COMPLETE', chemicals: 'COMPLETE', jsa: 'COMPLETE' },
      missionReady: true, invalidatedBy: 'AIRCRAFT',
    });
    expect(states[5].state).toBe('COMPLETE');
    expect(states[6].state).toBe('COMPLETE');
    expect(states[7].state).toBe('COMPLETE');
    expect(states[8]).toEqual(expect.objectContaining({ state: 'CURRENT', reason: 'JSA requires review after Aircraft change.' }));
  });
});
