import { Client, Field, LatLng, Property } from '../types/fieldManagement';
import { ALL_STATES, AustralianState } from '../types/chemical';

type ApiRecord = Record<string, unknown>;

export interface OperationalSession {
  user: { id: string; email: string | null; name: string };
  organisation: { id: string; name: string };
  roles: string[];
  permissions: string[];
  operatingLocationIds: string[];
}

export interface OperationalOperatingLocation {
  id: string;
  name: string;
  address: string;
  timezone: string;
  latitude?: number;
  longitude?: number;
  addressSource?: 'ADDRESS_SEARCH' | 'MANUALLY_ADJUSTED';
  locationConfirmedAt?: string;
  rowVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface OperationalJob {
  id: string;
  clientId: string;
  propertyId: string;
  fieldIds: string[];
  reference: string;
  scope: string;
  status: string;
  notes: string;
  requestedDate?: string;
  scheduledDate?: string;
  rowVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface OperationalBoundaryGeoJson {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: number[][][] | number[][][][];
}

export interface OperationalFieldBoundaryVersion {
  id: string;
  fieldId: string;
  propertyId: string;
  versionNumber: number;
  boundaryGeojson: OperationalBoundaryGeoJson;
  boundaryCoords: LatLng[];
  capturedAt?: string;
  rowVersion?: number;
  fieldVersion?: number;
  createdAt: string;
  updatedAt: string;
}

export interface FieldBoundaryVersionCreateInput {
  fieldId: string;
  propertyId: string;
  expectedFieldVersion: number;
  boundaryGeojson: OperationalBoundaryGeoJson;
  capturedAt?: string;
}

type OperationalJobCreateBase = Omit<OperationalJob, 'id' | 'reference' | 'rowVersion' | 'createdAt' | 'updatedAt'>;
export type OperationalJobCreateInput = OperationalJobCreateBase & (
  { autoGenerateReference: true; reference?: never } | { autoGenerateReference?: false; reference: string }
);
export type OperationalJobUpdateInput = Partial<Pick<OperationalJob, 'fieldIds' | 'reference' | 'scope' | 'status' | 'notes' | 'requestedDate' | 'scheduledDate'>>;
export type OperationalJobArchiveConfirmation = Omit<OperationalJob, 'fieldIds'>;

export interface OperationalMission {
  id: string;
  jobId: string;
  operatingLocationId: string;
  missionNumber: string;
  title: string;
  description: string;
  status: 'Planning' | 'Completed';
  scheduledStartAt: string | null;
  aircraftIds: string[];
  equipmentKitIds: string[];
  rowVersion: number;
  createdAt: string;
  updatedAt: string;
}

type OperationalMissionCreateBase = Omit<OperationalMission, 'id' | 'missionNumber' | 'rowVersion' | 'createdAt' | 'updatedAt' | 'scheduledStartAt' | 'aircraftIds' | 'equipmentKitIds'> & {
  scheduledStartAt?: string | null;
  aircraftIds?: string[];
  equipmentKitIds?: string[];
};
export type OperationalMissionCreateInput = OperationalMissionCreateBase & (
  { autoGenerateReference: true; missionNumber?: never } | { autoGenerateReference?: false; missionNumber: string }
);
export type OperationalMissionUpdateInput = Partial<Pick<OperationalMission,
  'jobId' | 'operatingLocationId' | 'missionNumber' | 'title' | 'description' | 'status' | 'scheduledStartAt' | 'aircraftIds' | 'equipmentKitIds'>>;

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

function optionalDate(record: ApiRecord, camel: string, snake: string): string | undefined {
  const candidate = optionalText(record, camel, snake) || undefined;
  if (!candidate) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(candidate);
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12 || Number(match[3]) < 1
    || Number(match[3]) > new Date(Date.UTC(Number(match[1]), Number(match[2]), 0)).getUTCDate()) return malformed(camel);
  return candidate;
}

function stringArray(record: ApiRecord, camel: string, snake = camel, allowEmpty = true): string[] {
  const candidate = value(record, camel, snake);
  if (!Array.isArray(candidate) || (!allowEmpty && candidate.length === 0)
    || candidate.some((entry) => typeof entry !== 'string' || entry.trim() === '')) return malformed(camel);
  if (new Set(candidate).size !== candidate.length) return malformed(camel);
  return candidate;
}

function positiveInteger(record: ApiRecord, camel: string, snake = camel): number {
  const candidate = value(record, camel, snake);
  if (!Number.isInteger(candidate) || Number(candidate) < 1) return malformed(camel);
  return Number(candidate);
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
  const contactName = optionalText(record, 'contactName', 'contact_name');
  const rawAddresses = value(record, 'addresses', 'addresses');
  const addresses = Array.isArray(rawAddresses) ? rawAddresses.filter((entry): entry is ApiRecord => Boolean(entry && typeof entry === 'object' && !Array.isArray(entry))).map((entry) => ({
    label: optionalText(entry, 'label'), address: optionalText(entry, 'address'), locality: optionalText(entry, 'locality'),
    state: optionalText(entry, 'state') as any, postcode: optionalText(entry, 'postcode'),
    lat: Number(entry.lat), lng: Number(entry.lng),
    coordinateSource: optionalText(entry, 'coordinateSource') as any,
    locationConfirmedAt: optionalText(entry, 'locationConfirmedAt'),
  })) : [];
  return {
    id: requiredText(record, 'id'),
    contractorUserId: '',
    name: requiredText(record, 'name'),
    ...(contactName ? { contactName } : {}),
    phone: optionalText(record, 'contactPhone', 'contact_phone'),
    email: optionalText(record, 'contactEmail', 'contact_email'),
    notes: optionalText(record, 'notes'),
    ...(addresses.length ? { addresses } : {}),
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
    locality: optionalText(record, 'locality'),
    postcode: optionalText(record, 'postcode'),
    lotPlan: optionalText(record, 'lotPlan', 'lot_plan'),
    notes: optionalText(record, 'notes'),
    primaryContactName: optionalText(record, 'primaryContactName', 'primary_contact_name'),
    accessNotes: optionalText(record, 'accessNotes', 'access_notes'),
    addressSource: value(record, 'addressSource', 'address_source') === 'GEOCODED' ? 'GEOCODED' : 'MANUAL',
    lat: value(record, 'latitude', 'latitude') == null ? undefined : Number(value(record, 'latitude', 'latitude')),
    lng: value(record, 'longitude', 'longitude') == null ? undefined : Number(value(record, 'longitude', 'longitude')),
    locationConfirmedAt: optionalText(record, 'locationConfirmedAt', 'location_confirmed_at') || undefined,
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

export function mapApiOperatingLocation(record: ApiRecord): OperationalOperatingLocation {
  const rawLatitude = value(record, 'latitude', 'latitude');
  const rawLongitude = value(record, 'longitude', 'longitude');
  const rawAddressSource = value(record, 'addressSource', 'address_source');
  return {
    id: requiredText(record, 'id'), name: requiredText(record, 'name'),
    address: optionalText(record, 'address'), timezone: optionalText(record, 'timezone'),
    ...(rawLatitude === null || rawLatitude === undefined ? {} : { latitude: Number(rawLatitude) }),
    ...(rawLongitude === null || rawLongitude === undefined ? {} : { longitude: Number(rawLongitude) }),
    ...(rawAddressSource === 'ADDRESS_SEARCH' || rawAddressSource === 'MANUALLY_ADJUSTED' ? { addressSource: rawAddressSource } : {}),
    ...(optionalText(record, 'locationConfirmedAt', 'location_confirmed_at') ? { locationConfirmedAt: optionalText(record, 'locationConfirmedAt', 'location_confirmed_at') } : {}),
    rowVersion: versionValue(record), createdAt: timestamp(record, 'createdAt', 'created_at'),
    updatedAt: timestamp(record, 'updatedAt', 'updated_at'),
  };
}

function mapApiJobCore(record: ApiRecord): OperationalJobArchiveConfirmation {
  return {
    id: requiredText(record, 'id'), clientId: requiredText(record, 'clientId', 'client_id'),
    propertyId: requiredText(record, 'propertyId', 'property_id'), reference: requiredText(record, 'reference'),
    scope: optionalText(record, 'scope'), status: requiredText(record, 'status'), notes: optionalText(record, 'notes'),
    requestedDate: optionalDate(record, 'requestedDate', 'requested_date'),
    scheduledDate: optionalDate(record, 'scheduledDate', 'scheduled_date'), rowVersion: versionValue(record),
    createdAt: timestamp(record, 'createdAt', 'created_at'), updatedAt: timestamp(record, 'updatedAt', 'updated_at'),
  };
}

export function mapApiJob(record: ApiRecord): OperationalJob {
  return { ...mapApiJobCore(record), fieldIds: stringArray(record, 'fieldIds', 'field_ids', false) };
}

export function mapApiJobArchiveConfirmation(record: ApiRecord): OperationalJobArchiveConfirmation {
  return mapApiJobCore(record);
}

function boundaryGeojson(record: ApiRecord): OperationalBoundaryGeoJson {
  const candidate = value(record, 'boundaryGeojson', 'boundary_geojson') as any;
  if (!candidate || typeof candidate !== 'object' || !['Polygon', 'MultiPolygon'].includes(candidate.type) || !Array.isArray(candidate.coordinates)) {
    return malformed('boundaryGeojson');
  }
  const polygons = candidate.type === 'Polygon' ? [candidate.coordinates] : candidate.coordinates;
  if (polygons.length === 0) return malformed('boundaryGeojson');
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || polygon.length === 0) return malformed('boundaryGeojson');
    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 4) return malformed('boundaryGeojson');
      for (const point of ring) {
        if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)
          || point[0] < -180 || point[0] > 180 || point[1] < -90 || point[1] > 90) return malformed('boundaryGeojson');
      }
      if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) return malformed('boundaryGeojson');
    }
  }
  return candidate as OperationalBoundaryGeoJson;
}

