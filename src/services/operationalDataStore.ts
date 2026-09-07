import { Client, Field, Property } from '../types/fieldManagement';
import {
  FieldBoundaryVersionCreateInput, OperationalFieldBoundaryVersion, OperationalJob, OperationalJobCreateInput,
  OperationalJobUpdateInput, OperationalMission, OperationalMissionCreateInput, OperationalMissionUpdateInput,
  OperationalOperatingLocation,
  ClientCreateInput, ClientUpdateInput, FieldCreateInput, FieldUpdateInput,
  PropertyCreateInput, PropertyUpdateInput,
} from './operationalApi';

export type OperationalLoadStatus = 'idle' | 'loading' | 'ready' | 'error' | 'unauthorised';
export const SAVED_CONFIRMATION_MS = 3000;

export interface OperationalDataError {
  message: string;
  code: string;
  status?: number;
  details?: Record<string, unknown>;
  currentVersion?: number;
}

export interface OperationalDataState {
  clients: Client[];
  properties: Property[];
  fields: Field[];
  operatingLocations: OperationalOperatingLocation[];
  operatingLocationIds: string[];
  jobs: OperationalJob[];
  missions: OperationalMission[];
  fieldBoundaryVersions: OperationalFieldBoundaryVersion[];
  status: OperationalLoadStatus;
  saving: boolean;
  savedAt: string | null;
  lastSaved: { resource: 'client' | 'property' | 'field' | 'job' | 'mission' | 'boundary'; recordId: string; at: string } | null;
  error: OperationalDataError | null;
}

export interface OperationalDataGateway {
  /** Local compatibility hook; remote callers must resolve organisation from /api/v1/session. */
  resolveOrganisation?(): Promise<string>;
  listClients(): Promise<Client[]>;
  listProperties(): Promise<Property[]>;
  listFields(): Promise<Field[]>;
  listOperatingLocations(): Promise<OperationalOperatingLocation[]>;
  listJobs(): Promise<OperationalJob[]>;
  listMissions(): Promise<OperationalMission[]>;
  listFieldBoundaryVersions(fieldId: string): Promise<OperationalFieldBoundaryVersion[]>;
  createClient(input: ClientCreateInput): Promise<Client>;
  updateClient(id: string, input: ClientUpdateInput, expectedVersion: number): Promise<Client>;
  archiveClient(id: string, expectedVersion: number): Promise<unknown>;
  createProperty(input: PropertyCreateInput): Promise<Property>;
  updateProperty(id: string, input: PropertyUpdateInput, expectedVersion: number): Promise<Property>;
  archiveProperty(id: string, expectedVersion: number): Promise<unknown>;
  createField(input: FieldCreateInput): Promise<Field>;
  updateField(id: string, input: FieldUpdateInput, expectedVersion: number): Promise<Field>;
  archiveField(id: string, expectedVersion: number): Promise<unknown>;
  createJob(input: OperationalJobCreateInput): Promise<OperationalJob>;
  updateJob(id: string, input: OperationalJobUpdateInput, expectedVersion: number): Promise<OperationalJob>;
  archiveJob(id: string, expectedVersion: number): Promise<unknown>;
  createMission(input: OperationalMissionCreateInput): Promise<OperationalMission>;
  updateMission(id: string, input: OperationalMissionUpdateInput, expectedVersion: number): Promise<OperationalMission>;
  archiveMission(id: string, expectedVersion: number): Promise<unknown>;
  createFieldBoundaryVersion(input: FieldBoundaryVersionCreateInput): Promise<OperationalFieldBoundaryVersion>;
}

const emptyState = (): OperationalDataState => ({
  clients: [], properties: [], fields: [], operatingLocations: [], operatingLocationIds: [], jobs: [], missions: [], fieldBoundaryVersions: [],
  status: 'idle', saving: false, savedAt: null, lastSaved: null, error: null,
});

