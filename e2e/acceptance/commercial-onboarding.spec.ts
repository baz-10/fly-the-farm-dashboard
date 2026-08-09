import { expect, Page, test } from '@playwright/test';
import path from 'node:path';
import { acceptanceRunLabel, findAcceptanceRecord } from './fixtures/acceptanceRecords';
import { persistProvisionedOnboardingEvidence } from './fixtures/commercialOnboardingEvidence';
import { classifyCommercialOnboardingInvitationLink } from './fixtures/commercialOnboardingInvitation';
import { openMissionCreationWorkspace } from './fixtures/missionCreationWorkspace';

type SecretSource = Record<string, string | undefined>;
type OnboardingEnvironment = {
  baseUrl: string;
  applicantMailboxEmail: string;
  applicantPassword: string;
  platformEmail: string;
  platformPassword: string;
  mailboxUrl: string;
  mailboxToken: string;
  supabaseOrigin: string;
};

const required = (source: SecretSource, name: string): string => {
  const value = source[name];
  if (!value?.trim()) throw new Error(`Commercial onboarding acceptance requires ${name}.`);
  return value;
};

export function commercialOnboardingEnvironment(source: SecretSource = process.env): OnboardingEnvironment {
  const baseUrl = new URL(required(source, 'E2E_BASE_URL')).origin;
  const mailboxUrl = new URL(required(source, 'E2E_ONBOARDING_MAILBOX_URL'));
  const supabaseUrl = new URL(required(source, 'SUPABASE_URL'));
  if (new URL(baseUrl).protocol !== 'https:' || mailboxUrl.protocol !== 'https:' || supabaseUrl.protocol !== 'https:') {
    throw new Error('Commercial onboarding acceptance requires HTTPS application, mailbox and Supabase endpoints.');
  }
  return {
    baseUrl,
    applicantMailboxEmail: required(source, 'E2E_ONBOARDING_APPLICANT_EMAIL').trim().toLowerCase(),
    applicantPassword: required(source, 'E2E_ONBOARDING_APPLICANT_PASSWORD'),
    platformEmail: required(source, 'E2E_PLATFORM_EMAIL').trim().toLowerCase(),
    platformPassword: required(source, 'E2E_PLATFORM_PASSWORD'),
    mailboxUrl: mailboxUrl.toString(),
    mailboxToken: required(source, 'E2E_ONBOARDING_MAILBOX_TOKEN'),
    supabaseOrigin: supabaseUrl.origin,
  };
}

function controlledApplicantAlias(mailbox: string, runId: string): string {
  const at = mailbox.lastIndexOf('@');
  if (at < 1 || at === mailbox.length - 1) throw new Error('E2E_ONBOARDING_APPLICANT_EMAIL must be a valid mailbox address.');
  const local = mailbox.slice(0, at).split('+')[0];
  const tag = runId.toLowerCase().replace(/[^a-z0-9]/g, '').slice(-30);
  if (!tag) throw new Error('Commercial onboarding acceptance could not create a controlled mailbox alias.');
  return `${local}+sc-onboarding-${tag}@${mailbox.slice(at + 1)}`;
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  const responsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/auth'
    && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Sign In' }).click();
  const response = await responsePromise;
  const body = await response.json().catch(() => ({}));
  if (!response.ok()) throw new Error(`ONBOARDING_LOGIN_FAILED code=${body?.error?.code || 'UNKNOWN'} correlation=${body?.correlationId || 'unavailable'}`);
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
}

async function signOut(page: Page) {
  const origin = new URL(page.url()).origin;
  const response = await page.request.post('/api/auth', { headers: { Origin: origin }, data: { action: 'logout' } });
  expect(response.status(), 'Organisation logout must succeed before re-login verification').toBe(200);
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
}

async function waitForInvitationLink(page: Page, environment: OnboardingEnvironment, applicantEmail: string, invitationId: string, after: string) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const mailbox = new URL(environment.mailboxUrl);
    mailbox.searchParams.set('recipient', applicantEmail);
    mailbox.searchParams.set('after', after);
    const response = await page.request.get(mailbox.toString(), {
      headers: { Authorization: `Bearer ${environment.mailboxToken}`, Accept: 'application/json' },
      timeout: 15_000,
    });
    if (response.ok()) {
      const body = await response.json().catch(() => ({}));
      const links = Array.isArray(body?.messages)
        ? body.messages.flatMap((message: any) => Array.isArray(message?.links) ? message.links : [])
        : [];
      const match = links.map((candidate: unknown) => classifyCommercialOnboardingInvitationLink(String(candidate), {
        applicationOrigin: environment.baseUrl,
        supabaseOrigin: environment.supabaseOrigin,
        invitationId,
      })).find(Boolean);
      if (match) return match;
    }
    await page.waitForTimeout(2_000);
  }
  throw new Error('ONBOARDING_INVITATION_EMAIL_NOT_RECEIVED');
}

