import { MissionRecord, MissionStatus } from '../../types/mission';
import { getMissionNextAction, groupMissionsForRegister, MISSION_REGISTER_SECTIONS } from '../missionRegister';

function mission(id: string, status: MissionStatus, name = id): MissionRecord {
  return { id, status, missionName: name, missionNumber: id, updatedAt: `2026-07-18T0${id.length}:00:00.000Z`, location: { name: `${name} field`, address: '' }, aircraftConfiguration: { aircraftId: `${id}-aircraft` } } as MissionRecord;
}

describe('mission register grouping', () => {
  test('uses the approved fixed section order', () => {
    expect(MISSION_REGISTER_SECTIONS.map((section) => section.label)).toEqual(['In Progress', 'Authorised', 'Planning', 'Completed']);
  });

  test('keeps Flying separate from Approved and combines completed records', () => {
    const groups = groupMissionsForRegister([
      mission('planning', 'Planning'),
      mission('approved', 'Approved'),
      mission('flying', 'Flying'),
      mission('completed', 'Completed'),
      mission('locked', 'Locked'),
    ], '');

    expect(groups[0].missions.map((item) => item.id)).toEqual(['flying']);
    expect(groups[1].missions.map((item) => item.id)).toEqual(['approved']);
    expect(groups[2].missions.map((item) => item.id)).toEqual(['planning']);
    expect(groups[3].missions.map((item) => item.id)).toEqual(['completed', 'locked']);
  });

  test('search filters every group without changing placement', () => {
    const groups = groupMissionsForRegister([
      mission('flying', 'Flying', 'Creek spray'),
      mission('approved', 'Approved', 'North spray'),
    ], 'north');
    expect(groups[0].missions).toEqual([]);
    expect(groups[1].missions.map((item) => item.id)).toEqual(['approved']);
  });

  test.each([
    ['Flying', 'Record flight progress or completion'],
    ['Approved', 'Ready to commence flight'],
    ['Planning', 'Continue mission planning'],
    ['Completed', 'Review completed mission'],
    ['Locked', 'Review completed mission'],
  ] as Array<[MissionStatus, string]>)('provides the %s next action', (status, expected) => {
    expect(getMissionNextAction(mission(status, status))).toBe(expected);
  });
});
