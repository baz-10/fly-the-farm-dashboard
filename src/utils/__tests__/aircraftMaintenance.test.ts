import { describe, expect, test } from 'vitest';

import type { Aircraft } from '../../types/aircraft';
import { addMonthsToDateInput, getAircraftMaintenanceAlerts } from '../aircraftMaintenance';

function aircraft(): Aircraft {
  return {
    id: 'aircraft-1', registration: 'T50-001', manufacturer: 'DJI', model: 'Agras T50', serialNumber: 'ABC',
    activationDate: '2026-01-01T00:00:00.000Z', mtow: 103, maxAltitude: 120, maxWindSpeed: 20,
    maintenanceDates: {
      lastInspection: '2026-07-01T00:00:00.000Z', nextInspectionDue: '2026-07-25T00:00:00.000Z',
      lastMajorService: '2026-01-01T00:00:00.000Z', nextMajorServiceDue: '2026-07-10T00:00:00.000Z',
      totalFlightHours: 42, hoursSinceLastService: 12,
    },
    insurance: { policyNumber: 'P1', provider: 'Insurer', expiryDate: '2026-09-01T00:00:00.000Z', coverageAmount: 1, hullValue: 1 },
    status: 'operational', assignedKits: [],
    operationalLimits: { minOperatingTemp: 0, maxOperatingTemp: 45, maxPayloadWeight: 40, batteryCycles: 200, maxFlightTime: 22, serviceRange: 2, minimumCrewSize: 2 },
    documentation: { manuals: [], certificates: [], logbooks: [], complianceChecks: { casaCompliant: true, lastCasaInspection: '', nextCasaInspectionDue: '' } },
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('aircraft maintenance helpers', () => {
  test('adds three and six calendar months without overflowing month end', () => {
    expect(addMonthsToDateInput('2026-01-31', 3)).toBe('2026-04-30');
    expect(addMonthsToDateInput('2026-01-31', 6)).toBe('2026-07-31');
  });

  test('reports upcoming and overdue aircraft dates', () => {
    expect(getAircraftMaintenanceAlerts(aircraft(), new Date('2026-07-16T00:00:00.000Z'))).toEqual([
      expect.objectContaining({ kind: 'inspection', status: 'due-soon', daysRemaining: 9 }),
      expect.objectContaining({ kind: 'major-service', status: 'overdue', daysRemaining: -6 }),
    ]);
  });
});
