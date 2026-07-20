import { MaintenanceReadings, MaintenanceSchedule, ScheduleMeter, ScheduleStatus } from '../types/maintenance';

function meterValue(meter: ScheduleMeter, dueAt: string | number, readings: MaintenanceReadings, now: Date) {
  if (meter === 'calendar') return { current: now.getTime(), due: new Date(String(dueAt) + (String(dueAt).includes('T') ? '' : 'T23:59:59')).getTime(), unit: 'days' };
  const key: Record<Exclude<ScheduleMeter, 'calendar'>, keyof MaintenanceReadings> = { 'flight-hours': 'flightHours', 'component-hours': 'componentHours', cycles: 'cycles', kilometres: 'kilometres', 'operating-hours': 'operatingHours' };
  return { current: Number(readings[key[meter]] || 0), due: Number(dueAt), unit: meter };
}

function singleStatus(meter: ScheduleMeter, dueAt: string | number, warning: number, readings: MaintenanceReadings, now: Date): ScheduleStatus {
  const values = meterValue(meter, dueAt, readings, now);
  const rawRemaining = values.due - values.current;
  const remaining = meter === 'calendar' ? Math.ceil(rawRemaining / 86400000) : rawRemaining;
  const state = rawRemaining < 0 ? 'overdue' : remaining === 0 ? 'due' : remaining <= warning ? 'due-soon' : 'current';
  return { state, remaining, dueLabel: meter === 'calendar' ? String(dueAt) : `${dueAt} ${values.unit}` };
}

const severity = { current: 0, 'due-soon': 1, due: 2, overdue: 3 } as const;
export function calculateScheduleStatus(schedule: MaintenanceSchedule, readings: MaintenanceReadings, now = new Date()): ScheduleStatus {
  const primary = singleStatus(schedule.meter, schedule.dueAt, schedule.dueSoonBy, readings, now);
  if (!schedule.alternateMeter || schedule.alternateDueAt === undefined) return primary;
  const alternate = singleStatus(schedule.alternateMeter, schedule.alternateDueAt, schedule.dueSoonBy, readings, now);
  return severity[alternate.state] > severity[primary.state] ? alternate : primary;
}
