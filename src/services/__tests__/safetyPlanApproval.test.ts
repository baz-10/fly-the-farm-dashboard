import { describe, expect, it } from 'vitest';

import { makeSafetyPlan, makeSafetyPlanVersion } from '../../test/safetyPlanFixtures';
import type { SafetyPlanActor } from '../../types/safetyPlan';
import {
  acknowledgeSafetyPlan,
  approveSafetyPlan,
  canonicalSafetyPlanVersion,
  reviseSafetyPlan,
  submitSafetyPlan,
} from '../safetyPlanApproval';

const NOW = '2026-07-24T00:00:00.000Z';
const admin: SafetyPlanActor = {
  userId: 'admin-1', name: 'Admin', role: 'admin', operationalAuthority: true,
};
const authority: SafetyPlanActor = {
  userId: 'authority-1', name: 'Authority', role: 'contractor', operationalAuthority: true,
};
const pic: SafetyPlanActor = {
  userId: 'pic-1', name: 'Pilot', role: 'contractor', operationalAuthority: false,
};

function currentVersion(plan: ReturnType<typeof makeSafetyPlan>) {
  return plan.versions.find((version) => version.id === plan.currentVersionId)!;
}

describe('Safety Plan controlled lifecycle', () => {
  it('submits a complete draft without mutating its input', () => {
    const draft = makeSafetyPlan();
    const submitted = submitSafetyPlan(draft, pic, NOW);
    expect(submitted).toMatchObject({ status: 'submitted', revision: 2, updatedAt: NOW });
    expect(currentVersion(submitted)).toMatchObject({ status: 'submitted', revision: 2 });
    expect(draft.status).toBe('draft');
  });

  it('rejects submission when a required section is incomplete', () => {
    const version = makeSafetyPlanVersion({
      sections: [{
        id: 'required',
        required: true,
        fields: [{
          id: 'missing', label: 'Missing', helpText: '', type: 'text',
          required: true, companyEditable: true, value: '',
        }],
      }],
    });
    expect(() => submitSafetyPlan(
      makeSafetyPlan({ currentVersionId: version.id, versions: [version] }),
      pic,
      NOW
    )).toThrow(/required/i);
  });

  it('locks an approved snapshot and creates a digest and retention date', async () => {
    const submitted = submitSafetyPlan(makeSafetyPlan(), pic, NOW);
    const approved = await approveSafetyPlan(submitted, authority, NOW);
    const version = currentVersion(approved);
    expect(approved.status).toBe('approved');
    expect(version.contentDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(version.retentionUntil).toBe('2033-07-24T00:00:00.000Z');
    expect(Object.isFrozen(version)).toBe(true);
    expect(version.approvedBy).toEqual(authority);
  });

  it('rejects approval by a user without authority', async () => {
    const submitted = submitSafetyPlan(makeSafetyPlan(), pic, NOW);
    await expect(approveSafetyPlan(submitted, pic, NOW)).rejects.toThrow(/authority/i);
  });

  it('produces the same digest when object key insertion order differs', async () => {
    const first = submitSafetyPlan(makeSafetyPlan(), pic, NOW);
    const reordered = {
      ...first,
      versions: first.versions.map((version) => ({
        ...version,
        sourceSnapshot: {
          sourceLinks: version.sourceSnapshot.sourceLinks,
          missions: version.sourceSnapshot.missions,
          job: version.sourceSnapshot.job,
          capturedAt: version.sourceSnapshot.capturedAt,
        },
      })),
    };
    const [left, right] = await Promise.all([
      approveSafetyPlan(first, admin, NOW),
      approveSafetyPlan(reordered, admin, NOW),
    ]);
    expect(currentVersion(left).contentDigest).toBe(currentVersion(right).contentDigest);
  });

  it('excludes transient approval and UI state from canonical content', () => {
    const base = makeSafetyPlanVersion();
    const changed = {
      ...base,
      updatedAt: '2030-01-01T00:00:00.000Z',
      revision: 99,
      sourceRefreshIntent: { kind: 'source_refresh' as const },
      contentDigest: 'client-value',
      approvedAt: NOW,
      approvedBy: admin,
      retentionUntil: NOW,
    };
    expect(canonicalSafetyPlanVersion(base)).toBe(canonicalSafetyPlanVersion(changed));
  });

  it('creates a new draft instead of editing an approved version', async () => {
    const approved = await approveSafetyPlan(
      submitSafetyPlan(makeSafetyPlan(), pic, NOW),
      admin,
      NOW
    );
    const revised = reviseSafetyPlan(approved, admin, NOW);
    expect(revised.versions).toHaveLength(2);
    expect(revised.versions[0].status).toBe('approved');
    expect(revised.versions[1]).toMatchObject({ status: 'draft', version: '1.1' });
    expect(Object.isFrozen(revised.versions[1])).toBe(false);
  });

  it('supersedes the previously approved version only when the revision is approved', async () => {
    const approved = await approveSafetyPlan(
      submitSafetyPlan(makeSafetyPlan(), pic, NOW),
      admin,
      NOW
    );
    const revision = reviseSafetyPlan(approved, admin, NOW);
    expect(revision.versions[0].status).toBe('approved');
    const resubmitted = submitSafetyPlan(revision, pic, NOW);
    const nextApproved = await approveSafetyPlan(resubmitted, authority, NOW);
    expect(nextApproved.versions[0].status).toBe('superseded');
    expect(currentVersion(nextApproved).status).toBe('approved');
  });

  it('records acknowledgement but never changes mission authorisation', async () => {
    const approved = await approveSafetyPlan(
      submitSafetyPlan(makeSafetyPlan({
        versions: [makeSafetyPlanVersion({
          sourceSnapshot: {
            capturedAt: NOW,
            job: { id: 'job-1', name: 'Test job' },
            missions: [],
            crew: [{ id: pic.userId, name: pic.name, role: 'PIC' }],
            sourceLinks: [],
          },
        })],
      }), pic, NOW),
      admin,
      NOW
    );
    const result = acknowledgeSafetyPlan(approved, pic, NOW);
    expect(currentVersion(result).acknowledgements).toContainEqual(
      expect.objectContaining({
        actor: expect.objectContaining({ userId: pic.userId }),
        assignedRole: 'PIC',
      })
    );
    expect((result as { missionBlocking?: unknown }).missionBlocking).toBeUndefined();
  });

  it('rejects acknowledgement by an unassigned user and duplicate active acknowledgement', async () => {
    const version = makeSafetyPlanVersion({
      sourceSnapshot: {
        capturedAt: NOW,
        job: { id: 'job-1', name: 'Test job' },
        missions: [],
        crew: [{ id: pic.userId, name: pic.name, role: 'PIC' }],
        sourceLinks: [],
      },
    });
    const approved = await approveSafetyPlan(
      submitSafetyPlan(makeSafetyPlan({ versions: [version] }), pic, NOW),
      admin,
      NOW
    );
    expect(() => acknowledgeSafetyPlan(approved, authority, NOW)).toThrow(/assigned/i);
    const acknowledged = acknowledgeSafetyPlan(approved, pic, NOW);
    expect(() => acknowledgeSafetyPlan(acknowledged, pic, NOW)).toThrow(/already/i);
  });
});
