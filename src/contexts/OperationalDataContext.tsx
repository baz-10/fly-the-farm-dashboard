import React, { createContext, useContext, useLayoutEffect, useMemo, useSyncExternalStore } from 'react';
import { useAuth } from './AuthContext';
import { getPersistenceMode, PersistenceMode } from '../services/persistence';
import { createOperationalApi, listAll } from '../services/operationalApi';
import {
  createOperationalDataStore, OperationalDataGateway, OperationalDataState, OperationalDataStore,
} from '../services/operationalDataStore';
import {
  deleteClient, deleteField, deleteProperty, getClients, getFields, getProperties,
  saveClient, saveField, saveProperty, setCurrentUser, updateClient, updateField, updateProperty,
} from '../services/fieldManagementStore';

type OperationalDataContextValue = OperationalDataState & OperationalDataStore & { mode: PersistenceMode };

const OperationalDataContext = createContext<OperationalDataContextValue | null>(null);

function createRemoteGateway(): OperationalDataGateway {
  const api = createOperationalApi();
  return {
    resolveOrganisation: async () => (await api.session()).organisation.id,
    listClients: () => listAll((page, pageSize) => api.clients.list(page, pageSize)),
    listProperties: () => listAll((page, pageSize) => api.properties.list(page, pageSize)),
    listFields: () => listAll((page, pageSize) => api.fields.list(page, pageSize)),
    createClient: (input) => api.clients.create(input),
    updateClient: (id, input, expectedVersion) => api.clients.update(id, input, expectedVersion),
    archiveClient: (id, expectedVersion) => api.clients.archive(id, expectedVersion),
    createProperty: (input) => api.properties.create(input),
    updateProperty: (id, input, expectedVersion) => api.properties.update(id, input, expectedVersion),
    archiveProperty: (id, expectedVersion) => api.properties.archive(id, expectedVersion),
    createField: (input) => api.fields.create(input),
    updateField: (id, input, expectedVersion) => api.fields.update(id, input, expectedVersion),
    archiveField: (id, expectedVersion) => api.fields.archive(id, expectedVersion),
  };
}

function createLocalGateway(): OperationalDataGateway {
  return {
    resolveOrganisation: async () => 'local-development',
    listClients: async () => getClients(),
    listProperties: async () => getProperties(),
    listFields: async () => getFields(),
    createClient: async (input) => saveClient(input),
    updateClient: async (id, input) => updateClient(id, input),
    archiveClient: async (id) => deleteClient(id),
    createProperty: async (input) => saveProperty(input),
    updateProperty: async (id, input) => updateProperty(id, input),
    archiveProperty: async (id) => deleteProperty(id),
    createField: async (input) => saveField(input),
    updateField: async (id, input) => updateField(id, input),
    archiveField: async (id) => deleteField(id),
  };
}

export function OperationalDataProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const userRole = user?.role;
  const contractorId = user?.contractorId;
  const clientRecordId = user?.clientRecordId;
  const tenantIdentity = user?.tenantId;
  const mode = getPersistenceMode();
  const store = useMemo(
    () => createOperationalDataStore(mode === 'remote' ? createRemoteGateway() : createLocalGateway()),
    [mode],
  );
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
    void store.setAuthenticatedUser(userId || null, tenantIdentity || null);
  }, [clientRecordId, contractorId, mode, store, tenantIdentity, userId, userRole]);

  const value = useMemo<OperationalDataContextValue>(() => ({ ...state, ...store, mode }), [mode, state, store]);
  return <OperationalDataContext.Provider value={value}>{children}</OperationalDataContext.Provider>;
}

export function useOperationalData(): OperationalDataContextValue {
  const context = useContext(OperationalDataContext);
  if (!context) throw new Error('useOperationalData must be used within OperationalDataProvider');
  return context;
}
