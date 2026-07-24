import { describe, expect, it } from 'vitest';
import {
  canSubmitPlan,
  getPlanAttention,
  getRetentionUntil,
  nextPlanVersion,
} from '../safetyPlanRules';
import { AU_REOC_SAFETY_PLAN_STANDARD, SAFETY_PLAN_NOTICE } from '../../data/safetyPlanStandard';
import { makeSafetyPlan } from '../../test/safetyPlanFixtures';

describe('Safety Plan rules', () => {
  it('does not treat an absent plan or acknowledgement as a mission blocker', () => {
    expect(getPlanAttention(makeSafetyPlan({ acknowledgements: [] }))).toContainEqual(
      expect.objectContaining({ code: 'crew_acknowledgement', blocking: false })
    );
  });

  it('blocks only plan submission when a template-required field is empty', () => {
    const plan = makeSafetyPlan({ sections: [{ id: 'scope', required: true, fields: [] }] });
    expect(canSubmitPlan(plan)).toEqual({
      ok: false,
      missing: ['scope'],
    });
  });

  it('retains approved records for at least seven years', () => {
    expect(getRetentionUntil('2026-07-24T00:00:00.000Z')).toBe('2033-07-24T00:00:00.000Z');
  });

  it('increments controlled versions without mutating the approved version', () => {
    expect(nextPlanVersion('3.2')).toBe('3.3');
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
