import {
  explainMaintenanceThreshold,
  getControllingMaintenanceThreshold,
  normalizeMaintenanceDueResult,
  rankMaintenanceRequirements,
  summarizeAttachedMaintenance,
} from './dueState';

type JsonObject = Record<string, unknown>;

const threshold = (overrides: JsonObject = {}): JsonObject => ({
  thresholdId: 'threshold-meter',
  sequenceNumber: 1,
  thresholdType: 'METER',
  meterType: 'odometer',
  unitCode: 'km',
  intervalValue: 10000,
  dueSoonValue: 1500,
  baselineType: 'COMMISSIONING',
  baselineValue: 0,
  baselineDate: null,
  currentValue: 8580,
  currentRecordedAt: '2026-08-21T01:30:00.000Z',
  currentAuthoritySource: 'AUTHORITATIVE_METER',
  dueValue: 10000,
  dueDate: null,
  remaining: 1420,
  state: 'DUE_SOON',
  baselineEvidence: { source: 'commissioning certificate' },
  ...overrides,
});

const requirement = (overrides: JsonObject = {}): JsonObject => ({
  requirementId: 'requirement-ftf-10k',
  requirementVersionId: 'requirement-ftf-10k-v3',
  requirementCode: 'FTF-10K',
  requirementName: 'FSS550 10,000 km Service',
  requirementKind: 'SERVICE',
  authorityType: 'ORGANISATION_STANDARD',
  authorityScope: 'ORGANISATION',
  lifecycleState: 'EFFECTIVE',
  effectiveFrom: '2026-01-01T00:00:00.000Z',
  effectiveTo: null,
  thresholdPolicy: 'ANY',
  state: 'DUE_SOON',
  controllingThresholdId: 'threshold-meter',
  thresholds: [threshold()],
  evidence: { approval: 'operations standard 3' },
  serviceKitVersionId: 'service-kit-v3',
  ...overrides,
});

const projection = (overrides: JsonObject = {}): JsonObject => ({
  assetId: 'registry-ftf-11',
  asOf: '2026-08-21T01:30:00.000Z',
  timezone: 'Australia/Brisbane',
  requirements: [requirement()],
  attachedAssetSummaries: [],
  ...overrides,
});

