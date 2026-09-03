import type {
  MaintenanceDueResult,
  MaintenanceRequirementDueResult,
  MaintenanceThresholdResult,
} from '../../../types/fleetMaintenance';
import type {
  FleetMaintenanceDueSummary,
  FleetMaintenanceDueRow,
} from '../../../services/maintenanceApi';
import type { ResolvedAssetRoute } from '../../../services/technicalCatalogueApi';

export const MAINTENANCE_FIXTURE_AS_OF = '2026-08-21T01:30:00.000Z';
export const MAINTENANCE_FIXTURE_BASE_ID = '33333333-3333-4333-8333-333333333333';
export const FTF11_REGISTRY_ID = '77777777-7777-4777-8777-777777777711';
export const GEN003_REGISTRY_ID = '77777777-7777-4777-8777-777777777003';
export const T100_REGISTRY_ID = '77777777-7777-4777-8777-777777710002';

const meterThreshold = (overrides: Partial<MaintenanceThresholdResult> = {}): MaintenanceThresholdResult => ({
  thresholdId: 'threshold-odometer',
  sequenceNumber: 1,
  thresholdType: 'METER',
  meterType: 'odometer',
  unitCode: 'km',
  intervalValue: 10000,
  dueSoonValue: 1500,
  baselineType: 'COMMISSIONING',
  baselineValue: 0,
  baselineDate: null,
  currentValue: 8580,
  currentRecordedAt: MAINTENANCE_FIXTURE_AS_OF,
  currentAuthoritySource: 'AUTHORITATIVE_METER',
  dueValue: 10000,
  dueDate: null,
  remaining: 1420,
  state: 'DUE_SOON',
  baselineEvidence: { title: 'Commissioning certificate', reference: 'FTF-11-COMM' },
  ...overrides,
});

const calendarThreshold = (overrides: Partial<MaintenanceThresholdResult> = {}): MaintenanceThresholdResult => ({
  thresholdId: 'threshold-calendar',
  sequenceNumber: 2,
  thresholdType: 'CALENDAR',
  meterType: null,
  unitCode: 'MONTH',
  intervalValue: 12,
  dueSoonValue: 30,
  baselineType: 'COMMISSIONING',
  baselineValue: null,
  baselineDate: '2025-10-12',
  currentValue: null,
  currentRecordedAt: null,
  currentAuthoritySource: null,
  dueValue: null,
  dueDate: '2032-02-11',
  remaining: 2000,
  state: 'CURRENT',
  baselineEvidence: { title: 'In-service record', reference: 'FTF-11-IN-SERVICE' },
  ...overrides,
});

const conditionThreshold = (): MaintenanceThresholdResult => ({
  thresholdId: 'threshold-condition',
  sequenceNumber: 1,
  thresholdType: 'CONDITION',
  meterType: null,
  unitCode: null,
  intervalValue: null,
  dueSoonValue: null,
  baselineType: null,
  baselineValue: null,
  baselineDate: null,
  currentValue: null,
  currentRecordedAt: null,
  currentAuthoritySource: null,
  dueValue: null,
  dueDate: null,
  remaining: null,
  state: 'INSUFFICIENT_DATA',
  baselineEvidence: null,
});

const requirement = (overrides: Partial<MaintenanceRequirementDueResult> = {}): MaintenanceRequirementDueResult => ({
  requirementId: 'requirement-ftf-10k',
  requirementVersionId: 'requirement-ftf-10k-v3',
  requirementCode: 'FTF-10K',
  requirementName: '10,000 km service',
  requirementKind: 'SERVICE',
  authorityType: 'ORGANISATION_STANDARD',
  authorityScope: 'ORGANISATION',
  lifecycleState: 'EFFECTIVE',
  effectiveFrom: '2026-01-01T00:00:00.000Z',
  effectiveTo: null,
  thresholdPolicy: 'ANY',
  state: 'DUE_SOON',
  controllingThresholdId: 'threshold-odometer',
  thresholds: [meterThreshold(), calendarThreshold()],
  evidence: { title: 'Fly The Farm maintenance standard', reference: 'FTF-SVC-10K', page: '3-02' },
  serviceKitVersionId: 'template-version-ftf11-10k-v3',
  ...overrides,
});

export const gen003DueState: MaintenanceDueResult = {
  assetId: GEN003_REGISTRY_ID,
  asOf: MAINTENANCE_FIXTURE_AS_OF,
  timezone: 'Australia/Brisbane',
  requirements: [requirement({
    requirementId: 'requirement-gen-500h',
    requirementVersionId: 'requirement-gen-500h-v1',
    requirementCode: 'GEN-500H',
    requirementName: 'GEN-003 500 h service',
    authorityType: 'MANUFACTURER',
    authorityScope: 'PLATFORM',
    state: 'DUE_SOON',
    controllingThresholdId: 'threshold-engine-hours',
    thresholds: [meterThreshold({
      thresholdId: 'threshold-engine-hours',
      meterType: 'engine_hours',
      unitCode: 'h',
      intervalValue: 500,
      dueSoonValue: 25,
      currentValue: 481.8,
      dueValue: 500,
      remaining: 18.2,
    })],
    evidence: { title: 'Honda GX maintenance schedule', reference: 'GX-500H', page: '42' },
    serviceKitVersionId: null,
  })],
  attachedAssetSummaries: [],
};

