import { JSARecord } from '../types/mission';
import { MissionWorkPackDraft } from '../types/workPack';

function effectivePrimary(draft: MissionWorkPackDraft | undefined): string {
  const assignment = draft?.aircraftAssignments?.find((item) => item.aircraftId && item.kitId);
  return assignment ? `${assignment.aircraftId}\u0000${assignment.kitId}` : '';
}

export function reopenApprovedJSA(jsa: JSARecord): JSARecord {
  if (jsa.status !== 'approved') return jsa;
  return {
    ...jsa,
    status: 'in-progress',
    reviewedBy: undefined,
    completedDate: undefined,
    reviewedDate: undefined,
    signOffs: { pilot: { userId: 'current_user', signature: '', signedAt: '' } },
    updatedAt: new Date().toISOString(),
  };
}

export function reopenJSAForWorkPackChange(
  jsa: JSARecord,
  previous: MissionWorkPackDraft | undefined,
  next: MissionWorkPackDraft | undefined,
): JSARecord {
  return effectivePrimary(previous) !== effectivePrimary(next) ? reopenApprovedJSA(jsa) : jsa;
}
