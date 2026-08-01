import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { OperationalDataProvider, useOperationalData } from '../OperationalDataContext';

const mockApi = {
  session: jest.fn().mockResolvedValue({ user: { id: 'user-1', email: null, name: 'Pilot' }, organisation: { id: 'org-1', name: 'Farm Org' } }),
  clients: { list: jest.fn().mockResolvedValue({ records: [], page: 1, pageSize: 100 }), create: jest.fn(), update: jest.fn(), archive: jest.fn() },
  properties: { list: jest.fn().mockResolvedValue({ records: [], page: 1, pageSize: 100 }), create: jest.fn(), update: jest.fn(), archive: jest.fn() },
  fields: { list: jest.fn().mockResolvedValue({ records: [], page: 1, pageSize: 100 }), create: jest.fn(), update: jest.fn(), archive: jest.fn() },
  operatingLocations: { list: jest.fn().mockResolvedValue({ records: [], page: 1, pageSize: 100 }), create: jest.fn(), update: jest.fn(), archive: jest.fn() },
  jobs: { list: jest.fn().mockResolvedValue({ records: [], page: 1, pageSize: 100 }), create: jest.fn(), update: jest.fn(), archive: jest.fn() },
  missions: { list: jest.fn().mockResolvedValue({ records: [], page: 1, pageSize: 100 }), create: jest.fn(), update: jest.fn(), archive: jest.fn() },
  fieldBoundaryVersions: { list: jest.fn(), get: jest.fn(), create: jest.fn() },
};
let mockMode = 'remote';
let mockUser: any = { id: 'user-1', role: 'contractor', tenantId: 'profile-tenant-that-is-not-the-operational-org' };
const mockSetCurrentUser = jest.fn();

jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
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
  return <div>{data.mode}:{data.status}:{data.clients.length}:{(data as any).missions?.map((mission: any) => mission.id).join(',') || ''}:{(data as any).operatingLocationIds?.join(',') || ''}</div>;
}

