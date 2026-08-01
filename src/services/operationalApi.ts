import { Client, Field, LatLng, Property } from '../types/fieldManagement';
import { ALL_STATES, AustralianState } from '../types/chemical';

type ApiRecord = Record<string, unknown>;

export interface OperationalSession {
  user: { id: string; email: string | null; name: string };
  organisation: { id: string; name: string };
}

export interface OperationalJob {
  id: string;
  clientId: string;
  propertyId: string;
  reference: string;
  status: string;
  rowVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface OperationalMission {
  id: string;
  jobId: string;
  operatingLocationId: string;
  missionNumber: string;
  status: string;
  scheduledStartAt?: string;
  rowVersion: number;
  createdAt: string;
  updatedAt: string;
}

export type ClientCreateInput = Omit<Client, 'id' | 'createdAt' | 'updatedAt' | 'rowVersion'>;
export type PropertyCreateInput = Omit<Property, 'id' | 'createdAt' | 'updatedAt' | 'rowVersion'>;
export type FieldCreateInput = Omit<Field, 'id' | 'createdAt' | 'updatedAt' | 'rowVersion'>;
export type ClientUpdateInput = Partial<Omit<ClientCreateInput, 'contractorUserId' | 'linkedUserId'>>;
export type PropertyUpdateInput = Partial<Omit<PropertyCreateInput, 'clientId'>>;
export type FieldUpdateInput = Partial<Omit<FieldCreateInput, 'propertyId'>>;

export class OperationalApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;
  readonly currentVersion?: number;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'OperationalApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.currentVersion = typeof details?.currentVersion === 'number' ? details.currentVersion : undefined;
  }
}

function value(record: ApiRecord, camel: string, snake: string): unknown {
  return record[camel] !== undefined ? record[camel] : record[snake];
}

function malformed(field: string): never {
  throw new OperationalApiError(0, 'MALFORMED_RESPONSE', `The operational API returned an invalid ${field}.`);
}

function requiredText(record: ApiRecord, camel: string, snake = camel): string {
  const candidate = value(record, camel, snake);
  if (typeof candidate !== 'string' || candidate.trim() === '') return malformed(camel);
  return candidate;
}

function optionalText(record: ApiRecord, camel: string, snake = camel): string {
  const candidate = value(record, camel, snake);
  if (candidate === undefined || candidate === null) return '';
  if (typeof candidate !== 'string') return malformed(camel);
  return candidate;
}

function versionValue(record: ApiRecord): number {
  const candidate = value(record, 'rowVersion', 'row_version');
  if (typeof candidate !== 'number' || !Number.isInteger(candidate) || candidate < 1) return malformed('rowVersion');
  return candidate;
}

function timestamp(record: ApiRecord, camel: string, snake: string): string {
  const candidate = requiredText(record, camel, snake);
  if (Number.isNaN(Date.parse(candidate))) return malformed(camel);
  return candidate;
}

function propertyState(record: ApiRecord): AustralianState {
  const candidate = requiredText(record, 'state');
  if (!ALL_STATES.includes(candidate as AustralianState)) return malformed('state');
  return candidate as AustralianState;
}

function boundaryCoordinates(record: ApiRecord): LatLng[] | undefined {
  const direct = value(record, 'boundaryCoords', 'boundary_coords');
  if (Array.isArray(direct)) {
    const coordinates = direct.filter((point): point is [number, number] => (
      Array.isArray(point) && point.length === 2 && point.every((entry) => Number.isFinite(Number(entry)))
    )).map((point) => [Number(point[0]), Number(point[1])] as LatLng);
    return coordinates.length > 0 ? coordinates : undefined;
  }
  const geoJson = value(record, 'boundaryGeojson', 'boundary_geojson') as { type?: unknown; coordinates?: unknown } | undefined;
  if (geoJson?.type === 'Polygon' && Array.isArray(geoJson.coordinates) && Array.isArray(geoJson.coordinates[0])) {
    const coordinates = (geoJson.coordinates[0] as unknown[]).filter((point): point is [number, number] => (
      Array.isArray(point) && point.length >= 2 && point.every((entry) => Number.isFinite(Number(entry)))
    )).map((point) => [Number(point[1]), Number(point[0])] as LatLng);
    return coordinates.length > 0 ? coordinates : undefined;
  }
  return undefined;
}