export function mapApiFieldBoundaryVersion(record: ApiRecord): OperationalFieldBoundaryVersion {
  const geojson = boundaryGeojson(record);
  const polygon = geojson.type === 'Polygon' ? geojson.coordinates as number[][][] : (geojson.coordinates as number[][][][])[0];
  const outerRing = polygon[0];
  const boundaryCoords = outerRing.slice(0, -1).map((point) => [point[1], point[0]] as LatLng);
  const capturedAt = optionalText(record, 'capturedAt', 'captured_at') || undefined;
  if (capturedAt && Number.isNaN(Date.parse(capturedAt))) return malformed('capturedAt');
  const rowVersionRaw = value(record, 'rowVersion', 'row_version');
  const fieldVersionRaw = value(record, 'fieldVersion', 'field_version');
  if (rowVersionRaw !== undefined && (!Number.isInteger(rowVersionRaw) || Number(rowVersionRaw) < 1)) return malformed('rowVersion');
  if (fieldVersionRaw !== undefined && (!Number.isInteger(fieldVersionRaw) || Number(fieldVersionRaw) < 1)) return malformed('fieldVersion');
  return {
    id: requiredText(record, 'id'), fieldId: requiredText(record, 'fieldId', 'field_id'),
    propertyId: requiredText(record, 'propertyId', 'property_id'), versionNumber: positiveInteger(record, 'versionNumber', 'version_number'),
    boundaryGeojson: geojson, boundaryCoords, capturedAt,
    rowVersion: rowVersionRaw === undefined ? undefined : Number(rowVersionRaw),
    fieldVersion: fieldVersionRaw === undefined ? undefined : Number(fieldVersionRaw),
    createdAt: timestamp(record, 'createdAt', 'created_at'), updatedAt: timestamp(record, 'updatedAt', 'updated_at'),
  };
}

