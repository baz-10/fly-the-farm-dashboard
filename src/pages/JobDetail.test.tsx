import { describe, expect, it } from 'vitest';

import { makeSafetyPlan, makeSafetyPlanVersion } from '../test/safetyPlanFixtures';
import type { MissionRecord } from '../types/mission';
import {
  approvedVersionForExport,
  assignedPicCrew,
  canActorAcknowledgeVersion,
  selectJobSafetyPlanForJob,
} from './JobDetail';

describe('JobDetail Safety Plan boundary', () => {
  it('associates a Safety Plan strictly by exact jobId', () => {
    const similarlyNamed = makeSafetyPlan({ id: 'plan-10', jobId: 'job-10' });
    const exact = makeSafetyPlan({ id: 'plan-1', jobId: 'job-1' });
    expect(selectJobSafetyPlanForJob([similarlyNamed, exact], 'job-1')).toBe(exact);
  });

  it('exports only the immutable approved current version', () => {
    const draft = makeSafetyPlanVersion({ id: 'draft', status: 'draft' });
    const approved = makeSafetyPlanVersion({
      id: 'approved',
      status: 'approved',
      approvedAt: '2026-07-24T01:00:00.000Z',
      contentDigest: 'digest',
    });
    const plan = makeSafetyPlan({
      status: 'approved',
      currentVersionId: approved.id,
      versions: [draft, approved],
    });
    expect(approvedVersionForExport(plan)).toBe(approved);
    expect(() => approvedVersionForExport(makeSafetyPlan())).toThrow(/approved immutable/i);
  });

  it('snapshots the assigned PIC and mirrors acknowledgement eligibility', () => {
    const actor = {
      userId: 'pilot-1',
      name: 'Pilot One',
      role: 'contractor' as const,
      operationalAuthority: false,
    };
    const mission = {
      id: 'mission-1',
      jobId: 'job-1',
      jsaRecord: {
        signOffs: { pilot: { userId: 'pilot-1', signature: '', signedAt: '' } },
      },
    } as unknown as MissionRecord;
    expect(assignedPicCrew([mission], 'job-1', actor)).toEqual([
      { id: 'pilot-1', name: 'Pilot One', role: 'PIC' },
    ]);

    const version = makeSafetyPlanVersion({
      status: 'approved',
      sourceSnapshot: {
        ...makeSafetyPlanVersion().sourceSnapshot,
        crew: [{ id: 'pilot-1', name: 'Pilot One', role: 'PIC' }],
      },
    });
    expect(canActorAcknowledgeVersion(version, actor)).toBe(true);
    expect(canActorAcknowledgeVersion({
      ...version,
      acknowledgements: [{
        id: 'ack-1',
        versionId: version.id,
        actor,
        assignedRole: 'PIC',
        statement: 'Read',
        acknowledgedAt: '2026-07-24T02:00:00.000Z',
      }],
    }, actor)).toBe(false);
  });

  it('does not fabricate the plan creator as PIC and includes real VO and CRP assignments', () => {
    const admin = {
      userId: 'admin-creator',
      name: 'Admin Creator',
      role: 'admin' as const,
      operationalAuthority: true,
    };
    expect(assignedPicCrew([], 'job-1', admin)).toEqual([]);

    const mission = {
      id: 'mission-1',
      jobId: 'job-1',
      jsaRecord: {
        signOffs: {
          pilot: { userId: 'pilot-1' },
          crp: { userId: 'crp-1' },
        },
      },
      flightExecution: {
        crew: {
          pilot: { userId: 'pilot-1' },
          visualObserver: { userId: 'vo-1' },
          crp: { userId: 'crp-1' },
        },
      },
    } as unknown as MissionRecord;
    expect(assignedPicCrew([mission], 'job-1', admin)).toEqual([
      { id: 'crp-1', name: 'Assigned crew crp-1', role: 'CRP' },
      { id: 'pilot-1', name: 'Assigned crew pilot-1', role: 'PIC' },
      { id: 'vo-1', name: 'Assigned crew vo-1', role: 'Visual observer' },
    ]);

    const version = makeSafetyPlanVersion({
      status: 'approved',
      sourceSnapshot: {
        ...makeSafetyPlanVersion().sourceSnapshot,
        crew: assignedPicCrew([mission], 'job-1', admin),
      },
    });
    expect(canActorAcknowledgeVersion(version, admin)).toBe(false);
    expect(canActorAcknowledgeVersion(version, {
      userId: 'vo-1',
      name: 'Observer',
      role: 'contractor',
      operationalAuthority: false,
    })).toBe(true);
    expect(canActorAcknowledgeVersion(version, {
      userId: 'crp-1',
      name: 'CRP',
      role: 'contractor',
      operationalAuthority: true,
    })).toBe(true);
  });
});
