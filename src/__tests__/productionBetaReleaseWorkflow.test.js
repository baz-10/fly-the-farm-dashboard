const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const root = path.resolve(__dirname, '../..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const releaseWorkflow = () => yaml.load(read('.github/workflows/production-beta-release.yml'));
const vercelConfiguration = () => JSON.parse(read('vercel.json'));
const step = (job, name) => job.steps.find((candidate) => candidate.name === name);

describe('GitHub-managed Production Beta release governance', () => {
  test('uses a manual immutable release SHA and one protected deployment authority', () => {
    const definition = releaseWorkflow();
    const source = read('.github/workflows/production-beta-release.yml');

    expect(Object.keys(definition.on)).toEqual(['workflow_dispatch']);
    expect(definition.on.workflow_dispatch.inputs.release_sha.required).toBe(true);
    expect(definition.permissions).toEqual({ contents: 'read' });
    expect(definition.concurrency).toEqual({
      group: 'production-beta-release',
      'cancel-in-progress': false,
    });

    const release = definition.jobs.release;
    expect(definition.jobs.validate.environment).toBeUndefined();
    expect(release.environment).toBe('production-beta-deployment');
    expect(release.env.RELEASE_SHA).toBe('${{ inputs.release_sha }}');
    expect(release.env.SUPABASE_ACCESS_TOKEN).toBeUndefined();
    expect(release.env.SUPABASE_DB_PASSWORD).toBeUndefined();
    expect(release.env.VERCEL_TOKEN).toBeUndefined();
    expect(release.env.VERCEL_ORG_ID).toBe('${{ vars.VERCEL_ORG_ID }}');
    expect(release.env.VERCEL_PROJECT_ID).toBe('${{ vars.VERCEL_PROJECT_ID }}');
    expect(release.env.SUPABASE_CLI_VERSION).toBe('2.113.0');
    expect(release.env.VERCEL_CLI_VERSION).toBe('58.9.0');
    expect(source).not.toMatch(/production-beta-acceptance[\s\S]{0,500}(SUPABASE_ACCESS_TOKEN|SUPABASE_DB_PASSWORD|VERCEL_TOKEN)/);
    expect(source).not.toMatch(/uses:\s+actions\/(checkout|setup-node)@v\d/);
    expect(source).toContain('actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683');
    expect(source).toContain('actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020');

    expect(step(release, 'Install locked dependencies').env).toBeUndefined();
    expect(step(release, 'Apply repository migrations').env).toEqual({
      SUPABASE_ACCESS_TOKEN: '${{ secrets.SUPABASE_ACCESS_TOKEN }}',
      SUPABASE_DB_PASSWORD: '${{ secrets.SUPABASE_DB_PASSWORD }}',
    });
    expect(step(release, 'Deploy exact release to Vercel').env).toEqual({
      VERCEL_TOKEN: '${{ secrets.VERCEL_TOKEN }}',
    });
  });

  test('pins checkout, build, migration, deployment and verification to one release SHA', () => {
    const definition = releaseWorkflow();
    const validation = definition.jobs.validate;
    const release = definition.jobs.release;
    const names = release.steps.map(({ name }) => name);

    expect(step(validation, 'Check out immutable release').with.ref).toBe('${{ inputs.release_sha }}');
    expect(step(validation, 'Verify immutable release identity').run).toContain('HEAD_SHA="$(git rev-parse HEAD)"');
    expect(step(release, 'Check out immutable release').with.ref).toBe('${{ inputs.release_sha }}');
    expect(step(release, 'Verify Production Beta project binding').run).toContain('fzkrvglzompkuiodqllr');

    const validationNames = validation.steps.map(({ name }) => name);
    expect(validationNames.indexOf('Run deterministic regression'))
      .toBeLessThan(validationNames.indexOf('Build exact release'));
    expect(step(validation, 'Build exact release').run).toBe('CI=false npm run build');
    expect(release.needs).toBe('validate');

    const ordered = [
      'Inspect remote migration ledger',
      'Dry-run repository migrations',
      'Apply repository migrations',
      'Verify remote migration ledger',
      'Deploy exact release to Vercel',
      'Wait for Vercel READY',
      'Verify deployed release SHA',
    ];
    ordered.forEach((name) => expect(names).toContain(name));
    ordered.slice(1).forEach((name, index) => {
      expect(names.indexOf(ordered[index])).toBeLessThan(names.indexOf(name));
    });

    expect(step(release, 'Deploy exact release to Vercel').run)
      .toContain('--meta githubCommitSha="$RELEASE_SHA"');
    expect(step(release, 'Verify deployed release SHA').run)
      .toContain('/api/v1/deployment');
  });

  test('runs operational acceptance only after the protected release succeeds', () => {
    const definition = releaseWorkflow();
    const acceptance = definition.jobs.acceptance;

    expect(acceptance.needs).toBe('release');
    expect(acceptance.uses).toBe('./.github/workflows/production-beta-operational-acceptance.yml');
    expect(acceptance.with.expected_release_sha).toBe('${{ needs.release.outputs.release-sha }}');
    expect(acceptance.secrets).toBeUndefined();
  });

  test('records the complete canonical Production Beta release history after acceptance', () => {
    const definition = releaseWorkflow();
    const release = definition.jobs.release;
    const record = definition.jobs['release-record'];

    expect(release.outputs['migration-ids']).toBe('${{ steps.migration_plan.outputs.migration-ids }}');
    expect(release.outputs['remote-migration-ids']).toBe('${{ steps.migration_ledger.outputs.remote-migration-ids }}');
    expect(release.outputs['pending-migration-ids']).toBe('${{ steps.migration_ledger.outputs.pending-migration-ids }}');
    expect(release.outputs['migration-ledger-verified']).toBe('${{ steps.migration_ledger.outputs.migration-ledger-verified }}');
    expect(release.outputs['migration-boundary-crossed']).toBe('${{ steps.migration_boundary.outputs.crossed }}');
    expect(release.outputs['deployment-id']).toBe('${{ steps.vercel_ready.outputs.deployment-id }}');
    expect(release.outputs['deployment-timestamp']).toBe('${{ steps.vercel_ready.outputs.deployment-timestamp }}');
    expect(record.needs).toEqual(['release', 'acceptance']);
    expect(record.if).toBe("always() && needs.release.outputs.migration-boundary-crossed == 'true'");

    const writeRecord = step(record, 'Write canonical release record');
    expect(writeRecord.env.RELEASE_SHA).toBe('${{ inputs.release_sha }}');
    expect(writeRecord.env.MIGRATION_IDS).toBe('${{ needs.release.outputs.migration-ids }}');
    expect(writeRecord.env.REMOTE_MIGRATION_IDS).toBe('${{ needs.release.outputs.remote-migration-ids }}');
    expect(writeRecord.env.PENDING_MIGRATION_IDS).toBe('${{ needs.release.outputs.pending-migration-ids }}');
    expect(writeRecord.env.MIGRATION_LEDGER_VERIFIED).toBe('${{ needs.release.outputs.migration-ledger-verified }}');
    expect(writeRecord.env.DEPLOYMENT_ID).toBe('${{ needs.release.outputs.deployment-id }}');
    expect(writeRecord.env.DEPLOYMENT_TIMESTAMP).toBe('${{ needs.release.outputs.deployment-timestamp }}');
    expect(writeRecord.env.ACCEPTANCE_RUN_ID).toBe('${{ github.run_id }}');
    expect(writeRecord.env.ACCEPTANCE_RESULT).toBe('${{ needs.acceptance.result }}');
    expect(writeRecord.run).toBe('node scripts/productionBetaReleaseEvidence.mjs record >> "$GITHUB_STEP_SUMMARY"');
  });

  test('machine-parses and reconciles the exact Supabase migration plan and ledger', () => {
    const definition = releaseWorkflow();
    const release = definition.jobs.release;
    const names = release.steps.map(({ name }) => name);
    const plan = step(release, 'Dry-run repository migrations');
    const ledger = step(release, 'Verify remote migration ledger');

    expect(plan.run).toContain('node scripts/productionBetaReleaseEvidence.mjs plan');
    expect(plan.run).not.toContain('matchAll');
    expect(names.indexOf('Mark migration boundary'))
      .toBeLessThan(names.indexOf('Apply repository migrations'));
    expect(step(release, 'Mark migration boundary').id).toBe('migration_boundary');
    expect(ledger.id).toBe('migration_ledger');
    expect(ledger.run).toContain('migration list --linked');
    expect(ledger.run).toContain('db push --linked --dry-run');
    expect(ledger.run).toContain('productionBetaReleaseEvidence.mjs ledger');
    expect(ledger.run).toContain('productionBetaReleaseEvidence.mjs plan');
    expect(ledger.run).toContain('productionBetaReleaseEvidence.mjs reconcile');
    expect(ledger.run.indexOf('echo "remote-migration-ids=$remote_migration_ids"'))
      .toBeLessThan(ledger.run.indexOf('productionBetaReleaseEvidence.mjs reconcile'));
    expect(ledger.run.indexOf('echo "pending-migration-ids=$pending_migration_ids"'))
      .toBeLessThan(ledger.run.indexOf('productionBetaReleaseEvidence.mjs reconcile'));
  });

  test('disables only the automatic Production branch deployment and preserves previews elsewhere', () => {
    const configuration = vercelConfiguration();

    expect(configuration.git).toEqual({
      deploymentEnabled: {
        'codex/production-beta': false,
      },
    });
    expect(configuration.git.deploymentEnabled['*']).toBeUndefined();
  });

  test('fails forward without mutating migration history or exporting credentials', () => {
    const definition = releaseWorkflow();
    const source = read('.github/workflows/production-beta-release.yml');
    const release = definition.jobs.release;

    expect(step(release, 'Apply repository migrations').id).toBe('apply_migrations');
    expect(step(release, 'Report partial release').if)
      .toContain("steps.apply_migrations.outcome == 'success'");
    expect(step(release, 'Report partial release').run).toContain('PARTIAL RELEASE');
    expect(definition.jobs['release-record'].if)
      .toContain("needs.release.outputs.migration-boundary-crossed == 'true'");
    expect(source).not.toMatch(/migration repair|db reset|migration.*delete|\.env(?:\.|\s|$)|upload-artifact/i);
  });

  test('documents trust separation, partial releases and the first-release gate', () => {
    const runbook = read('docs/operations/production-beta-github-release.md');
    expect(runbook).toContain('production-beta-deployment');
    expect(runbook).toContain('production-beta-acceptance');
    expect(runbook).toContain('PARTIAL RELEASE');
    expect(runbook).toContain('Never repair, delete, reverse or rewrite migration history automatically');
    expect(runbook).toContain('Product Owner approval');
    expect(runbook).toContain('automatic Vercel Git production deployment');
    expect(runbook).toContain('Release SHA');
    expect(runbook).toContain('Migration IDs');
    expect(runbook).toContain('zero repository migrations remain pending');
    expect(runbook).toContain('NOT_RUN');
    expect(runbook).toContain('Deployment ID');
    expect(runbook).toContain('Acceptance workflow run ID');
    expect(runbook).toContain('all other unassigned branches remain eligible for Preview deployments');
  });
});