async function openInvitation(page: Page, environment: OnboardingEnvironment, invitation: { url: string }, invitationId: string) {
  try {
    await page.goto(invitation.url);
  } catch {
    throw new Error('ONBOARDING_INVITATION_PROVIDER_NAVIGATION_FAILED');
  }
  await page.waitForURL((candidate) => candidate.origin === environment.baseUrl
    && candidate.pathname === '/onboarding/accept'
    && candidate.searchParams.get('invitation') === invitationId)
    .catch(() => { throw new Error('ONBOARDING_INVITATION_CANONICAL_REDIRECT_FAILED'); });
  await expect(page.getByRole('heading', { name: 'Activate your organisation' })).toBeVisible();
}

async function assertAuthoritativeOperationalReadiness(page: Page) {
  const response = await page.request.get('/api/v1/getting-started');
  expect(response.status(), 'Getting Started must return authoritative readiness').toBe(200);
  const projection = (await response.json()).data;
  const requiredSteps = projection.steps.filter((step: any) => !step.optional);
  expect(requiredSteps).not.toHaveLength(0);
  expect(requiredSteps.every((step: any) => step.state === 'COMPLETE')).toBe(true);
  expect(projection.steps).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'PERSONNEL', state: 'OPTIONAL', count: 0, optional: true }),
  ]));
  expect(projection.operationalReadiness).toMatchObject({
    state: 'NEEDS_OPERATIONAL_ATTENTION',
    requiredActions: [],
    personnel: { state: 'NOT_RECORDED' },
  });
  expect(projection.operationalReadiness.advisories.filter((item: any) => item.code === 'REOC_MISSING')).toEqual([{
    code: 'REOC_MISSING',
    label: 'ReOC certificate missing',
    reason: 'Required ReOC record is missing.',
    route: '/compliance/reoc',
    requiresAttention: true,
    modelVersion: 'AU-CASA-HEALTH-1',
    criticalRuleVersion: 1,
  }]);
  return projection;
}

async function createAircraftAndEquipment(page: Page, label: string) {
  const locationsResponse = await page.request.get('/api/v1/operating-locations?page=1&pageSize=100');
  expect(locationsResponse.ok()).toBeTruthy();
  const locations = (await locationsResponse.json()).data;
  expect(locations).not.toHaveLength(0);
  const operatingLocationId = locations[0].id;
  const origin = new URL(page.url()).origin;
  const registration = `SC-${label.replace(/\D/g, '').slice(-12)}`;
  const aircraftResponse = await page.request.post('/api/v1/aircraft', {
    headers: { Origin: origin },
    data: {
      operatingLocationId, registration, manufacturer: 'Acceptance Aircraft', model: 'Controlled Beta',
      serialNumber: label, activationDate: '2026-08-09', status: 'operational',
      serviceabilityState: 'serviceable', missionReady: true, mtow: 149.9, maxAltitude: 120, maxWindSpeed: 25,
      maintenanceDates: { lastInspection: '2026-08-09', nextInspectionDue: '2027-08-09', lastMajorService: '2026-08-09', nextMajorServiceDue: '2027-08-09', totalFlightHours: 0, hoursSinceLastService: 0 },
      insurance: { policyNumber: label, provider: 'Controlled acceptance evidence', expiryDate: '2027-08-09', coverageAmount: 1, hullValue: 1 },
      operationalLimits: { minOperatingTemp: -10, maxOperatingTemp: 45, maxPayloadWeight: 75, batteryCycles: 0, maxFlightTime: 18, serviceRange: 8, minimumCrewSize: 1 },
      documentation: { manuals: [], certificates: [], logbooks: [], complianceChecks: { casaCompliant: false, lastCasaInspection: '', nextCasaInspectionDue: '' } },
      notes: 'Controlled Production Beta onboarding acceptance record.',
    },
  });
  expect(aircraftResponse.ok(), 'Aircraft should persist through the ordinary API').toBeTruthy();
  const aircraft = (await aircraftResponse.json()).data;
  const equipmentResponse = await page.request.post('/api/v1/equipment-kits', {
    headers: { Origin: origin },
    data: {
      operatingLocationId, name: label, type: 'spray-system', description: 'Controlled acceptance equipment',
      specifications: { weight: 1 }, components: [], operationalData: { status: 'available' },
      financialData: { purchasePrice: 1 }, compatibleAircraft: [aircraft.id], notes: 'Controlled acceptance record.',
    },
  });
  expect(equipmentResponse.ok(), 'Equipment should persist through the ordinary API').toBeTruthy();
  return { operatingLocationId, aircraft: aircraft.id, equipment: (await equipmentResponse.json()).data.id, registration };
}