export const ftf11DueState: MaintenanceDueResult = {
  assetId: FTF11_REGISTRY_ID,
  asOf: MAINTENANCE_FIXTURE_AS_OF,
  timezone: 'Australia/Brisbane',
  requirements: [
    requirement(),
    requirement({
      requirementId: 'requirement-brakes',
      requirementVersionId: 'requirement-brakes-v2',
      requirementCode: 'ISZ-BRAKE',
      requirementName: 'Brake system inspection',
      requirementKind: 'INSPECTION',
      authorityType: 'MANUFACTURER',
      authorityScope: 'PLATFORM',
      state: 'DUE',
      controllingThresholdId: 'threshold-brakes',
      thresholds: [meterThreshold({ thresholdId: 'threshold-brakes', currentValue: 10000, remaining: 0, state: 'DUE' })],
      evidence: { title: 'Isuzu FSS550 maintenance schedule', reference: 'ISZ-BRAKE-10K', page: '7-14' },
      serviceKitVersionId: null,
    }),
    requirement({
      requirementId: 'requirement-pump-calibration',
      requirementVersionId: 'requirement-pump-calibration-v1',
      requirementCode: 'FTF-PUMP-500H',
      requirementName: 'Pump calibration',
      requirementKind: 'CALIBRATION',
      state: 'OVERDUE',
      controllingThresholdId: 'threshold-pump-hours',
      thresholds: [meterThreshold({
        thresholdId: 'threshold-pump-hours',
        meterType: 'engine_hours',
        unitCode: 'h',
        intervalValue: 500,
        dueSoonValue: 20,
        currentValue: 501,
        dueValue: 500,
        remaining: -1,
        state: 'OVERDUE',
      })],
      evidence: { title: 'Fly The Farm calibration programme', reference: 'CAL-PUMP-500H' },
      serviceKitVersionId: null,
    }),
    requirement({
      requirementId: 'requirement-body',
      requirementVersionId: 'requirement-body-v1',
      requirementCode: 'ISZ-BODY-ANNUAL',
      requirementName: 'Annual body inspection',
      requirementKind: 'INSPECTION',
      authorityType: 'MANUFACTURER',
      authorityScope: 'PLATFORM',
      state: 'CURRENT',
      controllingThresholdId: 'threshold-body-calendar',
      thresholds: [calendarThreshold({ thresholdId: 'threshold-body-calendar', sequenceNumber: 1 })],
      evidence: { title: 'Isuzu body inspection programme', reference: 'ISZ-BODY-ANNUAL' },
      serviceKitVersionId: null,
    }),
    requirement({
      requirementId: 'requirement-pump-condition',
      requirementVersionId: 'requirement-pump-condition-v1',
      requirementCode: 'FTF-PUMP-CONDITION',
      requirementName: 'Pump condition assessment',
      requirementKind: 'CONDITION_BASED',
      authorityType: 'CONDITION_BASED',
      authorityScope: 'ORGANISATION',
      state: 'INSUFFICIENT_DATA',
      controllingThresholdId: 'threshold-condition',
      thresholds: [conditionThreshold()],
      evidence: { title: 'Fly The Farm pump assessment standard', reference: 'PUMP-CONDITION-1' },
      serviceKitVersionId: null,
    }),
  ],
  attachedAssetSummaries: [{
    registryId: GEN003_REGISTRY_ID,
    dueState: {
      assetId: gen003DueState.assetId,
      asOf: gen003DueState.asOf,
      timezone: gen003DueState.timezone,
      requirements: gen003DueState.requirements,
    },
  }],
};

export const ftf11CalendarControlsDueState: MaintenanceDueResult = {
  ...ftf11DueState,
  requirements: [requirement({
    controllingThresholdId: 'threshold-calendar',
    thresholds: [
      meterThreshold({ remaining: 1420, state: 'DUE_SOON' }),
      calendarThreshold({ dueDate: '2026-09-10', remaining: 20, state: 'DUE_SOON' }),
    ],
  })],
  attachedAssetSummaries: [],
};

