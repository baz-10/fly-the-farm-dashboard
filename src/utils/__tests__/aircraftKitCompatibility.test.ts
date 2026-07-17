import {
  getKitCompatibility,
  isKitCompatibleWithAircraft,
  normaliseAircraftModel,
} from '../aircraftKitCompatibility';
import { Aircraft, EquipmentKit } from '../../types/aircraft';

const aircraft = (overrides: Partial<Aircraft> = {}): Aircraft => ({
  id: 'aircraft-t100-001',
  registration: 'FTF-T100-001',
  manufacturer: 'DJI',
  model: 'DJI Agras T100',
  serialNumber: 'T100-SERIAL',
  mtow: 149.9,
  maxAltitude: 120,
  maxWindSpeed: 28,
  maintenanceDates: {
    lastInspection: '2026-01-01',
    nextInspectionDue: '2027-01-01',
    lastMajorService: '2026-01-01',
    nextMajorServiceDue: '2027-01-01',
    totalFlightHours: 0,
    hoursSinceLastService: 0,
  },
  insurance: {
    policyNumber: 'POLICY',
    provider: 'Provider',
    expiryDate: '2027-01-01',
    coverageAmount: 100000,
    hullValue: 50000,
  },
  status: 'operational',
  assignedKits: [],
  operationalLimits: {
    minOperatingTemp: 0,
    maxOperatingTemp: 40,
    maxPayloadWeight: 110,
    maxFlightTime: 20,
    serviceRange: 2,
    minimumCrewSize: 2,
  },
  documentation: {
    manuals: [],
    certificates: [],
    logbooks: [],
    complianceChecks: {
      casaCompliant: true,
      lastCasaInspection: '2026-01-01',
      nextCasaInspectionDue: '2027-01-01',
    },
  },
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  ...overrides,
});

const kit = (overrides: Partial<EquipmentKit> = {}): EquipmentKit => ({
  id: 'kit-t100-spray-base',
  name: 'T100 Spray Base',
  type: 'spray-system',
  description: 'Spray base for Agras T100',
  specifications: {
    weight: 75,
    dimensions: { length: 100, width: 100, height: 50 },
    powerRequirement: 100,
    operatingVoltage: '52V',
    temperatureRange: { min: 0, max: 40 },
    weatherResistance: 'IP54',
  },
  components: [],
  operationalData: {
    status: 'available',
    totalOperatingHours: 0,
    lastCalibrationDate: '2026-01-01',
    nextCalibrationDue: '2027-01-01',
    lastMaintenanceDate: '2026-01-01',
    nextMaintenanceDue: '2027-01-01',
    averageSetupTime: 10,
    averagePackupTime: 10,
  },
  financialData: {
    purchasePrice: 1000,
    currentValue: 900,
    depreciationRate: 10,
    maintenanceCostPerHour: 5,
    insuranceValue: 1000,
  },
  compatibleAircraft: ['T100'],
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  ...overrides,
});

describe('aircraft kit compatibility', () => {
  test('normalises manufacturer and Agras naming differences', () => {
    expect(normaliseAircraftModel(' DJI Agras T100 ')).toBe('t100');
    expect(normaliseAircraftModel('T-100')).toBe('t100');
  });

  test('allows a model-compatible kit without a registration-specific configuration', () => {
    expect(isKitCompatibleWithAircraft(aircraft(), kit())).toBe(true);
  });

  test('keeps legacy aircraft ID compatibility working', () => {
    expect(isKitCompatibleWithAircraft(
      aircraft(),
      kit({ compatibleAircraft: ['aircraft-t100-001'] }),
    )).toBe(true);
  });

  test('rejects a kit for another aircraft model', () => {
    expect(getKitCompatibility(
      aircraft(),
      kit({ compatibleAircraft: ['T50'] }),
    )).toEqual(expect.objectContaining({
      compatible: false,
      reasons: expect.arrayContaining(['Kit is not compatible with DJI Agras T100']),
    }));
  });

  test('rejects unavailable and overweight kits with actionable reasons', () => {
    const result = getKitCompatibility(aircraft(), kit({
      specifications: { ...kit().specifications, weight: 111 },
      operationalData: { ...kit().operationalData, status: 'maintenance' },
    }));

    expect(result.compatible).toBe(false);
    expect(result.reasons).toEqual(expect.arrayContaining([
      'Kit is not available',
      'Kit exceeds aircraft payload limit',
    ]));
  });
});
