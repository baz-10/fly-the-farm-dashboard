import { expect, test as base } from '@playwright/test';

const CONTRACTOR = {
  id: 'e2e-contractor',
  email: 'operator@example.test',
  name: 'Synthetic Operator',
  password: 'local-e2e-only',
  role: 'contractor',
  tenantId: 'e2e-tenant',
  inviteCode: 'E2E001',
};

export const test = base.extend<{ authenticatedPage: void }>({
  authenticatedPage: [async ({ page }, use) => {
    await page.addInitScript((contractor) => {
      window.localStorage.setItem('ftf_users', JSON.stringify({
        [contractor.email]: contractor,
      }));
      window.localStorage.setItem('ftf_session', JSON.stringify({
        id: contractor.id,
        email: contractor.email,
        name: contractor.name,
        role: contractor.role,
        tenantId: contractor.tenantId,
        inviteCode: contractor.inviteCode,
        tier: 'free',
      }));
    }, CONTRACTOR);
    await use();
  }, { auto: true }],
});

export { expect };