test('Application → review → approval → invitation → first Draft Mission reaches Operational Readiness', async ({ browser, page }, testInfo) => {
  testInfo.setTimeout(420_000);
  const environment = commercialOnboardingEnvironment();
  const label = `${acceptanceRunLabel()} ONBOARDING`;
  const applicantEmail = controlledApplicantAlias(environment.applicantMailboxEmail, label);
  const mailboxAfter = new Date(Date.now() - 5_000).toISOString();
  const records: Record<string, any> = {};
  let applicationReference = '';
  let applicationId = '';
  let invitationId = '';
  let organisationId = '';

  try {
    await page.goto('/apply');
    await expect(page.getByRole('heading', { name: 'Apply for Spray Command' })).toBeVisible();
    await page.getByLabel('Business name').fill(label);
    await page.getByLabel('Your name').fill('Controlled Acceptance Administrator');
    await page.getByLabel('Email').fill(applicantEmail);
    await page.getByLabel('Phone').fill('0400 000 000');
    await page.getByLabel('Base name').fill(`${label} Base`);
    await page.getByLabel('Base address').fill('1 Queen Street, Brisbane QLD 4000');
    const addressOptions = page.getByRole('option');
    await expect(addressOptions).not.toHaveCount(0);
    await addressOptions.first().click();
    const confirmLocation = page.getByRole('button', { name: /Confirm location|Location confirmed/ });
    if (await confirmLocation.isVisible()) await confirmLocation.click();
    await page.getByLabel(/I confirm these details/).check();
    await page.getByRole('button', { name: 'Send application' }).click();
    await expect(page.getByRole('heading', { name: 'Application received' })).toBeVisible();
    applicationReference = (await page.locator('text=/SC-APP-[A-Z0-9]+/').first().innerText()).trim();

    const crossOrigin = await page.request.post('/api/v1/commercial-onboarding?action=apply', {
      headers: { Origin: 'https://cross-origin.invalid', 'Sec-Fetch-Site': 'cross-site' }, data: {},
    });
    expect(crossOrigin.status()).toBe(403);
    expect((await crossOrigin.json()).error.code).toBe('CROSS_ORIGIN_REQUEST');
    const unauthenticatedList = await page.request.get('/api/v1/commercial-onboarding?action=list');
    expect([401, 403]).toContain(unauthenticatedList.status());

    const platformContext = await browser.newContext();
    const platformPage = await platformContext.newPage();
    await signIn(platformPage, environment.platformEmail, environment.platformPassword);
    await platformPage.goto('/platform');
    await expect(platformPage.getByRole('heading', { name: 'Platform Administration' })).toBeVisible();
    const application = platformPage.locator('[class*="MuiCard-root"]').filter({ hasText: applicationReference }).first();
    await expect(application).toBeVisible();

    const applicationListResponse = await platformPage.request.get('/api/v1/commercial-onboarding?action=list');
    expect(applicationListResponse.ok()).toBeTruthy();
    const submittedApplication = ((await applicationListResponse.json()).data || [])
      .find((candidate: any) => candidate.applicationReference === applicationReference);
    expect(submittedApplication?.id).toBeTruthy();
    applicationId = submittedApplication.id;

    const unapprovedIssue = await platformPage.request.post('/api/v1/commercial-onboarding?action=issue', {
      headers: { Origin: environment.baseUrl },
      data: { applicationId: submittedApplication.id, expectedVersion: submittedApplication.rowVersion, notes: 'Direct unapproved invitation must fail.' },
    });
    expect(unapprovedIssue.status()).toBe(409);
    expect((await unapprovedIssue.json()).error.code).toBe('APPROVED_APPLICATION_REQUIRED');

    await application.getByRole('button', { name: 'Start review' }).click();
    await expect(application.getByRole('button', { name: 'Approve application' })).toBeVisible();
    await application.getByRole('button', { name: 'Approve application' }).click();
    await platformPage.getByLabel('Decision notes').fill('Controlled Production Beta onboarding approval.');
    await platformPage.getByRole('button', { name: 'Confirm approval' }).click();
    await expect(application.getByRole('button', { name: 'Send invitation' })).toBeVisible();
    await application.getByRole('button', { name: 'Send invitation' }).click();
    await platformPage.getByLabel('Invitation notes').fill('Controlled Production Beta onboarding invitation.');
    const issueResponsePromise = platformPage.waitForResponse((response) => response.url().includes('action=issue') && response.request().method() === 'POST');
    await platformPage.getByRole('button', { name: 'Confirm and send invitation' }).click();
    const issueResponse = await issueResponsePromise;
    expect(issueResponse.status()).toBe(201);
    invitationId = (await issueResponse.json()).data.invitation_id;

    const preAcceptanceList = await platformPage.request.get('/api/v1/commercial-onboarding?action=list');
    expect(preAcceptanceList.ok()).toBeTruthy();
    const preAcceptanceApplication = ((await preAcceptanceList.json()).data || [])
      .find((candidate: any) => candidate.applicationReference === applicationReference);
    expect(preAcceptanceApplication?.invitations).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: invitationId, resultingOrganisation: null }),
    ]));

    const platformOperationalRead = await platformPage.request.get('/api/v1/clients?page=1&pageSize=1');
    expect([401, 403]).toContain(platformOperationalRead.status());
    await platformContext.close();

    const invitationLink = await waitForInvitationLink(page, environment, applicantEmail, invitationId, mailboxAfter);
    await openInvitation(page, environment, invitationLink, invitationId);
    await page.getByLabel('Create password').fill(environment.applicantPassword);
    await page.getByLabel('Confirm password').fill(environment.applicantPassword);
    const activationResponsePromise = page.waitForResponse((response) => {
      if (new URL(response.url()).pathname !== '/api/auth' || response.request().method() !== 'POST') return false;
      try { return response.request().postDataJSON()?.action === 'accept-organisation-invitation'; } catch { return false; }
    });
    await page.getByRole('button', { name: 'Activate organisation' }).click();
    const activationResponse = await activationResponsePromise;
    expect(activationResponse.status(), 'Atomic organisation provisioning must succeed').toBe(200);
    const activation = await activationResponse.json();
    expect(activation.provisioning).toEqual({
      invitationId,
      organisationId: expect.any(String),
      operatingLocationId: expect.any(String),
    });
    organisationId = activation.provisioning.organisationId;
    await persistProvisionedOnboardingEvidence(path.resolve('test-results/commercial-onboarding-evidence.json'), {
      applicationId, applicationReference, invitationId, organisationId,
      operatingLocationId: activation.provisioning.operatingLocationId,
    });

    await expect(page).toHaveURL(/\/getting-started$/);
    await expect(page.getByRole('heading', { name: 'Getting Started' })).toBeVisible();

    const trustedSession = await page.request.get('/api/v1/session');
    expect(trustedSession.status()).toBe(200);
    const session = (await trustedSession.json()).data;
    expect(session.organisation.id).toBe(organisationId);
    expect(session.roles).toContain('admin');
    expect(session.identityPlane).not.toBe('platform');

    const provisionedBasesResponse = await page.request.get('/api/v1/operating-locations?page=1&pageSize=100');
    expect(provisionedBasesResponse.ok()).toBeTruthy();
    const provisionedBases = (await provisionedBasesResponse.json()).data || [];
    expect(provisionedBases).toHaveLength(1);

    expect(provisionedBases[0].id).toBe(activation.provisioning.operatingLocationId);

    const baseSave = page.getByRole('button', { name: 'Save confirmed Base' });
    if (await baseSave.count()) {
      await page.getByLabel('Search Base address').fill('1 Queen Street, Brisbane QLD 4000');
      await expect(page.getByRole('option')).not.toHaveCount(0);
      await page.getByRole('option').first().click();
      const confirm = page.getByRole('button', { name: /Confirm location|Location confirmed/ });
      if (await confirm.isVisible()) await confirm.click();
      await baseSave.click();
      await expect(page.getByText('Your Base is confirmed and saved.')).toBeVisible();
    }

    const resources = await createAircraftAndEquipment(page, label);
    await page.goto('/aircraft?returnTo=%2Fgetting-started');
    await expect(page.getByText(resources.registration).first()).toBeVisible();
    await page.getByRole('tab', { name: /Equipment Kits/ }).click();
    await expect(page.getByText(label).first()).toBeVisible();
    await page.goto('/getting-started');
    await expect(page.getByRole('region', { name: 'Personnel readiness' })).toBeVisible();
    await expect(page.getByText(/Personnel.*not yet|Add Personnel/i).first()).toBeVisible();

    await openMissionCreationWorkspace(page);
    await page.getByRole('button', { name: 'Add new Client' }).click();
    await page.getByRole('textbox', { name: 'Client or business name' }).fill(label);
    await page.getByRole('button', { name: 'Save Client and continue' }).click();
    records.client = await findAcceptanceRecord(page.request, 'clients', label);
    await page.getByRole('button', { name: 'Add new Property' }).click();
    await page.getByRole('textbox', { name: 'Property name' }).fill(label);
    await page.getByRole('textbox', { name: 'Property location' }).fill('1 Queen Street, Brisbane QLD 4000');
    await expect(page.getByRole('option')).not.toHaveCount(0);
    await page.getByRole('option').first().click();
    await page.getByRole('button', { name: 'Confirm location' }).click();
    await page.getByRole('button', { name: 'Save Property and continue' }).click();
    records.property = await findAcceptanceRecord(page.request, 'properties', label);
    await page.getByRole('button', { name: 'Create new Field' }).click();
    await page.getByRole('textbox', { name: 'Field name' }).fill(label);
    await page.getByRole('button', { name: 'Upload' }).click();
    await page.locator('input[type="file"][accept*=".kml"]').setInputFiles(
      path.join(__dirname, 'fixtures/acceptance-boundary.kml'),
    );
    await expect(page.getByText(/Calculated area: (?!0\.00)/)).toBeVisible();
    await page.getByRole('button', { name: 'Save Field and boundary' }).click();
    records.field = await findAcceptanceRecord(page.request, 'fields', label);
    await page.getByRole('button', { name: 'Create new Job' }).click();
    await page.getByRole('textbox', { name: 'Job scope' }).fill(label);
    await page.getByRole('button', { name: 'Save Job and continue' }).click();
    records.job = await findAcceptanceRecord(page.request, 'jobs', label);
    await page.getByRole('textbox', { name: 'Mission title' }).fill(label);
    await page.getByRole('button', { name: 'Create Draft Mission' }).click();
    await expect(page).toHaveURL(/\/missions\/[0-9a-f-]+\?guided=1$/, { timeout: 45_000 });
    records.mission = await findAcceptanceRecord(page.request, 'missions', label);

    await page.goto('/getting-started');
    await expect(page.getByRole('heading', { name: 'Getting Started' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your workspace needs operational attention' })).toBeVisible();
    await assertAuthoritativeOperationalReadiness(page);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Getting Started' })).toBeVisible();
    await assertAuthoritativeOperationalReadiness(page);

    await signOut(page);
    await signIn(page, applicantEmail, environment.applicantPassword);
    await page.goto('/getting-started');
    await assertAuthoritativeOperationalReadiness(page); // re-login

    const secondContext = await browser.newContext();
    const secondPage = await secondContext.newPage();
    await signIn(secondPage, applicantEmail, environment.applicantPassword);
    await secondPage.goto('/getting-started');
    await expect(secondPage.getByRole('heading', { name: 'Getting Started' })).toBeVisible(); // second session
    await assertAuthoritativeOperationalReadiness(secondPage);
    await secondContext.close();

    await persistProvisionedOnboardingEvidence(path.resolve('test-results/commercial-onboarding-evidence.json'), {
      applicationId, applicationReference, invitationId, organisationId, operatingLocationId: resources.operatingLocationId,
      aircraftId: resources.aircraft, equipmentId: resources.equipment,
      clientId: records.client.id, propertyId: records.property.id, fieldId: records.field.id,
      jobId: records.job.id, missionId: records.mission.id,
    });
  } finally { /* transactional cleanup is performed by the repository-controlled post-test RPC */ }
});

test('public application responses remain non-enumerating', async ({ request }) => {
  const environment = commercialOnboardingEnvironment();
  const unauthenticated = await request.get(`${environment.baseUrl}/api/v1/commercial-onboarding?action=list`);
  expect([401, 403]).toContain(unauthenticated.status()); // UNAUTHENTICATED
  const crossOrigin = await request.post(`${environment.baseUrl}/api/v1/commercial-onboarding?action=apply`, {
    headers: { Origin: 'https://cross-origin.invalid', 'Sec-Fetch-Site': 'cross-site' }, data: {},
  });
  expect(crossOrigin.status()).toBe(403);
  const crossOriginBody = await crossOrigin.json().catch(() => ({}));
  expect(crossOriginBody.error.code).toBe('CROSS_ORIGIN_REQUEST');
  expect(JSON.stringify(crossOriginBody)).not.toContain(environment.applicantMailboxEmail);
  // Durable intake uses the same customer-safe APPLICATION_UNAVAILABLE response for rate limiting.
});
