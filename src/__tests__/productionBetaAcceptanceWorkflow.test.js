const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const yaml = require('js-yaml');

const workflowPath = path.resolve(
  process.cwd(),
  '.github/workflows/production-beta-operational-acceptance.yml',
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
      return { defineConfig: (config) => config, devices: { 'Desktop Chrome': { browserName: 'chromium' } } };
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