export function mapApiClient(record: ApiRecord): Client {
  return {
    id: requiredText(record, 'id'),
    contractorUserId: '',
    name: requiredText(record, 'name'),
    phone: optionalText(record, 'contactPhone', 'contact_phone'),
    email: optionalText(record, 'contactEmail', 'contact_email'),
    notes: '',
    createdAt: timestamp(record, 'createdAt', 'created_at'),
    updatedAt: timestamp(record, 'updatedAt', 'updated_at'),
    rowVersion: versionValue(record),
  };
}

export function mapApiProperty(record: ApiRecord): Property {
  return {
    id: requiredText(record, 'id'),
    clientId: requiredText(record, 'clientId', 'client_id'),
    name: requiredText(record, 'name'),
    address: optionalText(record, 'address'),
    state: propertyState(record),
    locality: '',
    lotPlan: '',
    notes: '',
    createdAt: timestamp(record, 'createdAt', 'created_at'),
    updatedAt: timestamp(record, 'updatedAt', 'updated_at'),
    rowVersion: versionValue(record),
  };
}

export function mapApiField(record: ApiRecord): Field {
  const rawArea = value(record, 'areaHectares', 'area_hectares');
  const area = rawArea === undefined || rawArea === null ? 0 : Number(rawArea);
  if (!Number.isFinite(area) || area < 0) return malformed('areaHectares');
  const fieldBoundaryVersionId = optionalText(record, 'fieldBoundaryVersionId', 'field_boundary_version_id') || undefined;
  return {
    id: requiredText(record, 'id'),
    propertyId: requiredText(record, 'propertyId', 'property_id'),
    name: requiredText(record, 'name'),
    sizeHa: area,
    boundary: null,
    boundaryCoords: boundaryCoordinates(record),
    notes: '',
    createdAt: timestamp(record, 'createdAt', 'created_at'),
    updatedAt: timestamp(record, 'updatedAt', 'updated_at'),
    rowVersion: versionValue(record),
    fieldBoundaryVersionId,
  };
}

function mapJob(record: ApiRecord): OperationalJob {
  return {
    id: requiredText(record, 'id'), clientId: requiredText(record, 'clientId', 'client_id'),
    propertyId: requiredText(record, 'propertyId', 'property_id'), reference: requiredText(record, 'reference'),
    status: requiredText(record, 'status'), rowVersion: versionValue(record),
    createdAt: timestamp(record, 'createdAt', 'created_at'), updatedAt: timestamp(record, 'updatedAt', 'updated_at'),
  };
}

function mapMission(record: ApiRecord): OperationalMission {
  const scheduledStartAt = optionalText(record, 'scheduledStartAt', 'scheduled_start_at') || undefined;
  if (scheduledStartAt && Number.isNaN(Date.parse(scheduledStartAt))) return malformed('scheduledStartAt');
  return {
    id: requiredText(record, 'id'), jobId: requiredText(record, 'jobId', 'job_id'),
    operatingLocationId: requiredText(record, 'operatingLocationId', 'operating_location_id'),
    missionNumber: requiredText(record, 'missionNumber', 'mission_number'), status: requiredText(record, 'status'),
    scheduledStartAt, rowVersion: versionValue(record), createdAt: timestamp(record, 'createdAt', 'created_at'),
    updatedAt: timestamp(record, 'updatedAt', 'updated_at'),
  };
}

interface ApiList<T> { records: T[]; page: number; pageSize: number; }

