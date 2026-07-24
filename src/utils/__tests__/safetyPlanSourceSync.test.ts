import { describe, expect, it } from 'vitest';

import { makeSafetyPlanVersion } from '../../test/safetyPlanFixtures';
import type {
  SafetyPlanSourceItem,
  SafetyPlanSourceSnapshot,
} from '../../types/safetyPlan';
import {
  applySourceRefresh,
  diffSafetyPlanSources,
} from '../safetyPlanSourceSync';

function item(
  sourceItemId: string,
  value: string,
  sourceUpdatedAt = '2026-07-24T00:00:00.000Z',
  overrides: Partial<SafetyPlanSourceItem> = {}
): SafetyPlanSourceItem {
  return {
    id: `jsa:mission-1:${sourceItemId}`,
    sourceType: 'jsa',
    sourceId: 'mission-1',
    sourceItemId,
    sourceUpdatedAt,
    label: sourceItemId,
    value,
    companyValue: value,
    ...overrides,
  };
}

function snapshot(hazards: SafetyPlanSourceItem[]): SafetyPlanSourceSnapshot {
  return {
    capturedAt: '2026-07-24T00:00:00.000Z',
    job: { id: 'job-1', name: 'Job 1' },
    missions: [],
    sourceLinks: [],
    hazards,
  };
}

describe('Safety Plan source synchronisation', () => {
  it('classifies added, changed, removed and unchanged items by source identity and timestamp', () => {
    const current = snapshot([
      item('unchanged', 'Same'),
      item('changed', 'Old'),
      item('removed', 'Gone'),
    ]);
    const latest = snapshot([
      item('unchanged', 'Same'),
      item('changed', 'New', '2026-07-25T00:00:00.000Z'),
      item('added', 'Added'),
    ]);

    const diff = diffSafetyPlanSources(current, latest);

    expect(diff.added.map(({ sourceItemId }) => sourceItemId)).toEqual(['added']);
    expect(diff.changed.map(({ latest }) => latest.sourceItemId)).toEqual(['changed']);
    expect(diff.removed.map(({ sourceItemId }) => sourceItemId)).toEqual(['removed']);
    expect(diff.unchanged.map(({ sourceItemId }) => sourceItemId)).toEqual(['unchanged']);
  });

  it('does not overwrite a company-authored control during refresh', () => {
    const currentItem = item('risk-1', 'Source control', undefined, {
      companyValue: 'Company spotter remains at western gate',
    });
    const latestItem = item('risk-1', 'Changed source control', '2026-07-25T00:00:00.000Z');
    const version = makeSafetyPlanVersion({
      sourceSnapshot: snapshot([currentItem]),
      sections: [{
        id: 'consolidated_jsa_hazards_controls',
        required: true,
        fields: [{
          id: currentItem.id,
          label: 'risk-1',
          helpText: '',
          type: 'textarea',
          required: false,
          companyEditable: true,
          value: 'Company spotter remains at western gate',
        }],
      }],
    });
    const diff = diffSafetyPlanSources(version.sourceSnapshot, snapshot([latestItem]));

    const refreshed = applySourceRefresh(version, diff, [
      { itemId: currentItem.id, action: 'keep_company_value' },
    ], {
      actor: { userId: 'admin-1', name: 'Admin', role: 'admin', operationalAuthority: true },
      now: '2026-07-25T01:00:00.000Z',
    });

    expect(refreshed.sections[0].fields).toContainEqual(
      expect.objectContaining({ id: currentItem.id, value: 'Company spotter remains at western gate' })
    );
    expect(refreshed.sourceSnapshot.hazards?.[0]).toMatchObject({
      value: 'Changed source control',
      companyValue: 'Company spotter remains at western gate',
    });
  });

  it('requires an explicit decision for every changed and removed item', () => {
    const current = snapshot([item('changed', 'Old'), item('removed', 'Old')]);
    const latest = snapshot([item('changed', 'New', '2026-07-25T00:00:00.000Z')]);
    const diff = diffSafetyPlanSources(current, latest);

    expect(() => applySourceRefresh(
      makeSafetyPlanVersion({ sourceSnapshot: current }),
      diff,
      [{ itemId: item('changed', '').id, action: 'accept_source_value' }],
      {
        actor: { userId: 'admin-1', name: 'Admin', role: 'admin', operationalAuthority: true },
        now: '2026-07-25T01:00:00.000Z',
      }
    )).toThrow(/explicit decision/i);
  });

  it('records source-refreshed audit metadata without mutating the input version', () => {
    const current = snapshot([item('changed', 'Old')]);
    const latest = snapshot([item('changed', 'New', '2026-07-25T00:00:00.000Z')]);
    const version = makeSafetyPlanVersion({ sourceSnapshot: current, revision: 4 });
    const diff = diffSafetyPlanSources(current, latest);

    const refreshed = applySourceRefresh(
      version,
      diff,
      [{ itemId: item('changed', '').id, action: 'accept_source_value' }],
      {
        actor: { userId: 'admin-1', name: 'Admin', role: 'admin', operationalAuthority: true },
        now: '2026-07-25T01:00:00.000Z',
      }
    );

    expect(refreshed).not.toBe(version);
    expect(version.revision).toBe(4);
    expect(refreshed).toMatchObject({
      revision: 5,
      updatedAt: '2026-07-25T01:00:00.000Z',
      sourceRefreshAudit: {
        action: 'source_refreshed',
        occurredAt: '2026-07-25T01:00:00.000Z',
        actor: expect.objectContaining({ userId: 'admin-1' }),
      },
    });
  });

  it('adds a field for a newly imported source item', () => {
    const current = snapshot([]);
    const added = item('new-risk', 'Set a 30 m exclusion zone');
    const diff = diffSafetyPlanSources(current, snapshot([added]));
    const version = makeSafetyPlanVersion({ sourceSnapshot: current });

    const refreshed = applySourceRefresh(version, diff, [], {
      actor: { userId: 'admin-1', name: 'Admin', role: 'admin', operationalAuthority: true },
      now: '2026-07-25T01:00:00.000Z',
    });

    expect(
      refreshed.sections
        .find(({ id }) => id === 'consolidated_jsa_hazards_controls')
        ?.fields
    ).toContainEqual(expect.objectContaining({
      id: added.id,
      value: 'Set a 30 m exclusion zone',
    }));
  });

  it('accepts the latest source control rather than copying the hazard description', () => {
    const currentItem = item('hazard-1', 'Overhead power lines', undefined, {
      companyValue: 'Old source control',
    });
    const latestItem = item('hazard-1', 'Overhead power lines', '2026-07-25T00:00:00.000Z', {
      companyValue: 'Use a visual observer and exclusion zone',
    });
    const diff = diffSafetyPlanSources(snapshot([currentItem]), snapshot([latestItem]));

    const refreshed = applySourceRefresh(
      makeSafetyPlanVersion({ sourceSnapshot: snapshot([currentItem]) }),
      diff,
      [{ itemId: currentItem.id, action: 'accept_source_value' }],
      {
        actor: { userId: 'admin-1', name: 'Admin', role: 'admin', operationalAuthority: true },
        now: '2026-07-25T01:00:00.000Z',
      }
    );

    expect(refreshed.sourceSnapshot.hazards?.[0].companyValue)
      .toBe('Use a visual observer and exclusion zone');
  });
});
