import { getCalendarRange, getOperationalWeek, groupMissionsByLocalDate } from '../missionSchedule';
import { MissionRecord } from '../../types/mission';

const mission = (id: string, scheduledDate: string): MissionRecord => ({ id, scheduledDate } as MissionRecord);

describe('mission schedule utilities', () => {
  test('builds today plus the following six local calendar days', () => {
    const days = getOperationalWeek(new Date(2026, 6, 18, 15, 30));
    expect(days).toHaveLength(7);
    expect(days[0]).toEqual(new Date(2026, 6, 18));
    expect(days[6]).toEqual(new Date(2026, 6, 24));
  });

  test('groups in-range missions by local day and sorts by scheduled time', () => {
    const days = getOperationalWeek(new Date(2026, 6, 18, 12));
    const groups = groupMissionsByLocalDate([
      mission('later', new Date(2026, 6, 18, 15).toISOString()),
      mission('outside', new Date(2026, 6, 25, 9).toISOString()),
      mission('earlier', new Date(2026, 6, 18, 8).toISOString()),
      mission('tomorrow', new Date(2026, 6, 19, 7).toISOString()),
    ], days);

    expect(groups.map((group) => group.missions.map((item) => item.id))).toEqual([
      ['earlier', 'later'],
      ['tomorrow'],
    ]);
  });

  test('returns day, locale week, and month calendar ranges', () => {
    const anchor = new Date(2026, 6, 18, 13);
    expect(getCalendarRange('day', anchor)).toEqual({ start: new Date(2026, 6, 18), end: new Date(2026, 6, 18, 23, 59, 59, 999) });
    expect(getCalendarRange('week', anchor)).toEqual({ start: new Date(2026, 6, 13), end: new Date(2026, 6, 19, 23, 59, 59, 999) });
    expect(getCalendarRange('month', anchor)).toEqual({ start: new Date(2026, 6, 1), end: new Date(2026, 6, 31, 23, 59, 59, 999) });
  });
});
