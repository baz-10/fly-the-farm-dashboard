import { calculateScheduleStatus } from '../maintenanceSchedule';
import { MaintenanceSchedule } from '../../types/maintenance';

const base = { id: 's1', tenantId: 't1', assetId: 'a1', title: 'Service', mandatory: true, dueSoonBy: 10, source: 'manufacturer' as const, createdAt: '', updatedAt: '' };

describe('maintenance schedule status', () => {
  test('calculates calendar, hour and kilometre due states', () => {
    const calendar: MaintenanceSchedule = { ...base, meter: 'calendar', dueAt: '2026-07-31' };
    expect(calculateScheduleStatus(calendar, {}, new Date('2026-08-01T12:00:00Z')).state).toBe('overdue');
    const hours: MaintenanceSchedule = { ...base, meter: 'flight-hours', dueAt: 100, dueSoonBy: 5 };
    expect(calculateScheduleStatus(hours, { flightHours: 98 })).toMatchObject({ state: 'due-soon', remaining: 2 });
    const km: MaintenanceSchedule = { ...base, meter: 'kilometres', dueAt: 90000, dueSoonBy: 1000 };
    expect(calculateScheduleStatus(km, { kilometres: 90000 }).state).toBe('due');
  });

  test('uses whichever threshold occurs first', () => {
    const schedule: MaintenanceSchedule = { ...base, meter: 'calendar', dueAt: '2026-08-30', alternateMeter: 'operating-hours', alternateDueAt: 500 };
    expect(calculateScheduleStatus(schedule, { operatingHours: 501 }, new Date('2026-07-20')).state).toBe('overdue');
  });
});
