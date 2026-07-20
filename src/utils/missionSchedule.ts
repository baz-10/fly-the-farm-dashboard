import { addDays, endOfDay, endOfMonth, startOfDay, startOfMonth, startOfWeek } from 'date-fns';
import { MissionRecord } from '../types/mission';

export type CalendarView = 'day' | 'week' | 'month';

export interface MissionDayGroup {
  dateKey: string;
  date: Date;
  missions: MissionRecord[];
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getOperationalWeek(anchor: Date): Date[] {
  const start = startOfDay(anchor);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function groupMissionsByLocalDate(missions: MissionRecord[], dates: Date[]): MissionDayGroup[] {
  const allowed = new Map(dates.map((date) => [localDateKey(date), startOfDay(date)]));
  const grouped = new Map<string, MissionRecord[]>();

  missions.forEach((mission) => {
    if (!mission.scheduledDate) return;
    const scheduled = new Date(mission.scheduledDate);
    if (Number.isNaN(scheduled.getTime())) return;
    const key = localDateKey(scheduled);
    if (!allowed.has(key)) return;
    grouped.set(key, [...(grouped.get(key) || []), mission]);
  });

  return dates.flatMap((date) => {
    const dateKey = localDateKey(date);
    const items = grouped.get(dateKey);
    if (!items?.length) return [];
    return [{ dateKey, date: allowed.get(dateKey)!, missions: [...items].sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate)) }];
  });
}

export function getCalendarRange(view: CalendarView, anchor: Date): { start: Date; end: Date } {
  if (view === 'day') return { start: startOfDay(anchor), end: endOfDay(anchor) };
  if (view === 'month') return { start: startOfMonth(anchor), end: endOfMonth(anchor) };
  const start = startOfWeek(anchor, { weekStartsOn: 1 });
  return { start, end: endOfDay(addDays(start, 6)) };
}
