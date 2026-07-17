import { buildEmptyMissionSafetyAssessment, evaluateMissionSafety, isUnsafeAnswer, MISSION_CHECKS } from '../missionSafety';

describe('mission safety rules', () => {
  test('contains the 13 approved checks with risk-aware unsafe answers', () => {
    expect(MISSION_CHECKS).toHaveLength(13);
    MISSION_CHECKS.forEach((check) => {
      expect(isUnsafeAnswer(check.id, check.unsafeAnswer)).toBe(true);
      expect(isUnsafeAnswer(check.id, !check.unsafeAnswer)).toBe(false);
    });
  });

  test('blocks an incomplete assessment', () => {
    expect(evaluateMissionSafety(buildEmptyMissionSafetyAssessment()).state).toBe('incomplete');
  });

  test('allows an assessed risk score below 6 without mitigation', () => {
    const assessment = buildEmptyMissionSafetyAssessment();
    assessment.answers = MISSION_CHECKS.map((check) => ({ questionId: check.id, answer: !check.unsafeAnswer, notes: '' }));
    assessment.answers[0].answer = MISSION_CHECKS[0].unsafeAnswer;
    assessment.riskControls = [{ questionId: MISSION_CHECKS[0].id, likelihood: 1, consequence: 5, mitigation: '', residualLikelihood: null, residualConsequence: null }];
    expect(evaluateMissionSafety(assessment).state).toBe('ready');
  });

  test('requires mitigation at score 6 and blocks residual score 6', () => {
    const assessment = buildEmptyMissionSafetyAssessment();
    assessment.answers = MISSION_CHECKS.map((check) => ({ questionId: check.id, answer: !check.unsafeAnswer, notes: '' }));
    assessment.answers[0].answer = MISSION_CHECKS[0].unsafeAnswer;
    assessment.riskControls = [{ questionId: MISSION_CHECKS[0].id, likelihood: 2, consequence: 3, mitigation: '', residualLikelihood: null, residualConsequence: null }];
    expect(evaluateMissionSafety(assessment).state).toBe('needs-mitigation');
    assessment.riskControls[0] = { ...assessment.riskControls[0], mitigation: 'Additional controls', residualLikelihood: 2, residualConsequence: 3 };
    expect(evaluateMissionSafety(assessment).state).toBe('cannot-proceed');
    assessment.riskControls[0].residualLikelihood = 1;
    expect(evaluateMissionSafety(assessment).state).toBe('ready');
  });
});
