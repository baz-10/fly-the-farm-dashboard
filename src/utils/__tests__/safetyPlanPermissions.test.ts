import { describe, expect, it } from 'vitest';
import type { User } from '../../contexts/AuthContext';
import { makeSafetyPlan, makeSafetyPlanVersion } from '../../test/safetyPlanFixtures';
import {
  canApproveSafetyPlan,
  canDeleteSafetyPlan,
  canEditSafetyPlan,
  isSafetyPlanAuthority,
} from '../safetyPlanPermissions';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'user@example.com',
    name: 'Test user',
    role: 'contractor',
    tenantId: 'tenant-1',
    tier: 'free',
    safetyPlanAuthority: false,
    ...overrides,
  };
}

describe('Safety Plan permissions', () => {
  it.each([
    [{ role: 'admin', safetyPlanAuthority: false }, true],
    [{ role: 'contractor', safetyPlanAuthority: true }, true],
    [{ role: 'contractor', safetyPlanAuthority: false }, false],
    [{ role: 'client', safetyPlanAuthority: true }, false],
  ])('approver decision for %o is %s', (overrides, expected) => {
    expect(canApproveSafetyPlan(makeUser(overrides as Partial<User>))).toBe(expected);
  });

  it('treats only administrators and nominated contractors as authorities', () => {
    expect(isSafetyPlanAuthority(makeUser({ role: 'admin' }))).toBe(true);
    expect(isSafetyPlanAuthority(makeUser({ safetyPlanAuthority: true }))).toBe(true);
    expect(isSafetyPlanAuthority(makeUser())).toBe(false);
    expect(isSafetyPlanAuthority(makeUser({ role: 'client', safetyPlanAuthority: true }))).toBe(false);
    expect(isSafetyPlanAuthority(null)).toBe(false);
  });

  it('allows tenant operators to edit drafts but not locked workflow states', () => {
    const admin = makeUser({ role: 'admin' });
    const contractor = makeUser();
    const draft = makeSafetyPlan();

    expect(canEditSafetyPlan(admin, draft)).toBe(true);
    expect(canEditSafetyPlan(contractor, draft)).toBe(true);
    expect(canEditSafetyPlan(makeUser({ role: 'client' }), draft)).toBe(false);
    expect(canEditSafetyPlan(admin, makeSafetyPlan({ status: 'submitted' }))).toBe(false);
    expect(canEditSafetyPlan(admin, makeSafetyPlan({ status: 'approved' }))).toBe(false);
    expect(canEditSafetyPlan(admin, makeSafetyPlan({ status: 'superseded' }))).toBe(false);
  });

  it('permits only administrators to delete a draft version', () => {
    const draft = makeSafetyPlanVersion({ status: 'draft' });

    expect(canDeleteSafetyPlan(makeUser({ role: 'admin' }), draft)).toBe(true);
    expect(canDeleteSafetyPlan(makeUser({ role: 'contractor', safetyPlanAuthority: true }), draft)).toBe(false);
    expect(canDeleteSafetyPlan(makeUser({ role: 'client' }), draft)).toBe(false);
  });

  it('never permits an approved or superseded version to be deleted', () => {
    const admin = makeUser({ role: 'admin' });

    expect(canDeleteSafetyPlan(admin, makeSafetyPlanVersion({ status: 'approved' }))).toBe(false);
    expect(canDeleteSafetyPlan(admin, makeSafetyPlanVersion({ status: 'superseded' }))).toBe(false);
  });
});
