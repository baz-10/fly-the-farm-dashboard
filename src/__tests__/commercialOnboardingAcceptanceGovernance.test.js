const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const root = path.resolve(__dirname, '../..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const workflow = () => yaml.load(read('.github/workflows/production-beta-operational-acceptance.yml'));

const step = (job, name) => job.steps.find((candidate) => candidate.name === name);

describe('commercial onboarding acceptance governance', () => {
  test('defines the complete unattended lifecycle and hostile boundaries', () => {
    const source = read('e2e/acceptance/commercial-onboarding.spec.ts');
    for (const marker of [
      'Apply for Spray Command', 'Start review', 'Approve application', 'Send invitation',
      'Activate organisation', 'Getting Started', 'Save confirmed Base',
      'Aircraft', 'Equipment', 'Personnel', 'Client', 'Property', 'Field', 'Job',
      'Draft Mission', 'Operational Readiness', 'second session',
      'APPLICATION_UNAVAILABLE', 'APPROVED_APPLICATION_REQUIRED', 'CROSS_ORIGIN_REQUEST', 'UNAUTHENTICATED',
      'controlledApplicantAlias',
    ]) expect(source).toContain(marker);
    expect(source).not.toMatch(/localStorage\.setItem|sessionStorage\.setItem/);
  });

  test('keeps authentication artefacts disabled and secrets environment-managed', () => {
    const workflow = read('.github/workflows/production-beta-operational-acceptance.yml');
    for (const secret of [
      'E2E_ONBOARDING_APPLICANT_EMAIL', 'E2E_ONBOARDING_APPLICANT_PASSWORD',
      'E2E_PLATFORM_EMAIL', 'E2E_PLATFORM_PASSWORD',
      'E2E_ONBOARDING_MAILBOX_URL', 'E2E_ONBOARDING_MAILBOX_TOKEN',
    ]) expect(workflow).toContain(`secrets.${secret}`);
    expect(workflow).toContain('commercial-onboarding.spec.ts');
    expect(workflow).toContain('verify:commercial-onboarding');
    const playwright = read('playwright.config.ts');
    expect(playwright).toContain("trace: 'off'");
    expect(playwright).toContain("screenshot: 'off'");
    expect(playwright).toContain("video: 'off'");
    expect(playwright).toMatch(/name: 'commercial-onboarding'[\s\S]*retries: 0/);
    expect(workflow).not.toContain('name: commercial-onboarding-acceptance-failure');
  });

  test('orders exact-deployment gates and verifies controlled production evidence before transactional cleanup', () => {
    const definition = workflow();
    const authentication = definition.jobs['authentication-acceptance'];
    const onboarding = definition.jobs['commercial-onboarding-acceptance'];
    const operational = definition.jobs['operational-acceptance'];

    expect(authentication).toBeDefined();
    expect(onboarding).toBeDefined();
    expect(operational).toBeDefined();
    expect(authentication.needs).toBe('deployment-identity');
    expect(onboarding.needs).toEqual(['deployment-identity', 'authentication-acceptance']);
    expect(operational.needs).toEqual(['deployment-identity', 'commercial-onboarding-acceptance']);

    for (const job of [authentication, onboarding, operational]) {
      expect(step(job, 'Check out accepted source').with.ref)
        .toBe('${{ needs.deployment-identity.outputs.commit-sha }}');
    }

    const onboardingSteps = onboarding.steps.map(({ name }) => name);
    expect(onboardingSteps.indexOf('Run unattended commercial onboarding'))
      .toBeLessThan(onboardingSteps.indexOf('Verify exact controlled onboarding evidence'));
    expect(onboardingSteps.indexOf('Verify exact controlled onboarding evidence'))
      .toBeLessThan(onboardingSteps.indexOf('Archive only the controlled onboarding organisation transactionally'));

    const operationalSteps = operational.steps.map(({ name }) => name);
    expect(operationalSteps.indexOf('Recreate authenticated browser state'))
      .toBeLessThan(operationalSteps.indexOf('Prove deterministic acceptance cleanup'));
    expect(operationalSteps.indexOf('Prove deterministic acceptance cleanup'))
      .toBeLessThan(operationalSteps.indexOf('Run established Client-to-Mission gate'));

    expect(step(onboarding, 'Verify exact controlled onboarding evidence').run)
      .toContain('--verify-controlled test-results/commercial-onboarding-evidence.json');
    expect(step(onboarding, 'Run deterministic sharded regression').run).toContain('test:ci:sharded');
    expect(read('.github/workflows/production-beta-operational-acceptance.yml'))
      .toContain('github.event.client_payload.commitSha');
  });

  test('ships a repository-controlled PostgreSQL verifier and operator runbook', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.scripts['verify:product-maturity']).toBe('node scripts/verifyProductMaturityRegistry.mjs');
    expect(pkg.scripts['verify:commercial-onboarding']).toBe('node scripts/verifyCommercialOnboardingPostgres.mjs');
    const verifier = read('scripts/verifyCommercialOnboardingPostgres.mjs');
    for (const evidence of [
      'commercial_onboarding_application_events', 'commercial_onboarding_invitation_events',
      'organisations', 'memberships', 'organisation_seat_allocations',
      'membership_operating_location_assignments', 'platform_users', 'personnel',
      'audit_events', 'transactional_outbox',
    ]) expect(verifier).toContain(evidence);
    expect(verifier).toContain('commercial_onboarding.acceptance_archived');
    expect(verifier).toContain('--verify-controlled');
    expect(verifier).toContain('ftf_archive_controlled_commercial_onboarding');
    expect(read('docs/operations/commercial-onboarding-runbook.md')).toContain('Application → Review → Approval → Invitation');
    expect(read('docs/operations/commercial-onboarding-runbook.md')).toContain('supports `+` addressing');
  });
});
