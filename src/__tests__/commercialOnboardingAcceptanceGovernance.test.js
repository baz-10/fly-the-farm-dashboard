const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

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
    const workflow = read('.github/workflows/production-beta-operational-acceptance.yml');
    const ordered = [
      'Resolve exact deployed commit',
      'Prove Organisation authentication',
      'Prove deterministic acceptance cleanup',
      'Run established Client-to-Mission gate',
      'Run unattended commercial onboarding',
      'Verify exact controlled onboarding evidence',
      'Archive only the controlled onboarding organisation transactionally',
    ];
    let cursor = -1;
    for (const marker of ordered) {
      const next = workflow.indexOf(marker);
      expect(next).toBeGreaterThan(cursor);
      cursor = next;
    }
    expect(workflow).toContain('--verify-controlled test-results/commercial-onboarding-evidence.json');
    expect(workflow).toContain('test:ci:sharded');
    expect(workflow).toContain('github.event.client_payload.commitSha');
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
