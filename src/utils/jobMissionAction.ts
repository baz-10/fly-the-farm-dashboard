export interface JobMissionSummary {
  id: string;
  jobId: string;
  status: string;
}

export type JobMissionDestination = 'create' | 'mission' | 'register';

export interface JobMissionAction {
  summary: string;
  label: 'Create Mission' | 'Continue Mission' | 'Open Mission' | 'Open Missions' | 'Mission History';
  destination: JobMissionDestination;
  missionId?: string;
}

const normalized = (status: string) => status.trim().toLowerCase();
const isDraft = (status: string) => ['planning', 'draft'].includes(normalized(status));
const isCompleted = (status: string) => ['completed', 'locked'].includes(normalized(status));

export function deriveJobMissionAction(jobId: string, missions: JobMissionSummary[]): JobMissionAction {
  const linked = missions.filter((mission) => mission.jobId === jobId);
  if (linked.length === 0) return { summary: 'No Missions yet', label: 'Create Mission', destination: 'create' };

  if (linked.length === 1) {
    const [mission] = linked;
    if (isCompleted(mission.status)) return { summary: 'Mission completed', label: 'Mission History', destination: 'register' };
    if (isDraft(mission.status)) return { summary: '1 Draft Mission', label: 'Continue Mission', destination: 'mission', missionId: mission.id };
    return { summary: '1 Active Mission', label: 'Open Mission', destination: 'mission', missionId: mission.id };
  }

  if (linked.every((mission) => isCompleted(mission.status))) {
    return { summary: 'Mission completed', label: 'Mission History', destination: 'register' };
  }
  const allActive = linked.every((mission) => !isCompleted(mission.status));
  return { summary: allActive ? `${linked.length} Active Missions` : `${linked.length} Missions`, label: 'Open Missions', destination: 'register' };
}
