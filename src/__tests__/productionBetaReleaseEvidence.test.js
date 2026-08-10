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

    test('rejects a skipped malformed migration warning before accepting an empty plan', () => {
      const parseMigrationPlan = productionFunction('parseMigrationPlan');
      expect(() => parseMigrationPlan([
        'Skipping migration malformed_name.sql... (file name must match pattern "<timestamp>_name.sql")',
        'Remote database is up to date.',
      ].join('\n'))).toThrow('Supabase migration plan contains an unrecognised warning');
    });

    test.each([
      ['', 'empty output'],
      ['Connecting to remote database...', 'missing terminal plan state'],
      [
        'Warning: found 20260810010000_add_release_attempts.sql outside the migration plan.\nRemote database is up to date.',
        'migration-like output outside the plan',
      ],
      [
        'Remote database is up to date.\nmigration 20260810010000 was mentioned by another command',
        'bare migration ID outside an explicit plan',
      ],
      [
        'Would push these migrations:\n • 20260810010000_first.sql\nmigration 20260810020000 was not a plan bullet',
        'bare migration ID after an explicit plan',
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

  describe('parseMigrationLedger', () => {
    test('returns only the exact Remote column IDs from the pinned Supabase ledger table', () => {
      const parseMigrationLedger = productionFunction('parseMigrationLedger');
      const output = [
        'Connecting to remote database...',
        '        LOCAL          │     REMOTE         │     TIME (UTC)',
        '  ─────────────────┼────────────────┼──────────────────────',
        '   20260809090000 │ 20260809090000 │ 2026-08-09 09:00:00',
        '   20260810010000 │                │ 2026-08-10 01:00:00',
        '                  │ 20260810020000 │ 2026-08-10 02:00:00',
      ].join('\n');

      expect(parseMigrationLedger(output)).toEqual([
        '20260809090000',
        '20260810020000',
      ]);
    });

    test('rejects an unrelated table with loose Local and Remote labels', () => {
      const parseMigrationLedger = productionFunction('parseMigrationLedger');
      expect(() => parseMigrationLedger([
        'Local audit | Remote audit | Notes',
        '------------|--------------|------',
        '20260810010000 | 20260810010000 | unrelated evidence',
      ].join('\n'))).toThrow('Supabase migration ledger header is missing');
    });

    test('rejects a false table-shaped row before it can satisfy reconciliation', () => {
      const parseMigrationLedger = productionFunction('parseMigrationLedger');
      const reconcileMigrationLedger = productionFunction('reconcileMigrationLedger');
      expect(() => {
        const remoteIds = parseMigrationLedger([
          'Connecting to remote database...',
          'Local │ Remote │ Time (UTC)',
          '──────┼────────┼───────────',
          '20260810010000 │ 20260810010000 │ unrelated',
        ].join('\n'));
        reconcileMigrationLedger({
          plannedIds: ['20260810010000'],
          remoteIds,
          pendingAfter: [],
        });
      }).toThrow('Supabase migration ledger row is malformed');
    });

    test('rejects a raw valid timestamp that the pinned Supabase formatter would render as UTC time', () => {
      const parseMigrationLedger = productionFunction('parseMigrationLedger');
      expect(() => parseMigrationLedger([
        'Connecting to remote database...',
        'Local │ Remote │ Time (UTC)',
        '──────┼────────┼───────────',
        '20260810010000 │ 20260810010000 │ 20260810010000',
      ].join('\n'))).toThrow('Supabase migration ledger row is malformed');
    });

    test('rejects mixed table delimiters that the pinned Supabase renderer cannot emit', () => {
      const parseMigrationLedger = productionFunction('parseMigrationLedger');
      expect(() => parseMigrationLedger([
        'Local | Remote │ Time (UTC)',
        '------|--------|-----------',
        '20260810010000 | 20260810010000 | 2026-08-10 01:00:00',
      ].join('\n'))).toThrow('Supabase migration ledger header is missing');
    });

    test('rejects a compact lookalike table even when its timestamp is valid', () => {
      const parseMigrationLedger = productionFunction('parseMigrationLedger');
      const reconcileMigrationLedger = productionFunction('reconcileMigrationLedger');
      expect(() => {
        const remoteIds = parseMigrationLedger([
          'Local | Remote | Time (UTC)',
          '------|--------|-----------',
          '20260810010000 | 20260810010000 | 2026-08-10 01:00:00',
        ].join('\n'));
        reconcileMigrationLedger({
          plannedIds: ['20260810010000'],
          remoteIds,
          pendingAfter: [],
        });
      }).toThrow();
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
