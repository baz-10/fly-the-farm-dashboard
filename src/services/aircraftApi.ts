import { Aircraft } from '../types/aircraft';

type ApiRecord = Record<string, unknown>;
export type AircraftWriteInput = Omit<Aircraft, 'id' | 'createdAt' | 'updatedAt' | 'rowVersion' | 'assignedKits'>;

export class AircraftApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly currentVersion?: number,
  ) {
    super(message);
    this.name = 'AircraftApiError';
  }
}

function malformed(field: string): never {
  throw new AircraftApiError(0, 'MALFORMED_RESPONSE', `The Aircraft API returned an invalid ${field}.`);
}

function text(record: ApiRecord, field: string, allowEmpty = false): string {
  const value = record[field];
  if (typeof value !== 'string' || (!allowEmpty && !value.trim())) return malformed(field);
  return value;
}

function number(record: ApiRecord, field: string, minimum = Number.NEGATIVE_INFINITY): number {
  const value = record[field];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) return malformed(field);
  return value;
}

function object(record: ApiRecord, field: string): ApiRecord {
  const value = record[field];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return malformed(field);
  return value as ApiRecord;
}

function stringArray(record: ApiRecord, field: string): string[] {
  const value = record[field];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) return malformed(field);
  return value as string[];
}

export function mapAircraftRecord(candidate: unknown): Aircraft {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return malformed('record');
  const record = candidate as ApiRecord;
  const maintenance = object(record, 'maintenanceDates');
  const insurance = object(record, 'insurance');
  const limits = object(record, 'operationalLimits');
  const documentation = object(record, 'documentation');
  const compliance = object(documentation, 'complianceChecks');
  const status = text(record, 'status') as Aircraft['status'];
  if (!['operational', 'maintenance', 'retired', 'inspection'].includes(status)) return malformed('status');
  const serviceabilityState = text(record, 'serviceabilityState') as NonNullable<Aircraft['serviceabilityState']>;
  if (!['serviceable', 'unserviceable', 'inspection_required', 'maintenance_required'].includes(serviceabilityState)) return malformed('serviceabilityState');
  if (typeof record.missionReady !== 'boolean' || typeof compliance.casaCompliant !== 'boolean') return malformed('readiness');
  const rowVersion = number(record, 'rowVersion', 1);
  if (!Number.isInteger(rowVersion)) return malformed('rowVersion');
  return {
    id: text(record, 'id'), operatingLocationId: text(record, 'operatingLocationId'), registration: text(record, 'registration'),
    manufacturer: text(record, 'manufacturer'), model: text(record, 'model'), serialNumber: text(record, 'serialNumber'),
    activationDate: text(record, 'activationDate', true) || undefined, status, serviceabilityState,
    missionReady: record.missionReady, mtow: number(record, 'mtow', 0), maxAltitude: number(record, 'maxAltitude', 0), maxWindSpeed: number(record, 'maxWindSpeed', 0),
    maintenanceDates: {
      lastInspection: text(maintenance, 'lastInspection', true), nextInspectionDue: text(maintenance, 'nextInspectionDue', true),
      lastMajorService: text(maintenance, 'lastMajorService', true), nextMajorServiceDue: text(maintenance, 'nextMajorServiceDue', true),
      totalFlightHours: number(maintenance, 'totalFlightHours', 0), hoursSinceLastService: number(maintenance, 'hoursSinceLastService', 0),
    },
    insurance: {
      policyNumber: text(insurance, 'policyNumber'), provider: text(insurance, 'provider'), expiryDate: text(insurance, 'expiryDate'),
      coverageAmount: number(insurance, 'coverageAmount', 0), hullValue: number(insurance, 'hullValue', 0),
    },
    operationalLimits: {
      minOperatingTemp: number(limits, 'minOperatingTemp'), maxOperatingTemp: number(limits, 'maxOperatingTemp'),
      maxPayloadWeight: number(limits, 'maxPayloadWeight', 0),
      ...(limits.batteryCycles === undefined ? {} : { batteryCycles: number(limits, 'batteryCycles', 0) }),
      maxFlightTime: number(limits, 'maxFlightTime', 0), serviceRange: number(limits, 'serviceRange', 0), minimumCrewSize: number(limits, 'minimumCrewSize', 1),
    },
    documentation: {
      manuals: stringArray(documentation, 'manuals'), certificates: stringArray(documentation, 'certificates'), logbooks: stringArray(documentation, 'logbooks'),
      complianceChecks: {
        casaCompliant: compliance.casaCompliant as boolean,
        lastCasaInspection: text(compliance, 'lastCasaInspection', true), nextCasaInspectionDue: text(compliance, 'nextCasaInspectionDue', true),
      },
    },
    assignedKits: [], notes: text(record, 'notes', true), rowVersion,
    createdAt: text(record, 'createdAt'), updatedAt: text(record, 'updatedAt'),
  };
}

async function request(fetcher: typeof fetch, path: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetcher(path, {
    ...init, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = body?.error || {};
    throw new AircraftApiError(response.status, error.code || 'AIRCRAFT_API_ERROR', error.message || 'Aircraft request failed.', error.meta?.currentVersion);
  }
  return body?.data;
}

export function createAircraftApiGateway(fetcher: typeof fetch = fetch) {
  return {
    async list(): Promise<Aircraft[]> {
      const data = await request(fetcher, '/api/v1/aircraft?page=1&pageSize=100');
      if (!Array.isArray(data)) return malformed('record list');
      return data.map(mapAircraftRecord);
    },
    async create(input: AircraftWriteInput): Promise<Aircraft> {
      return mapAircraftRecord(await request(fetcher, '/api/v1/aircraft', { method: 'POST', body: JSON.stringify(input) }));
    },
    async update(id: string, input: AircraftWriteInput, expectedVersion: number): Promise<Aircraft> {
      return mapAircraftRecord(await request(fetcher, `/api/v1/aircraft?id=${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ ...input, expectedVersion }) }));
    },
    async archive(id: string, expectedVersion: number): Promise<Aircraft> {
      return mapAircraftRecord(await request(fetcher, `/api/v1/aircraft?id=${encodeURIComponent(id)}`, { method: 'DELETE', body: JSON.stringify({ expectedVersion }) }));
    },
  };
}

export type AircraftApiGateway = ReturnType<typeof createAircraftApiGateway>;
