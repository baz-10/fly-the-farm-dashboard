import type { MissionAuditEntry, MissionPlanningChemical, MissionRecord } from '../types/mission';

export interface MissionReadinessSummary {
  total: number;
  ready: number;
  attention: number;
  blocked: number;
}

export type ChemicalAllocation = MissionPlanningChemical;

export interface MissionNextAction {
  kind: 'complete-jsa' | 'authorize-mission' | 'generate-flight-plan' | 'authorize-flight' | 'start-flight' | 'record-completion' | 'complete-mission';
  label: string;
  detail: string;
  action: string;
}

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

export function getMissionNextAction(mission: MissionRecord): MissionNextAction {
  if (mission.status === 'Planning' && mission.jsaRecord?.status !== 'approved') {
    return {
      kind: 'complete-jsa',
      label: 'Complete JSA',
      detail: `${mission.missionName} needs safety sign-off`,
      action: 'Review',
    };
  }
  if (mission.status === 'Planning') {
    return {
      kind: 'authorize-mission',
      label: 'Authorize Mission',
      detail: `${mission.missionName} is ready for approval review`,
      action: 'Review',
    };
  }
  if (mission.status === 'Approved' && !mission.flightPlan) {
    return {
      kind: 'generate-flight-plan',
      label: 'Generate Flight Plan',
      detail: `${mission.missionName} is approved without a flight plan`,
      action: 'Plan',
    };
  }
  if (mission.status === 'Approved' && !mission.approvals.flyingAuthorization) {
    return {
      kind: 'authorize-flight',
      label: 'Authorize Flight',
      detail: `${mission.missionName} needs CRP flight authorisation`,
      action: 'Review',
    };
  }
  if (mission.status === 'Approved') {
    return {
      kind: 'start-flight',
      label: 'Start Flight',
      detail: `${mission.missionName} is authorised and ready to start`,
      action: 'Open',
    };
  }
  if (mission.flightExecution) {
    return {
      kind: 'complete-mission',
      label: 'Complete Mission',
      detail: `${mission.missionName} has flight results ready for completion`,
      action: 'Open',
    };
  }
  return {
    kind: 'record-completion',
    label: 'Record Completion',
    detail: `${mission.missionName} is in flight`,
    action: 'Open',
  };
}
