import {
  canStartMissionOperatingDay,
  formatMissionOperatingWorkDate,
  MISSION_WORKSPACE_STAGES,
  deriveMissionWorkspaceStages,
  groupMissionStatusItems,
  selectInitialMissionStage,
} from '../missionWorkspace';
import type { MissionOperatingDay } from '../../types/missionOperations';
import type { MissionStepStatus } from '../missionStepper';

const completePlanningSteps: MissionStepStatus[] = Array.from({ length: 10 }, () => ({ state: 'COMPLETE', reason: 'Saved.' }));

describe('Mission Workspace state model', () => {
  test('defines the complete lifecycle and one operational question per stage', () => {
    expect(MISSION_WORKSPACE_STAGES.map((stage) => [stage.id, stage.question])).toEqual([
      ['mission', 'What am I doing?'], ['map', 'Where am I working?'], ['resources', 'What am I taking?'],
      ['weather-chemicals', 'What conditions am I expecting and what am I applying?'], ['jsa', 'Is it safe?'],
      ['review', 'What exact package may the eligible CRP decide?'], ['operating-days', 'What work is planned or recorded for each operating day?'],
      ['operational-closeout', 'What actually happened?'],
      ['mission-outcomes', 'How effective was the work?'], ['customer-outcome', 'What did the customer think?'],
    ]);
  });

  test('keeps later lifecycle stages visible with authoritative availability reasons', () => {
    const stages = deriveMissionWorkspaceStages({ planningSteps: completePlanningSteps, authorised: false, completed: false });
    expect(stages).toHaveLength(10);
    expect(stages.find((stage) => stage.id === 'operating-days')).toMatchObject({ available: false, reason: 'Available after Mission Authorisation' });
    expect(stages.find((stage) => stage.id === 'operational-closeout')).toMatchObject({ available: false, reason: 'Available after Mission Authorisation' });
    expect(stages.find((stage) => stage.id === 'mission-outcomes')).toMatchObject({ available: false, reason: 'Available after Completion' });
  });

  test('makes closeout available after authorisation and outcomes available only after completion', () => {
    const authorised = deriveMissionWorkspaceStages({ planningSteps: completePlanningSteps, authorised: true, completed: false });
    expect(authorised[6]).toMatchObject({ available: true, state: 'INCOMPLETE' });
    expect(authorised[7]).toMatchObject({ available: true, state: 'INCOMPLETE' });
    expect(authorised[8]).toMatchObject({ available: false, state: 'BLOCKED' });
    const completed = deriveMissionWorkspaceStages({ planningSteps: completePlanningSteps, authorised: true, completed: true });
    expect(completed[6]).toMatchObject({ available: true, state: 'COMPLETE' });
    expect(completed[8]).toMatchObject({ available: true, state: 'OPTIONAL' });
  });

  test('selects the first actionable available stage and groups health without treating future stages as blockers', () => {
    const planning = completePlanningSteps.map((step) => ({ ...step }));
    planning[5] = { state: 'NEEDS_REVIEW', reason: 'Map requires review.' };
    planning[7] = { state: 'INCOMPLETE', reason: 'Weather is missing.' };
    const stages = deriveMissionWorkspaceStages({ planningSteps: planning, authorised: false, completed: false });
    expect(selectInitialMissionStage(stages)).toBe('map');
    expect(groupMissionStatusItems(stages)).toMatchObject({
      needsReview: [expect.objectContaining({ stageId: 'map' })],
      needsAttention: [expect.objectContaining({ stageId: 'weather-chemicals' })],
    });
    expect(groupMissionStatusItems(stages).needsAttention.some((item) => item.stageId === 'operational-closeout')).toBe(false);
  });

  test('keeps operating-day dates Base-local and requires the exact effective JSA review before start', () => {
    const day: Pick<MissionOperatingDay, 'state' | 'jsaRevisionId' | 'jsaReview'> = {
      state: 'READY', jsaRevisionId: 'jsa-current', jsaReview: null,
    };
    expect(formatMissionOperatingWorkDate('2026-09-05')).toBe('5 September 2026');
    expect(canStartMissionOperatingDay(day)).toBe(false);
    expect(canStartMissionOperatingDay({ ...day, jsaReview: {
      id: 'review', operatingDayId: 'day', missionId: 'mission', jsaRevisionId: 'jsa-current', outcome: 'CONDITIONS_COVERED', notes: null,
      reviewedByInternalUserId: 'user', reviewedAt: '2026-09-05T00:00:00.000Z',
    } })).toBe(true);
  });
});
