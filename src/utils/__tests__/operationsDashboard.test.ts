import type { MissionRecord } from '../../types/mission';
import {
  getMissionActivity,
  getMissionNextAction,
  getMissionReadiness,
  getTodaysChemicalAllocations,
  getTodaysSprayMissions,
} from '../operationsDashboard';

function mission(overrides: Partial<MissionRecord> = {}): MissionRecord {
  const id = overrides.id || `mission-${Math.random()}`;
  return {
    id,
    missionNumber: 'MSN-2026-000001',
    status: 'Planning',
    missionName: 'North paddock spray',
    missionType: 'spray',
    priority: 'medium',
    description: '',
    clientId: 'client-1',
    location: { name: 'North paddock', address: '', coordinates: { latitude: 0, longitude: 0 }, elevation: 0 },
    scheduledDate: '2026-07-15T08:30:00+10:00',
    estimatedDuration: 60,
    weatherRequirements: { maxWindSpeed: 20, minVisibility: 1000, maxPrecipitationChance: 20, allowedCloudCover: 100 },
    aircraftConfiguration: { aircraftId: 'aircraft-1', configurationId: 'config-1', estimatedFlightTime: 45, maxPayloadWeight: 40 },
    jsaRecord: {
      id: 'jsa-1', missionId: id, jsaType: 'standard-spray', status: 'pending', jsaNumber: 'JSA-1', completedBy: '',
      hazardIdentification: [],
      safetyRequirements: {
        personnelRequirements: { minimumCrewSize: 1, requiredQualifications: [], requiredTraining: [] },
        equipmentRequirements: { requiredSafetyEquipment: [], emergencyEquipment: [], communicationEquipment: [], backupSystems: [] },
        operationalConstraints: { weatherLimitations: [], proximityRestrictions: [], specialProcedures: [] },
      },
      emergencyProcedures: { communicationPlan: { primaryContact: '', secondaryContact: '', emergencyServices: [] }, evacuationPlan: '', equipmentFailureProcedures: [], medicalEmergencyPlan: '' },
      signOffs: { pilot: { userId: '', signature: '', signedAt: '' } }, createdAt: '2026-07-15T00:00:00Z', updatedAt: '2026-07-15T00:00:00Z',
    },
    boundaryFiles: [],
    approvals: {} as MissionRecord['approvals'],
    financialEstimate: { aircraftCost: 0, equipmentCost: 0, personnelCost: 0, travelCost: 0, totalEstimatedCost: 0 },
    complianceChecks: { casaNotification: false, airspaceApproval: false, localPermits: false, environmentalClearance: false, insuranceCoverage: false },
    auditTrail: [{ id: `audit-${id}`, missionId: id, timestamp: '2026-07-15T00:00:00Z', userId: 'user-1', action: 'created', changes: [] }],
    createdAt: '2026-07-15T00:00:00Z', updatedAt: '2026-07-15T00:00:00Z', createdBy: 'user-1', lastModifiedBy: 'user-1',
    ...overrides,
  };
}

describe('operations dashboard selectors', () => {
  it('shows only spray missions scheduled for the requested local day', () => {
    const now = new Date('2026-07-15T12:00:00+10:00');
    const today = mission();
    const tomorrow = mission({ id: 'tomorrow', scheduledDate: '2026-07-16T08:30:00+10:00' });
    const survey = mission({ id: 'survey', missionType: 'survey' });
    expect(getTodaysSprayMissions([tomorrow, survey, today], now)).toEqual([today]);
  });

  it('classifies live mission readiness without counting completed records', () => {
    const blocked = mission({ id: 'blocked' });
    const attention = mission({ id: 'attention', jsaRecord: { ...mission().jsaRecord, status: 'approved' } });
    const ready = mission({ id: 'ready', status: 'Approved' });
    const completed = mission({ id: 'completed', status: 'Completed' });
    expect(getMissionReadiness([blocked, attention, ready, completed])).toEqual({ total: 3, ready: 1, attention: 1, blocked: 1 });
  });

  it('aggregates only real positive chemical quantities from todays missions', () => {
    const first = mission({
      planningState: {
        clientName: 'Client', propertyName: 'Farm', fieldName: 'Field', missionNotes: '', boundaryCoords: [],
        operation: { applicationRateLHa: 20, perimeterKm: 0, bufferZones: 0, exclusionZones: 0, estimatedBatteryChanges: 0, flightLines: 0, turnAroundCount: 0 },
        weatherWindow: { startTime: '08:00', endTime: '10:00', windDirection: 'E', windSpeedKmh: 8, windGustKmh: 10, temperatureC: 22, rainChancePercent: 0 },
        chemicals: [
          { product: 'Glyphosate 540', ratePerHa: 2, unit: 'L', totalRequired: 20 },
          { product: '', ratePerHa: 0, unit: 'L', totalRequired: 0 },
        ],
      },
    });
    const second = mission({ id: 'second', planningState: { ...first.planningState!, chemicals: [{ product: 'Glyphosate 540', ratePerHa: 2, unit: 'L', totalRequired: 10 }] } });
    expect(getTodaysChemicalAllocations([first, second], new Date('2026-07-15T12:00:00+10:00'))).toEqual([
      { product: 'Glyphosate 540', ratePerHa: 2, unit: 'L', totalRequired: 30 },
    ]);
  });

  it('orders mission audit entries newest first', () => {
    const older = mission({ id: 'older' });
    const newer = mission({ id: 'newer', auditTrail: [{ id: 'latest', missionId: 'newer', timestamp: '2026-07-15T01:00:00Z', userId: 'user-1', action: 'approved', changes: [] }] });
    expect(getMissionActivity([older, newer], 1)[0].entry.id).toBe('latest');
  });

  it('follows every operational step after planning approval', () => {
    const approved = mission({ id: 'approved', status: 'Approved' });
    expect(getMissionNextAction(approved).kind).toBe('generate-flight-plan');

    const planned = mission({
      id: 'planned',
      status: 'Approved',
      flightPlan: {} as MissionRecord['flightPlan'],
    });
    expect(getMissionNextAction(planned).kind).toBe('authorize-flight');

    const authorized = mission({
      ...planned,
      id: 'authorized',
      approvals: {
        ...planned.approvals,
        flyingAuthorization: {} as MissionRecord['approvals']['flyingAuthorization'],
      },
    });
    expect(getMissionNextAction(authorized).kind).toBe('start-flight');

    const flying = mission({ id: 'flying', status: 'Flying' });
    expect(getMissionNextAction(flying).kind).toBe('record-completion');

    const recorded = mission({
      id: 'recorded',
      status: 'Flying',
      flightExecution: {} as MissionRecord['flightExecution'],
    });
    expect(getMissionNextAction(recorded).kind).toBe('complete-mission');
  });
});
