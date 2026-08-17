const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const activeWorkflow = path.join(root, '.github/workflows/production-controlled-residual-archive.yml');
const historicalEvidence = path.join(root, 'docs/operations/historical-production-controlled-residual-archive.yml');
const workflowsDirectory = path.join(root, '.github/workflows');

test('retires the historical residual archive from executable GitHub Actions', () => {
  expect(fs.existsSync(activeWorkflow)).toBe(false);
  expect(fs.existsSync(historicalEvidence)).toBe(true);
  const evidence = fs.readFileSync(historicalEvidence, 'utf8');
  expect(evidence).toContain('HISTORICAL NON-EXECUTABLE EVIDENCE');
  expect(evidence).toContain('Superseded by the canonical evidence-bound controlled-cleanup path');
  expect(evidence).toContain('ARCHIVE_EXACT_FIVE_CONTROLLED_ORGANISATIONS');
});

test('no active Production workflow retains the obsolete pre-correction authority contract', () => {
  const sources = fs.readdirSync(workflowsDirectory)
    .filter((name) => /\.ya?ml$/i.test(name))
    .map((name) => fs.readFileSync(path.join(workflowsDirectory, name), 'utf8'))
    .join('\n');

  expect(sources).not.toContain('ARCHIVE_EXACT_FIVE_CONTROLLED_ORGANISATIONS');
  expect(sources).not.toContain('Verify privilege state remains PRE_CORRECTION');
  expect(sources).not.toContain("migrationHead','20260813140000'");
  expect(sources).not.toContain("ftfStoreMaintain',has_table_privilege");
});

test('canonical release and controlled cleanup authority remain available', () => {
  const release = fs.readFileSync(path.join(workflowsDirectory, 'production-beta-release.yml'), 'utf8');
  const acceptance = fs.readFileSync(path.join(workflowsDirectory, 'production-beta-operational-acceptance.yml'), 'utf8');
  const verifier = fs.readFileSync(path.join(root, 'scripts/verifyCommercialOnboardingPostgres.mjs'), 'utf8');

  expect(release).toContain('supabase@$SUPABASE_CLI_VERSION" db push --linked');
  expect(release).toContain('Dry-run repository migrations');
  expect(acceptance).toContain('Commercial onboarding acceptance');
  expect(verifier).toContain("rpc/ftf_archive_controlled_commercial_onboarding");
});
