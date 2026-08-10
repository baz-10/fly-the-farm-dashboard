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
    test('returns the exact repository and remote columns from the pinned Supabase ledger table', () => {
      const parseMigrationLedger = productionFunction('parseMigrationLedger');
      const parseMigrationLedgerState = productionFunction('parseMigrationLedgerState');
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
      expect(parseMigrationLedgerState(output)).toEqual({
        repositoryIds: ['20260809090000', '20260810010000'],
        remoteIds: ['20260809090000', '20260810020000'],
      });
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

  describe('verifyMigrationPlan', () => {
    test('accepts only the exact repository IDs absent from the pre-apply remote ledger', () => {
      const verifyMigrationPlan = productionFunction('verifyMigrationPlan');
      expect(verifyMigrationPlan({
        repositoryIds: ['20260809090000', '20260810010000', '20260810020000'],
        preRemoteIds: ['20260809090000'],
        plannedIds: ['20260810010000', '20260810020000'],
      })).toEqual({
        repositoryIds: ['20260809090000', '20260810010000', '20260810020000'],
        preRemoteIds: ['20260809090000'],
        plannedIds: ['20260810010000', '20260810020000'],
        verified: true,
      });
    });

    test('rejects an unexpectedly empty dry-run plan when repository state has a pending migration', () => {
      const verifyMigrationPlan = productionFunction('verifyMigrationPlan');
      expect(() => verifyMigrationPlan({
        repositoryIds: ['20260809090000', '20260810010000'],
        preRemoteIds: ['20260809090000'],
        plannedIds: [],
      })).toThrow('Planned migrations do not equal repository migrations absent from the pre-apply remote ledger: expected 20260810010000; received NONE');
    });

    test('rejects an extra or reordered migration outside the exact repository/pre-remote difference', () => {
      const verifyMigrationPlan = productionFunction('verifyMigrationPlan');
      expect(() => verifyMigrationPlan({
        repositoryIds: ['20260809090000', '20260810010000', '20260810020000'],
        preRemoteIds: ['20260809090000'],
        plannedIds: ['20260810020000', '20260810010000'],
      })).toThrow('Planned migrations do not equal repository migrations absent from the pre-apply remote ledger');
    });
  });

  describe('reconcileMigrationLedger', () => {
    test('proves the exact post-minus-pre remote delta equals the plan and none remain pending', () => {
      const reconcileMigrationLedger = productionFunction('reconcileMigrationLedger');
      expect(reconcileMigrationLedger({
        plannedIds: ['20260810010000', '20260810020000'],
        preRemoteIds: ['20260809090000'],
        postRemoteIds: ['20260809090000', '20260810010000', '20260810020000'],
        pendingAfter: [],
      })).toEqual({
        plannedIds: ['20260810010000', '20260810020000'],
        preRemoteIds: ['20260809090000'],
        postRemoteIds: ['20260809090000', '20260810010000', '20260810020000'],
        appliedIds: ['20260810010000', '20260810020000'],
        pendingAfter: [],
        verified: true,
      });
    });

    test('rejects a post-apply remote delta that omits or adds any migration outside the plan', () => {
      const reconcileMigrationLedger = productionFunction('reconcileMigrationLedger');
      expect(() => reconcileMigrationLedger({
        plannedIds: ['20260810010000', '20260810020000'],
        preRemoteIds: ['20260809090000'],
        postRemoteIds: ['20260809090000', '20260810010000', '20260810030000'],
        pendingAfter: [],
      })).toThrow('Applied remote migration delta does not exactly equal the plan: expected 20260810010000,20260810020000; received 20260810010000,20260810030000');
    });

    test('rejects any repository migration still pending after apply', () => {
      const reconcileMigrationLedger = productionFunction('reconcileMigrationLedger');
      expect(() => reconcileMigrationLedger({
        plannedIds: ['20260810010000'],
        preRemoteIds: ['20260809090000'],
        postRemoteIds: ['20260809090000', '20260810010000'],
        pendingAfter: ['20260810020000'],
      })).toThrow('Repository migrations still pending after apply: 20260810020000');
    });
  });

  describe('parseVercelDeploymentIdentity', () => {
    test('captures deployment identity, creation time and state before the READY wait', () => {
      const parseVercelDeploymentIdentity = productionFunction('parseVercelDeploymentIdentity');
      expect(parseVercelDeploymentIdentity({
        id: 'dpl_created',
        createdAt: '2026-08-10T04:05:06.000Z',
        readyState: 'BUILDING',
      })).toEqual({
        deploymentId: 'dpl_created',
        deploymentTimestamp: '2026-08-10T04:05:06.000Z',
        deploymentState: 'BUILDING',
      });
    });
  });

  describe('buildReleaseRecord', () => {
    test('builds canonical evidence for an accepted release', () => {
      const buildReleaseRecord = productionFunction('buildReleaseRecord');
      const record = buildReleaseRecord({
        releaseSha: 'a'.repeat(40),
        migrationBoundaryCrossed: true,
        workflowRunId: '123456789',
        releaseAttemptTimestamp: '2026-08-10T04:00:00.000Z',
        repositoryIds: ['20260809090000', '20260810010000'],
        preRemoteIds: ['20260809090000'],
        plannedIds: ['20260810010000'],
        postRemoteIds: ['20260809090000', '20260810010000'],
        pendingAfter: [],
        migrationLedgerVerified: true,
        releaseResult: 'success',
        migrationApplyOutcome: 'success',
        migrationLedgerOutcome: 'success',
        deploymentCreationOutcome: 'success',
        deploymentIdentityOutcome: 'success',
        deploymentReadyOutcome: 'success',
        deploymentMetadataOutcome: 'success',
        runtimeVerificationOutcome: 'success',
        canonicalAliasOutcome: 'success',
        deploymentId: 'dpl_accepted',
        deploymentTimestamp: '2026-08-10T04:05:06.000Z',
        deploymentState: 'READY',
        deployedShaVerified: true,
        acceptanceResult: 'success',
      });

      expect(record).toContain('## Production Beta Release Record');
      expect(record).toContain('| Release classification | `ACCEPTED` |');
      expect(record).toContain('| Workflow run ID | `123456789` |');
      expect(record).toContain('| Release attempt timestamp | `2026-08-10T04:00:00.000Z` |');
      expect(record).toContain('| Failure stage | `NONE` |');
      expect(record).toContain('| Planned migration IDs | `["20260810010000"]` |');
      expect(record).toContain('| Pre-apply remote migration IDs | `["20260809090000"]` |');
      expect(record).toContain('| Post-apply remote migration IDs | `["20260809090000","20260810010000"]` |');
      expect(record).toContain('| Repository migrations pending after apply | `[]` |');
      expect(record).toContain('| Migration ledger verified | `true` |');
      expect(record).toContain('| Deployment state | `READY` |');
      expect(record).toContain('| Acceptance result | `success` |');
    });

    test('retains deployment identity and BUILDING state when the READY wait fails', () => {
      const buildReleaseRecord = productionFunction('buildReleaseRecord');
      const record = buildReleaseRecord({
        releaseSha: 'b'.repeat(40),
        migrationBoundaryCrossed: true,
        workflowRunId: '987654321',
        releaseAttemptTimestamp: '2026-08-10T04:00:00.000Z',
        repositoryIds: ['20260810010000'],
        preRemoteIds: [],
        plannedIds: ['20260810010000'],
        postRemoteIds: ['20260810010000'],
        pendingAfter: [],
        migrationLedgerVerified: true,
        releaseResult: 'failure',
        migrationApplyOutcome: 'success',
        migrationLedgerOutcome: 'success',
        deploymentCreationOutcome: 'success',
        deploymentIdentityOutcome: 'success',
        deploymentReadyOutcome: 'failure',
        deploymentMetadataOutcome: 'skipped',
        runtimeVerificationOutcome: 'skipped',
        deploymentId: 'dpl_partial',
        deploymentTimestamp: '2026-08-10T04:05:06.000Z',
        deploymentState: 'BUILDING',
        deployedShaVerified: false,
        acceptanceResult: 'skipped',
      });

      expect(record).toContain('| Release classification | `PARTIAL_RELEASE` |');
      expect(record).toContain('| Workflow run ID | `987654321` |');
      expect(record).toContain('| Failure stage | `DEPLOYMENT_READY_WAIT` |');
      expect(record).toContain('| Deployment ID | `dpl_partial` |');
      expect(record).toContain('| Deployment timestamp | `2026-08-10T04:05:06.000Z` |');
      expect(record).toContain('| Deployment state | `BUILDING` |');
      expect(record).toContain('| Acceptance result | `NOT_RUN` |');
    });

    test('labels a pre-deployment ledger failure accurately with explicit not-created deployment evidence', () => {
      const buildReleaseRecord = productionFunction('buildReleaseRecord');
      const record = buildReleaseRecord({
        releaseSha: 'd'.repeat(40),
        migrationBoundaryCrossed: true,
        workflowRunId: '222333444',
        releaseAttemptTimestamp: '2026-08-10T04:00:00.000Z',
        repositoryIds: ['20260810010000'],
        preRemoteIds: [],
        plannedIds: ['20260810010000'],
        migrationLedgerVerified: false,
        releaseResult: 'failure',
        migrationApplyOutcome: 'success',
        migrationLedgerOutcome: 'failure',
        deploymentCreationOutcome: 'skipped',
        acceptanceResult: 'skipped',
      });

      expect(record).toContain('| Failure stage | `MIGRATION_LEDGER_VERIFICATION` |');
      expect(record).toContain('| Deployment ID | `NOT_CREATED` |');
      expect(record).toContain('| Deployment timestamp | `NOT_CREATED` |');
      expect(record).toContain('| Deployment state | `NOT_CREATED` |');
    });

    test('labels a canonical alias deployment-ID mismatch as the exact failure stage', () => {
      const buildReleaseRecord = productionFunction('buildReleaseRecord');
      const record = buildReleaseRecord({
        releaseSha: 'e'.repeat(40),
        migrationBoundaryCrossed: true,
        workflowRunId: '555666777',
        releaseAttemptTimestamp: '2026-08-10T04:00:00.000Z',
        repositoryIds: [],
        preRemoteIds: [],
        plannedIds: [],
        postRemoteIds: [],
        pendingAfter: [],
        migrationLedgerVerified: true,
        releaseResult: 'failure',
        migrationApplyOutcome: 'success',
        migrationLedgerOutcome: 'success',
        deploymentCreationOutcome: 'success',
        deploymentIdentityOutcome: 'success',
        deploymentReadyOutcome: 'success',
        deploymentMetadataOutcome: 'success',
        runtimeVerificationOutcome: 'success',
        canonicalAliasOutcome: 'failure',
        deploymentId: 'dpl_alias_mismatch',
        deploymentTimestamp: '2026-08-10T04:05:06.000Z',
        deploymentState: 'READY',
        deployedShaVerified: true,
        acceptanceResult: 'skipped',
      });

      expect(record).toContain('| Failure stage | `CANONICAL_ALIAS_VERIFICATION` |');
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
