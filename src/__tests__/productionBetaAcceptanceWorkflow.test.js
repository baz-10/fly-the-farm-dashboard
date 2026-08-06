const fs = require('fs');
const path = require('path');

const workflowPath = path.resolve(
  process.cwd(),
  '.github/workflows/production-beta-operational-acceptance.yml',
);
const playwrightConfigPath = path.resolve(process.cwd(), 'playwright.config.ts');

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
    expect(workflow).not.toContain('workflow_dispatch:\n      inputs:');
  });

  test('does not retain authentication screenshots, video, or traces', () => {
    const config = fs.readFileSync(playwrightConfigPath, 'utf8');

    expect(config).toContain("name: 'auth'");
    expect(config).toMatch(/name: 'auth'[\s\S]*trace: 'off'/);
    expect(config).toMatch(/name: 'auth'[\s\S]*screenshot: 'off'/);
    expect(config).toMatch(/name: 'auth'[\s\S]*video: 'off'/);
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
});
