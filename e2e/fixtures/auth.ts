import { expect, test as base } from '@playwright/test';
import { AU_REOC_SAFETY_PLAN_STANDARD } from '../../src/data/safetyPlanStandard';
import type { SafetyPlan, SafetyPlanActor, SafetyPlanStatus } from '../../src/types/safetyPlan';

const CONTRACTOR = {
  id: 'e2e-contractor',
  email: 'operator@example.test',
  name: 'Synthetic Operator',
  password: 'local-e2e-only',
  role: 'contractor',
  safetyPlanAuthority: false,
  tenantId: 'e2e-tenant',
  inviteCode: 'E2E001',
};

export const SAFETY_PLAN_USERS = {
  contractor: CONTRACTOR,
  authority: {
    ...CONTRACTOR,
    id: 'e2e-authority',
    email: 'authority@example.test',
    name: 'Synthetic Authority',
    safetyPlanAuthority: true,
  },
  admin: {
    ...CONTRACTOR,
    id: 'e2e-admin',
    email: 'admin@example.test',
    name: 'Synthetic Administrator',
    role: 'admin',
    safetyPlanAuthority: false,
  },
  pic: {
    ...CONTRACTOR,
    id: 'e2e-pic',
    email: 'pic@example.test',
    name: 'Synthetic PIC',
    safetyPlanAuthority: false,
  },
  client: {
    ...CONTRACTOR,
    id: 'e2e-client-user',
    email: 'client@example.test',
    name: 'Synthetic Client',
    role: 'client',
    clientRecordId: 'e2e-client',
    safetyPlanAuthority: false,
  },
  unrelated: {
    ...CONTRACTOR,
    id: 'e2e-unrelated',
    email: 'unrelated@example.test',
    name: 'Unrelated Operator',
    tenantId: 'e2e-other-tenant',
    safetyPlanAuthority: false,
  },
} as const;

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
  ftf_missions: [{
    id: 'e2e-mission',
    jobId: 'e2e-job',
    missionName: 'Synthetic authorised mission',
    status: 'Approved',
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    jsaRecord: {
      id: 'e2e-jsa',
      updatedAt: CREATED_AT,
      hazardIdentification: [
        { id: 'hazard-powerlines', description: 'Powerlines', controlMeasures: ['Maintain exclusion area'] },
        { id: 'hazard-public', description: 'Public access', controlMeasures: ['Install signage'] },
      ],
      missionChecks: {
        answers: [{ questionId: 'weather-change', answer: true, notes: 'Weather may change' }],
        riskControls: [{ questionId: 'weather-change', mitigation: 'Monitor live weather' }],
      },
      signOffs: { pilot: { userId: 'e2e-pic' } },
    },
  }],
};

