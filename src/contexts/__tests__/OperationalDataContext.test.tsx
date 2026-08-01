import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { OperationalDataProvider, useOperationalData } from '../OperationalDataContext';

const mockApi = {
  session: jest.fn().mockResolvedValue({ user: { id: 'user-1', email: null, name: 'Pilot' }, organisation: { id: 'org-1', name: 'Farm Org' } }),
  clients: { list: jest.fn().mockResolvedValue({ records: [], page: 1, pageSize: 100 }), create: jest.fn(), update: jest.fn(), archive: jest.fn() },
  properties: { list: jest.fn().mockResolvedValue({ records: [], page: 1, pageSize: 100 }), create: jest.fn(), update: jest.fn(), archive: jest.fn() },
  fields: { list: jest.fn().mockResolvedValue({ records: [], page: 1, pageSize: 100 }), create: jest.fn(), update: jest.fn(), archive: jest.fn() },
};
let mockMode = 'remote';
const mockSetCurrentUser = jest.fn();

jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1', role: 'contractor' } }) }));
jest.mock('../../services/persistence', () => ({ getPersistenceMode: () => mockMode }));
jest.mock('../../services/fieldManagementStore', () => ({
  setCurrentUser: (user: unknown) => mockSetCurrentUser(user),
  getClients: () => [], getProperties: () => [], getFields: () => [],
  saveClient: jest.fn(), updateClient: jest.fn(), deleteClient: jest.fn(),
  saveProperty: jest.fn(), updateProperty: jest.fn(), deleteProperty: jest.fn(),
  saveField: jest.fn(), updateField: jest.fn(), deleteField: jest.fn(),
}));
jest.mock('../../services/operationalApi', () => {
  const actual = jest.requireActual('../../services/operationalApi');
  return { ...actual, createOperationalApi: () => mockApi };
});

function Probe() {
  const data = useOperationalData();
  return <div>{data.mode}:{data.status}:{data.clients.length}</div>;
}

describe('OperationalDataProvider', () => {
  beforeEach(() => {
    mockMode = 'remote';
    mockApi.session.mockResolvedValue({ user: { id: 'user-1', email: null, name: 'Pilot' }, organisation: { id: 'org-1', name: 'Farm Org' } });
    mockApi.clients.list.mockResolvedValue({ records: [], page: 1, pageSize: 100 });
    mockApi.properties.list.mockResolvedValue({ records: [], page: 1, pageSize: 100 });
    mockApi.fields.list.mockResolvedValue({ records: [], page: 1, pageSize: 100 });
  });

  test('loads remote authoritative collections through the v1 adapter and exposes no browser cache fallback', async () => {
    render(<OperationalDataProvider><Probe /></OperationalDataProvider>);
    await waitFor(() => expect(screen.getByText('remote:ready:0')).toBeInTheDocument());
    expect(mockApi.session).toHaveBeenCalledTimes(1);
    expect(mockApi.clients.list).toHaveBeenCalledWith(1, 100);
    expect(mockApi.properties.list).toHaveBeenCalledWith(1, 100);
    expect(mockApi.fields.list).toHaveBeenCalledWith(1, 100);
  });

  test('applies authenticated user scoping before loading the local compatibility store', async () => {
    mockMode = 'local';
    render(<OperationalDataProvider><Probe /></OperationalDataProvider>);
    await waitFor(() => expect(screen.getByText('local:ready:0')).toBeInTheDocument());
    expect(mockSetCurrentUser).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-1', role: 'contractor' }));
    expect(mockApi.session).not.toHaveBeenCalled();
  });
});
