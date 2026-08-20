import { expect, test, type Page, type Route } from '@playwright/test';
import {
  TECHNICAL_FIXTURE_AS_OF,
  ftf11Catalogue,
  ftf11Preferences,
  ftf11ServiceTemplate,
  gen003Catalogue,
  t100Catalogue,
} from '../../src/components/maintenance/__fixtures__/technicalCatalogueFixtures';

const userId = '11111111-1111-4111-8111-111111111111';
const organisationId = '22222222-2222-4222-8222-222222222222';
const baseId = '33333333-3333-4333-8333-333333333333';
const ftf11Id = '44444444-4444-4444-8444-444444444444';
const gen003Id = '55555555-5555-4555-8555-555555555555';
const t100Id = '66666666-6666-4666-8666-666666666666';

const records = [
  { id: ftf11Id, assetIdentifier: 'FTF-11', manufacturer: 'Isuzu', model: 'FSS550', assetType: 'truck' },
  { id: gen003Id, assetIdentifier: 'GEN-003', manufacturer: 'Honda', model: 'GX', assetType: 'generator' },
].map((record) => ({ ...record, operatingLocationId: baseId, serialNumber: `SER-${record.assetIdentifier}`, status: 'available', notes: '', rowVersion: 1, createdAt: TECHNICAL_FIXTURE_AS_OF, updatedAt: TECHNICAL_FIXTURE_AS_OF }));

const routes = {
  [ftf11Id]: { registryId: 'registry-source-ftf-11', source: 'fleet-asset', sourceRecordId: ftf11Id, identity: 'FTF-11' },
  [gen003Id]: { registryId: 'registry-source-gen-003', source: 'fleet-asset', sourceRecordId: gen003Id, identity: 'GEN-003' },
  [t100Id]: { registryId: 'registry-source-t100', source: 'aircraft', sourceRecordId: t100Id, identity: 'T100-01' },
};

const catalogueByRegistry = {
  'registry-source-ftf-11': { ...ftf11Catalogue, attachedAssets: [routes[gen003Id]] },
  'registry-source-gen-003': gen003Catalogue,
  'registry-source-t100': t100Catalogue,
};

const fulfil = (route: Route, data: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
const fulfilPage = (route: Route, data: unknown[]) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data, pagination: { page: 1, pageSize: 100 } }) });

async function mockTechnicalRegister(page: Page) {
  const permissions = ['fleet_assets.read', 'technical_catalogue.read', 'technical_preferences.read', 'service_templates.read'];
  await page.route('**/api/store*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**/api/auth', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { id: userId, email: 'technical@example.test', name: 'Technical Operator', role: 'admin', identityPlane: 'organisation', entitlements: [], permissions } }) }));
  await page.route('**/api/v1/session', (route) => fulfil(route, { user: { id: userId, email: 'technical@example.test', name: 'Technical Operator' }, organisation: { id: organisationId, name: 'Fleet Test' }, roles: ['organisation_admin'], permissions, operatingLocationIds: [baseId] }));
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/technical-catalogue')) {
      const action = url.searchParams.get('action');
      if (action === 'resolve-asset') return fulfil(route, routes[url.searchParams.get('sourceRecordId') as keyof typeof routes]);
      if (action === 'lookup') return fulfil(route, catalogueByRegistry[url.searchParams.get('assetId') as keyof typeof catalogueByRegistry]);
      if (action === 'preferences') return fulfil(route, ftf11Preferences);
      if (action === 'service-template-version') return fulfil(route, ftf11ServiceTemplate);
    }
    if (url.pathname.endsWith('/fleet-assets')) return fulfilPage(route, records);
    if (url.pathname.endsWith('/aircraft')) return fulfil(route, [{
      id: t100Id, operatingLocationId: baseId, registration: 'T100-01', manufacturer: 'DJI', model: 'Agras T100', serialNumber: 'T100-SER-01',
      activationDate: '2026-01-01', mtow: 149.9, maxAltitude: 120, maxWindSpeed: 12, status: 'operational', serviceabilityState: 'serviceable', missionReady: true,
      maintenanceDates: { lastInspection: '2026-08-01', nextInspectionDue: '2026-09-01', lastMajorService: '2026-07-01', nextMajorServiceDue: '2026-10-01', totalFlightHours: 10, hoursSinceLastService: 2 },
      insurance: { policyNumber: 'TEST-POLICY', provider: 'Fixture Insurer', expiryDate: '2027-01-01', coverageAmount: 100000, hullValue: 80000 },
      assignedKits: [], operationalLimits: { minOperatingTemp: 0, maxOperatingTemp: 40, maxPayloadWeight: 100, maxFlightTime: 15, serviceRange: 2, minimumCrewSize: 2 },
      documentation: { manuals: [], certificates: [], logbooks: [], complianceChecks: { casaCompliant: true, lastCasaInspection: '2026-08-01', nextCasaInspectionDue: '2027-08-01' } },
      notes: '', rowVersion: 1, createdAt: TECHNICAL_FIXTURE_AS_OF, updatedAt: TECHNICAL_FIXTURE_AS_OF,
    }]);
    if (url.pathname.endsWith('/equipment-kits') || url.pathname.endsWith('/operating-locations')) return fulfil(route, []);
    return fulfil(route, []);
  });
}

