import { Client, Field, Property } from '../types/fieldManagement';
import {
  ClientCreateInput, ClientUpdateInput, FieldCreateInput, FieldUpdateInput,
  PropertyCreateInput, PropertyUpdateInput,
} from './operationalApi';

export type OperationalLoadStatus = 'idle' | 'loading' | 'ready' | 'error' | 'unauthorised';

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
  status: OperationalLoadStatus;
  saving: boolean;
  savedAt: string | null;
  lastSaved: { resource: 'client' | 'property' | 'field'; recordId: string; at: string } | null;
  error: OperationalDataError | null;
}

export interface OperationalDataGateway {
  resolveOrganisation(): Promise<string>;
  listClients(): Promise<Client[]>;
  listProperties(): Promise<Property[]>;
  listFields(): Promise<Field[]>;
  createClient(input: ClientCreateInput): Promise<Client>;
  updateClient(id: string, input: ClientUpdateInput, expectedVersion: number): Promise<Client>;
  archiveClient(id: string, expectedVersion: number): Promise<unknown>;
  createProperty(input: PropertyCreateInput): Promise<Property>;
  updateProperty(id: string, input: PropertyUpdateInput, expectedVersion: number): Promise<Property>;
  archiveProperty(id: string, expectedVersion: number): Promise<unknown>;
  createField(input: FieldCreateInput): Promise<Field>;
  updateField(id: string, input: FieldUpdateInput, expectedVersion: number): Promise<Field>;
  archiveField(id: string, expectedVersion: number): Promise<unknown>;
}

const emptyState = (): OperationalDataState => ({
  clients: [], properties: [], fields: [], status: 'idle', saving: false, savedAt: null, lastSaved: null, error: null,
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
  setAuthenticatedUser(userId: string | null, tenantIdentity?: string | null): Promise<void>;
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
}

export function createOperationalDataStore(gateway: OperationalDataGateway): OperationalDataStore {
  let state = emptyState();
  let userId: string | null = null;
  let authenticatedScope: string | null = null;
  let organisationId: string | null = null;
  let generation = 0;
  let pendingMutations = 0;
  const listeners = new Set<() => void>();

  const emit = (next: OperationalDataState) => {
    state = next;
    listeners.forEach((listener) => listener());
  };
  const patch = (updates: Partial<OperationalDataState>) => emit({ ...state, ...updates });
  const clear = (status: OperationalLoadStatus) => emit({ ...emptyState(), status });

  async function load(): Promise<void> {
    if (!userId) { clear('idle'); return; }
    const activeGeneration = ++generation;
    clear('loading');
    try {
      const resolvedOrganisation = await gateway.resolveOrganisation();
      if (activeGeneration !== generation || !userId) return;
      if (!resolvedOrganisation) throw Object.assign(new Error('No active organisation is available.'), { code: 'FORBIDDEN', status: 403 });
      organisationId = resolvedOrganisation;
      const [clients, properties, fields] = await Promise.all([
        gateway.listClients(), gateway.listProperties(), gateway.listFields(),
      ]);
      if (activeGeneration !== generation || !userId || organisationId !== resolvedOrganisation) return;
      emit({ clients, properties, fields, status: 'ready', saving: false, savedAt: null, lastSaved: null, error: null });
    } catch (error) {
      if (activeGeneration !== generation) return;
      organisationId = null;
      const normalized = operationalError(error);
      emit({ ...emptyState(), status: normalized.status === 401 || normalized.status === 403 ? 'unauthorised' : 'error', error: normalized });
    }
  }

  function expectedVersion(collection: Array<{ id: string; rowVersion?: number }>, id: string): number {
    return collection.find((record) => record.id === id)?.rowVersion || 1;
  }

  async function mutate<T extends { id?: string }>(
    resource: 'client' | 'property' | 'field',
    recordId: string | null,
    request: () => Promise<T>,
    confirm: (record: T) => void,
  ): Promise<T> {
    const activeGeneration = generation;
    pendingMutations += 1;
    patch({ saving: true, savedAt: null, lastSaved: null, error: null });
    try {
      const record = await request();
      if (activeGeneration !== generation || !userId) {
        throw Object.assign(new Error('The authenticated organisation changed before the save completed.'), { code: 'STALE_SCOPE' });
      }
      confirm(record);
      const at = new Date().toISOString();
      patch({ savedAt: at, lastSaved: { resource, recordId: recordId || record.id || '', at }, error: null });
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

  return {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async setAuthenticatedUser(nextUserId, tenantIdentity = null) {
      const nextScope = nextUserId ? `${nextUserId}:${tenantIdentity || ''}` : null;
      if (nextScope === authenticatedScope && nextUserId !== null) return;
      userId = nextUserId;
      authenticatedScope = nextScope;
      organisationId = null;
      generation += 1;
      pendingMutations = 0;
      if (!nextUserId) { clear('idle'); return; }
      await load();
    },
    refresh: load,
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
  };
}
