import { describe, expect, it } from 'vitest';
import {
  canSubmitPlan,
  getPlanAttention,
  getRetentionUntil,
  nextPlanVersion,
} from '../safetyPlanRules';
import { AU_REOC_SAFETY_PLAN_STANDARD, SAFETY_PLAN_NOTICE } from '../../data/safetyPlanStandard';
import { makeSafetyPlan, makeSafetyPlanVersion } from '../../test/safetyPlanFixtures';

describe('Safety Plan rules', () => {
  it('does not treat an absent plan or acknowledgement as a mission blocker', () => {
    expect(getPlanAttention(makeSafetyPlan())).toContainEqual(
      expect.objectContaining({ code: 'crew_acknowledgement', blocking: false })
    );
  });

  it('blocks only plan submission when a template-required field is empty', () => {
    const version = makeSafetyPlanVersion({ sections: [{ id: 'scope', required: true, fields: [] }] });
    const plan = makeSafetyPlan({ versions: [version], currentVersionId: version.id });
    expect(canSubmitPlan(plan)).toEqual({
      ok: false,
      missing: ['scope'],
    });
  });

  it('retains approved records for at least seven years', () => {
    expect(getRetentionUntil('2026-07-24T00:00:00.000Z')).toBe('2033-07-24T00:00:00.000Z');
  });

  it('rejects non-canonical or invalid UTC approval timestamps', () => {
    expect(() => getRetentionUntil('2026-02-30T00:00:00.000Z')).toThrow();
    expect(() => getRetentionUntil('July 24 2026')).toThrow();
    expect(() => getRetentionUntil('2026-07-24T00:00:00.000+10:00')).toThrow();
  });

  it('increments controlled versions without mutating the approved version', () => {
    expect(nextPlanVersion('3.2')).toBe('3.3');
  });

  it('rejects ambiguous, unsafe and overflowing controlled version components', () => {
    expect(() => nextPlanVersion('01.2')).toThrow();
    expect(() => nextPlanVersion('1.9007199254740992')).toThrow();
    expect(() => nextPlanVersion(`1.${'9'.repeat(400)}`)).toThrow();
  });

  it('treats only active acknowledgements on the current version as current', () => {
    const withdrawnVersion = makeSafetyPlanVersion({
      acknowledgements: [{
        id: 'withdrawn-acknowledgement',
        versionId: 'safety-plan-version-1',
        actor: { userId: 'crew-1', name: 'Crew member', role: 'contractor', operationalAuthority: false },
        assignedRole: 'observer',
        statement: 'Read and acknowledged.',
        acknowledgedAt: '2026-07-24T00:00:00.000Z',
        withdrawnAt: '2026-07-24T01:00:00.000Z',
      }],
    });
    const activeVersion = makeSafetyPlanVersion({
      acknowledgements: [{
        id: 'active-acknowledgement',
        versionId: 'safety-plan-version-1',
        actor: { userId: 'crew-1', name: 'Crew member', role: 'contractor', operationalAuthority: false },
        assignedRole: 'observer',
        statement: 'Read and acknowledged.',
        acknowledgedAt: '2026-07-24T00:00:00.000Z',
      }],
    });
    const replacedVersion = makeSafetyPlanVersion({
      acknowledgements: [{
        id: 'replaced-acknowledgement',
        versionId: 'safety-plan-version-1',
        actor: { userId: 'crew-1', name: 'Crew member', role: 'contractor', operationalAuthority: false },
        assignedRole: 'observer',
        statement: 'Read and acknowledged.',
        acknowledgedAt: '2026-07-24T00:00:00.000Z',
        replacementAcknowledgementId: 'active-acknowledgement',
      }],
    });

    expect(getPlanAttention(makeSafetyPlan({ versions: [withdrawnVersion], currentVersionId: withdrawnVersion.id })))
      .toContainEqual(expect.objectContaining({ code: 'crew_acknowledgement', blocking: false }));
    expect(getPlanAttention(makeSafetyPlan({ versions: [activeVersion], currentVersionId: activeVersion.id })))
      .not.toContainEqual(expect.objectContaining({ code: 'crew_acknowledgement' }));
    expect(getPlanAttention(makeSafetyPlan({ versions: [replacedVersion], currentVersionId: replacedVersion.id })))
      .toContainEqual(expect.objectContaining({ code: 'crew_acknowledgement', blocking: false }));
  });

  it('rejects plans without the explicitly selected current version', () => {
    expect(canSubmitPlan(makeSafetyPlan({ versions: [], currentVersionId: undefined }))).toEqual({
      ok: false,
      missing: ['current_version'],
      reason: 'current_version_missing',
    });
    expect(canSubmitPlan(makeSafetyPlan({ currentVersionId: 'stale-version-id' }))).toEqual({
      ok: false,
      missing: ['current_version'],
      reason: 'current_version_missing',
    });
  });

  it('records not-required selection provenance and audit action', () => {
    const actor = { userId: 'admin-1', name: 'Administrator', role: 'admin' as const, operationalAuthority: true };
    const plan = makeSafetyPlan({
      status: 'not_required',
      notRequiredReason: 'No operational work is currently planned.',
      notRequiredActor: actor,
      notRequiredSelectedAt: '2026-07-24T00:00:00.000Z',
    });

    expect(plan).toMatchObject({
      notRequiredReason: 'No operational work is currently planned.',
      notRequiredActor: actor,
      notRequiredSelectedAt: '2026-07-24T00:00:00.000Z',
    });
    const action: import('../../types/safetyPlan').SafetyPlanAuditEvent['action'] = 'not_required_selected';
    expect(action).toBe('not_required_selected');
  });

  it('provides the frozen 14-section CASA/ReOC-aligned standard', () => {
    expect(AU_REOC_SAFETY_PLAN_STANDARD).toMatchObject({
      version: 'AU-REOC-1.0',
      jurisdiction: 'AU',
      notice: SAFETY_PLAN_NOTICE,
    });
    expect(AU_REOC_SAFETY_PLAN_STANDARD.sections).toHaveLength(14);
    expect(Object.isFrozen(AU_REOC_SAFETY_PLAN_STANDARD)).toBe(true);
  });
});