describe('authoritative maintenance due-state contract', () => {
  test.each([
    { currentValue: 9999, remaining: 1, state: 'DUE_SOON' },
    { currentValue: 10000, remaining: 0, state: 'DUE' },
    { currentValue: 10001, remaining: -1, state: 'OVERDUE' },
  ])('preserves the server state at the meter threshold boundary: $state', ({ currentValue, remaining, state }) => {
    const result = normalizeMaintenanceDueResult(projection({
      requirements: [requirement({ state, thresholds: [threshold({ currentValue, remaining, state })] })],
    }));

    expect(result.requirements[0].state).toBe(state);
    expect(explainMaintenanceThreshold(result.requirements[0].thresholds[0])).toMatchObject({
      state,
      current: { value: currentValue, recordedAt: '2026-08-21T01:30:00.000Z', authoritySource: 'AUTHORITATIVE_METER' },
      due: { value: 10000, date: null },
      remaining: { value: remaining, unitCode: 'km' },
    });
  });

  test.each([
    ['2027-02-27T13:59:59.000Z', 'CURRENT'],
    ['2027-02-27T14:00:00.000Z', 'DUE'],
  ])('preserves the leap-anniversary Brisbane calendar decision at %s', (asOf, state) => {
    const calendar = threshold({
      thresholdId: 'threshold-calendar', thresholdType: 'CALENDAR', meterType: null, unitCode: 'YEAR',
      intervalValue: 3, dueSoonValue: null, baselineValue: null, baselineDate: '2024-02-29',
      currentValue: null, currentRecordedAt: null, currentAuthoritySource: null,
      dueValue: null, dueDate: '2027-02-28', remaining: state === 'DUE' ? 0 : 1, state,
    });
    const result = normalizeMaintenanceDueResult(projection({
      asOf,
      requirements: [requirement({ state, controllingThresholdId: 'threshold-calendar', thresholds: [calendar] })],
    }));

    expect(result.asOf).toBe(asOf);
    expect(result.timezone).toBe('Australia/Brisbane');
    expect(result.requirements[0].state).toBe(state);
    expect(explainMaintenanceThreshold(result.requirements[0].thresholds[0]).due).toEqual({ value: null, date: '2027-02-28' });
  });

  test('explains calendar intervals separately from day-based remaining and warning evidence', () => {
    const calendar = threshold({
      thresholdId: 'threshold-calendar', thresholdType: 'CALENDAR', meterType: null, unitCode: 'YEAR',
      intervalValue: 3, dueSoonValue: 30, baselineValue: null, baselineDate: '2024-02-29',
      currentValue: null, currentRecordedAt: null, currentAuthoritySource: null,
      dueValue: null, dueDate: '2027-02-28', remaining: 20, state: 'DUE_SOON',
    });
    const result = normalizeMaintenanceDueResult(projection({
      requirements: [requirement({ controllingThresholdId: 'threshold-calendar', thresholds: [calendar] })],
    }));

    expect(explainMaintenanceThreshold(result.requirements[0].thresholds[0])).toMatchObject({
      interval: { value: 3, unitCode: 'YEAR' },
      remaining: { value: 20, unitCode: 'DAY' },
      dueSoonRule: { value: 30, unitCode: 'DAY' },
    });
  });

  test('uses the projection controlling-threshold ID when ANY changes controller', () => {
    const calendar = threshold({
      thresholdId: 'threshold-calendar', sequenceNumber: 2, thresholdType: 'CALENDAR', meterType: null,
      unitCode: 'MONTH', intervalValue: 12, dueSoonValue: 30, baselineValue: null,
      baselineDate: '2025-10-12', currentValue: null, currentRecordedAt: null,
      currentAuthoritySource: null, dueValue: null, dueDate: '2026-10-12', remaining: 52,
      state: 'CURRENT',
    });
    const byMeter = normalizeMaintenanceDueResult(projection({
      requirements: [requirement({ thresholds: [threshold(), calendar] })],
    }));
    const byCalendar = normalizeMaintenanceDueResult(projection({
      requirements: [requirement({ controllingThresholdId: 'threshold-calendar', thresholds: [threshold({ remaining: 120 }), calendar] })],
    }));

    expect(getControllingMaintenanceThreshold(byMeter.requirements[0]).thresholdId).toBe('threshold-meter');
    expect(getControllingMaintenanceThreshold(byCalendar.requirements[0]).thresholdId).toBe('threshold-calendar');
  });

  test.each([
    threshold({ baselineType: null, baselineValue: null, baselineEvidence: null, dueValue: null, remaining: null, state: 'INSUFFICIENT_DATA' }),
    threshold({ currentValue: null, currentRecordedAt: null, currentAuthoritySource: null, dueValue: null, remaining: null, state: 'INSUFFICIENT_DATA' }),
  ])('keeps missing meter evidence insufficient instead of inventing zero', (meter) => {
    const result = normalizeMaintenanceDueResult(projection({
      requirements: [requirement({ state: 'INSUFFICIENT_DATA', thresholds: [meter] })],
    }));
    const explanation = explainMaintenanceThreshold(result.requirements[0].thresholds[0]);

    expect(explanation.state).toBe('INSUFFICIENT_DATA');
    expect(explanation.remaining).toBeNull();
  });

  test('preserves the authoritative corrected meter projection and separate baseline evidence', () => {
    const result = normalizeMaintenanceDueResult(projection({
      requirements: [requirement({ thresholds: [threshold({
        currentValue: 8600,
        currentRecordedAt: '2026-08-21T02:00:00.000Z',
        remaining: 1400,
        baselineEvidence: { source: 'commissioning certificate' },
      })] })],
    }));

    expect(explainMaintenanceThreshold(result.requirements[0].thresholds[0])).toMatchObject({
      current: { value: 8600, recordedAt: '2026-08-21T02:00:00.000Z', authoritySource: 'AUTHORITATIVE_METER' },
      baseline: { evidence: { source: 'commissioning certificate' } },
    });
  });

  test.each(['CONDITION', 'COMPONENT'])('%s remains insufficient without its later authoritative evidence source', (thresholdType) => {
    const result = normalizeMaintenanceDueResult(projection({
      requirements: [requirement({
        requirementKind: thresholdType === 'CONDITION' ? 'CONDITION_BASED' : 'REPLACEMENT',
        state: 'INSUFFICIENT_DATA',
        thresholds: [threshold({
          thresholdId: `threshold-${thresholdType.toLowerCase()}`, thresholdType, meterType: null,
          unitCode: thresholdType === 'COMPONENT' ? 'HOUR' : null, intervalValue: thresholdType === 'COMPONENT' ? 50 : null,
          dueSoonValue: null, baselineType: null, baselineValue: null, baselineDate: null,
          currentValue: null, currentRecordedAt: null, currentAuthoritySource: null,
          dueValue: null, dueDate: null, remaining: null, state: 'INSUFFICIENT_DATA', baselineEvidence: null,
        })],
        controllingThresholdId: `threshold-${thresholdType.toLowerCase()}`,
      })],
    }));

    expect(result.requirements[0].state).toBe('INSUFFICIENT_DATA');
  });

  test('preserves explicit one-time evidence without inventing recurrence', () => {
    const oneTime = threshold({
      thresholdId: 'threshold-one-time', thresholdType: 'ONE_TIME', meterType: null, unitCode: null,
      intervalValue: null, dueSoonValue: null, baselineType: 'ONE_TIME', baselineValue: null,
      baselineDate: '2026-10-02', currentValue: null, currentRecordedAt: null,
      currentAuthoritySource: null, dueValue: null, dueDate: '2026-10-02', remaining: 42,
      state: 'CURRENT', baselineEvidence: { source: 'approved one-time directive' },
    });
    const result = normalizeMaintenanceDueResult(projection({
      requirements: [requirement({ requirementKind: 'ONE_TIME', state: 'CURRENT', controllingThresholdId: 'threshold-one-time', thresholds: [oneTime] })],
    }));

    expect(explainMaintenanceThreshold(result.requirements[0].thresholds[0]).baseline).toEqual({
      type: 'ONE_TIME', value: null, date: '2026-10-02', evidence: { source: 'approved one-time directive' },
    });
  });

  test('accepts a historically applicable superseded version and rejects inactive lifecycle rows', () => {
    expect(normalizeMaintenanceDueResult(projection({
      requirements: [requirement({ lifecycleState: 'SUPERSEDED', effectiveTo: '2027-01-01T00:00:00.000Z' })],
    })).requirements[0].lifecycleState).toBe('SUPERSEDED');

    expect(() => normalizeMaintenanceDueResult(projection({
      requirements: [requirement({ lifecycleState: 'APPROVED' })],
    }))).toThrow(/lifecycleState/i);
  });

  test.each([
    ['service-kit-v3', 'service-kit-v3'],
    [null, null],
  ])('preserves optional exact Service Kit linkage: %s', (serviceKitVersionId, expected) => {
    expect(normalizeMaintenanceDueResult(projection({
      requirements: [requirement({ serviceKitVersionId })],
    })).requirements[0].serviceKitVersionId).toBe(expected);
  });

  test('summarizes attached equipment without contaminating the parent requirement state', () => {
    const childDueState = {
      assetId: 'registry-gen-003',
      asOf: '2026-08-21T01:30:00.000Z',
      timezone: 'Australia/Brisbane',
      requirements: [requirement({ requirementCode: 'GEN-500H', requirementName: '500 h service', state: 'DUE_SOON', serviceKitVersionId: null })],
    };
    const result = normalizeMaintenanceDueResult(projection({
      requirements: [requirement({ state: 'CURRENT', thresholds: [threshold({ state: 'CURRENT', remaining: 5000 })] })],
      attachedAssetSummaries: [{ registryId: 'registry-gen-003', dueState: childDueState }],
    }));

    expect(result.requirements[0].state).toBe('CURRENT');
    expect(summarizeAttachedMaintenance(result)).toEqual({
      requiresAttention: true,
      assets: [{ registryId: 'registry-gen-003', requirementCount: 1, attentionRequirementCount: 1, highestState: 'DUE_SOON' }],
    });
  });

  test('ranks requirements for presentation without changing their projected state', () => {
    const result = normalizeMaintenanceDueResult(projection({
      requirements: [
        requirement({ requirementCode: 'CURRENT', state: 'CURRENT', thresholds: [threshold({ state: 'CURRENT' })] }),
        requirement({ requirementCode: 'OVERDUE', state: 'OVERDUE', thresholds: [threshold({ state: 'OVERDUE', remaining: -1 })] }),
        requirement({ requirementCode: 'DUE', state: 'DUE', thresholds: [threshold({ state: 'DUE', remaining: 0 })] }),
      ],
    }));

    expect(rankMaintenanceRequirements(result.requirements).map((row) => row.requirementCode)).toEqual(['OVERDUE', 'DUE', 'CURRENT']);
    expect(result.requirements.map((row) => row.requirementCode)).toEqual(['CURRENT', 'OVERDUE', 'DUE']);
  });

  test.each([
    [projection({ asOf: '2026-08-21' }), /asOf/i],
    [projection({ timezone: 'AEST' }), /timezone/i],
    [projection({ requirements: [requirement({ thresholdPolicy: 'ALL' })] }), /thresholdPolicy/i],
    [projection({ requirements: [requirement({ state: 'UNSERVICEABLE' })] }), /state/i],
    [projection({ availability: 'unavailable' }), /availability/i],
    [projection({ mission_ready: false }), /mission_ready/i],
    [projection({ requirements: [requirement({ controllingThresholdId: 'unknown-threshold' })] }), /controllingThresholdId/i],
    [projection({ requirements: [requirement({ authorityType: 'MANUFACTURER', authorityScope: 'ORGANISATION' })] }), /authorityScope/i],
    [projection({ requirements: [requirement({ evidence: {} })] }), /evidence/i],
    [projection({ requirements: [requirement({ lifecycleState: 'SUPERSEDED', effectiveFrom: '2025-01-01T00:00:00.000Z', effectiveTo: '2026-01-01T00:00:00.000Z' })] }), /effective/i],
    [projection({ requirements: [requirement({ thresholds: [threshold({ currentRecordedAt: null })] })] }), /currentRecordedAt/i],
    [projection({ requirements: [requirement({ thresholds: [threshold({ meterType: 'tachometer' })] })] }), /meterType/i],
    [projection({ requirements: [requirement({ thresholds: [threshold({ baselineType: 'GUESSED' })] })] }), /baselineType/i],
    [projection({ requirements: [requirement({ thresholds: [threshold({ currentAuthoritySource: 'BROWSER_CACHE' })] })] }), /currentAuthoritySource/i],
    [projection({ requirements: [requirement({ thresholds: [threshold({
      thresholdType: 'ONE_TIME', meterType: null, unitCode: 'DATE', intervalValue: null, dueSoonValue: null,
      baselineType: null, baselineValue: null, baselineDate: null, currentValue: null, currentRecordedAt: null,
      currentAuthoritySource: null, dueValue: null, dueDate: null, remaining: null, state: 'INSUFFICIENT_DATA', baselineEvidence: null,
    })] })] }), /unitCode/i],
    [projection({ requirements: [requirement({ thresholds: [threshold(), threshold({ sequenceNumber: 2 })] })] }), /thresholdId/i],
    [projection({ requirements: [requirement({ thresholds: [threshold({ baselineDate: '2027-02-31' })] })] }), /baselineDate/i],
    [projection({ attachedAssetSummaries: [{
      registryId: 'registry-gen-003',
      dueState: {
        assetId: 'registry-gen-003', asOf: '2026-08-22T01:30:00.000Z', timezone: 'Australia/Brisbane',
        requirements: [requirement({ requirementCode: 'GEN-500H' })],
      },
    }] }), /asOf/i],
  ])('fails closed for malformed or out-of-scope projection evidence', (payload, message) => {
    expect(() => normalizeMaintenanceDueResult(payload)).toThrow(message);
  });
});