const COMPANY_TEMPLATE = {
  ...AU_REOC_SAFETY_PLAN_STANDARD,
  id: 'e2e-company-safety-plan-master',
  name: 'Synthetic company Safety Plan master',
  tenantId: CONTRACTOR.tenantId,
  recordType: 'published',
  standardVersion: AU_REOC_SAFETY_PLAN_STANDARD.version,
  sectionStandardVersions: Object.fromEntries(
    AU_REOC_SAFETY_PLAN_STANDARD.sections.map((section) => [
      section.id,
      AU_REOC_SAFETY_PLAN_STANDARD.version,
    ])
  ),
  masterVersion: 1,
  version: '1.0',
  isPlatformStandard: false,
  publishedAt: CREATED_AT,
  publishedBy: { userId: 'e2e-admin', name: 'Synthetic Administrator' },
  sections: AU_REOC_SAFETY_PLAN_STANDARD.sections.map((section) => ({
    ...section,
    fields: section.fields.map((field) => ({ ...field })),
  })),
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
    await page.addInitScript(({ contractor, safetyUsers, jobs, workPack, maintenance }) => {
      const selectedRole = window.localStorage.getItem('ftf_e2e_role') as keyof typeof safetyUsers | null;
      const sessionUser = selectedRole && safetyUsers[selectedRole]
        ? safetyUsers[selectedRole]
        : contractor;
      window.localStorage.setItem('ftf_users', JSON.stringify({
        [contractor.email]: contractor,
      }));
      window.localStorage.setItem('ftf_session', JSON.stringify({
        id: sessionUser.id,
        email: sessionUser.email,
        name: sessionUser.name,
        role: sessionUser.role,
        tenantId: sessionUser.tenantId,
        inviteCode: sessionUser.inviteCode,
        safetyPlanAuthority: sessionUser.safetyPlanAuthority,
        tier: 'free',
      }));
      for (const [key, value] of Object.entries(jobs)) {
        window.localStorage.setItem(key, JSON.stringify(value));
      }
      window.localStorage.setItem('ftf_work_packs', JSON.stringify(workPack));
      window.localStorage.setItem('ftf_maintenance', JSON.stringify(maintenance));
      window.localStorage.setItem(`ftf_safety_plan_templates:${contractor.tenantId}:${contractor.id}`, JSON.stringify([companyTemplate]));
      window.localStorage.setItem('ftf_user_licenses', JSON.stringify({
        [contractor.id]: {
          userId: contractor.id,
          generalInfo: {
            applicatorName: contractor.name,
            primaryLicenseNumber: 'E2E-REOC',
            companyName: 'Synthetic Ag Operations',
            abn: '00 000 000 000',
            insurancePolicyNumber: 'E2E',
            insuranceExpiryDate: '2027-07-24',
          },
          stateLicenses: { NSW: {}, VIC: {}, QLD: {}, SA: {}, WA: {}, TAS: {}, NT: {}, ACT: {} },
          lastUpdated: createdAt,
        },
      }));
    }, {
      contractor: CONTRACTOR,
      safetyUsers: SAFETY_PLAN_USERS,
      jobs: JOB_FIXTURES,
      workPack: WORK_PACK_FIXTURE,
      maintenance: MAINTENANCE_FIXTURE,
      companyTemplate: COMPANY_TEMPLATE,
      createdAt: CREATED_AT,
    });
    await use();
  }, { auto: true }],
});

export { expect };

export function completedSafetyPlan(
  status: SafetyPlanStatus = 'draft',
  actor: SafetyPlanActor = {
    userId: CONTRACTOR.id,
    name: CONTRACTOR.name,
    role: 'contractor',
    operationalAuthority: false,
  }
): SafetyPlan {
  const approved = status === 'approved';
  const versionStatus = status === 'not_required' ? 'draft' : status;
  return {
    id: 'e2e-safety-plan',
    jobId: 'e2e-job',
    tenantId: CONTRACTOR.tenantId,
    revision: 1,
    status,
    currentVersionId: 'e2e-safety-plan-version-1',
    versions: status === 'not_required' ? [] : [{
      id: 'e2e-safety-plan-version-1',
      planId: 'e2e-safety-plan',
      version: '1.0',
      status: versionStatus,
      templateSnapshot: COMPANY_TEMPLATE,
      sections: COMPANY_TEMPLATE.sections.map((section) => ({
        ...section,
        fields: section.fields.map((field) => ({
          ...field,
          value: field.type === 'boolean'
            ? true
            : field.type === 'person_list' || field.type === 'asset_list' || field.type === 'multi_select'
              ? ['Synthetic completed value']
              : 'Synthetic completed value',
        })),
      })),
      sourceSnapshot: {
        capturedAt: CREATED_AT,
        company: { id: CONTRACTOR.tenantId, name: 'Synthetic Ag Operations' },
        job: {
          id: 'e2e-job',
          name: 'Synthetic weeds — Synthetic Paddock',
          clientName: 'Synthetic Grower',
          propertyName: 'Synthetic Farm',
          fieldName: 'Synthetic Paddock',
          location: '1 Test Road',
          operatingDates: '2026-07-24',
        },
        missions: [{ id: 'e2e-mission', name: 'Synthetic authorised mission' }],
        crew: [{ id: 'e2e-pic', name: 'Synthetic PIC', role: 'PIC' }],
        hazards: [
          { id: 'jsa:e2e-mission:1', sourceType: 'jsa', sourceId: 'e2e-mission', sourceItemId: '1', sourceUpdatedAt: CREATED_AT, label: 'Powerlines', value: 'Powerlines', companyValue: 'Maintain exclusion area' },
          { id: 'jsa:e2e-mission:2', sourceType: 'jsa', sourceId: 'e2e-mission', sourceItemId: '2', sourceUpdatedAt: CREATED_AT, label: 'Public access', value: 'Public access', companyValue: 'Install signage' },
          { id: 'risk_assessment:e2e-mission:3', sourceType: 'risk_assessment', sourceId: 'e2e-mission', sourceItemId: '3', sourceUpdatedAt: CREATED_AT, label: 'Weather may change', value: 'Monitor live weather', companyValue: 'Monitor live weather' },
        ],
        sourceLinks: [],
      },
      attachments: [],
      acknowledgements: [],
      ...(approved ? {
        approvedBy: actor,
        approvedAt: CREATED_AT,
        contentDigest: 'e2e-approved-digest',
        retentionUntil: '2033-07-24T00:00:00.000Z',
      } : {}),
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
      revision: 1,
      createdBy: actor,
    }],
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  };
}

