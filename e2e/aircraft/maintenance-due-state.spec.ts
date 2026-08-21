import { expect, test, type Page, type Route } from '@playwright/test';
import type { MaintenanceDueResult } from '../../src/types/fleetMaintenance';
import {
  FTF11_REGISTRY_ID,
  GEN003_REGISTRY_ID,
  MAINTENANCE_FIXTURE_AS_OF,
  MAINTENANCE_FIXTURE_BASE_ID,
  T100_REGISTRY_ID,
  fleetMaintenancePageOne,
  fleetMaintenancePageTwo,
  ftf11DueState,
  gen003DueState,
  maintenanceFixtureRoutes,
  t100DueState,
} from '../../src/components/maintenance/__fixtures__/maintenanceDueFixtures';

const userId = '11111111-1111-4111-8111-111111111111';
const organisationId = '22222222-2222-4222-8222-222222222222';

const records = [
  { id: 'source-ftf-11', assetIdentifier: 'FTF-11', manufacturer: 'Isuzu', model: 'FSS550', assetType: 'truck' },
  { id: 'source-gen-003', assetIdentifier: 'GEN-003', manufacturer: 'Honda', model: 'GX', assetType: 'generator' },
].map((record) => ({
  ...record,
  operatingLocationId: MAINTENANCE_FIXTURE_BASE_ID,
  serialNumber: `SER-${record.assetIdentifier}`,
  registration: '',
  status: 'available',
  notes: '',
  rowVersion: 1,
  createdAt: MAINTENANCE_FIXTURE_AS_OF,
  updatedAt: MAINTENANCE_FIXTURE_AS_OF,
}));

const dueByRegistry: Record<string, MaintenanceDueResult> = {
  [FTF11_REGISTRY_ID]: ftf11DueState,
  [GEN003_REGISTRY_ID]: gen003DueState,
  [T100_REGISTRY_ID]: t100DueState,
};

const bindAsOf = (result: MaintenanceDueResult, asOf: string): MaintenanceDueResult => ({
  ...result,
  asOf,
  attachedAssetSummaries: result.attachedAssetSummaries.map((attached) => ({
    ...attached,
    dueState: { ...attached.dueState, asOf },
  })),
});

const fulfil = (route: Route, data: unknown) => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ data }),
});

const fulfilPage = (route: Route, data: unknown[]) => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ data, pagination: { page: 1, pageSize: 100 } }),
});

async function mockMaintenance(page: Page) {
  const permissions = [
    'fleet_assets.read',
    'technical_catalogue.read',
    'service_templates.read',
    'maintenance_requirements.read',
  ];
  await page.route('**/api/store*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**/api/auth', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ user: { id: userId, tenantId: organisationId, email: 'maintenance@example.test', name: 'Maintenance Operator', role: 'admin', identityPlane: 'organisation', entitlements: [], permissions } }),
  }));
  await page.route('**/api/v1/session', (route) => fulfil(route, {
    user: { id: userId, email: 'maintenance@example.test', name: 'Maintenance Operator' },
    organisation: { id: organisationId, name: 'Fleet Test' },
    roles: ['organisation_admin'],
    permissions,
    operatingLocationIds: [MAINTENANCE_FIXTURE_BASE_ID],
  }));
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/technical-catalogue') && url.searchParams.get('action') === 'resolve-asset') {
      return fulfil(route, maintenanceFixtureRoutes[url.searchParams.get('sourceRecordId') || '']);
    }
    if (url.pathname.endsWith('/asset-maintenance')) {
      const action = url.searchParams.get('action');
      const asOf = url.searchParams.get('asOf') || '';
      if (action === 'due-state') return fulfil(route, bindAsOf(dueByRegistry[url.searchParams.get('assetId') || ''], asOf));
      if (action === 'fleet-due-summary') {
        const requestedState = url.searchParams.get('state');
        const requestedBase = url.searchParams.get('baseId');
        const requestedType = url.searchParams.get('assetType');
        const pageSize = Number(url.searchParams.get('pageSize'));
        const rows = [...fleetMaintenancePageOne.rows, ...fleetMaintenancePageTwo.rows]
          .filter((row) => !requestedState || row.highestState === requestedState)
          .filter((row) => !requestedBase || row.operatingLocationId === requestedBase)
          .filter((row) => !requestedType || row.source === requestedType);
        const pageCounts = { CURRENT: 0, DUE_SOON: 0, DUE: 0, OVERDUE: 0, INSUFFICIENT_DATA: 0 };
        rows.forEach((row) => { pageCounts[row.highestState] += 1; });
        return fulfil(route, {
          asOf,
          filters: { baseId: requestedBase, assetType: requestedType, state: requestedState },
          pageCounts,
          page: { pageSize, hasMore: false, nextCursor: null, scannedCount: rows.length, returnedCount: rows.length },
          rows,
        });
      }
    }
    if (url.pathname.endsWith('/fleet-assets')) return fulfilPage(route, records);
    if (url.pathname.endsWith('/operating-locations')) return fulfilPage(route, [{
      id: MAINTENANCE_FIXTURE_BASE_ID,
      name: 'Toowoomba Base',
      address: '1 Test Road',
      timezone: 'Australia/Brisbane',
      rowVersion: 1,
      createdAt: MAINTENANCE_FIXTURE_AS_OF,
      updatedAt: MAINTENANCE_FIXTURE_AS_OF,
    }]);
    if (url.pathname.endsWith('/aircraft')) return fulfil(route, [{
      id: 'source-t100-002',
      operatingLocationId: MAINTENANCE_FIXTURE_BASE_ID,
      registration: 'T100-002',
      manufacturer: 'DJI',
      model: 'Agras T100',
      serialNumber: 'T100-SER-002',
      activationDate: '2026-01-01',
      mtow: 149.9,
      maxAltitude: 120,
      maxWindSpeed: 12,
      status: 'operational',
      serviceabilityState: 'serviceable',
      missionReady: true,
      maintenanceDates: { lastInspection: '2026-08-01', nextInspectionDue: '2026-09-01', lastMajorService: '2026-07-01', nextMajorServiceDue: '2026-10-01', totalFlightHours: 46.3, hoursSinceLastService: 46.3 },
      insurance: { policyNumber: 'TEST-POLICY', provider: 'Fixture Insurer', expiryDate: '2027-01-01', coverageAmount: 100000, hullValue: 80000 },
      assignedKits: [],
      operationalLimits: { minOperatingTemp: 0, maxOperatingTemp: 40, maxPayloadWeight: 100, maxFlightTime: 15, serviceRange: 2, minimumCrewSize: 2 },
      documentation: { manuals: [], certificates: [], logbooks: [], complianceChecks: { casaCompliant: true, lastCasaInspection: '2026-08-01', nextCasaInspectionDue: '2027-08-01' } },
      notes: '',
      rowVersion: 1,
      createdAt: MAINTENANCE_FIXTURE_AS_OF,
      updatedAt: MAINTENANCE_FIXTURE_AS_OF,
    }]);
    if (url.pathname.endsWith('/equipment-kits')) return fulfil(route, []);
    return fulfil(route, []);
  });
}