export const t100DueState: MaintenanceDueResult = {
  assetId: T100_REGISTRY_ID,
  asOf: MAINTENANCE_FIXTURE_AS_OF,
  timezone: 'Australia/Brisbane',
  requirements: [
    requirement({
      requirementId: 'requirement-t100-propulsion',
      requirementVersionId: 'requirement-t100-propulsion-v1',
      requirementCode: 'FTF-T100-50H',
      requirementName: '50 h propulsion inspection',
      requirementKind: 'INSPECTION',
      state: 'DUE_SOON',
      controllingThresholdId: 'threshold-flight-hours-50',
      thresholds: [meterThreshold({
        thresholdId: 'threshold-flight-hours-50',
        meterType: 'flight_hours',
        unitCode: 'h',
        intervalValue: 50,
        dueSoonValue: 5,
        currentValue: 46.3,
        currentAuthoritySource: 'AIRCRAFT_COMPATIBILITY',
        dueValue: 50,
        remaining: 3.7,
      })],
      evidence: { title: 'Fly The Farm propulsion inspection standard', reference: 'FTF-T100-50H' },
      serviceKitVersionId: null,
    }),
    requirement({
      requirementId: 'requirement-dji-100h',
      requirementVersionId: 'requirement-dji-100h-v1',
      requirementCode: 'DJI-T100-100H',
      requirementName: 'DJI 100 h service',
      authorityType: 'MANUFACTURER',
      authorityScope: 'PLATFORM',
      state: 'CURRENT',
      controllingThresholdId: 'threshold-flight-hours-100',
      thresholds: [meterThreshold({
        thresholdId: 'threshold-flight-hours-100',
        meterType: 'flight_hours',
        unitCode: 'h',
        intervalValue: 100,
        dueSoonValue: 10,
        currentValue: 46.3,
        currentAuthoritySource: 'AIRCRAFT_COMPATIBILITY',
        dueValue: 100,
        remaining: 53.7,
        state: 'CURRENT',
      })],
      evidence: { title: 'DJI T100 maintenance manual', reference: 'DJI-T100-100H', page: '88' },
      serviceKitVersionId: null,
    }),
  ],
  attachedAssetSummaries: [],
};

export const maintenanceFixtureRoutes: Record<string, ResolvedAssetRoute> = {
  'source-ftf-11': { registryId: FTF11_REGISTRY_ID, source: 'fleet-asset', sourceRecordId: 'source-ftf-11', identity: 'FTF-11' },
  'source-gen-003': { registryId: GEN003_REGISTRY_ID, source: 'fleet-asset', sourceRecordId: 'source-gen-003', identity: 'GEN-003' },
  'source-t100-002': { registryId: T100_REGISTRY_ID, source: 'aircraft', sourceRecordId: 'source-t100-002', identity: 'T100-002' },
};

const fleetRow = (overrides: Partial<FleetMaintenanceDueRow> = {}): FleetMaintenanceDueRow => ({
  registryId: FTF11_REGISTRY_ID,
  source: 'fleet-asset',
  sourceRecordId: 'source-ftf-11',
  identity: 'FTF-11',
  operatingLocationId: MAINTENANCE_FIXTURE_BASE_ID,
  highestState: 'OVERDUE',
  requirementCount: 5,
  attachedAssetCount: 1,
  stateCounts: { CURRENT: 1, DUE_SOON: 1, DUE: 1, OVERDUE: 1, INSUFFICIENT_DATA: 1 },
  ...overrides,
});

export const fleetMaintenancePageOne: FleetMaintenanceDueSummary = {
  asOf: MAINTENANCE_FIXTURE_AS_OF,
  filters: { baseId: null, assetType: null, state: null },
  pageCounts: { CURRENT: 0, DUE_SOON: 1, DUE: 0, OVERDUE: 1, INSUFFICIENT_DATA: 0 },
  page: { pageSize: 2, hasMore: true, nextCursor: 'eyJ2IjoxfQ', scannedCount: 3, returnedCount: 2 },
  rows: [
    fleetRow(),
    fleetRow({
      registryId: GEN003_REGISTRY_ID,
      sourceRecordId: 'source-gen-003',
      identity: 'GEN-003',
      highestState: 'DUE_SOON',
      requirementCount: 1,
      attachedAssetCount: 0,
      stateCounts: { CURRENT: 0, DUE_SOON: 1, DUE: 0, OVERDUE: 0, INSUFFICIENT_DATA: 0 },
    }),
  ],
};

export const fleetMaintenancePageTwo: FleetMaintenanceDueSummary = {
  asOf: MAINTENANCE_FIXTURE_AS_OF,
  filters: { baseId: null, assetType: null, state: null },
  pageCounts: { CURRENT: 0, DUE_SOON: 1, DUE: 0, OVERDUE: 0, INSUFFICIENT_DATA: 0 },
  page: { pageSize: 2, hasMore: false, nextCursor: null, scannedCount: 1, returnedCount: 1 },
  rows: [fleetRow({
    registryId: T100_REGISTRY_ID,
    source: 'aircraft',
    sourceRecordId: 'source-t100-002',
    identity: 'T100-002',
    highestState: 'DUE_SOON',
    requirementCount: 2,
    attachedAssetCount: 0,
    stateCounts: { CURRENT: 1, DUE_SOON: 1, DUE: 0, OVERDUE: 0, INSUFFICIENT_DATA: 0 },
  })],
};