export async function installSafetyPlan(
  page: import('@playwright/test').Page,
  plan: SafetyPlan,
  role: keyof typeof SAFETY_PLAN_USERS = 'contractor'
) {
  const user = SAFETY_PLAN_USERS[role];
  await page.evaluate(({ nextPlan, nextUser }) => {
    window.localStorage.setItem(
      'ftf_e2e_role',
      Object.entries({
        contractor: 'e2e-contractor',
        authority: 'e2e-authority',
        admin: 'e2e-admin',
        pic: 'e2e-pic',
        client: 'e2e-client-user',
        unrelated: 'e2e-unrelated',
      }).find(([, id]) => id === nextUser.id)?.[0] || 'contractor'
    );
    window.localStorage.setItem('ftf_session', JSON.stringify({ ...nextUser, tier: 'pro' }));
    window.localStorage.setItem(
      `ftf_safety_plans:${nextUser.tenantId}:${nextUser.id}`,
      JSON.stringify([nextPlan])
    );
  }, { nextPlan: plan, nextUser: user });
}

export async function authenticateSafetyPlanRole(
  page: import('@playwright/test').Page,
  role: keyof typeof SAFETY_PLAN_USERS
) {
  const user = SAFETY_PLAN_USERS[role];
  await page.evaluate((nextUser) => {
    const tenantId = nextUser.tenantId;
    const currentSession = JSON.parse(window.localStorage.getItem('ftf_session') || 'null');
    const currentKey = currentSession?.id
      ? `ftf_safety_plans:${tenantId}:${currentSession.id}`
      : '';
    const existingKeys = Object.keys(window.localStorage)
      .filter((key) => key.startsWith(`ftf_safety_plans:${tenantId}:`));
    const sharedPlans = currentKey && window.localStorage.getItem(currentKey)
      ? window.localStorage.getItem(currentKey)
      : existingKeys.length
      ? window.localStorage.getItem(existingKeys[0])
      : '[]';
    window.localStorage.setItem(
      'ftf_e2e_role',
      Object.entries({
        contractor: 'e2e-contractor',
        authority: 'e2e-authority',
        admin: 'e2e-admin',
        pic: 'e2e-pic',
        client: 'e2e-client-user',
        unrelated: 'e2e-unrelated',
      }).find(([, id]) => id === nextUser.id)?.[0] || 'contractor'
    );
    window.localStorage.setItem('ftf_session', JSON.stringify({ ...nextUser, tier: 'pro' }));
    window.localStorage.setItem(
      `ftf_safety_plans:${tenantId}:${nextUser.id}`,
      sharedPlans || '[]'
    );
  }, user);
  await page.reload();
}