describe('OperationalDataProvider', () => {
  beforeEach(() => {
    mockMode = 'remote';
    mockUser = { id: 'user-1', role: 'contractor', tenantId: 'profile-tenant-that-is-not-the-operational-org' };
    jest.clearAllMocks();
    mockApi.session.mockResolvedValue({ user: { id: 'user-1', email: null, name: 'Pilot' }, organisation: { id: 'org-1', name: 'Farm Org' }, operatingLocationIds: ['location-1'] });
    mockApi.clients.list.mockResolvedValue({ records: [], page: 1, pageSize: 100 });
    mockApi.properties.list.mockResolvedValue({ records: [], page: 1, pageSize: 100 });
    mockApi.fields.list.mockResolvedValue({ records: [], page: 1, pageSize: 100 });
    mockApi.operatingLocations.list.mockResolvedValue({ records: [], page: 1, pageSize: 100 });
    mockApi.jobs.list.mockResolvedValue({ records: [], page: 1, pageSize: 100 });
    mockApi.missions.list.mockResolvedValue({ records: [], page: 1, pageSize: 100 });
  });

  test('clears immediately during a session switch and ignores a stale session response', async () => {
    let resolveOldSession!: (value: unknown) => void;
    const oldSession = new Promise((resolve) => { resolveOldSession = resolve; });
    const { rerender } = render(<OperationalDataProvider><Probe /></OperationalDataProvider>);
    await waitFor(() => expect(screen.getByText('remote:ready:0::location-1')).toBeInTheDocument());

    mockUser = { id: 'user-2', role: 'contractor', tenantId: 'misleading-profile-tenant' };
    mockApi.session.mockReturnValueOnce(oldSession as any);
    rerender(<OperationalDataProvider><Probe /></OperationalDataProvider>);
    expect(screen.getByText('remote:loading:0::')).toBeInTheDocument();

    mockUser = { id: 'user-3', role: 'contractor', tenantId: 'another-misleading-profile-tenant' };
    mockApi.session.mockResolvedValueOnce({
      user: { id: 'user-3', email: null, name: 'Pilot 3' },
      organisation: { id: 'authoritative-org-3', name: 'Farm Org 3' },
      operatingLocationIds: ['location-3'],
    });
    rerender(<OperationalDataProvider><Probe /></OperationalDataProvider>);
    await waitFor(() => expect(screen.getByText('remote:ready:0::location-3')).toBeInTheDocument());

    resolveOldSession({
      user: { id: 'user-2', email: null, name: 'Pilot 2' },
      organisation: { id: 'stale-org-2', name: 'Stale Farm Org' },
      operatingLocationIds: ['stale-location'],
    });
    await waitFor(() => expect(screen.getByText('remote:ready:0::location-3')).toBeInTheDocument());
    expect(mockApi.session).toHaveBeenCalledTimes(3);
  });

  test('loads remote authoritative collections through the v1 adapter and exposes no browser cache fallback', async () => {
    render(<OperationalDataProvider><Probe /></OperationalDataProvider>);
    await waitFor(() => expect(screen.getByText('remote:ready:0::location-1')).toBeInTheDocument());
    expect(mockApi.session).toHaveBeenCalledTimes(1);
    expect(mockApi.clients.list).toHaveBeenCalledWith(1, 100);
    expect(mockApi.properties.list).toHaveBeenCalledWith(1, 100);
    expect(mockApi.fields.list).toHaveBeenCalledWith(1, 100);
    expect(mockApi.operatingLocations.list).toHaveBeenCalledWith(1, 100);
    expect(mockApi.jobs.list).toHaveBeenCalledWith(1, 100);
    expect(mockApi.missions.list).toHaveBeenCalledWith(1, 100);
  });

  test('reloads missions from the second authorised session instead of retaining the first source', async () => {
    const location = { id: 'location-1', name: 'Base', address: '', timezone: 'Australia/Brisbane', rowVersion: 1, createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z' };
    const job = { id: 'job-1', clientId: 'client-1', propertyId: 'property-1', fieldIds: [], reference: 'JOB-1', scope: '', status: 'draft', notes: '', rowVersion: 1, createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z' };
    const mission = (id: string) => ({ id, jobId: 'job-1', operatingLocationId: 'location-1', missionNumber: id, title: id, description: '', status: 'Planning', rowVersion: 1, createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z' });
    mockApi.clients.list.mockResolvedValue({ records: [{ id: 'client-1' }], page: 1, pageSize: 100 });
    mockApi.properties.list.mockResolvedValue({ records: [{ id: 'property-1', clientId: 'client-1' }], page: 1, pageSize: 100 });
    mockApi.operatingLocations.list.mockResolvedValue({ records: [location], page: 1, pageSize: 100 });
    mockApi.jobs.list.mockResolvedValue({ records: [job], page: 1, pageSize: 100 });
    mockApi.missions.list.mockResolvedValueOnce({ records: [mission('mission-one')], page: 1, pageSize: 100 });
    const { rerender } = render(<OperationalDataProvider><Probe /></OperationalDataProvider>);
    await waitFor(() => expect(screen.getByText('remote:ready:1:mission-one:location-1')).toBeInTheDocument());

    mockUser = { id: 'user-2', role: 'contractor' };
    mockApi.session.mockResolvedValueOnce({
      user: { id: 'user-2', email: null, name: 'Pilot 2' }, organisation: { id: 'org-2', name: 'Second Org' },
      operatingLocationIds: ['location-1'],
    });
    mockApi.missions.list.mockResolvedValueOnce({ records: [mission('mission-two')], page: 1, pageSize: 100 });
    rerender(<OperationalDataProvider><Probe /></OperationalDataProvider>);
    expect(screen.getByText('remote:loading:0::')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('remote:ready:1:mission-two:location-1')).toBeInTheDocument());
    expect(screen.queryByText(/mission-one/)).not.toBeInTheDocument();
  });

  test('surfaces an authoritative session failure without falling back to browser data', async () => {
    mockApi.session.mockRejectedValueOnce(Object.assign(new Error('No active membership'), { status: 403, code: 'FORBIDDEN' }));
    render(<OperationalDataProvider><Probe /></OperationalDataProvider>);
    await waitFor(() => expect(screen.getByText('remote:unauthorised:0::')).toBeInTheDocument());
    expect(mockApi.clients.list).not.toHaveBeenCalled();
  });

  test('applies authenticated user scoping before loading the local compatibility store', async () => {
    mockMode = 'local';
    render(<OperationalDataProvider><Probe /></OperationalDataProvider>);
    await waitFor(() => expect(screen.getByText('local:ready:0::')).toBeInTheDocument());
    expect(mockSetCurrentUser).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-1', role: 'contractor' }));
    expect(mockApi.session).not.toHaveBeenCalled();
  });
});