export function mapApiMission(record: ApiRecord): OperationalMission {
  const rawScheduledStartAt = value(record, 'scheduledStartAt', 'scheduled_start_at');
  const scheduledStartAt = rawScheduledStartAt === undefined || rawScheduledStartAt === null
    ? null : optionalText(record, 'scheduledStartAt', 'scheduled_start_at');
  if (scheduledStartAt === '') return malformed('scheduledStartAt');
  if (scheduledStartAt && Number.isNaN(Date.parse(scheduledStartAt))) return malformed('scheduledStartAt');
  const status = requiredText(record, 'status').toLowerCase();
  if (!['planning', 'completed'].includes(status)) return malformed('status');
  return {
    id: requiredText(record, 'id'), jobId: requiredText(record, 'jobId', 'job_id'),
    operatingLocationId: requiredText(record, 'operatingLocationId', 'operating_location_id'),
    missionNumber: requiredText(record, 'missionNumber', 'mission_number'),
    title: requiredText(record, 'title'), description: optionalText(record, 'description'), status: status === 'completed' ? 'Completed' : 'Planning',
    aircraftIds: Array.isArray(value(record, 'aircraftIds', 'aircraft_ids'))
      ? (value(record, 'aircraftIds', 'aircraft_ids') as unknown[]).map(String) : [],
    equipmentKitIds: Array.isArray(value(record, 'equipmentKitIds', 'equipment_kit_ids'))
      ? (value(record, 'equipmentKitIds', 'equipment_kit_ids') as unknown[]).map(String) : [],
    scheduledStartAt, rowVersion: versionValue(record), createdAt: timestamp(record, 'createdAt', 'created_at'),
    updatedAt: timestamp(record, 'updatedAt', 'updated_at'),
  };
}

