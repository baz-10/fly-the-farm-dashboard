import type { MissionAuditEntry, MissionPlanningChemical, MissionRecord } from '../types/mission';

export interface MissionReadinessSummary {
  total: number;
  ready: number;
  attention: number;
  blocked: number;
}

export type ChemicalAllocation = MissionPlanningChemical;

function localDateKey(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function getTodaysSprayMissions(missions: MissionRecord[], now = new Date()): MissionRecord[] {
  const today = localDateKey(now);
  return missions
    .filter((mission) => mission.missionType === 'spray' && localDateKey(mission.scheduledDate) === today)
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
}

export function getMissionReadiness(missions: MissionRecord[]): MissionReadinessSummary {
  const active = missions.filter((mission) => !['Completed', 'Locked'].includes(mission.status));
  return active.reduce<MissionReadinessSummary>((summary, mission) => {
    summary.total += 1;
    if (mission.status === 'Approved' || mission.status === 'Flying') {
      summary.ready += 1;
    } else if (mission.jsaRecord?.status === 'approved') {
      summary.attention += 1;
    } else {
      summary.blocked += 1;
    }
    return summary;
  }, { total: 0, ready: 0, attention: 0, blocked: 0 });
}

export function getTodaysChemicalAllocations(missions: MissionRecord[], now = new Date()): ChemicalAllocation[] {
  const totals = new Map<string, ChemicalAllocation>();
  getTodaysSprayMissions(missions, now).forEach((mission) => {
    mission.planningState?.chemicals?.forEach((chemical) => {
      const product = chemical.product.trim();
      if (!product || chemical.totalRequired <= 0) return;
      const key = `${product.toLocaleLowerCase()}::${chemical.unit}`;
      const existing = totals.get(key);
      if (existing) {
        existing.totalRequired += chemical.totalRequired;
      } else {
        totals.set(key, { ...chemical, product });
      }
    });
  });
  return Array.from(totals.values()).sort((a, b) => b.totalRequired - a.totalRequired);
}

export function getMissionActivity(
  missions: MissionRecord[],
  limit = 4,
): Array<{ mission: MissionRecord; entry: MissionAuditEntry }> {
  return missions
    .flatMap((mission) => (mission.auditTrail || []).map((entry) => ({ mission, entry })))
    .sort((a, b) => b.entry.timestamp.localeCompare(a.entry.timestamp))
    .slice(0, limit);
}
