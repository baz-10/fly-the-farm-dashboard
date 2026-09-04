export type MissionPackageState = 'PREPARING' | 'AWAITING_CRP_APPROVAL' | 'AUTHORISED' | 'REJECTED';

export interface MissionPackageRevision {
  id: string;
  missionId: string;
  revisionNumber: number;
  fieldIds: string[];
  jsaRevisionId: string;
  evidenceDigest: string;
  state: MissionPackageState;
  createdAt: string;
}

export interface CrpDecision {
  id: string;
  packageRevisionId: string;
  decision: 'AUTHORISED' | 'REJECTED';
  decidedByInternalUserId: string;
  decidedAt: string;
  declaration: string;
}

export interface MissionPackageHistory {
  missionId: string;
  currentRevision: number;
  packages: MissionPackageRevision[];
  decisions: CrpDecision[];
}