const viewports = [
  ['iPhone', { width: 390, height: 844 }],
  ['iPad mini', { width: 744, height: 1133 }],
  ['iPad Pro', { width: 1024, height: 1366 }],
  ['desktop', { width: 1440, height: 900 }],
] as const;

for (const [viewportName, viewport] of viewports) {
  test(`answers authoritative FTF-11, GEN-003 and T100 questions at ${viewportName} width`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await mockTechnicalRegister(page);

    await page.goto(`/assets/fleet-asset/${ftf11Id}/parts-fluids`);
    await expect(page.getByRole('heading', { name: 'FTF-11' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Parts & Fluids' })).toBeVisible();
    const engine = page.getByRole('button', { name: 'Engine · 4 specifications' });
    await expect(engine).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByText(/8-98037577-0/)).toHaveCount(0);
    await engine.click();
    await expect(page.getByText('SAE 15W-40').first()).toBeVisible();
    await expect(page.getByText(/8-98037577-0/).first()).toBeVisible();
    await expect(page.getByText('12.8 L · Service fill').first()).toBeVisible();
    await expect(page.getByRole('region', { name: 'Our preference' }).getByText('Delo 400 SLK')).toBeVisible();
    const attachment = page.getByRole('link', { name: 'GEN-003 · Service information' });
    await expect(attachment).toHaveAttribute('href', `/assets/fleet-asset/${gen003Id}/parts-fluids`);
    await expect(page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).resolves.toBe(true);

    await attachment.click();
    await page.getByRole('button', { name: 'Engine · 2 specifications' }).click();
    await expect(page.getByText('SAE 10W-30').first()).toBeVisible();
    await expect(page.getByText('1.1 L · Refill after filter replacement').first()).toBeVisible();
    await expect(page.getByText(/15400-RTA-003/).first()).toBeVisible();

    await page.goto(`/assets/fleet-asset/${ftf11Id}/service-kits`);
    await expect(page.getByRole('heading', { name: 'Service Kits' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Parts & Fluids' })).toHaveCount(0);
    await page.getByRole('button', { name: 'FSS550 — 10,000 km service · Manufacturer' }).click();
    await expect(page.getByText('Version 3 · Effective')).toBeVisible();
    await expect(page.getByText(/Change engine oil/)).toBeVisible();
    await expect(page.getByText(/Inspect drive belts/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Applicability' })).toBeVisible();
    await expect(page.getByText('Isuzu · FSS550 · Engine')).toBeVisible();
    await expect(page.getByText('Replace only when the restriction indicator is red.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Requirement links' })).toBeVisible();
    await expect(page.getByText('maintenance-requirement-fss550-10k-v2')).toBeVisible();
    await expect(page.getByText(/does not schedule or decide when work is due/i)).toBeVisible();

    await page.goto(`/assets/aircraft/${t100Id}/parts-fluids`);
    await page.getByRole('button', { name: 'Propulsion · 3 specifications' }).click();
    await expect(page.getByText('CW blade')).toBeVisible();
    await expect(page.getByText(/WB37-014/)).toBeVisible();
    await expect(page.getByText('Propeller shim')).toBeVisible();
    await expect(page.getByText(/tracked component/i)).toHaveCount(0);
    await expect(page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).resolves.toBe(true);
  });
}