interface ApiList<T> { records: T[]; page: number; pageSize: number; }

interface ResourceAdapter<T, TCreate, TUpdate, TArchive = T> {
  list(page?: number, pageSize?: number): Promise<ApiList<T>>;
  get(id: string): Promise<T>;
  create(input: TCreate): Promise<T>;
  update(id: string, input: TUpdate, expectedVersion: number): Promise<T>;
  archive(id: string, expectedVersion: number): Promise<TArchive>;
}

export interface OperationalApi {
  session(): Promise<OperationalSession>;
  operatingLocations: ResourceAdapter<OperationalOperatingLocation,
    Pick<OperationalOperatingLocation, 'name' | 'address' | 'timezone'>,
    Partial<Pick<OperationalOperatingLocation, 'name' | 'address' | 'timezone'>> & {
      latitude?: number; longitude?: number; addressSource?: 'ADDRESS_SEARCH' | 'MANUALLY_ADJUSTED';
      locationConfirmed?: boolean; locationConfirmedAt?: string;
    }>;
  clients: ResourceAdapter<Client, ClientCreateInput, ClientUpdateInput>;
  properties: ResourceAdapter<Property, PropertyCreateInput, PropertyUpdateInput>;
  fields: ResourceAdapter<Field, FieldCreateInput, FieldUpdateInput>;
  jobs: ResourceAdapter<OperationalJob, OperationalJobCreateInput, OperationalJobUpdateInput, OperationalJobArchiveConfirmation>;
  fieldBoundaryVersions: {
    list(fieldId: string, page?: number, pageSize?: number): Promise<ApiList<OperationalFieldBoundaryVersion>>;
    get(id: string): Promise<OperationalFieldBoundaryVersion>;
    create(input: FieldBoundaryVersionCreateInput): Promise<OperationalFieldBoundaryVersion>;
  };
  missions: ResourceAdapter<OperationalMission, OperationalMissionCreateInput, OperationalMissionUpdateInput>;
}

interface ApiOptions { timeoutMs?: number; }

