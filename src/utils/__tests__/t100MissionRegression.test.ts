import { validateMissionData, validateStatusTransitionRules } from '../../contexts/MissionContext';
import { MissionRecord } from '../../types/mission';
import { getMissionWorkflowState } from '../missionWorkflow';

const aircraft = {
  id: 't100-001',
  status: 'operational',
  maintenanceDates: { nextInspectionDue: '2027-01-01', nextMajorServiceDue: '2027-01-01' },
  insurance: { expiryDate: '2027-01-01' },
};
const sprayBase = {
  id: 't100-spray-base',
  operationalData: { status: 'available' },
};
const fleet = {
  getAircraftById: () => aircraft,
  getEquipmentKitById: () => sprayBase,
  getConfigurationById: () => undefined,
  validateConfiguration: () => true,
};

const mission = {
  missionName: 'T100 end-to-end test',
  clientId: 'client-1',
  status: 'Planning',
  scheduledDate: '2026-08-01T00:00:00.000Z',
  aircraftConfiguration: {
    aircraftId: 't100-001',
    kitId: 't100-spray-base',
    estimatedFlightTime: 60,
    maxPayloadWeight: 110,
  },
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

test('T100 mission can plan, approve, fly and complete with a model-compatible spray base', () => {
  const validationCodes = validateMissionData(mission, fleet).map((error) => error.code);
  expect(validationCodes).not.toContain('REQUIRED_FIELD');
  expect(validationCodes).not.toContain('INVALID_CONFIGURATION');
  expect(validateStatusTransitionRules('Planning', 'Approved', mission, fleet)).toEqual([]);

  expect(getMissionWorkflowState({
    hasMission: true,
    status: 'Approved',
    jsaApproved: true,
    environmentalReviewComplete: true,
    hasFlightPlan: true,
    hasFlightAuthorization: true,
    hasFlightExecution: false,
  }).action).toBe('start-flying');

  expect(getMissionWorkflowState({
    hasMission: true,
    status: 'Flying',
    jsaApproved: true,
    environmentalReviewComplete: true,
    hasFlightPlan: true,
    hasFlightAuthorization: true,
    hasFlightExecution: true,
  }).action).toBe('mark-completed');
});