const viewports = [
  ['phone', { width: 390, height: 844 }],
  ['tablet', { width: 768, height: 1024 }],
  ['desktop', { width: 1440, height: 900 }],
] as const;

for (const [viewportName, viewport] of viewports) {
  test(`keeps due state compact and explainable at ${viewportName} width`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await mockMaintenance(page);

    await page.goto('/assets/fleet-asset/source-ftf-11/maintenance');
    await expect(page.getByRole('heading', { name: 'FTF-11' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Due now · 2 requirements' })).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('button', { name: 'Due soon · 1 requirement' })).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('button', { name: /Upcoming/ })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Attached equipment maintenance' }).getByText('GEN-003 500 h service')).toBeVisible();
    await page.getByRole('button', { name: 'Due soon · 1 requirement' }).click();
    await page.getByRole('button', { name: '10,000 km service · Due soon' }).click();
    const detail = page.getByRole('region', { name: '10,000 km service details' });
    await expect(detail.getByRole('heading', { name: 'Due in 1,420 km' })).toBeVisible();
    await expect(detail.getByText('Organisation standard')).toBeVisible();
    await expect(detail.getByText('Fly The Farm maintenance standard')).toBeVisible();
    await expect(detail.getByRole('link', { name: 'Open linked Service Kit' })).toBeVisible();
    await expect(page.getByRole('button', { name: /ground|serviceability|availability|mission ready/i })).toHaveCount(0);
    await expect(page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).resolves.toBe(true);

    await page.goto('/assets/fleet-asset/source-gen-003/maintenance');
    await page.getByRole('button', { name: 'Due soon · 1 requirement' }).click();
    await page.getByRole('button', { name: 'GEN-003 500 h service · Due soon' }).click();
    await expect(page.getByRole('region', { name: 'GEN-003 500 h service details' }).getByRole('heading', { name: 'Due in 18.2 h' })).toBeVisible();
    await expect(page.getByText('No Service Kit linked')).toBeVisible();

    await page.goto('/assets/aircraft/source-t100-002/maintenance');
    await page.getByRole('button', { name: 'Due soon · 1 requirement' }).click();
    await page.getByRole('button', { name: '50 h propulsion inspection · Due soon' }).click();
    const propulsionDetail = page.getByRole('region', { name: '50 h propulsion inspection details' });
    await expect(propulsionDetail.getByText('46.3 h')).toBeVisible();
    await expect(propulsionDetail.getByText('Organisation standard')).toBeVisible();
    await page.getByRole('button', { name: 'Current · 1 requirement' }).click();
    await page.getByRole('button', { name: 'DJI 100 h service · Current' }).click();
    await expect(page.getByRole('region', { name: 'DJI 100 h service details' }).getByText('Manufacturer requirement')).toBeVisible();

    await page.goto('/fleet-work-packs');
    const fleet = page.getByRole('region', { name: 'Fleet maintenance' });
    await expect(fleet).toBeVisible();
    await expect(fleet.getByRole('list', { name: 'Fleet maintenance results' })).toBeVisible();
    await expect(fleet.getByRole('link', { name: 'FTF-11 maintenance' })).toBeVisible();
    await expect(fleet.getByRole('table')).toHaveCount(0);
    await expect(page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).resolves.toBe(true);
  });
}