export function createOperationalApi(options: ApiOptions = {}): OperationalApi {
  const timeoutMs = options.timeoutMs ?? 12000;

  async function request(path: string, init: RequestInit = {}): Promise<any> {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    const requestId = typeof globalThis.crypto?.randomUUID === 'function' ? globalThis.crypto.randomUUID() : `request-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    try {
      let response: Response;
      try {
        response = await fetch(path, {
          ...init,
          credentials: 'same-origin',
          signal: controller.signal,
          headers: init.body ? { 'Content-Type': 'application/json', 'X-Request-ID': requestId, ...(init.headers || {}) } : { 'X-Request-ID': requestId, ...(init.headers || {}) },
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
          { ...(apiError.meta && typeof apiError.meta === 'object' ? apiError.meta : {}), correlationId: response.headers?.get?.('X-Correlation-ID') || requestId },
        );
      }
      return envelope;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function resource<T, TCreate, TUpdate, TArchive = T>(
    name: string,
    map: (record: ApiRecord) => T,
    writable: (input: TCreate | TUpdate) => ApiRecord,
    archiveMap: (record: ApiRecord) => TArchive = map as unknown as (record: ApiRecord) => TArchive,
  ): ResourceAdapter<T, TCreate, TUpdate, TArchive> {
    const base = `/api/v1/${name}`;
    const responseRecord = (envelope: any): T => {
      if (!envelope?.data || typeof envelope.data !== 'object' || Array.isArray(envelope.data)) {
        throw new OperationalApiError(0, 'MALFORMED_RESPONSE', 'The operational API returned an invalid record.');
      }
      return map(envelope.data);
    };
    const responseArchiveRecord = (envelope: any): TArchive => {
      if (!envelope?.data || typeof envelope.data !== 'object' || Array.isArray(envelope.data)) {
        throw new OperationalApiError(0, 'MALFORMED_RESPONSE', 'The operational API returned an invalid record.');
      }
      return archiveMap(envelope.data);
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
        return responseArchiveRecord(await request(`${base}?id=${encodeURIComponent(id)}`, {
          method: 'DELETE', body: JSON.stringify({ expectedVersion }),
        }));
      },
    };
  }

  const clientWritable = (input: ClientCreateInput | ClientUpdateInput): ApiRecord => {
    const payload: ApiRecord = {};
    if (input.name !== undefined) payload.name = input.name;
    if (input.contactName !== undefined) payload.contactName = input.contactName;
    if (input.email !== undefined) payload.contactEmail = input.email;
    if (input.phone !== undefined) payload.contactPhone = input.phone;
    if (input.notes !== undefined) payload.notes = input.notes;
    if (input.addresses?.length) payload.addresses = input.addresses;
    return payload;
  };
  const propertyWritable = (input: PropertyCreateInput | PropertyUpdateInput): ApiRecord => {
    const payload: ApiRecord = {};
    if ('clientId' in input && input.clientId !== undefined) payload.clientId = input.clientId;
    if (input.name !== undefined) payload.name = input.name;
    if (input.address !== undefined) payload.address = input.address;
    if (input.state !== undefined) payload.state = input.state;
    if (input.locality) payload.locality = input.locality;
    if (input.postcode) payload.postcode = input.postcode;
    if (input.lotPlan) payload.lotPlan = input.lotPlan;
    if (input.primaryContactName) payload.primaryContactName = input.primaryContactName;
    if (input.accessNotes) payload.accessNotes = input.accessNotes;
    if (input.notes) payload.notes = input.notes;
    if (input.lat !== undefined) payload.latitude = input.lat;
    if (input.lng !== undefined) payload.longitude = input.lng;
    if (input.addressSource !== undefined) payload.addressSource = input.addressSource;
    if (input.locationConfirmedAt !== undefined) payload.locationConfirmedAt = input.locationConfirmedAt;
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

  const jobWritable = (input: OperationalJobCreateInput | OperationalJobUpdateInput): ApiRecord => ({
    ...('clientId' in input && input.clientId !== undefined ? { clientId: input.clientId } : {}),
    ...('propertyId' in input && input.propertyId !== undefined ? { propertyId: input.propertyId } : {}),
    ...(input.fieldIds !== undefined ? { fieldIds: input.fieldIds } : {}),
    ...(input.reference !== undefined ? { reference: input.reference } : {}),
    ...('autoGenerateReference' in input && input.autoGenerateReference !== undefined ? { autoGenerateReference: input.autoGenerateReference } : {}),
    ...(input.scope !== undefined ? { scope: input.scope } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
    ...(input.requestedDate !== undefined ? { requestedDate: input.requestedDate } : {}),
    ...(input.scheduledDate !== undefined ? { scheduledDate: input.scheduledDate } : {}),
  });
  const missionWritable = (input: OperationalMissionCreateInput | OperationalMissionUpdateInput): ApiRecord => {
    if (input.status !== undefined && input.status !== 'Planning') {
      throw new OperationalApiError(400, 'VALIDATION_ERROR', 'Remote mission writes may only use Planning status.');
    }
    return {
      ...(input.jobId !== undefined ? { jobId: input.jobId } : {}),
      ...(input.operatingLocationId !== undefined ? { operatingLocationId: input.operatingLocationId } : {}),
      ...(input.missionNumber !== undefined ? { missionNumber: input.missionNumber } : {}),
      ...('autoGenerateReference' in input && input.autoGenerateReference !== undefined ? { autoGenerateReference: input.autoGenerateReference } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.status !== undefined ? { status: 'planning' } : {}),
      ...(input.scheduledStartAt !== undefined ? { scheduledStartAt: input.scheduledStartAt } : {}),
      ...(input.aircraftIds !== undefined ? { aircraftIds: input.aircraftIds } : {}),
      ...(input.equipmentKitIds !== undefined ? { equipmentKitIds: input.equipmentKitIds } : {}),
    };
  };

  return {
    async session() {
      const data = (await request('/api/v1/session')).data;
      if (!data || typeof data !== 'object' || Array.isArray(data)) return malformed('session');
      const roles = stringArray(data, 'roles');
      const permissions = stringArray(data, 'permissions');
      const operatingLocationIds = stringArray(data, 'operatingLocationIds');
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
        roles,
        permissions,
        operatingLocationIds,
      };
    },
    operatingLocations: resource('operating-locations', mapApiOperatingLocation, (input: any) => ({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
      ...(input.latitude !== undefined ? { latitude: input.latitude } : {}),
      ...(input.longitude !== undefined ? { longitude: input.longitude } : {}),
      ...(input.addressSource !== undefined ? { addressSource: input.addressSource } : {}),
      ...(input.locationConfirmed !== undefined ? { locationConfirmed: input.locationConfirmed } : {}),
      ...(input.locationConfirmedAt !== undefined ? { locationConfirmedAt: input.locationConfirmedAt } : {}),
    })),
    clients: resource('clients', mapApiClient, clientWritable),
    properties: resource('properties', mapApiProperty, propertyWritable),
    fields: resource('fields', mapApiField, fieldWritable),
    jobs: resource('jobs', mapApiJob, jobWritable, mapApiJobArchiveConfirmation),
    fieldBoundaryVersions: (() => {
      const base = '/api/v1/field-boundary-versions';
      const responseRecord = async (promise: Promise<any>) => {
        const envelope = await promise;
        if (!envelope?.data || typeof envelope.data !== 'object' || Array.isArray(envelope.data)) return malformed('boundary record');
        return mapApiFieldBoundaryVersion(envelope.data);
      };
      return {
        async list(fieldId: string, page = 1, pageSize = 100) {
          const envelope = await request(`${base}?fieldId=${encodeURIComponent(fieldId)}&page=${page}&pageSize=${pageSize}`);
          if (!Array.isArray(envelope?.data) || !Number.isInteger(envelope?.pagination?.page)
            || !Number.isInteger(envelope?.pagination?.pageSize)) return malformed('boundary list');
          return { records: envelope.data.map(mapApiFieldBoundaryVersion), page: envelope.pagination.page, pageSize: envelope.pagination.pageSize };
        },
        get(id: string) { return responseRecord(request(`${base}?id=${encodeURIComponent(id)}`)); },
        create(input: FieldBoundaryVersionCreateInput) {
          return responseRecord(request(base, { method: 'POST', body: JSON.stringify(input) }));
        },
      };
    })(),
    missions: resource('missions', mapApiMission, missionWritable),
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
