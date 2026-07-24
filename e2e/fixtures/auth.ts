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

const CREATED_AT = '2026-07-24T00:00:00.000Z';

const JOB_FIXTURES = {
  ftf_clients: [{
    id: 'e2e-client',
    contractorUserId: CONTRACTOR.id,
    name: 'Synthetic Grower',
    phone: '',
    email: 'grower@example.test',
    notes: '',
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  }],
  ftf_properties: [{
    id: 'e2e-property',
    clientId: 'e2e-client',
    name: 'Synthetic Farm',
    address: '1 Test Road',
    state: 'QLD',
    locality: 'Testville',
    lotPlan: '',
    notes: '',
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  }],
  ftf_fields: [{
    id: 'e2e-field',
    propertyId: 'e2e-property',
    name: 'Synthetic Paddock',
    sizeHa: 10,
    boundary: null,
    notes: '',
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  }],
  ftf_jobs: [{
    id: 'e2e-job',
    fieldId: 'e2e-field',
    propertyId: 'e2e-property',
    clientId: 'e2e-client',
    weedTarget: 'Synthetic weeds',
    chemicals: [],
    waterRateLHa: '40',
    adjuvants: '',
    dateSprayed: '2026-07-24',
    weather: {
      tempC: 24,
      windSpeedKmh: 8,
      windDirection: 'E',
      humidity: 55,
      deltaT: 6,
    },
    sprayRec: null,
    droneModel: 'Synthetic T100',
    applicatorName: 'Synthetic Operator',
    notes: 'Read-only browser fixture',
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  }],
};

const WORK_PACK_FIXTURE = {
  assets: [{
    id: 'e2e-truck',
    assetType: 'truck',
    registration: 'E2E-001',
    name: 'Synthetic Operations Truck',
    manufacturer: 'Synthetic',
    model: 'Fixture',
    year: 2026,
    vin: 'E2EVIN',
    ownershipType: 'owned',
    payloadCapacityKg: 1000,
    operationalNotes: 'Operational data remains visible',
    status: 'available',
    costs: {
      purchasePrice: 987654.34,
      currentValue: 987654.35,
      financePaymentMonthly: 0,
      registrationAnnual: 0,
      insuranceAnnual: 0,
      depreciationAnnual: 0,
      servicingAnnual: 0,
      tyresAnnual: 0,
      fuelCostPerLitre: 0,
      averageFuelLitresPer100Km: 0,
      costPerHour: 987654.31,
      costPerDay: 987654.32,
      costPerKm: 987654.33,
    },
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  }],
  trucks: [],
  templates: [],
  snapshots: [],
};

const MAINTENANCE_FIXTURE = {
  assets: [{
    id: 'e2e-maintenance-truck',
    tenantId: CONTRACTOR.tenantId,
    sourceId: 'e2e-truck',
    scope: 'fleet',
    assetClass: 'truck',
    name: 'Synthetic Operations Truck',
    status: 'serviceable',
    readings: { kilometres: 100 },
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  }],
  schedules: [],
  records: [{
    id: 'e2e-maintenance-record',
    tenantId: CONTRACTOR.tenantId,
    assetId: 'e2e-maintenance-truck',
    type: 'maintenance',
    title: 'Synthetic service',
    description: 'Operational maintenance record',
    status: 'serviceable',
    occurredAt: CREATED_AT,
    createdAt: CREATED_AT,
    createdBy: CONTRACTOR.id,
    createdByName: CONTRACTOR.name,
    createdByRole: CONTRACTOR.role,
    affectsServiceability: false,
    resultingServiceability: 'serviceable',
    cost: 987654.36,
    attachments: [],
  }],
  auditEvents: [],
};

export const test = base;

export const authenticatedTest = base.extend<{ authenticatedSession: void }>({
  authenticatedSession: [async ({ page }, use) => {
    await page.addInitScript(({ contractor, jobs, workPack, maintenance }) => {
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
      for (const [key, value] of Object.entries(jobs)) {
        window.localStorage.setItem(key, JSON.stringify(value));
      }
      window.localStorage.setItem('ftf_work_packs', JSON.stringify(workPack));
      window.localStorage.setItem('ftf_maintenance', JSON.stringify(maintenance));
    }, {
      contractor: CONTRACTOR,
      jobs: JOB_FIXTURES,
      workPack: WORK_PACK_FIXTURE,
      maintenance: MAINTENANCE_FIXTURE,
    });
    await use();
  }, { auto: true }],
});

export { expect };
