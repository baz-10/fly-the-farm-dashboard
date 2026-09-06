const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const yaml = require('js-yaml');

const workflowPath = path.resolve(
  process.cwd(),
  '.github/workflows/production-beta-operational-acceptance.yml',
);
const clientToMissionPreflightPath = path.resolve(
  process.cwd(),
  'scripts/clientToMissionProductionPreflight.sql',
);
const playwrightConfigPath = path.resolve(process.cwd(), 'playwright.config.ts');
const workflowDefinition = () => yaml.load(fs.readFileSync(workflowPath, 'utf8'));
const workflowStep = (job, name) => job.steps.find((candidate) => candidate.name === name);
const playwrightConfiguration = () => {
  const compiled = ts.transpileModule(fs.readFileSync(playwrightConfigPath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const configModule = { exports: {} };
  const controlledRequire = (name) => {
    if (name === '@playwright/test') {
      return {
        defineConfig: (config) => config,
        devices: {
          'Desktop Chrome': { browserName: 'chromium' },
          'Desktop Safari': { browserName: 'webkit' },
        },
      };
    }
    throw new Error(`Unexpected Playwright config import: ${name}`);
  };
  new Function('require', 'module', 'exports', 'process', compiled)(
    controlledRequire,
    configModule,
    configModule.exports,
    process,
  );
  return configModule.exports.default;
};

describe('Production Beta operational acceptance execution profile', () => {
  test('provides one isolated protected-runner migration-ledger diagnostic without operational execution', () => {
    const definition = workflowDefinition();
    const inputs = definition.on.workflow_dispatch.inputs;
    const diagnostic = definition.jobs['supabase-ledger-diagnostic'];
    const source = JSON.stringify(diagnostic);

    expect(inputs.supabase_ledger_diagnostic_only).toEqual({
      description: 'Diagnose only the protected-runner Supabase migration ledger path',
      required: false,
      type: 'boolean',
      default: false,
    });
    expect(diagnostic.environment).toBe('production-beta-acceptance');
    expect(diagnostic.if).toContain('inputs.supabase_ledger_diagnostic_only == true');
    expect(diagnostic.env).toEqual(expect.objectContaining({
      EXPECTED_SUPABASE_PROJECT_REF: 'fzkrvglzompkuiodqllr',
      SUPABASE_CLI_VERSION: '2.113.0',
      SUPABASE_ACCESS_TOKEN: '${{ secrets.SUPABASE_ACCESS_TOKEN }}',
      SUPABASE_DB_PASSWORD: '${{ secrets.SUPABASE_DB_PASSWORD }}',
    }));
    expect(source).toContain('migration list --linked');
    expect(source).toContain('exit_code=$?');
    expect(source).toContain('redact-diagnostic');
    expect(source).not.toMatch(/playwright|commercial-onboarding|archive-controlled|ftf_archive|db push|migration up|vercel deploy/);
  });

  test('dispatches Client-to-Mission alone only for the frozen healthy Production release', () => {
    const definition = workflowDefinition();
    const inputs = definition.on.workflow_dispatch.inputs;
    const preflight = definition.jobs['client-to-mission-preflight'];
    const authentication = definition.jobs['authentication-acceptance'];
    const onboarding = definition.jobs['commercial-onboarding-acceptance'];
    const operational = definition.jobs['operational-acceptance'];

    expect(inputs.client_to_mission_only).toEqual({
      description: 'Run only the existing Client-to-Mission Production acceptance',
      required: false,
      type: 'boolean',
      default: false,
    });
    expect(inputs.target_environment).toEqual({
      description: 'Explicit protected target',
      required: true,
      type: 'choice',
      options: ['production'],
      default: 'production',
    });
    expect(inputs.expected_release_sha).toEqual({
      description: 'Frozen Production application SHA',
      required: false,
      type: 'string',
      default: '',
    });
    expect(preflight.environment).toBe('production-beta-acceptance');
    expect(preflight.if).toContain('inputs.client_to_mission_only == true');
    expect(authentication.if).toContain('inputs.client_to_mission_only != true');
    expect(onboarding.if).toContain('inputs.client_to_mission_only != true');
    expect(operational.needs).toEqual(expect.arrayContaining([
      'deployment-identity',
      'client-to-mission-preflight',
      'commercial-onboarding-acceptance',
    ]));
    expect(operational.if).toContain("needs.client-to-mission-preflight.result == 'success'");
    expect(operational.if).toContain("needs.commercial-onboarding-acceptance.result == 'skipped'");
    expect(preflight.env.EXPECTED_RELEASE_SHA).toBe('${{ inputs.expected_release_sha }}');
    expect(preflight.env.EXPECTED_SUPABASE_PROJECT_REF).toBe('fzkrvglzompkuiodqllr');

    const preflightSource = fs.readFileSync(clientToMissionPreflightPath, 'utf8');
    expect(preflightSource).toContain("version='20260813130000'");
    expect(preflightSource).toContain("event_type='commercial_onboarding.acceptance_archived'");
    expect(preflightSource).toContain("topic='commercial_onboarding.acceptance_archived'");
    expect(preflightSource).toContain("tenant_id='961a4354-40f5-479d-a577-74839596ad14'::uuid");
    expect(preflightSource).toContain("digest mismatch: clients");
    expect(preflightSource).not.toContain("name like 'SC ACCEPTANCE — %'");
  });

  test('manual Client-to-Mission mode reuses the existing gate and cannot onboard, archive, migrate, or deploy', () => {
    const definition = workflowDefinition();
    const preflight = definition.jobs['client-to-mission-preflight'];
    const operational = definition.jobs['operational-acceptance'];
    const preflightSource = JSON.stringify(preflight);
    const operationalSource = JSON.stringify(operational);

    expect(workflowStep(operational, 'Run established Client-to-Mission gate').run)
      .toBe('npx playwright test --project=chromium --no-deps');
    expect(workflowStep(operational, 'Prove deterministic acceptance cleanup').run)
      .toBe('npx playwright test --project=cleanup --no-deps');
    expect(preflightSource).not.toMatch(/commercial-onboarding\.spec|archive-controlled|ftf_archive_controlled_commercial_onboarding/);
    expect(`${preflightSource}${operationalSource}`).not.toMatch(/db push(?! --linked --dry-run)|vercel deploy|supabase migration up/);
    expect(operationalSource).not.toMatch(/commercial-onboarding\.spec|archive-controlled|ftf_archive_controlled_commercial_onboarding/);
  });

  test('runs the reviewed Client-to-Mission harness against the separately verified runtime SHA', () => {
    const definition = workflowDefinition();
    const operational = definition.jobs['operational-acceptance'];
    const checkout = workflowStep(operational, 'Check out accepted source');
    const harness = workflowStep(operational, 'Load reviewed Client-to-Mission acceptance harness');
    const stepNames = operational.steps.map(({ name }) => name);

    expect(checkout.with.ref).toBe('${{ needs.deployment-identity.outputs.commit-sha }}');
    expect(harness.env.ACCEPTANCE_HARNESS_SHA).toBe('${{ github.sha }}');
    expect(harness.run).toContain('e2e/acceptance/client-to-mission.spec.ts');
    expect(harness.run).not.toMatch(/\bsrc\/|\bserver\/|\bapi\/|playwright\.config/);
    expect(stepNames.indexOf('Install locked dependencies'))
      .toBeLessThan(stepNames.indexOf('Load reviewed Client-to-Mission acceptance harness'));
    expect(stepNames.indexOf('Load reviewed Client-to-Mission acceptance harness'))
      .toBeLessThan(stepNames.indexOf('Run established Client-to-Mission gate'));
  });

  test('pins deterministic acceptance execution to the approved operational timezone', () => {
    const definition = workflowDefinition();

    expect(definition.env).toEqual({ TZ: 'Australia/Brisbane' });
  });

  test('declares the reusable acceptance secret contract and fails closed before browser execution', () => {
    const definition = workflowDefinition();
    const contract = definition.on.workflow_call.secrets;
    const authentication = definition.jobs['authentication-acceptance'];
    const operational = definition.jobs['operational-acceptance'];
    const authGuard = workflowStep(authentication, 'Protect acceptance credentials in runner output');
    const operationalGuard = workflowStep(operational, 'Protect acceptance credentials in runner output');

    expect(contract.E2E_ORGANISATION_EMAIL).toEqual({ required: false });
    expect(contract.E2E_ORGANISATION_PASSWORD).toEqual({ required: false });
    expect(contract.SUPABASE_ACCESS_TOKEN).toEqual({ required: false });
    expect(contract.SUPABASE_DB_PASSWORD).toEqual({ required: false });
    expect(authentication.environment).toBe('production-beta-acceptance');
    expect(operational.environment).toBe('production-beta-acceptance');
    expect(authentication.env.E2E_ORGANISATION_EMAIL).toBe('${{ secrets.E2E_ORGANISATION_EMAIL }}');
    expect(authentication.env.E2E_ORGANISATION_PASSWORD).toBe('${{ secrets.E2E_ORGANISATION_PASSWORD }}');
    expect(authGuard.run).toContain('[[ -n "$E2E_ORGANISATION_EMAIL" ]]');
    expect(authGuard.run).toContain('[[ -n "$E2E_ORGANISATION_PASSWORD" ]]');
    expect(operationalGuard.run).toContain('[[ -n "$E2E_ORGANISATION_EMAIL" ]]');
    expect(operationalGuard.run).toContain('[[ -n "$E2E_ORGANISATION_PASSWORD" ]]');
    expect(JSON.stringify(definition.jobs)).not.toMatch(/production-beta-deployment/);
    expect(JSON.stringify({ authentication, operational }))
      .not.toMatch(/SUPABASE_ACCESS_TOKEN|SUPABASE_DB_PASSWORD|VERCEL_TOKEN/);
  });

  test('uses protected environment secrets without persisting credentials', () => {
    const workflow = fs.readFileSync(workflowPath, 'utf8');

    expect(workflow).toContain('environment: production-beta-acceptance');
    expect(workflow).toContain('E2E_BASE_URL: https://spray-command-production-beta.vercel.app');
    expect(workflow).toContain('E2E_ORGANISATION_EMAIL: ${{ secrets.E2E_ORGANISATION_EMAIL }}');
    expect(workflow).toContain('E2E_ORGANISATION_PASSWORD: ${{ secrets.E2E_ORGANISATION_PASSWORD }}');
    expect(workflow).toContain('::add-mask::$E2E_ORGANISATION_EMAIL');
    expect(workflow).toContain('::add-mask::$E2E_ORGANISATION_PASSWORD');
    expect(workflow).toContain('npx playwright test --project=environment');
    expect(workflow).toContain('npx playwright test --project=auth');
    expect(workflow).toContain('npx playwright test --project=cleanup --no-deps');
    expect(workflow).toContain('npx playwright test --project=chromium --no-deps');
    expect(workflow).toContain('if-no-files-found: ignore');
    expect(workflow).toContain('cancel-in-progress: false');

    expect(workflow).not.toMatch(/password\s*:\s*['"][^$]/i);
    expect(workflow).not.toMatch(/email\s*:\s*['"][^$]/i);
    const dispatchInputs = workflowDefinition().on.workflow_dispatch.inputs;
    expect(Object.keys(dispatchInputs).some((name) => name.startsWith('E2E_'))).toBe(false);
  });

  test('disables reusable authentication captures for every project that consumes credentials or storage state', () => {
    const config = playwrightConfiguration();

    for (const name of ['auth', 'cleanup', 'chromium', 'commercial-onboarding']) {
      const project = config.projects.find((candidate) => candidate.name === name);
      expect(project).toBeDefined();
      const effectiveUse = { ...config.use, ...project.use };
      expect(effectiveUse).toMatchObject({ trace: 'off', screenshot: 'off', video: 'off' });
    }
  });

  test('defines both Chromium and WebKit browser projects for responsive acceptance coverage', () => {
    const config = playwrightConfiguration();

    expect(config.projects).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'chromium', use: expect.objectContaining({ browserName: 'chromium' }) }),
      expect.objectContaining({ name: 'webkit', use: expect.objectContaining({ browserName: 'webkit' }) }),
    ]));
  });

  test('uploads only explicit safe text outcomes after removing authenticated storage', () => {
    const operational = workflowDefinition().jobs['operational-acceptance'];
    const names = operational.steps.map(({ name }) => name);
    const diagnostics = workflowStep(operational, 'Write safe text failure diagnostics');
    const removeAuth = workflowStep(operational, 'Remove authentication state');
    const upload = workflowStep(operational, 'Retain safe text failure diagnostics');

    expect(diagnostics).toBeDefined();
    expect(removeAuth).toBeDefined();
    expect(upload).toBeDefined();
    if (!diagnostics || !removeAuth || !upload) return;
    expect(diagnostics.if).toBe('failure()');
    expect(diagnostics.run).toContain('test-results/safe-diagnostics/operational-acceptance.txt');
    expect(diagnostics.env).toEqual(expect.objectContaining({
      ENVIRONMENT_RESULT: '${{ steps.environment.outcome }}',
      AUTHENTICATION_RESULT: '${{ steps.authentication.outcome }}',
      CLEANUP_RESULT: '${{ steps.cleanup.outcome }}',
      OPERATIONAL_RESULT: '${{ steps.operational.outcome }}',
    }));
    expect(names.indexOf(removeAuth.name)).toBeLessThan(names.indexOf(upload.name));
    expect(upload.with.path).toBe('test-results/safe-diagnostics/operational-acceptance.txt');
    expect(upload.with.path).not.toMatch(/\.auth|playwright-report|playwright-artifacts|storage/i);
  });

  test('proves authentication before starting the operational workflow', () => {
    const workflow = fs.readFileSync(workflowPath, 'utf8');
    const environmentIndex = workflow.indexOf('npx playwright test --project=environment');
    const authenticationIndex = workflow.indexOf('npx playwright test --project=auth');
    const cleanupIndex = workflow.indexOf('npx playwright test --project=cleanup --no-deps');
    const operationalIndex = workflow.indexOf('npx playwright test --project=chromium --no-deps');

    expect(environmentIndex).toBeGreaterThan(-1);
    expect(authenticationIndex).toBeGreaterThan(environmentIndex);
    expect(cleanupIndex).toBeGreaterThan(authenticationIndex);
    expect(operationalIndex).toBeGreaterThan(cleanupIndex);
  });

  test('supports a mailbox-only Preview preflight without entering operational acceptance', () => {
    const definition = workflowDefinition();
    const dispatch = definition.on.workflow_dispatch;
    const preflight = definition.jobs['mailbox-preview-preflight'];

    expect(dispatch.inputs.mailbox_preflight_only).toMatchObject({
      required: false,
      type: 'boolean',
      default: false,
    });
    expect(dispatch.inputs.mailbox_preview_url).toBeUndefined();
    expect(preflight.environment).toBe('production-beta-acceptance');
    expect(preflight.if).toContain('inputs.mailbox_preflight_only == true');
    expect(preflight.env).toEqual(expect.objectContaining({
      MAILBOX_PREVIEW_URL: 'https://spray-command-production-beta-ra6pdkcu5-bjt-ftfs-projects.vercel.app',
      E2E_ONBOARDING_MAILBOX_TOKEN: '${{ secrets.E2E_ONBOARDING_MAILBOX_TOKEN }}',
      VERCEL_AUTOMATION_BYPASS_SECRET: '${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}',
    }));
    expect(preflight.steps.map(({ name }) => name)).toContain('Verify mailbox Preview runtime sequence');
    expect(definition.jobs['deployment-identity'].if).toContain('inputs.mailbox_preflight_only != true');
  });
});