function operationalError(error: unknown): OperationalDataError {
  const candidate = error as Partial<OperationalDataError> | undefined;
  return {
    message: error instanceof Error ? error.message : typeof candidate?.message === 'string' ? candidate.message : 'Operational data request failed.',
    code: typeof candidate?.code === 'string' ? candidate.code : 'UNKNOWN_ERROR',
    status: typeof candidate?.status === 'number' ? candidate.status : undefined,
    details: candidate?.details,
    currentVersion: typeof candidate?.currentVersion === 'number' ? candidate.currentVersion : undefined,
  };
}

export function describeOperationalError(error: unknown): string {
  const normalized = operationalError(error);
  if (normalized.code === 'VERSION_CONFLICT') {
    const version = normalized.currentVersion ? ` Current version: ${normalized.currentVersion}.` : '';
    return `This record changed on the server. Reload and try again.${version}`;
  }
  if (normalized.code === 'ARCHIVE_CONFLICT' || normalized.code === 'RELATIONSHIP_CONFLICT') {
    return 'This record cannot be archived while active dependent records remain.';
  }
  if (normalized.status === 401 || normalized.status === 403) return 'You are not authorised to perform this operation.';
  return normalized.message;
}

export interface OperationalDataStore {
  getSnapshot(): OperationalDataState;
  subscribe(listener: () => void): () => void;
  setAuthenticatedUser(userId: string | null, organisationId?: string | null): Promise<void>;
  authenticate(userId: string, resolveOrganisation: () => Promise<string | OperationalSessionScope>): Promise<void>;
  refresh(): Promise<void>;
  createClient(input: ClientCreateInput): Promise<Client>;
  updateClient(id: string, input: ClientUpdateInput): Promise<Client>;
  archiveClient(id: string): Promise<void>;
  createProperty(input: PropertyCreateInput): Promise<Property>;
  updateProperty(id: string, input: PropertyUpdateInput): Promise<Property>;
  archiveProperty(id: string): Promise<void>;
  createField(input: FieldCreateInput): Promise<Field>;
  updateField(id: string, input: FieldUpdateInput): Promise<Field>;
  archiveField(id: string): Promise<void>;
  createJob(input: OperationalJobCreateInput): Promise<OperationalJob>;
  updateJob(id: string, input: OperationalJobUpdateInput): Promise<OperationalJob>;
  archiveJob(id: string): Promise<void>;
  createMission(input: OperationalMissionCreateInput): Promise<OperationalMission>;
  updateMission(id: string, input: OperationalMissionUpdateInput): Promise<OperationalMission>;
  archiveMission(id: string): Promise<void>;
  refreshFieldBoundary(fieldId: string): Promise<OperationalFieldBoundaryVersion | null>;
  createFieldBoundaryVersion(fieldId: string, coordinates: Array<[number, number]> | Array<Array<[number, number]>>): Promise<OperationalFieldBoundaryVersion>;
}

export interface OperationalSessionScope {
  organisationId: string;
  operatingLocationIds: string[];
}

