import { MissionRecord, MissionStatus } from '../types/mission';

export type MissionRegisterSectionKey = 'in-progress' | 'authorised' | 'planning' | 'completed';

export interface MissionRegisterSectionDefinition {
  key: MissionRegisterSectionKey;
  label: string;
  description: string;
  color: string;
  statuses: MissionStatus[];
}

export const MISSION_REGISTER_SECTIONS: MissionRegisterSectionDefinition[] = [
  { key: 'in-progress', label: 'In Progress', description: 'Flights currently underway', color: '#2e7d32', statuses: ['Flying'] },
  { key: 'authorised', label: 'Authorised', description: 'Approved missions ready to commence', color: '#1565c0', statuses: ['Approved'] },
  { key: 'planning', label: 'Planning', description: 'Missions still being prepared or reviewed', color: '#d4860a', statuses: ['Planning'] },
  { key: 'completed', label: 'Completed', description: 'Finished and locked mission records', color: '#65746b', statuses: ['Completed', 'Locked'] },
];

function matchesMissionQuery(mission: MissionRecord, query: string) {
  if (!query) return true;
  return [mission.missionName, mission.missionNumber, mission.location?.name, mission.location?.address]
    .some((value) => value?.toLowerCase().includes(query));
}

export function groupMissionsForRegister(missions: MissionRecord[], search: string) {
  const query = search.trim().toLowerCase();
  return MISSION_REGISTER_SECTIONS.map((section) => ({
    ...section,
    missions: missions
      .filter((mission) => section.statuses.includes(mission.status))
      .filter((mission) => matchesMissionQuery(mission, query))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
  }));
}

export function getMissionNextAction(mission: MissionRecord) {
  if (mission.status === 'Flying') return 'Record flight progress or completion';
  if (mission.status === 'Approved') return 'Ready to commence flight';
  if (mission.status === 'Planning') return 'Continue mission planning';
  return 'Review completed mission';
}
