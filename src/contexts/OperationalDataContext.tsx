import React, { createContext, useContext, useLayoutEffect, useMemo, useSyncExternalStore } from 'react';
import { useAuth } from './AuthContext';
import { getPersistenceMode, PersistenceMode } from '../services/persistence';
import { createOperationalApi, listAll, OperationalApi, OperationalApiError } from '../services/operationalApi';
import {
  createOperationalDataStore, OperationalDataGateway, OperationalDataState, OperationalDataStore,
} from '../services/operationalDataStore';
import {
  deleteClient, deleteField, deleteProperty, getClients, getFields, getProperties,
  saveClient, saveField, saveProperty, setCurrentUser, updateClient, updateField, updateProperty,
} from '../services/fieldManagementStore';

type OperationalDataContextValue = OperationalDataState & OperationalDataStore & { mode: PersistenceMode };

const OperationalDataContext = createContext<OperationalDataContextValue | null>(null);

function createRemoteGateway(api: OperationalApi): OperationalDataGateway {
  return {
    listClients: () => listAll((page, pageSize) => api.clients.list(page, pageSize)),
    listProperties: () => listAll((page, pageSize) => api.properties.list(page, pageSize)),
    listFields: () => listAll((page, pageSize) => api.fields.list(page, pageSize)),
    listOperatingLocations: () => listAll((page, pageSize) => api.operatingLocations.list(page, pageSize)),
    listJobs: () => listAll((page, pageSize) => api.jobs.list(page, pageSize)),
    listMissions: () => listAll((page, pageSize) => api.missions.list(page, pageSize)),
    listFieldBoundaryVersions: (fieldId) => listAll((page, pageSize) => api.fieldBoundaryVersions.list(fieldId, page, pageSize)),
    createClient: (input) => api.clients.create(input),
    updateClient: (id, input, expectedVersion) => api.clients.update(id, input, expectedVersion),
    archiveClient: (id, expectedVersion) => api.clients.archive(id, expectedVersion),
    createProperty: (input) => api.properties.create(input),
    updateProperty: (id, input, expectedVersion) => api.properties.update(id, input, expectedVersion),
    archiveProperty: (id, expectedVersion) => api.properties.archive(id, expectedVersion),
    createField: (input) => api.fields.create(input),
    updateField: (id, input, expectedVersion) => api.fields.update(id, input, expectedVersion),
    archiveField: (id, expectedVersion) => api.fields.archive(id, expectedVersion),
    createJob: (input) => api.jobs.create(input),
    updateJob: (id, input, expectedVersion) => api.jobs.update(id, input, expectedVersion),
    archiveJob: (id, expectedVersion) => api.jobs.archive(id, expectedVersion),
    createMission: (input) => api.missions.create(input),
    updateMission: (id, input, expectedVersion) => api.missions.update(id, input, expectedVersion),
    archiveMission: (id, expectedVersion) => api.missions.archive(id, expectedVersion),
    createFieldBoundaryVersion: (input) => api.fieldBoundaryVersions.create(input),
  };
}

function createLocalGateway(): OperationalDataGateway {
  return {
    resolveOrganisation: async () => 'local-development',
    listClients: async () => getClients(),
    listProperties: async () => getProperties(),
    listFields: async () => getFields(),
    listOperatingLocations: async () => [],
    listJobs: async () => [],
    listMissions: async () => [],
    listFieldBoundaryVersions: async () => [],
    createClient: async (input) => saveClient(input),
    updateClient: async (id, input) => updateClient(id, input),
    archiveClient: async (id) => deleteClient(id),
    createProperty: async (input) => saveProperty(input),
    updateProperty: async (id, input) => updateProperty(id, input),
    archiveProperty: async (id) => deleteProperty(id),
    createField: async (input) => saveField(input),
    updateField: async (id, input) => updateField(id, input),
    archiveField: async (id) => deleteField(id),
    createJob: async () => { throw new Error('Authoritative job commands are unavailable in local mode.'); },
    updateJob: async () => { throw new Error('Authoritative job commands are unavailable in local mode.'); },
    archiveJob: async () => { throw new Error('Authoritative job commands are unavailable in local mode.'); },
    createMission: async () => { throw new Error('Authoritative mission commands are unavailable in local mode.'); },
    updateMission: async () => { throw new Error('Authoritative mission commands are unavailable in local mode.'); },
    archiveMission: async () => { throw new Error('Authoritative mission commands are unavailable in local mode.'); },
    createFieldBoundaryVersion: async () => { throw new Error('Authoritative boundary commands are unavailable in local mode.'); },
  };
}

export function OperationalDataProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const userRole = user?.role;
  const contractorId = user?.contractorId;
  const clientRecordId = user?.clientRecordId;
  const mode = getPersistenceMode();
  const runtime = useMemo(() => {
    if (mode === 'remote') {
      const api = createOperationalApi();
      return { api, store: createOperationalDataStore(createRemoteGateway(api)) };
    }
    return { api: null, store: createOperationalDataStore(createLocalGateway()) };
  }, [mode]);
  const { api, store } = runtime;
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  useLayoutEffect(() => {
    if (mode === 'local') {
      setCurrentUser(userId && userRole ? {
        id: userId,
        role: userRole,
        contractorId,
        clientRecordId,
      } : null);
    }
    if (!userId) {
      void store.setAuthenticatedUser(null);
    } else if (mode === 'remote' && api) {
      void store.authenticate(userId, async () => {
        const session = await api.session();
        if (session.user.id !== userId) {
          throw new OperationalApiError(401, 'UNAUTHENTICATED', 'The authenticated session changed. Sign in again.');
        }
        return session.organisation.id;
      });
    } else {
      void store.setAuthenticatedUser(userId, 'local-development');
    }
  }, [api, clientRecordId, contractorId, mode, store, userId, userRole]);

  const value = useMemo<OperationalDataContextValue>(() => ({ ...state, ...store, mode }), [mode, state, store]);
  return <OperationalDataContext.Provider value={value}>{children}</OperationalDataContext.Provider>;
}

export function useOperationalData(): OperationalDataContextValue {
  const context = useContext(OperationalDataContext);
  if (!context) throw new Error('useOperationalData must be used within OperationalDataProvider');
  return context;
}
