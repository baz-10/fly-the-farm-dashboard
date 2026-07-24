import { describe, expect, it } from 'vitest';

import { makeSafetyPlan, makeSafetyPlanVersion } from '../test/safetyPlanFixtures';
import { approvedVersionForExport, selectJobSafetyPlanForJob } from './JobDetail';

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
});