interface ResourceAdapter<T, TCreate, TUpdate> {
  list(page?: number, pageSize?: number): Promise<ApiList<T>>;
  get(id: string): Promise<T>;
  create(input: TCreate): Promise<T>;
  update(id: string, input: TUpdate, expectedVersion: number): Promise<T>;
  archive(id: string, expectedVersion: number): Promise<T>;
}

export interface OperationalApi {
  session(): Promise<OperationalSession>;
  clients: ResourceAdapter<Client, ClientCreateInput, ClientUpdateInput>;
  properties: ResourceAdapter<Property, PropertyCreateInput, PropertyUpdateInput>;
  fields: ResourceAdapter<Field, FieldCreateInput, FieldUpdateInput>;
  jobs: ResourceAdapter<OperationalJob, Omit<OperationalJob, 'id' | 'rowVersion' | 'createdAt' | 'updatedAt'>, Partial<Pick<OperationalJob, 'reference' | 'status'>>>;
  missions: ResourceAdapter<OperationalMission, Omit<OperationalMission, 'id' | 'rowVersion' | 'createdAt' | 'updatedAt'>, Partial<Pick<OperationalMission, 'missionNumber' | 'status' | 'scheduledStartAt'>>>;
}

interface ApiOptions { timeoutMs?: number; }

