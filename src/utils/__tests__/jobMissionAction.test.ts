import { deriveJobMissionAction } from '../jobMissionAction';

const mission = (id: string, status: string) => ({ id, jobId: 'job-1', status });

describe('deriveJobMissionAction', () => {
  test.each([
    [[], 'No Missions yet', 'Create Mission', 'create'],
    [[mission('mission-draft', 'Planning')], '1 Draft Mission', 'Continue Mission', 'mission'],
    [[mission('mission-active', 'Flying')], '1 Active Mission', 'Open Mission', 'mission'],
    [[mission('mission-a', 'Planning'), mission('mission-b', 'Flying')], '2 Active Missions', 'Open Missions', 'register'],
    [[mission('mission-complete', 'Completed')], 'Mission completed', 'Mission History', 'register'],
  ])('returns the truthful next action for %j', (missions, summary, label, destination) => {
    expect(deriveJobMissionAction('job-1', missions)).toEqual(expect.objectContaining({ summary, label, destination }));
  });

  test('does not treat a mixture containing completed Missions as completed-only history', () => {
    expect(deriveJobMissionAction('job-1', [mission('done', 'Completed'), mission('draft', 'Planning')]))
      .toEqual(expect.objectContaining({ summary: '2 Missions', label: 'Open Missions', destination: 'register' }));
  });
});
