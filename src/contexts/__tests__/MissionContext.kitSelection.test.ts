import { validateMissionData, validateStatusTransitionRules } from '../MissionContext';
import { MissionRecord } from '../../types/mission';

test('accepts a directly selected compatible kit without a saved configuration', () => {
  const mission = {
    missionName: 'T100 test mission',
    clientId: 'client-1',
    scheduledDate: '2026-08-01T00:00:00.000Z',
    aircraftConfiguration: {
      aircraftId: 't100-001',
      kitId: 't100-spray-base',
      estimatedFlightTime: 60,
      maxPayloadWeight: 110,
    },
  } as Partial<MissionRecord>;

  const errors = validateMissionData(mission, {
    getAircraftById: () => ({ id: 't100-001', status: 'operational' }),
    getEquipmentKitById: () => ({ id: 't100-spray-base', operationalData: { status: 'available' } }),
    getConfigurationById: () => undefined,
    validateConfiguration: () => true,
  });

  expect(errors).not.toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'REQUIRED_FIELD', field: 'aircraftConfiguration.configurationId' }),
    expect.objectContaining({ code: 'INVALID_CONFIGURATION' }),
  ]));
});

test('approves a safe directly selected kit without a configuration override', () => {
  const mission = {
    status: 'Planning',
    scheduledDate: '2026-08-01T00:00:00.000Z',
    aircraftConfiguration: { aircraftId: 't100-001', kitId: 't100-spray-base' },
    jsaRecord: { status: 'approved' },
    boundaryFiles: [{}],
    complianceChecks: {
      casaNotification: true,
      airspaceApproval: true,
      localPermits: true,
      environmentalClearance: true,
      insuranceCoverage: true,
    },
  } as MissionRecord;
  const aircraft = {
    id: 't100-001',
    status: 'operational',
    maintenanceDates: { nextInspectionDue: '2027-01-01', nextMajorServiceDue: '2027-01-01' },
    insurance: { expiryDate: '2027-01-01' },
  };

  const errors = validateStatusTransitionRules('Planning', 'Approved', mission, {
    getAircraftById: () => aircraft,
    getEquipmentKitById: () => ({ id: 't100-spray-base', operationalData: { status: 'available' } }),
    getConfigurationById: () => undefined,
    validateConfiguration: () => true,
  });

  expect(errors).not.toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'INCOMPLETE_CONFIGURATION' }),
    expect.objectContaining({ code: 'INVALID_CONFIGURATION' }),
  ]));
});