export function createOperationalApi(options: ApiOptions = {}): OperationalApi {
  const timeoutMs = options.timeoutMs ?? 12000;

  async function request(path: string, init: RequestInit = {}): Promise<any> {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      let response: Response;
      try {
        response = await fetch(path, {
          ...init,
          credentials: 'same-origin',
          signal: controller.signal,
          headers: init.body ? { 'Content-Type': 'application/json', ...(init.headers || {}) } : init.headers,
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw new OperationalApiError(0, 'TIMEOUT', 'The operational request timed out. Try again.');
        }
        throw new OperationalApiError(0, 'NETWORK_ERROR', 'Operational data is unavailable. Check the connection and try again.');
      }
      const envelope = await response.json().catch(() => ({}));
      if (!response.ok) {
        const apiError = envelope?.error || {};
        throw new OperationalApiError(
          response.status,
          typeof apiError.code === 'string' ? apiError.code : `HTTP_${response.status}`,
          typeof apiError.message === 'string' ? apiError.message : 'Operational API request failed.',
          apiError.meta && typeof apiError.meta === 'object' ? apiError.meta : undefined,
        );
      }
      return envelope;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function resource<T, TCreate, TUpdate>(
    name: string,
    map: (record: ApiRecord) => T,
    writable: (input: TCreate | TUpdate) => ApiRecord,
  ): ResourceAdapter<T, TCreate, TUpdate> {
    const base = `/api/v1/${name}`;
    const responseRecord = (envelope: any): T => {
      if (!envelope?.data || typeof envelope.data !== 'object' || Array.isArray(envelope.data)) {
        throw new OperationalApiError(0, 'MALFORMED_RESPONSE', 'The operational API returned an invalid record.');
      }
      return map(envelope.data);
    };
    return {
      async list(page = 1, pageSize = 100) {
        const envelope = await request(`${base}?page=${page}&pageSize=${pageSize}`);
        if (!Array.isArray(envelope?.data)) {
          throw new OperationalApiError(0, 'MALFORMED_RESPONSE', 'The operational API returned an invalid list.');
        }
        const responsePage = envelope?.pagination?.page;
        const responsePageSize = envelope?.pagination?.pageSize;
        if (!Number.isInteger(responsePage) || responsePage < 1 || !Number.isInteger(responsePageSize) || responsePageSize < 1) {
          throw new OperationalApiError(0, 'MALFORMED_RESPONSE', 'The operational API returned invalid pagination.');
        }
        return {
          records: envelope.data.map(map),
          page: responsePage,
          pageSize: responsePageSize,
        };
      },
      async get(id) { return responseRecord(await request(`${base}?id=${encodeURIComponent(id)}`)); },
      async create(input) {
        return responseRecord(await request(base, { method: 'POST', body: JSON.stringify(writable(input)) }));
      },
      async update(id, input, expectedVersion) {
        return responseRecord(await request(`${base}?id=${encodeURIComponent(id)}`, {
          method: 'PATCH', body: JSON.stringify({ ...writable(input), expectedVersion }),
        }));
      },
      async archive(id, expectedVersion) {
        return responseRecord(await request(`${base}?id=${encodeURIComponent(id)}`, {
          method: 'DELETE', body: JSON.stringify({ expectedVersion }),
        }));
      },
    };
  }

  const clientWritable = (input: ClientCreateInput | ClientUpdateInput): ApiRecord => {
    const payload: ApiRecord = {};
    if (input.name !== undefined) payload.name = input.name;
    if (input.email !== undefined) payload.contactEmail = input.email;
    if (input.phone !== undefined) payload.contactPhone = input.phone;
    return payload;
  };
  const propertyWritable = (input: PropertyCreateInput | PropertyUpdateInput): ApiRecord => {
    const payload: ApiRecord = {};
    if ('clientId' in input && input.clientId !== undefined) payload.clientId = input.clientId;
    if (input.name !== undefined) payload.name = input.name;
    if (input.address !== undefined) payload.address = input.address;
    if (input.state !== undefined) payload.state = input.state;
    return payload;
  };
  const fieldWritable = (input: FieldCreateInput | FieldUpdateInput): ApiRecord => {
    const payload: ApiRecord = {};
    if ('propertyId' in input && input.propertyId !== undefined) payload.propertyId = input.propertyId;
    if (input.name !== undefined) payload.name = input.name;
    if (input.sizeHa !== undefined) payload.areaHectares = input.sizeHa;
    if (input.fieldBoundaryVersionId !== undefined) payload.fieldBoundaryVersionId = input.fieldBoundaryVersionId;
    return payload;
  };

  const jobWritable = (input: any): ApiRecord => ({
    ...(input.clientId !== undefined ? { clientId: input.clientId } : {}),
    ...(input.propertyId !== undefined ? { propertyId: input.propertyId } : {}),
    ...(input.reference !== undefined ? { reference: input.reference } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
  });
  const missionWritable = (input: any): ApiRecord => ({
    ...(input.jobId !== undefined ? { jobId: input.jobId } : {}),
    ...(input.operatingLocationId !== undefined ? { operatingLocationId: input.operatingLocationId } : {}),
    ...(input.missionNumber !== undefined ? { missionNumber: input.missionNumber } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.scheduledStartAt !== undefined ? { scheduledStartAt: input.scheduledStartAt } : {}),
  });

  return {
    async session() {
      const data = (await request('/api/v1/session')).data;
      if (!data || typeof data !== 'object' || Array.isArray(data)) return malformed('session');
      return {
        user: {
          id: requiredText(data.user || {}, 'id'),
          email: data.user?.email === null || data.user?.email === undefined ? null : optionalText(data.user, 'email'),
          name: requiredText(data.user || {}, 'name'),
        },
        organisation: {
          id: requiredText(data.organisation || {}, 'id'),
          name: requiredText(data.organisation || {}, 'name'),
        },
      };
    },
    clients: resource('clients', mapApiClient, clientWritable),
    properties: resource('properties', mapApiProperty, propertyWritable),
    fields: resource('fields', mapApiField, fieldWritable),
    jobs: resource('jobs', mapJob, jobWritable),
    missions: resource('missions', mapMission, missionWritable),
  };
}

export async function listAll<T>(list: (page: number, pageSize: number) => Promise<ApiList<T>>): Promise<T[]> {
  const records: T[] = [];
  const pageSize = 100;
  for (let page = 1; ; page += 1) {
    const response = await list(page, pageSize);
    records.push(...response.records);
    if (response.records.length < pageSize) return records;
  }
}
