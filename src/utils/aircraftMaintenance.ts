import type { Aircraft } from '../types/aircraft';

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDateInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function addMonthsToDateInput(value: string, months: number): string {
  const date = parseDateInput(value);
  if (!date) return '';
  const originalDay = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(originalDay, lastDay));
  return date.toISOString().slice(0, 10);
}

export interface AircraftMaintenanceAlert {
  kind: 'inspection' | 'major-service' | 'insurance';
  status: 'overdue' | 'due-soon';
  daysRemaining: number;
  message: string;
}

export function getAircraftMaintenanceAlerts(
  aircraft: Aircraft,
  now = new Date(),
  warningDays = 30,
): AircraftMaintenanceAlert[] {
  const checks: Array<{ kind: AircraftMaintenanceAlert['kind']; label: string; value: string }> = [
    { kind: 'inspection', label: 'Inspection', value: aircraft.maintenanceDates.nextInspectionDue },
    { kind: 'major-service', label: 'Major inspection', value: aircraft.maintenanceDates.nextMajorServiceDue },
    { kind: 'insurance', label: 'Insurance', value: aircraft.insurance.expiryDate },
  ];

  return checks.flatMap(({ kind, label, value }) => {
    const due = new Date(value);
    if (Number.isNaN(due.getTime())) return [];
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const dueDay = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
    const daysRemaining = Math.round((dueDay - today) / DAY_MS);
    if (daysRemaining > warningDays) return [];
    return [{
      kind,
      status: daysRemaining < 0 ? 'overdue' : 'due-soon',
      daysRemaining,
      message: daysRemaining < 0
        ? `${label} overdue by ${Math.abs(daysRemaining)} day${Math.abs(daysRemaining) === 1 ? '' : 's'}`
        : `${label} due in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`,
    }];
  });
}