export function createOperationalDataStore(gateway: OperationalDataGateway): OperationalDataStore {
  let state = emptyState();
  let userId: string | null = null;
  let organisationId: string | null = null;
  let scopeResolver: (() => Promise<string | OperationalSessionScope>) | null = null;
  let generation = 0;
  let pendingMutations = 0;
  let savedConfirmationTimer: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<() => void>();

  const emit = (next: OperationalDataState) => {
    state = next;
    listeners.forEach((listener) => listener());
  };
  const patch = (updates: Partial<OperationalDataState>) => emit({ ...state, ...updates });
  const clear = (status: OperationalLoadStatus) => emit({ ...emptyState(), status });

  function clearSavedConfirmationTimer() {
    if (savedConfirmationTimer !== null) clearTimeout(savedConfirmationTimer);
    savedConfirmationTimer = null;
  }

  function beginScope(nextUserId: string | null, resolver: (() => Promise<string | OperationalSessionScope>) | null): number {
    generation += 1;
    pendingMutations = 0;
    clearSavedConfirmationTimer();
    userId = nextUserId;
    organisationId = null;
    scopeResolver = resolver;
    clear(nextUserId ? 'loading' : 'idle');
    return generation;
  }

  async function authenticate(nextUserId: string, resolveOrganisation: () => Promise<string | OperationalSessionScope>): Promise<void> {
    const activeGeneration = beginScope(nextUserId, resolveOrganisation);
    try {
      const resolvedScope = await resolveOrganisation();
      const resolvedOrganisation = typeof resolvedScope === 'string' ? resolvedScope : resolvedScope.organisationId;
      const assignedLocationIds = typeof resolvedScope === 'string' ? null : resolvedScope.operatingLocationIds;
      if (activeGeneration !== generation || userId !== nextUserId) return;
      if (!resolvedOrganisation) throw Object.assign(new Error('No active organisation is available.'), { code: 'FORBIDDEN', status: 403 });
      organisationId = resolvedOrganisation;
      const [clients, properties, fields, loadedOperatingLocations, jobs, loadedMissions] = await Promise.all([
        gateway.listClients(), gateway.listProperties(), gateway.listFields(),
        gateway.listOperatingLocations(), gateway.listJobs(), gateway.listMissions(),
      ]);
      if (activeGeneration !== generation || userId !== nextUserId || organisationId !== resolvedOrganisation) return;
      const scopedOperatingLocationIds = assignedLocationIds || loadedOperatingLocations.map((record) => record.id);
      const assignedOperatingLocationIds = new Set(scopedOperatingLocationIds);
      const operatingLocations = loadedOperatingLocations.filter((record) => assignedOperatingLocationIds.has(record.id));
      const missions = loadedMissions.filter((record) => assignedOperatingLocationIds.has(record.operatingLocationId));
      const clientIds = new Set(clients.map((record) => record.id));
      const propertiesById = new Map(properties.map((record) => [record.id, record]));
      const fieldsById = new Map(fields.map((record) => [record.id, record]));
      const jobIds = new Set(jobs.map((record) => record.id));
      const operatingLocationIds = new Set(operatingLocations.map((record) => record.id));
      const invalidProperty = properties.some((record) => !clientIds.has(record.clientId));
      const invalidField = fields.some((record) => !propertiesById.has(record.propertyId));
      const invalidJob = jobs.some((record) => {
        const propertyIds = record.propertyIds?.length ? record.propertyIds : [record.propertyId];
        const propertyIdSet = new Set(propertyIds);
        return !clientIds.has(record.clientId)
          || propertyIdSet.size !== propertyIds.length
          || !propertyIdSet.has(record.propertyId)
          || propertyIds.some((propertyId) => propertiesById.get(propertyId)?.clientId !== record.clientId)
          || record.fieldIds.some((fieldId) => {
            const selectedField = fieldsById.get(fieldId);
            return !selectedField || !propertyIdSet.has(selectedField.propertyId);
          });
      });
      const invalidMission = missions.some((record) => !['Planning', 'Completed'].includes(record.status)
        || !jobIds.has(record.jobId) || !operatingLocationIds.has(record.operatingLocationId));
      if (invalidProperty || invalidField || invalidJob || invalidMission) {
        throw Object.assign(new Error('The operational API returned records outside the active parent chain.'), { code: 'MALFORMED_RESPONSE' });
      }
      emit({ clients, properties, fields, operatingLocations, operatingLocationIds: scopedOperatingLocationIds, jobs, missions, fieldBoundaryVersions: [], status: 'ready', saving: false, savedAt: null, lastSaved: null, error: null });
    } catch (error) {
      if (activeGeneration !== generation) return;
      organisationId = null;
      const normalized = operationalError(error);
      emit({ ...emptyState(), status: normalized.status === 401 || normalized.status === 403 ? 'unauthorised' : 'error', error: normalized });
    }
  }

  async function refresh(): Promise<void> {
    if (!userId || !scopeResolver) { beginScope(null, null); return; }
    await authenticate(userId, scopeResolver);
  }

  function expectedVersion(collection: Array<{ id: string; rowVersion?: number }>, id: string): number {
    return collection.find((record) => record.id === id)?.rowVersion || 1;
  }

  async function mutate<T extends { id?: string }>(
    resource: 'client' | 'property' | 'field' | 'job' | 'mission' | 'boundary',
    recordId: string | null,
    request: () => Promise<T>,
    confirm: (record: T) => void,
  ): Promise<T> {
    const activeGeneration = generation;
    pendingMutations += 1;
    clearSavedConfirmationTimer();
    patch({ saving: true, savedAt: null, lastSaved: null, error: null });
    try {
      const record = await request();
      if (activeGeneration !== generation || !userId) {
        throw Object.assign(new Error('The authenticated organisation changed before the save completed.'), { code: 'STALE_SCOPE' });
      }
      confirm(record);
      const at = new Date().toISOString();
      patch({ savedAt: at, lastSaved: { resource, recordId: recordId || record.id || '', at }, error: null });
      savedConfirmationTimer = setTimeout(() => {
        if (activeGeneration === generation && state.lastSaved?.at === at) patch({ savedAt: null, lastSaved: null });
        savedConfirmationTimer = null;
      }, SAVED_CONFIRMATION_MS);
      return record;
    } catch (error) {
      if (activeGeneration === generation) patch({ savedAt: null, lastSaved: null, error: operationalError(error) });
      throw error;
    } finally {
      if (activeGeneration === generation) {
        pendingMutations = Math.max(0, pendingMutations - 1);
        patch({ saving: pendingMutations > 0 });
      }
    }
  }

  const replace = <T extends { id: string }>(records: T[], record: T): T[] => records.map((existing) => existing.id === record.id ? record : existing);

  const missionValidationError = (message: string) => Object.assign(new Error(message), {
    code: 'VALIDATION_ERROR', status: 400,
  });

  const missionConfirmationError = (message: string) => Object.assign(new Error(message), {
    code: 'MALFORMED_RESPONSE', status: 0,
  });

  function validateMissionInput(input: OperationalMissionCreateInput | OperationalMissionUpdateInput, current?: OperationalMission) {
    const status = input.status ?? current?.status;
    const jobId = input.jobId ?? current?.jobId;
    const operatingLocationId = input.operatingLocationId ?? current?.operatingLocationId;
    if (status !== 'Planning') throw missionValidationError('Remote mission writes may only use Planning status.');
    if (!jobId || !state.jobs.some((record) => record.id === jobId)) {
      throw missionValidationError('Select an authoritative job before saving the mission.');
    }
    if (!operatingLocationId || !state.operatingLocationIds.includes(operatingLocationId)
      || !state.operatingLocations.some((record) => record.id === operatingLocationId)) {
      throw missionValidationError('Select an active authoritative operating location before saving the mission.');
    }
  }

  function validateMissionConfirmation(record: OperationalMission, expectedId?: string) {
    if (!record || typeof record.id !== 'string' || !record.id || (expectedId && record.id !== expectedId)) {
      throw missionConfirmationError('The mission confirmation did not match the saved mission.');
    }
    if (record.status !== 'Planning') {
      throw missionConfirmationError('The mission confirmation returned an unsupported lifecycle state.');
    }
    if (!state.jobs.some((job) => job.id === record.jobId)) {
      throw missionConfirmationError('The mission confirmation returned an inactive or unavailable job.');
    }
    if (!state.operatingLocationIds.includes(record.operatingLocationId)
      || !state.operatingLocations.some((location) => location.id === record.operatingLocationId)) {
      throw missionConfirmationError('The mission confirmation returned an unassigned operating location.');
    }
  }

  return {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async setAuthenticatedUser(nextUserId, authenticatedOrganisationId = null) {
      if (!nextUserId) { beginScope(null, null); return; }
      await authenticate(nextUserId, async () => {
        if (authenticatedOrganisationId) return authenticatedOrganisationId;
        if (gateway.resolveOrganisation) return gateway.resolveOrganisation();
        return 'local-development';
      });
    },
    authenticate,
    refresh,
    createClient(input) {
      return mutate('client', null, () => gateway.createClient(input), (record) => patch({ clients: [...state.clients, record as Client] }));
    },
    updateClient(id, input) {
      return mutate('client', id, () => gateway.updateClient(id, input, expectedVersion(state.clients, id)), (record) => patch({ clients: replace(state.clients, record as Client) }));
    },
    async archiveClient(id) {
      await mutate('client', id, () => gateway.archiveClient(id, expectedVersion(state.clients, id)) as Promise<{ id?: string }>, () => patch({ clients: state.clients.filter((record) => record.id !== id) }));
    },
    createProperty(input) {
      return mutate('property', null, () => gateway.createProperty(input), (record) => patch({ properties: [...state.properties, record as Property] }));
    },
    updateProperty(id, input) {
      return mutate('property', id, () => gateway.updateProperty(id, input, expectedVersion(state.properties, id)), (record) => patch({ properties: replace(state.properties, record as Property) }));
    },
    async archiveProperty(id) {
      await mutate('property', id, () => gateway.archiveProperty(id, expectedVersion(state.properties, id)) as Promise<{ id?: string }>, () => patch({ properties: state.properties.filter((record) => record.id !== id) }));
    },
    createField(input) {
      return mutate('field', null, () => gateway.createField(input), (record) => patch({ fields: [...state.fields, record as Field] }));
    },
    updateField(id, input) {
      return mutate('field', id, () => gateway.updateField(id, input, expectedVersion(state.fields, id)), (record) => patch({ fields: replace(state.fields, record as Field) }));
    },
    async archiveField(id) {
      await mutate('field', id, () => gateway.archiveField(id, expectedVersion(state.fields, id)) as Promise<{ id?: string }>, () => patch({ fields: state.fields.filter((record) => record.id !== id) }));
    },
    createJob(input) {
      return mutate('job', null, () => gateway.createJob(input), (record) => patch({ jobs: [...state.jobs, record as OperationalJob] }));
    },
    updateJob(id, input) {
      return mutate('job', id, () => gateway.updateJob(id, input, expectedVersion(state.jobs, id)), (record) => patch({ jobs: replace(state.jobs, record as OperationalJob) }));
    },
    async archiveJob(id) {
      await mutate('job', id, () => gateway.archiveJob(id, expectedVersion(state.jobs, id)) as Promise<{ id?: string }>, () => patch({ jobs: state.jobs.filter((record) => record.id !== id) }));
    },
    createMission(input) {
      try { validateMissionInput(input); } catch (error) { return Promise.reject(error); }
      return mutate('mission', null, () => gateway.createMission(input), (record) => {
        validateMissionConfirmation(record as OperationalMission);
        patch({ missions: [...state.missions, record as OperationalMission] });
      });
    },
    updateMission(id, input) {
      const current = state.missions.find((record) => record.id === id);
      if (!current) return Promise.reject(Object.assign(new Error('Mission not found.'), { code: 'NOT_FOUND', status: 404 }));
      try { validateMissionInput(input, current); } catch (error) { return Promise.reject(error); }
      return mutate('mission', id, () => gateway.updateMission(id, input, expectedVersion(state.missions, id)), (record) => {
        validateMissionConfirmation(record as OperationalMission, id);
        patch({ missions: replace(state.missions, record as OperationalMission) });
      });
    },
    async archiveMission(id) {
      const current = state.missions.find((record) => record.id === id);
      if (!current) throw Object.assign(new Error('Mission not found.'), { code: 'NOT_FOUND', status: 404 });
      await mutate('mission', id, () => gateway.archiveMission(id, expectedVersion(state.missions, id)) as Promise<{ id?: string }>, () => patch({ missions: state.missions.filter((record) => record.id !== id) }));
    },
    async refreshFieldBoundary(fieldId) {
      const activeGeneration = generation;
      const field = state.fields.find((record) => record.id === fieldId);
      if (!field) throw Object.assign(new Error('Field not found.'), { code: 'NOT_FOUND', status: 404 });
      try {
        const records = await gateway.listFieldBoundaryVersions(fieldId);
        if (activeGeneration !== generation) throw Object.assign(new Error('The authenticated organisation changed before the load completed.'), { code: 'STALE_SCOPE' });
        if (records.some((record) => record.fieldId !== field.id || record.propertyId !== field.propertyId)) {
          throw Object.assign(new Error('The boundary response does not match the active field.'), { code: 'MALFORMED_RESPONSE' });
        }
        const current = records.find((record) => record.id === field.fieldBoundaryVersionId)
          || [...records].sort((a, b) => b.versionNumber - a.versionNumber)[0] || null;
        patch({
          fieldBoundaryVersions: [...state.fieldBoundaryVersions.filter((record) => record.fieldId !== fieldId), ...records],
          fields: current ? state.fields.map((record) => record.id === fieldId ? {
            ...record, boundaryCoords: current.boundaryCoords, boundaryPolygons: current.boundaryPolygons,
          } : record) : state.fields,
          error: null,
        });
        return current;
      } catch (error) {
        if (activeGeneration === generation) patch({ error: operationalError(error) });
        throw error;
      }
    },
    createFieldBoundaryVersion(fieldId, coordinates) {
      const field = state.fields.find((record) => record.id === fieldId);
      if (!field) return Promise.reject(Object.assign(new Error('Field not found.'), { code: 'NOT_FOUND', status: 404 }));
      const polygons: Array<Array<[number, number]>> = typeof coordinates[0]?.[0] === 'number'
        ? [coordinates as Array<[number, number]>]
        : coordinates as Array<Array<[number, number]>>;
      if (!polygons.length || polygons.some((polygon) => polygon.length < 3 || polygon.some(([lat, lng]) => !Number.isFinite(lat) || !Number.isFinite(lng)
        || lat < -90 || lat > 90 || lng < -180 || lng > 180))) {
        return Promise.reject(Object.assign(new Error('Boundary geometry must contain at least three valid points.'), { code: 'VALIDATION_ERROR', status: 400 }));
      }
      const rings = polygons.map((polygon) => {
        const ring = polygon.map(([lat, lng]) => [lng, lat]);
        ring.push([...ring[0]]);
        return ring;
      });
      return mutate('boundary', fieldId, () => gateway.createFieldBoundaryVersion({
        fieldId, propertyId: field.propertyId, expectedFieldVersion: field.rowVersion || 1,
        boundaryGeojson: rings.length === 1
          ? { type: 'Polygon', coordinates: [rings[0]] }
          : { type: 'MultiPolygon', coordinates: rings.map((ring) => [ring]) },
      }), (record) => {
        const boundary = record as OperationalFieldBoundaryVersion;
        if (!boundary.fieldVersion) throw Object.assign(new Error('The boundary response did not include the updated field version.'), { code: 'MALFORMED_RESPONSE' });
        patch({
          fieldBoundaryVersions: [...state.fieldBoundaryVersions.filter((item) => item.id !== boundary.id), boundary],
          fields: state.fields.map((item) => item.id === fieldId ? {
            ...item, rowVersion: boundary.fieldVersion, fieldBoundaryVersionId: boundary.id,
            boundaryCoords: boundary.boundaryCoords, boundaryPolygons: boundary.boundaryPolygons,
          } : item),
        });
      });
    },
  };
}
