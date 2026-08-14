const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const yaml = require('js-yaml');

const root = path.resolve(__dirname, '../..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const releaseWorkflow = () => yaml.load(read('.github/workflows/production-beta-release.yml'));
const vercelConfiguration = () => JSON.parse(read('vercel.json'));
const step = (job, name) => job.steps.find((candidate) => candidate.name === name);
const inlineIdentityValidator = (run, payloadVariable) => {
  const match = run.match(new RegExp(`node -e '([^']+)' "\\$${payloadVariable}" "\\$RELEASE_SHA"`));
  return match && match[1];
};
const validateIdentity = (script, payload, expectedReleaseSha) => spawnSync(
  process.execPath,
  ['-e', script, JSON.stringify(payload), expectedReleaseSha],
  { encoding: 'utf8' },
);

describe('GitHub-managed Production Beta release governance', () => {
  test('reconciles migration definitions through a mutually exclusive catalogue-only diagnostic', () => {
    const definition = releaseWorkflow();
    const diagnostic = definition.jobs['migration-definition-reconciliation'];
    const source = JSON.stringify(diagnostic);

    expect(definition.on.workflow_dispatch.inputs.migration_definition_reconciliation_only).toEqual({
      description: 'Compare reviewed and live PostgreSQL definitions without mutation',
      required: false,
      default: false,
      type: 'boolean',
    });
    expect(diagnostic.environment).toBe('production-beta-deployment');
    expect(diagnostic.if).toContain('inputs.migration_definition_reconciliation_only == true');
    expect(read('scripts/migrationDefinitionReconciliation.sql')).toMatch(/pg_catalog|information_schema/);
    expect(source).toContain('scripts/productionStateIntegrityReconciliation.sql');
    expect(source).toContain('scripts/productionStateIntegrityDiagnostic.sql');
    expect(source).toContain('scripts/productionPrivilegeProvenance.sql');
    expect(source.indexOf('scripts/productionPrivilegeProvenance.sql'))
      .toBeLessThan(source.indexOf('scripts/productionStateIntegrityDiagnostic.sql'));
    expect(source.indexOf('scripts/productionStateIntegrityDiagnostic.sql'))
      .toBeLessThan(source.indexOf('scripts/productionStateIntegrityReconciliation.sql'));
    expect(source.indexOf('scripts/productionStateIntegrityReconciliation.sql'))
      .toBeLessThan(source.indexOf('scripts/migrationDefinitionReconciliation.sql'));
    expect(source).not.toMatch(/db push|migration list|vercel deploy|alias set|promote|insert\b|update\b|delete\b|ftf_archive_controlled_commercial_onboarding\s*\(/i);
    expect(source).not.toMatch(/SUPABASE_ACCESS_TOKEN|VERCEL_TOKEN/);
    for (const jobName of ['validate', 'release', 'rehearsal', 'acceptance', 'release-record', 'diagnostic', 'connectivity-diagnostic', 'exact-sha-redeploy']) {
      expect(definition.jobs[jobName].if).toContain('inputs.migration_definition_reconciliation_only != true');
    }
  });
  test('redeploys an approved immutable SHA without any Supabase migration authority', () => {
    const definition = releaseWorkflow();
    const redeploy = definition.jobs['exact-sha-redeploy'];
    const source = JSON.stringify(redeploy);

    expect(definition.on.workflow_dispatch.inputs.exact_sha_redeploy_only).toEqual({
      description: 'Redeploy an approved immutable SHA without migrations',
      required: false,
      default: false,
      type: 'boolean',
    });
    expect(redeploy.environment).toBe('production-beta-deployment');
    expect(redeploy.if).toContain('inputs.exact_sha_redeploy_only == true');
    expect(redeploy.env.RELEASE_SHA).toBe('${{ inputs.release_sha }}');
    expect(redeploy.env.VERCEL_ORG_ID).toBe('${{ vars.VERCEL_ORG_ID }}');
    expect(redeploy.env.VERCEL_PROJECT_ID).toBe('${{ vars.VERCEL_PROJECT_ID }}');
    expect(source).not.toMatch(/SUPABASE_ACCESS_TOKEN|SUPABASE_DB_PASSWORD|supabase\b|migration\s+list|db\s+push/i);

    const names = redeploy.steps.map(({ name }) => name);
    const ordered = [
      'Check out immutable release',
      'Verify exact redeploy identity',
      'Install locked dependencies',
      'Build exact release',
      'Deploy exact release to Vercel',
      'Capture Vercel deployment identity',
      'Wait for Vercel READY',
      'Verify Vercel deployment metadata',
      'Verify deployed release SHA',
      'Verify canonical Production Beta alias',
    ];
    ordered.forEach((name) => expect(names).toContain(name));
    ordered.slice(1).forEach((name, index) => {
      expect(names.indexOf(ordered[index])).toBeLessThan(names.indexOf(name));
    });

    const deploy = step(redeploy, 'Deploy exact release to Vercel');
    expect(deploy.env).toEqual({ VERCEL_TOKEN: '${{ secrets.VERCEL_TOKEN }}' });
    expect(deploy.run).toContain('--prod');
    expect(deploy.run).toContain('--env SPRAY_COMMAND_RELEASE_SHA="$RELEASE_SHA"');
    expect(deploy.run).toContain('--meta githubCommitSha="$RELEASE_SHA"');
  });

  test('fails closed on conflicting workflow modes and gates acceptance behind mailbox authentication', () => {
    const definition = releaseWorkflow();
    const guard = definition.jobs['mode-guard'];
    const mailbox = definition.jobs['redeploy-mailbox-verification'];
    const acceptance = definition.jobs['redeploy-acceptance'];

    expect(guard.environment).toBeUndefined();
    expect(guard.steps[0].run).toContain('selected_modes');
    expect(guard.steps[0].run).toContain('[[ "$selected_modes" -le 1 ]]');
    expect(definition.jobs.release.if).toContain('inputs.exact_sha_redeploy_only != true');
    expect(definition.jobs.rehearsal.if).toContain('inputs.exact_sha_redeploy_only != true');
    expect(definition.jobs.acceptance.if).toContain('inputs.exact_sha_redeploy_only != true');
    expect(definition.jobs['release-record'].if).toContain('inputs.exact_sha_redeploy_only != true');

    expect(mailbox.needs).toBe('exact-sha-redeploy');
    expect(mailbox.environment).toBe('production-beta-acceptance');
    expect(JSON.stringify(mailbox)).toContain('E2E_ONBOARDING_MAILBOX_TOKEN');
    expect(JSON.stringify(mailbox)).toContain('VERCEL_AUTOMATION_BYPASS_SECRET');
    expect(JSON.stringify(mailbox)).not.toMatch(/SUPABASE_ACCESS_TOKEN|SUPABASE_DB_PASSWORD|VERCEL_TOKEN/);
    expect(step(mailbox, 'Verify mailbox bridge authentication').run)
      .toContain('x-vercel-protection-bypass');
    expect(step(mailbox, 'Verify mailbox bridge authentication').run)
      .toContain("+%Y-%m-%dT%H:%M:%S.%3NZ");
    expect(step(mailbox, 'Verify mailbox bridge authentication').run)
      .not.toContain("+%Y-%m-%dT%H:%M:%SZ");

    expect(acceptance.needs).toEqual(['exact-sha-redeploy', 'redeploy-mailbox-verification']);
    expect(acceptance.uses).toBe('./.github/workflows/production-beta-operational-acceptance.yml');
    expect(acceptance.with.expected_release_sha)
      .toBe('${{ needs.exact-sha-redeploy.outputs.release-sha }}');
  });

  test('hands acceptance secrets across the reusable workflow boundary without crossing deployment trust scopes', () => {
    const definition = releaseWorkflow();
    const acceptance = definition.jobs.acceptance;
    const release = definition.jobs.release;

    expect(acceptance.uses).toBe('./.github/workflows/production-beta-operational-acceptance.yml');
    expect(acceptance.secrets).toBe('inherit');
    expect(acceptance.environment).toBeUndefined();
    expect(JSON.stringify(acceptance)).not.toMatch(/SUPABASE_ACCESS_TOKEN|SUPABASE_DB_PASSWORD|VERCEL_TOKEN/);
    expect(JSON.stringify(release)).not.toMatch(/E2E_ORGANISATION_EMAIL|E2E_ORGANISATION_PASSWORD/);
  });

  test('compares database-password propagation without exposing derived credential material', () => {
    const definition = releaseWorkflow();
    const diagnostic = definition.jobs.diagnostic;

    expect(definition.on.workflow_dispatch.inputs.secret_propagation_only).toEqual({
      description: 'Compare protected database-secret propagation without release activity',
      required: false,
      default: false,
      type: 'boolean',
    });
    expect(diagnostic.environment).toBe('production-beta-deployment');
    expect(diagnostic.steps).toHaveLength(1);
    expect(diagnostic.steps[0].env.SUPABASE_DB_PASSWORD).toBe('${{ secrets.SUPABASE_DB_PASSWORD }}');
    expect(diagnostic.steps[0].run).toContain('process["env"].SUPABASE_DB_PASSWORD');
    expect(diagnostic.steps[0].run).toContain("printf 'MATCH\\n'");
    expect(diagnostic.steps[0].run).toContain("printf 'MISMATCH\\n'");
    expect(diagnostic.steps[0].run).not.toMatch(/sha(?:256)?|digest|length|set -x|migration\s+list|db\s+push|vercel\s+deploy|alias\s+set|promote/i);
    expect(definition.jobs.validate.if).toBe('inputs.secret_propagation_only != true && inputs.connectivity_diagnostic_only != true && inputs.migration_definition_reconciliation_only != true');
    expect(definition.jobs.release.if).toContain('inputs.secret_propagation_only != true');
    expect(definition.jobs.rehearsal.if).toContain('inputs.secret_propagation_only != true');
    expect(definition.jobs.acceptance.if).toContain('inputs.secret_propagation_only != true');
    expect(definition.jobs['release-record'].if).toContain('inputs.secret_propagation_only != true');
  });

  test('diagnoses session-pooler and direct connectivity without entering a release path', () => {
    const definition = releaseWorkflow();
    const diagnostic = definition.jobs['connectivity-diagnostic'];

    expect(definition.on.workflow_dispatch.inputs.connectivity_diagnostic_only).toEqual({
      description: 'Test read-only Production Beta PostgreSQL connectivity without release activity',
      required: false,
      default: false,
      type: 'boolean',
    });
    expect(diagnostic.environment).toBe('production-beta-deployment');
    expect(diagnostic.steps).toHaveLength(1);
    expect(diagnostic.steps[0].env.SUPABASE_DB_PASSWORD).toBe('${{ secrets.SUPABASE_DB_PASSWORD }}');
    expect(diagnostic.steps[0].run).toContain('aws-0-ap-southeast-2.pooler.supabase.com');
    expect(diagnostic.steps[0].run).toContain('postgres.fzkrvglzompkuiodqllr');
    expect(diagnostic.steps[0].run).toContain('db.fzkrvglzompkuiodqllr.supabase.co');
    expect(diagnostic.steps[0].run).toContain("--command 'SELECT 1'");
    expect(diagnostic.steps[0].run).not.toMatch(/migration\s+list|db\s+push|vercel\s+deploy|alias\s+set|promote|set -x/i);
    for (const jobName of ['validate', 'release', 'rehearsal', 'acceptance', 'release-record', 'diagnostic']) {
      expect(definition.jobs[jobName].if).toContain('inputs.connectivity_diagnostic_only != true');
    }
  });

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
    expect(definition.jobs.validate.env.TZ).toBe('Australia/Brisbane');
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

  test('supports a complete non-mutating rehearsal through a preview deployment', () => {
    const definition = releaseWorkflow();
    const source = read('.github/workflows/production-beta-release.yml');
    const rehearsal = definition.jobs.rehearsal;

    expect(definition.on.workflow_dispatch.inputs.rehearsal_only).toEqual({
      description: 'Run every release gate without migrations, Production deployment, aliases or acceptance',
      required: false,
      default: false,
      type: 'boolean',
    });
    expect(definition.jobs.release.if).toBe("inputs.rehearsal_only != true && inputs.secret_propagation_only != true && inputs.connectivity_diagnostic_only != true && inputs.migration_definition_reconciliation_only != true && inputs.exact_sha_redeploy_only != true");
    expect(definition.jobs.acceptance.if).toBe("inputs.rehearsal_only != true && inputs.secret_propagation_only != true && inputs.connectivity_diagnostic_only != true && inputs.migration_definition_reconciliation_only != true && inputs.exact_sha_redeploy_only != true");
    expect(definition.jobs['release-record'].if)
      .toContain("inputs.rehearsal_only != true");
    expect(rehearsal.needs).toBe('validate');
    expect(rehearsal.if).toBe("inputs.rehearsal_only == true && inputs.secret_propagation_only != true && inputs.connectivity_diagnostic_only != true && inputs.migration_definition_reconciliation_only != true && inputs.exact_sha_redeploy_only != true");
    expect(rehearsal.environment).toBe('production-beta-deployment');

    const names = rehearsal.steps.map(({ name }) => name);
    for (const name of [
      'Verify rehearsal credentials are present',
      'Verify Production Beta project binding',
      'Capture migration state before rehearsal',
      'Dry-run repository migrations',
      'Prove migration ledger remained unchanged',
      'Deploy exact release to Vercel Preview',
      'Capture Vercel Preview deployment identity',
      'Wait for Vercel Preview READY',
      'Verify Vercel Preview deployment metadata',
      'Verify Preview runtime release SHA',
      'Prove canonical Production Beta remained unchanged',
      'Report rehearsal gates',
    ]) expect(names).toContain(name);

    const dryRun = step(rehearsal, 'Dry-run repository migrations').run;
    const preState = step(rehearsal, 'Capture migration state before rehearsal').run;
    const unchanged = step(rehearsal, 'Prove migration ledger remained unchanged').run;
    const deploy = step(rehearsal, 'Deploy exact release to Vercel Preview').run;
    expect(dryRun).toContain('db push --linked --dry-run');
    expect(preState).toContain('ledger_status=$?');
    expect(preState).toContain('productionBetaReleaseEvidence.mjs redact-diagnostic');
    expect(preState).toContain('exit "$ledger_status"');
    expect(preState).not.toContain('set -x');
    expect(unchanged).toContain('migration list --linked');
    expect(unchanged).toContain('[[ "$post_remote_migration_ids" == "$PRE_REMOTE_MIGRATION_IDS" ]]');
    expect(deploy).toContain('vercel@$VERCEL_CLI_VERSION" deploy');
    expect(deploy).not.toContain('--prod');
    expect(rehearsal.steps.some(({ run = '' }) => /db push --linked\s*(?:\n|$)/.test(run))).toBe(false);
    expect(rehearsal.steps.some(({ run = '' }) => /alias\s+set|promote/.test(run))).toBe(false);
    expect(step(rehearsal, 'Prove canonical Production Beta remained unchanged').run)
      .toContain('[[ "$after_deployment_id" == "$BEFORE_PRODUCTION_DEPLOYMENT_ID" ]]');
  });

  test('gives interaction-heavy suites a deterministic hosted-runner timeout', () => {
    const runner = read('scripts/runJestShards.mjs');
    expect(runner).toContain("'--testTimeout=15000'");
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
      'Capture pre-apply migration state',
      'Dry-run repository migrations',
      'Apply repository migrations',
      'Verify remote migration ledger',
      'Deploy exact release to Vercel',
      'Capture Vercel deployment identity',
      'Wait for Vercel READY',
      'Verify Vercel deployment metadata',
      'Verify deployed release SHA',
      'Verify canonical Production Beta alias',
    ];
    ordered.forEach((name) => expect(names).toContain(name));
    ordered.slice(1).forEach((name, index) => {
      expect(names.indexOf(ordered[index])).toBeLessThan(names.indexOf(name));
    });

    expect(step(release, 'Deploy exact release to Vercel').run)
      .toContain('--meta githubCommitSha="$RELEASE_SHA"');
    expect(step(release, 'Deploy exact release to Vercel').run)
      .toContain('--env SPRAY_COMMAND_RELEASE_SHA="$RELEASE_SHA"');
    const deploymentIdentity = step(release, 'Capture Vercel deployment identity');
    expect(deploymentIdentity.id).toBe('vercel_identity');
    expect(deploymentIdentity.env.DEPLOYMENT_URL).toBe('${{ steps.vercel_deploy.outputs.deployment-url }}');
    expect(deploymentIdentity.run).toContain('vercel@$VERCEL_CLI_VERSION" inspect "$DEPLOYMENT_URL" --json');
    expect(deploymentIdentity.run).toContain('productionBetaReleaseEvidence.mjs deployment');
    expect(step(release, 'Wait for Vercel READY').run)
      .toContain('productionBetaReleaseEvidence.mjs deployment');
  });

  test('returns the generated deployment URL before the build can fail and captures its identity immediately', () => {
    const release = releaseWorkflow().jobs.release;
    const names = release.steps.map(({ name }) => name);
    const deploy = step(release, 'Deploy exact release to Vercel');

    expect(deploy.run).toContain('--no-wait');
    expect(deploy.run).toContain('echo "deployment-url=$DEPLOYMENT_URL" >> "$GITHUB_OUTPUT"');
    expect(names.indexOf(deploy.name)).toBeLessThan(names.indexOf('Capture Vercel deployment identity'));
    expect(names.indexOf('Capture Vercel deployment identity')).toBeLessThan(names.indexOf('Wait for Vercel READY'));
  });

  test('uses the pinned protection-aware Vercel client against the exact generated deployment', () => {
    const release = releaseWorkflow().jobs.release;
    const runtime = step(release, 'Verify deployed release SHA');

    expect(runtime.run)
      .toContain('vercel@$VERCEL_CLI_VERSION" curl /api/v1/deployment --deployment "$DEPLOYMENT_URL"');
    expect(runtime.run).toContain('--fail --silent --show-error --retry 6 --retry-delay 5');
    expect(runtime.run).not.toContain('--token "$VERCEL_TOKEN"');
    expect(runtime.run).not.toContain('curl --fail');
    expect(runtime.env.DEPLOYMENT_URL).toBe('${{ steps.vercel_deploy.outputs.deployment-url }}');
    expect(runtime.env.VERCEL_TOKEN).toBe('${{ secrets.VERCEL_TOKEN }}');

    const rehearsalRuntime = step(releaseWorkflow().jobs.rehearsal, 'Verify Preview runtime release SHA');
    expect(rehearsalRuntime.run).not.toContain('--token "$VERCEL_TOKEN"');
    expect(rehearsalRuntime.env.VERCEL_TOKEN).toBe('${{ secrets.VERCEL_TOKEN }}');
  });

  test('machine-joins the canonical Production Beta alias to the newly created deployment ID', () => {
    const release = releaseWorkflow().jobs.release;
    const canonicalAlias = step(release, 'Verify canonical Production Beta alias');

    expect(release.env.PRODUCTION_BETA_ALIAS).toBe('spray-command-production-beta.vercel.app');
    expect(canonicalAlias).toBeDefined();
    if (!canonicalAlias) return;
    expect(canonicalAlias.id).toBe('canonical_alias');
    expect(canonicalAlias.env.DEPLOYMENT_ID).toBe('${{ steps.vercel_ready.outputs.deployment-id }}');
    expect(canonicalAlias.env.VERCEL_TOKEN).toBe('${{ secrets.VERCEL_TOKEN }}');
    expect(canonicalAlias.run).toContain('inspect "https://$PRODUCTION_BETA_ALIAS" --json');
    expect(canonicalAlias.run).toContain('productionBetaReleaseEvidence.mjs deployment');
    expect(canonicalAlias.run).toContain('[[ "$alias_deployment_id" == "$DEPLOYMENT_ID" ]]');
  });

  test('fails closed on missing or mismatched Vercel metadata before querying runtime identity', () => {
    const release = releaseWorkflow().jobs.release;
    const names = release.steps.map(({ name }) => name);
    const metadata = step(release, 'Verify Vercel deployment metadata');

    expect(metadata).toBeDefined();
    if (!metadata) return;
    expect(names.indexOf(metadata.name)).toBeLessThan(names.indexOf('Verify deployed release SHA'));
    expect(metadata.run).toContain('https://api.vercel.com/v13/deployments/$DEPLOYMENT_ID');
    const validator = inlineIdentityValidator(metadata.run, 'metadata_json');
    expect(typeof validator).toBe('string');
    if (!validator) return;

    const expected = 'a'.repeat(40);
    expect(validateIdentity(validator, { meta: {} }, expected).status).not.toBe(0);
    expect(validateIdentity(validator, { meta: { githubCommitSha: 'b'.repeat(40) } }, expected).status).not.toBe(0);
    expect(validateIdentity(validator, { meta: { githubCommitSha: expected } }, expected)).toMatchObject({
      status: 0,
      stdout: expected,
    });
  });

  test('fails closed on missing or mismatched runtime identity and accepts the matching release', () => {
    const release = releaseWorkflow().jobs.release;
    const runtime = step(release, 'Verify deployed release SHA');
    const validator = inlineIdentityValidator(runtime.run, 'payload');

    expect(typeof validator).toBe('string');
    if (!validator) return;
    const expected = 'a'.repeat(40);
    expect(validateIdentity(validator, { data: {} }, expected).status).not.toBe(0);
    expect(validateIdentity(validator, { data: { commitSha: 'b'.repeat(40) } }, expected).status).not.toBe(0);
    expect(validateIdentity(validator, { data: { commitSha: expected } }, expected)).toMatchObject({
      status: 0,
      stdout: expected,
    });
  });

  test('runs operational acceptance only after the protected release succeeds', () => {
    const definition = releaseWorkflow();
    const release = definition.jobs.release;
    const acceptance = definition.jobs.acceptance;

    const names = release.steps.map(({ name }) => name);
    expect(names.indexOf('Verify deployed release SHA'))
      .toBeLessThan(names.indexOf('Verify canonical Production Beta alias'));
    expect(acceptance.needs).toBe('release');
    expect(acceptance.uses).toBe('./.github/workflows/production-beta-operational-acceptance.yml');
    expect(acceptance.with.expected_release_sha).toBe('${{ needs.release.outputs.release-sha }}');
    expect(acceptance.secrets).toBe('inherit');
  });

  test('records complete staged evidence for every attempt that crosses the migration boundary', () => {
    const definition = releaseWorkflow();
    const release = definition.jobs.release;
    const record = definition.jobs['release-record'];

    expect(release.outputs['migration-ids']).toBe('${{ steps.migration_plan.outputs.migration-ids }}');
    expect(release.outputs['repository-migration-ids']).toBe('${{ steps.pre_migration_state.outputs.repository-migration-ids }}');
    expect(release.outputs['pre-remote-migration-ids']).toBe('${{ steps.pre_migration_state.outputs.pre-remote-migration-ids }}');
    expect(release.outputs['post-remote-migration-ids']).toBe('${{ steps.migration_ledger.outputs.post-remote-migration-ids }}');
    expect(release.outputs['pending-migration-ids']).toBe('${{ steps.migration_ledger.outputs.pending-migration-ids }}');
    expect(release.outputs['migration-ledger-verified']).toBe('${{ steps.migration_ledger.outputs.migration-ledger-verified }}');
    expect(release.outputs['migration-boundary-crossed']).toBe('${{ steps.migration_boundary.outputs.crossed }}');
    expect(release.outputs['release-attempt-timestamp']).toBe('${{ steps.migration_boundary.outputs.release-attempt-timestamp }}');
    expect(release.outputs['release-evidence-script']).toBe('${{ steps.migration_boundary.outputs.release-evidence-script }}');
    expect(release.outputs['deployment-id']).toContain('steps.vercel_identity.outputs.deployment-id');
    expect(release.outputs['deployment-timestamp']).toContain('steps.vercel_identity.outputs.deployment-timestamp');
    expect(release.outputs['deployment-state']).toContain('steps.vercel_identity.outputs.deployment-state');
    expect(release.outputs['deployment-id']).toContain('steps.vercel_ready.outputs.deployment-id');
    expect(release.outputs['deployment-state']).toContain('steps.vercel_ready.outputs.deployment-state');
    expect(release.outputs['deployed-sha-verified']).toBe('${{ steps.deployed_sha.outputs.verified }}');
    for (const output of [
      'migration-apply-outcome', 'migration-ledger-outcome', 'deployment-creation-outcome',
      'deployment-identity-outcome', 'deployment-ready-outcome',
      'deployment-metadata-outcome', 'runtime-verification-outcome', 'canonical-alias-outcome',
    ]) expect(release.outputs[output]).toContain('.outcome');
    expect(record.needs).toEqual(['release', 'acceptance']);
    expect(record.if).toBe("inputs.rehearsal_only != true && inputs.secret_propagation_only != true && inputs.connectivity_diagnostic_only != true && inputs.migration_definition_reconciliation_only != true && inputs.exact_sha_redeploy_only != true && always() && needs.release.outputs.migration-boundary-crossed == 'true'");
    expect(step(record, 'Check out immutable release')).toBeUndefined();

    const writeRecord = step(record, 'Write canonical release record');
    expect(writeRecord.env.RELEASE_SHA).toBe('${{ inputs.release_sha }}');
    expect(writeRecord.env.WORKFLOW_RUN_ID).toBe('${{ github.run_id }}');
    expect(writeRecord.env.RELEASE_ATTEMPT_TIMESTAMP).toBe('${{ needs.release.outputs.release-attempt-timestamp }}');
    expect(writeRecord.env.MIGRATION_BOUNDARY_CROSSED).toBe('${{ needs.release.outputs.migration-boundary-crossed }}');
    expect(writeRecord.env.REPOSITORY_MIGRATION_IDS).toBe('${{ needs.release.outputs.repository-migration-ids }}');
    expect(writeRecord.env.PRE_REMOTE_MIGRATION_IDS).toBe('${{ needs.release.outputs.pre-remote-migration-ids }}');
    expect(writeRecord.env.MIGRATION_IDS).toBe('${{ needs.release.outputs.migration-ids }}');
    expect(writeRecord.env.POST_REMOTE_MIGRATION_IDS).toBe('${{ needs.release.outputs.post-remote-migration-ids }}');
    expect(writeRecord.env.PENDING_MIGRATION_IDS).toBe('${{ needs.release.outputs.pending-migration-ids }}');
    expect(writeRecord.env.MIGRATION_LEDGER_VERIFIED).toBe('${{ needs.release.outputs.migration-ledger-verified }}');
    expect(writeRecord.env.RELEASE_RESULT).toBe('${{ needs.release.result }}');
    expect(writeRecord.env.DEPLOYMENT_ID).toBe('${{ needs.release.outputs.deployment-id }}');
    expect(writeRecord.env.DEPLOYMENT_TIMESTAMP).toBe('${{ needs.release.outputs.deployment-timestamp }}');
    expect(writeRecord.env.DEPLOYMENT_STATE).toBe('${{ needs.release.outputs.deployment-state }}');
    expect(writeRecord.env.DEPLOYED_SHA_VERIFIED).toBe('${{ needs.release.outputs.deployed-sha-verified }}');
    expect(writeRecord.env.ACCEPTANCE_RESULT).toBe('${{ needs.acceptance.result }}');
    expect(writeRecord.env.MIGRATION_APPLY_OUTCOME).toBe('${{ needs.release.outputs.migration-apply-outcome }}');
    expect(writeRecord.env.MIGRATION_LEDGER_OUTCOME).toBe('${{ needs.release.outputs.migration-ledger-outcome }}');
    expect(writeRecord.env.DEPLOYMENT_CREATION_OUTCOME).toBe('${{ needs.release.outputs.deployment-creation-outcome }}');
    expect(writeRecord.env.DEPLOYMENT_IDENTITY_OUTCOME).toBe('${{ needs.release.outputs.deployment-identity-outcome }}');
    expect(writeRecord.env.DEPLOYMENT_READY_OUTCOME).toBe('${{ needs.release.outputs.deployment-ready-outcome }}');
    expect(writeRecord.env.DEPLOYMENT_METADATA_OUTCOME).toBe('${{ needs.release.outputs.deployment-metadata-outcome }}');
    expect(writeRecord.env.RUNTIME_VERIFICATION_OUTCOME).toBe('${{ needs.release.outputs.runtime-verification-outcome }}');
    expect(writeRecord.env.CANONICAL_ALIAS_OUTCOME).toBe('${{ needs.release.outputs.canonical-alias-outcome }}');
    expect(writeRecord.env.RELEASE_EVIDENCE_SCRIPT).toBe('${{ needs.release.outputs.release-evidence-script }}');
    expect(step(release, 'Mark migration boundary').run).toContain('readFileSync("scripts/productionBetaReleaseEvidence.mjs")');
    expect(writeRecord.run).toContain('Buffer.from(process.argv[2], "base64")');
    expect(writeRecord.run).not.toContain('base64 --decode');
    expect(writeRecord.run).toContain('node "$evidence_script" record >> "$GITHUB_STEP_SUMMARY"');
  });

  test('machine-proves the exact repository/pre-remote plan and post-minus-pre applied delta', () => {
    const definition = releaseWorkflow();
    const release = definition.jobs.release;
    const names = release.steps.map(({ name }) => name);
    const preState = step(release, 'Capture pre-apply migration state');
    const plan = step(release, 'Dry-run repository migrations');
    const ledger = step(release, 'Verify remote migration ledger');

    expect(preState.id).toBe('pre_migration_state');
    expect(preState.run).toContain('migration list --linked');
    expect(preState.run).toContain('productionBetaReleaseEvidence.mjs ledger-state');
    expect(preState.run).toContain('repository-migration-ids=');
    expect(preState.run).toContain('pre-remote-migration-ids=');
    expect(plan.run).toContain('node scripts/productionBetaReleaseEvidence.mjs plan');
    expect(plan.run).toContain('productionBetaReleaseEvidence.mjs verify-plan');
    expect(plan.env.REPOSITORY_MIGRATION_IDS).toBe('${{ steps.pre_migration_state.outputs.repository-migration-ids }}');
    expect(plan.env.PRE_REMOTE_MIGRATION_IDS).toBe('${{ steps.pre_migration_state.outputs.pre-remote-migration-ids }}');
    expect(plan.run).not.toContain('matchAll');
    expect(names.indexOf('Mark migration boundary'))
      .toBeLessThan(names.indexOf('Apply repository migrations'));
    expect(step(release, 'Mark migration boundary').id).toBe('migration_boundary');
    expect(ledger.id).toBe('migration_ledger');
    expect(ledger.run).toContain('migration list --linked');
    expect(ledger.run).toContain('db push --linked --dry-run');
    expect(ledger.env.PRE_REMOTE_MIGRATION_IDS).toBe('${{ steps.pre_migration_state.outputs.pre-remote-migration-ids }}');
    expect(ledger.run).toContain('productionBetaReleaseEvidence.mjs ledger-state');
    expect(ledger.run).toContain('productionBetaReleaseEvidence.mjs plan');
    expect(ledger.run).toContain('productionBetaReleaseEvidence.mjs reconcile');
    expect(ledger.run.indexOf('echo "post-remote-migration-ids=$post_remote_migration_ids"'))
      .toBeLessThan(ledger.run.indexOf('productionBetaReleaseEvidence.mjs reconcile'));
    expect(ledger.run.indexOf('echo "pending-migration-ids=$pending_migration_ids"'))
      .toBeLessThan(ledger.run.indexOf('productionBetaReleaseEvidence.mjs reconcile'));
  });

  test('fails both workflow dry-run parsing boundaries on skipped malformed migration warnings', () => {
    const release = releaseWorkflow().jobs.release;
    const plan = step(release, 'Dry-run repository migrations');
    const ledger = step(release, 'Verify remote migration ledger');
    const parserCommand = 'node scripts/productionBetaReleaseEvidence.mjs plan';
    const malformedOutput = [
      'Skipping migration malformed_name.sql... (file name must match pattern "<timestamp>_name.sql")',
      'Remote database is up to date.',
    ].join('\n');

    expect(plan.run).toContain(parserCommand);
    expect(ledger.run).toContain(parserCommand);
    expect(spawnSync(
      process.execPath,
      ['scripts/productionBetaReleaseEvidence.mjs', 'plan'],
      { cwd: root, encoding: 'utf8', input: malformedOutput },
    )).toMatchObject({
      status: 1,
      stdout: '',
      stderr: expect.stringContaining('Supabase migration plan contains an unrecognised warning'),
    });
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
    expect(step(release, 'Report partial release').run)
      .toContain('See the canonical release record for the exact failure stage');
    expect(step(release, 'Report partial release').run)
      .not.toContain('but deployment or deployed-SHA verification failed');
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
    expect(runbook).toContain('post-apply remote ledger minus the pre-apply remote ledger');
    expect(runbook).toContain('zero repository migrations remain pending');
    expect(runbook).toContain('NOT_RUN');
    expect(runbook).toContain('Deployment ID');
    expect(runbook).toContain('Workflow run ID');
    expect(runbook).toContain('release-attempt timestamp');
    expect(runbook).toContain('failure stage');
    expect(runbook).toContain('deployment state');
    expect(runbook).toContain('newly created deployment URL');
    expect(runbook).toContain('all other unassigned branches remain eligible for Preview deployments');
  });
});
