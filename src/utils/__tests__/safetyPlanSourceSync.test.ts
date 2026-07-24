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
    ]);

    expect(refreshed.sections[0].fields).toContainEqual(
      expect.objectContaining({ id: currentItem.id, value: 'Company spotter remains at western gate' })
    );
    expect(refreshed.sourceSnapshot.hazards?.[0]).toMatchObject({
      value: 'Changed source control',
      companyValue: 'Company spotter remains at western gate',
    });
  });

  it('preserves the actual edited section control rather than a stale snapshot copy', () => {
    const currentItem = item('risk-1', 'Source control', undefined, {
      companyValue: 'Stale snapshot control',
    });
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
          value: 'Edited field control from the current draft',
        }],
      }],
    });
    const diff = diffSafetyPlanSources(
      version.sourceSnapshot,
      snapshot([item('risk-1', 'Changed source control', '2026-07-25T00:00:00.000Z')])
    );

    const refreshed = applySourceRefresh(version, diff, [
      { itemId: currentItem.id, action: 'keep_company_value' },
    ]);

    expect(refreshed.sourceSnapshot.hazards?.[0].companyValue)
      .toBe('Edited field control from the current draft');
    expect(refreshed.sections[0].fields[0].value)
      .toBe('Edited field control from the current draft');
  });

  it('requires an explicit decision for every changed and removed item', () => {
    const current = snapshot([item('changed', 'Old'), item('removed', 'Old')]);
    const latest = snapshot([item('changed', 'New', '2026-07-25T00:00:00.000Z')]);
    const diff = diffSafetyPlanSources(current, latest);

    expect(() => applySourceRefresh(
      makeSafetyPlanVersion({ sourceSnapshot: current }),
      diff,
      [{ itemId: item('changed', '').id, action: 'accept_source_value' }]
    )).toThrow(/explicit decision/i);
  });

  it('emits server-authoritative source-refreshed audit metadata without actor or time', () => {
    const current = snapshot([item('changed', 'Old')]);
    const latest = snapshot([item('changed', 'New', '2026-07-25T00:00:00.000Z')]);
    const version = makeSafetyPlanVersion({ sourceSnapshot: current, revision: 4 });
    const diff = diffSafetyPlanSources(current, latest);

    const refreshed = applySourceRefresh(
      version,
      diff,
      [{ itemId: item('changed', '').id, action: 'accept_source_value' }]
    );

    expect(refreshed).not.toBe(version);
    expect(version.revision).toBe(4);
    expect(refreshed).toMatchObject({
      revision: 5,
      sourceRefreshAudit: {
        action: 'source_refreshed',
      },
    });
    expect(refreshed.updatedAt).toBe(version.updatedAt);
    expect(refreshed.sourceRefreshAudit).not.toHaveProperty('actor');
    expect(refreshed.sourceRefreshAudit).not.toHaveProperty('occurredAt');
  });

  it('adds a field for a newly imported source item', () => {
    const current = snapshot([]);
    const added = item('new-risk', 'Set a 30 m exclusion zone');
    const diff = diffSafetyPlanSources(current, snapshot([added]));
    const version = makeSafetyPlanVersion({ sourceSnapshot: current });

    const refreshed = applySourceRefresh(version, diff, []);

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
      [{ itemId: currentItem.id, action: 'accept_source_value' }]
    );

    expect(refreshed.sourceSnapshot.hazards?.[0].companyValue)
      .toBe('Use a visual observer and exclusion zone');
  });

  it('requires explicit review decisions for changed non-hazard source categories', () => {
    const current = {
      ...snapshot([]),
      job: { id: 'job-1', name: 'Old job name' },
      crew: [{ id: 'crew-1', name: 'Old Pilot', role: 'PIC' }],
    };
    const latest = {
      ...snapshot([]),
      job: { id: 'job-1', name: 'New job name' },
      crew: [{ id: 'crew-1', name: 'New Pilot', role: 'PIC' }],
    };
    const diff = diffSafetyPlanSources(current, latest);

    expect(diff.contextChanged.map(({ itemId }) => itemId)).toEqual([
      'context:crew',
      'context:job',
    ]);
    expect(() => applySourceRefresh(
      makeSafetyPlanVersion({ sourceSnapshot: current }),
      diff,
      [{ itemId: 'context:job', action: 'keep_company_value' }]
    )).toThrow(/context:crew/);

    const refreshed = applySourceRefresh(
      makeSafetyPlanVersion({ sourceSnapshot: current }),
      diff,
      [
        { itemId: 'context:job', action: 'keep_company_value' },
        { itemId: 'context:crew', action: 'accept_source_value' },
      ]
    );
    expect(refreshed.sourceSnapshot.job.name).toBe('Old job name');
    expect(refreshed.sourceSnapshot.crew?.[0].name).toBe('New Pilot');
  });
});
