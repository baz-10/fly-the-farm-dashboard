let releaseEvidence;

beforeAll(async () => {
  try {
    releaseEvidence = await import('../../scripts/productionBetaReleaseEvidence.mjs');
  } catch (error) {
    releaseEvidence = { loadError: error };
  }
});

const productionFunction = (name) => {
  expect(releaseEvidence.loadError).toBeUndefined();
  expect(typeof releaseEvidence[name]).toBe('function');
  return releaseEvidence[name];
};

describe('Production Beta release evidence', () => {
  describe('parseMigrationPlan', () => {
    test('returns exact repository migration IDs in dry-run order', () => {
      const parseMigrationPlan = productionFunction('parseMigrationPlan');
      const output = [
        'DRY RUN: migrations will *not* be pushed to the database.',
        'Connecting to remote database...',
        'Would push these migrations:',
        ' • 20260810010000_add_release_attempts.sql',
        ' • 20260810020000_reconcile_release_ledger.sql',
        'Finished supabase db push.',
      ].join('\n');

      expect(parseMigrationPlan(output)).toEqual([
        '20260810010000',
        '20260810020000',
      ]);
    });

    test('returns an exact empty plan only for the explicit up-to-date result', () => {
      const parseMigrationPlan = productionFunction('parseMigrationPlan');
      expect(parseMigrationPlan([
        'DRY RUN: migrations will *not* be pushed to the database.',
        'Connecting to remote database...',
        'Remote database is up to date.',
      ].join('\n'))).toEqual([]);
    });

    test.each([
      ['', 'empty output'],
      ['Connecting to remote database...', 'missing terminal plan state'],
      [
        'Warning: found 20260810010000_add_release_attempts.sql outside the migration plan.\nRemote database is up to date.',
        'migration-like output outside the plan',
      ],
      [
        'Would push these migrations:\n • 20260810010000_first.sql\n • 20260810010000_duplicate.sql',
        'duplicate migration ID',
      ],
      [
        'Would push these migrations:\n • 20260810010000_first.sql\n20260810020000_unbulleted.sql',
        'unstructured migration-like output',
      ],
    ])('rejects %s (%s)', (output) => {
      const parseMigrationPlan = productionFunction('parseMigrationPlan');
      expect(() => parseMigrationPlan(output)).toThrow();
    });
  });

  describe('reconcileMigrationLedger', () => {
    test('returns the verified exact plan and ledger when all planned IDs are remote and none remain pending', () => {
      const reconcileMigrationLedger = productionFunction('reconcileMigrationLedger');
      expect(reconcileMigrationLedger({
        plannedIds: ['20260810010000', '20260810020000'],
        remoteIds: ['20260809090000', '20260810010000', '20260810020000'],
        pendingAfter: [],
      })).toEqual({
        plannedIds: ['20260810010000', '20260810020000'],
        remoteIds: ['20260809090000', '20260810010000', '20260810020000'],
        pendingAfter: [],
        verified: true,
      });
    });

    test('rejects a planned migration absent from the remote ledger', () => {
      const reconcileMigrationLedger = productionFunction('reconcileMigrationLedger');
      expect(() => reconcileMigrationLedger({
        plannedIds: ['20260810010000', '20260810020000'],
        remoteIds: ['20260810010000'],
        pendingAfter: [],
      })).toThrow('Planned migrations absent from remote ledger: 20260810020000');
    });

    test('rejects any repository migration still pending after apply', () => {
      const reconcileMigrationLedger = productionFunction('reconcileMigrationLedger');
      expect(() => reconcileMigrationLedger({
        plannedIds: ['20260810010000'],
        remoteIds: ['20260810010000'],
        pendingAfter: ['20260810020000'],
      })).toThrow('Repository migrations still pending after apply: 20260810020000');
    });
  });

  describe('buildReleaseRecord', () => {
    test('builds canonical evidence for an accepted release', () => {
      const buildReleaseRecord = productionFunction('buildReleaseRecord');
      const record = buildReleaseRecord({
        releaseSha: 'a'.repeat(40),
        migrationBoundaryCrossed: true,
        plannedIds: ['20260810010000'],
        remoteIds: ['20260809090000', '20260810010000'],
        pendingAfter: [],
        migrationLedgerVerified: true,
        releaseResult: 'success',
        deploymentId: 'dpl_accepted',
        deploymentTimestamp: '2026-08-10T04:05:06.000Z',
        deployedShaVerified: true,
        acceptanceRunId: '123456789',
        acceptanceResult: 'success',
      });

      expect(record).toContain('## Production Beta Release Record');
      expect(record).toContain('| Release classification | `ACCEPTED` |');
      expect(record).toContain('| Planned migration IDs | `["20260810010000"]` |');
      expect(record).toContain('| Remote migration IDs | `["20260809090000","20260810010000"]` |');
      expect(record).toContain('| Repository migrations pending after apply | `[]` |');
      expect(record).toContain('| Migration ledger verified | `true` |');
      expect(record).toContain('| Acceptance result | `success` |');
    });

    test.each([
      ['deployment failure', '', '', false],
      ['deployed-SHA failure', 'dpl_partial', '2026-08-10T04:05:06.000Z', false],
    ])('records a canonical partial release with NOT_RUN acceptance after %s', (
      _failure,
      deploymentId,
      deploymentTimestamp,
      deployedShaVerified,
    ) => {
      const buildReleaseRecord = productionFunction('buildReleaseRecord');
      const record = buildReleaseRecord({
        releaseSha: 'b'.repeat(40),
        migrationBoundaryCrossed: true,
        plannedIds: ['20260810010000'],
        remoteIds: ['20260810010000'],
        pendingAfter: [],
        migrationLedgerVerified: true,
        releaseResult: 'failure',
        deploymentId,
        deploymentTimestamp,
        deployedShaVerified,
        acceptanceRunId: '987654321',
        acceptanceResult: 'skipped',
      });

      expect(record).toContain('| Release classification | `PARTIAL_RELEASE` |');
      expect(record).toContain('| Acceptance workflow run ID | `NOT_RUN` |');
      expect(record).toContain('| Acceptance result | `NOT_RUN` |');
    });

    test('refuses to label an attempt canonical before it crosses the migration boundary', () => {
      const buildReleaseRecord = productionFunction('buildReleaseRecord');
      expect(() => buildReleaseRecord({
        releaseSha: 'c'.repeat(40),
        migrationBoundaryCrossed: false,
      })).toThrow('Release attempt did not cross the migration boundary');
    });
  });
});
