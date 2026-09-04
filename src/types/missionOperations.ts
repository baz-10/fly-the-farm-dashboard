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

export type MissionOperatingDayState = 'DRAFT' | 'READY' | 'IN_PROGRESS' | 'COMPLETED' | 'SIGNED_OFF';
export type MissionJsaDayReviewOutcome = 'CONDITIONS_COVERED' | 'CHANGE_DECLARED';
export type MissionFieldActivityStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'NOT_WORKED';

export interface MissionJsaDayReview {
  id: string;
  operatingDayId: string;
  missionId: string;
  jsaRevisionId: string;
  outcome: MissionJsaDayReviewOutcome;
  notes: string | null;
  reviewedByInternalUserId: string;
  reviewedAt: string;
}

export interface MissionFieldActivity {
  id: string;
  operatingDayId: string;
  missionId: string;
  fieldId: string;
  hectaresAttempted: string | null;
  hectaresCompleted: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  status: MissionFieldActivityStatus;
  notes: string | null;
  rowVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface MissionOperatingDay {
  id: string;
  missionId: string;
  workDate: string;
  timezone: string;
  packageRevisionId: string;
  jsaRevisionId: string;
  state: MissionOperatingDayState;
  actualStartedAt: string | null;
  actualFinishedAt: string | null;
  notes: string | null;
  rowVersion: number;
  createdAt: string;
  updatedAt: string;
  jsaReview: MissionJsaDayReview | null;
  fieldActivities: MissionFieldActivity[];
}

export interface MissionOperatingDays {
  missionId: string;
  days: MissionOperatingDay[];
}

export interface MissionFieldActivityInput {
  fieldId: string;
  hectaresAttempted: string | null;
  hectaresCompleted: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  status: MissionFieldActivityStatus;
  notes: string | null;
}
