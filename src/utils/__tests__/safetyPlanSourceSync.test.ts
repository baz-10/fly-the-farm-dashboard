import { describe, expect, it } from 'vitest';

import { makeSafetyPlanVersion } from '../../test/safetyPlanFixtures';
import type {
  SafetyPlanSourceItem,
  SafetyPlanSourceSnapshot,
} from '../../types/safetyPlan';
import {
  applySourceRefresh,
  diffSafetyPlanSources,
  SOURCE_REFRESH_SERVER_AUDIT_ACTION,
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
      { itemId: 'field:mitigations_and_controls', action: 'keep_company_value' },
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
      { itemId: 'field:mitigations_and_controls', action: 'keep_company_value' },
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
      [
        { itemId: item('changed', '').id, action: 'accept_source_value' },
        { itemId: 'field:mitigations_and_controls', action: 'accept_source_value' },
      ]
    );

    expect(refreshed).not.toBe(version);
    expect(version.revision).toBe(4);
    expect(refreshed).toMatchObject({
      revision: 4,
      sourceRefreshIntent: {
        kind: 'source_refresh',
      },
    });
    expect(SOURCE_REFRESH_SERVER_AUDIT_ACTION).toBe('source_refreshed');
    expect(refreshed.updatedAt).toBe(version.updatedAt);
    expect(refreshed.sourceRefreshIntent).not.toHaveProperty('actor');
    expect(refreshed.sourceRefreshIntent).not.toHaveProperty('occurredAt');
  });

  it('adds a field for a newly imported source item', () => {
    const current = snapshot([]);
    const added = item('new-risk', 'Set a 30 m exclusion zone');
    const diff = diffSafetyPlanSources(current, snapshot([added]));
    const version = makeSafetyPlanVersion({ sourceSnapshot: current });

    const refreshed = applySourceRefresh(version, diff, [
      { itemId: 'field:hazards_and_risk_scores', action: 'accept_source_value' },
      { itemId: 'field:mitigations_and_controls', action: 'accept_source_value' },
    ]);

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
      [
        { itemId: currentItem.id, action: 'accept_source_value' },
        { itemId: 'field:mitigations_and_controls', action: 'accept_source_value' },
      ]
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
        { itemId: 'field:plan_scope', action: 'keep_company_value' },
        { itemId: 'field:job_details', action: 'keep_company_value' },
        { itemId: 'field:assigned_crew', action: 'accept_source_value' },
      ]
    );
    expect(refreshed.sourceSnapshot.job.name).toBe('Old job name');
    expect(refreshed.sourceSnapshot.crew?.[0].name).toBe('New Pilot');
  });

  it('recomputes accepted hazard aggregates only with explicit field decisions', () => {
    const currentItem = item('hazard-1', 'Old hazard', undefined, {
      label: 'Old hazard',
      companyValue: 'Company aggregate control',
    });
    const latestItem = item('hazard-1', 'New hazard', '2026-07-25T00:00:00.000Z', {
      label: 'New hazard',
      companyValue: 'New source control',
    });
    const current = snapshot([currentItem]);
    const latest = snapshot([latestItem]);
    const version = makeSafetyPlanVersion({
      sourceSnapshot: current,
      sections: [{
        id: 'consolidated_jsa_hazards_controls',
        required: true,
        fields: [
          {
            id: 'hazards_and_risk_scores',
            label: 'Hazards',
            helpText: '',
            type: 'textarea',
            required: true,
            companyEditable: true,
            value: 'Company-authored hazard summary',
          },
          {
            id: 'mitigations_and_controls',
            label: 'Controls',
            helpText: '',
            type: 'textarea',
            required: true,
            companyEditable: true,
            value: 'Company-authored aggregate controls',
          },
          {
            id: currentItem.id,
            label: 'Hazard control',
            helpText: '',
            type: 'textarea',
            required: false,
            companyEditable: true,
            value: 'Company item control',
          },
        ],
      }],
    });
    const diff = diffSafetyPlanSources(current, latest);

    expect(() => applySourceRefresh(version, diff, [
      { itemId: currentItem.id, action: 'accept_source_value' },
    ])).toThrow(/field:hazards_and_risk_scores/);

    const refreshed = applySourceRefresh(version, diff, [
      { itemId: currentItem.id, action: 'accept_source_value' },
      { itemId: 'field:hazards_and_risk_scores', action: 'accept_source_value' },
      { itemId: 'field:mitigations_and_controls', action: 'keep_company_value' },
    ]);
    const fields = refreshed.sections[0].fields;
    expect(fields.find(({ id }) => id === 'hazards_and_risk_scores')?.value).toBe('New hazard');
    expect(fields.find(({ id }) => id === 'mitigations_and_controls')?.value)
      .toBe('Company-authored aggregate controls');
  });

  it('accepts source-backed job fields individually without overwriting edited scope or site controls', () => {
    const current = {
      ...snapshot([]),
      job: {
        id: 'job-1',
        name: 'Old job',
        operatingDates: '2026-07-24',
        siteNotes: 'Old source notes',
      },
    };
    const latest = {
      ...snapshot([]),
      job: {
        id: 'job-1',
        name: 'New job',
        operatingDates: '2026-07-25',
        siteNotes: 'New source notes',
      },
    };
    const version = makeSafetyPlanVersion({
      sourceSnapshot: current,
      sections: [{
        id: 'job_client_property_location_operating_dates',
        required: true,
        fields: [
          { id: 'plan_scope', label: 'Scope', helpText: '', type: 'textarea', required: true, companyEditable: true, value: 'Company scope' },
          { id: 'job_details', label: 'Job', helpText: '', type: 'text', required: true, companyEditable: true, value: 'Old job' },
          { id: 'operating_dates', label: 'Dates', helpText: '', type: 'date_range', required: true, companyEditable: true, value: '2026-07-24' },
          { id: 'site_access_controls', label: 'Site', helpText: '', type: 'textarea', required: true, companyEditable: true, value: 'Company gate procedure' },
        ],
      }],
    });
    const diff = diffSafetyPlanSources(current, latest);

    expect(diff.fieldChanged.map(({ itemId }) => itemId)).toEqual([
      'field:job_details',
      'field:operating_dates',
      'field:plan_scope',
      'field:site_access_controls',
    ]);
    const refreshed = applySourceRefresh(version, diff, [
      { itemId: 'context:job', action: 'accept_source_value' },
      { itemId: 'field:job_details', action: 'accept_source_value' },
      { itemId: 'field:operating_dates', action: 'accept_source_value' },
      { itemId: 'field:plan_scope', action: 'keep_company_value' },
      { itemId: 'field:site_access_controls', action: 'keep_company_value' },
    ]);
    const fields = refreshed.sections[0].fields;
    expect(fields.find(({ id }) => id === 'job_details')?.value).toBe('New job');
    expect(fields.find(({ id }) => id === 'operating_dates')?.value).toBe('2026-07-25');
    expect(fields.find(({ id }) => id === 'plan_scope')?.value).toBe('Company scope');
    expect(fields.find(({ id }) => id === 'site_access_controls')?.value)
      .toBe('Company gate procedure');
    expect(refreshed.sourceRefreshIntent?.after?.decisions).toEqual([
      { itemId: 'context:job', action: 'accept_source_value' },
      { itemId: 'field:job_details', action: 'accept_source_value' },
      { itemId: 'field:operating_dates', action: 'accept_source_value' },
    ]);
  });

  it('does not import hazards or links from a rejected new mission', () => {
    const current = {
      ...snapshot([]),
      missions: [{ id: 'mission-1', name: 'Existing mission' }],
      sourceLinks: [{
        sourceType: 'mission' as const,
        sourceId: 'mission-1',
        sourceUpdatedAt: '2026-07-24T00:00:00.000Z',
      }],
    };
    const newMissionHazard = item('risk-new', 'New mission hazard', undefined, {
      sourceId: 'mission-2',
      id: 'jsa:mission-2:risk-new',
    });
    const latest = {
      ...snapshot([newMissionHazard]),
      missions: [
        { id: 'mission-1', name: 'Existing mission' },
        { id: 'mission-2', name: 'New mission' },
      ],
      sourceLinks: [
        ...current.sourceLinks,
        {
          sourceType: 'mission' as const,
          sourceId: 'mission-2',
          sourceUpdatedAt: '2026-07-24T00:00:00.000Z',
        },
      ],
    };
    const version = makeSafetyPlanVersion({ sourceSnapshot: current });
    const diff = diffSafetyPlanSources(current, latest);

    const refreshed = applySourceRefresh(version, diff, [
      { itemId: 'context:missions', action: 'keep_company_value' },
      { itemId: 'field:hazards_and_risk_scores', action: 'keep_company_value' },
      { itemId: 'field:mitigations_and_controls', action: 'keep_company_value' },
    ]);

    expect(refreshed.sourceSnapshot.missions.map(({ id }) => id)).toEqual(['mission-1']);
    expect(refreshed.sourceSnapshot.hazards).toEqual([]);
    expect(refreshed.sourceSnapshot.sourceLinks).toEqual(current.sourceLinks);
    expect(refreshed.sourceRefreshIntent?.after?.decisions).toEqual([]);
  });
});
