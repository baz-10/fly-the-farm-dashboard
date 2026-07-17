import { MissionRiskControl, MissionSafetyAssessment } from '../types/mission';

export const MISSION_CHECKS = [
  ['maps', 'Have you investigated the necessary maps and charts (either hard copy or electronic) for the area?', false],
  ['weather', 'Have you determined if the weather is suitable for the RPA and the operation?', false],
  ['notam', 'Have you reviewed the NOTAM related to the operations area?', false],
  ['people', 'Is there a possibility of a person moving into the area of operation or landing area during flight?', true],
  ['rights-of-way', 'Are there footpaths, or other rights of way?', true],
  ['landing-areas', 'Is there a suitable take-off and landing areas (including alternate landing area)?', false],
  ['public-separation', 'Is there an ability to maintain 30m horizontal separation from the public?', false],
  ['obstructions', 'Are there obstructions (buildings, trees etc.)?', true],
  ['interference', 'Is there a possible radio or GPS interference (power lines, antennas etc.)?', true],
  ['vlos', 'Will you have the ability to maintain VLOS / EVLOS?', false],
  ['pilot-ability', "Does the Remote pilot's ability match the location/task?", false],
  ['privacy', 'Are there privacy concerns?', true],
  ['signage', 'Will there be a need for signage?', true],
].map(([id, question, unsafeAnswer]) => ({ id: id as string, question: question as string, unsafeAnswer: unsafeAnswer as boolean }));

export type MissionSafetyState = 'incomplete' | 'ready' | 'needs-mitigation' | 'cannot-proceed';

export function buildEmptyMissionSafetyAssessment(): MissionSafetyAssessment {
  return { answers: MISSION_CHECKS.map(({ id }) => ({ questionId: id, answer: null, notes: '' })), generalComments: '', riskControls: [] };
}

export function isUnsafeAnswer(questionId: string, answer: boolean | null): boolean {
  const check = MISSION_CHECKS.find((candidate) => candidate.id === questionId);
  return answer !== null && Boolean(check) && answer === check!.unsafeAnswer;
}

export function calculateRiskScore(likelihood: number | null, consequence: number | null): number | null {
  return likelihood && consequence ? likelihood * consequence : null;
}

export function syncRiskControls(assessment: MissionSafetyAssessment): MissionRiskControl[] {
  const existing = new Map(assessment.riskControls.map((control) => [control.questionId, control]));
  return assessment.answers.filter((answer) => isUnsafeAnswer(answer.questionId, answer.answer)).map((answer) => existing.get(answer.questionId) || ({ questionId: answer.questionId, likelihood: null, consequence: null, mitigation: '', residualLikelihood: null, residualConsequence: null }));
}

export function evaluateMissionSafety(assessment: MissionSafetyAssessment): { state: MissionSafetyState; blockers: string[] } {
  const blockers: string[] = [];
  if (MISSION_CHECKS.some((check) => assessment.answers.find((answer) => answer.questionId === check.id)?.answer == null)) return { state: 'incomplete', blockers: ['Answer every mission check.'] };
  const controls = syncRiskControls(assessment);
  let state: MissionSafetyState = 'ready';
  controls.forEach((control) => {
    const score = calculateRiskScore(control.likelihood, control.consequence);
    if (score === null) { state = 'needs-mitigation'; blockers.push('Assess every triggered risk.'); return; }
    if (score >= 6) {
      const residual = calculateRiskScore(control.residualLikelihood, control.residualConsequence);
      if (!control.mitigation.trim() || residual === null) { state = 'needs-mitigation'; blockers.push('Add mitigation and a residual risk score.'); }
      else if (residual >= 6) { state = 'cannot-proceed'; blockers.push('Residual risk must be below 6.'); }
    }
  });
  return { state, blockers };
}
