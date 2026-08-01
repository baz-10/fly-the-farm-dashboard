import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ClientList from './ClientList';
import ClientDetail from './ClientDetail';
import PropertyDetail from './PropertyDetail';
import FieldDetail from './FieldDetail';

const client = {
  id: 'client-1', contractorUserId: '', name: 'North Farm', phone: '', email: '', notes: '', rowVersion: 1,
  createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z',
};
const property = {
  id: 'property-1', clientId: 'client-1', name: 'Home Block', address: '', state: 'NSW', locality: '', lotPlan: '', notes: '', rowVersion: 1,
  createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z',
};
const field = {
  id: 'field-1', propertyId: 'property-1', name: 'North Paddock', sizeHa: 12.5, boundary: null, notes: '', rowVersion: 1,
  createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z',
};

let mockOperational: any;
let mockParams: Record<string, string> = {};
const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => mockParams,
  Navigate: () => null,
}), { virtual: true });
jest.mock('../contexts/OperationalDataContext', () => ({ useOperationalData: () => mockOperational }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1', role: 'contractor' } }) }));
jest.mock('../components/AddressAutocomplete', () => () => <div>Address search</div>);
jest.mock('../components/FieldBoundaryEditor', () => () => <div>Boundary editor</div>);
jest.mock('../services/fieldManagementStore', () => ({
  getClients: () => [], getClientById: () => undefined, getPropertiesByClient: () => [], getPropertyById: () => undefined,
  getFieldsByProperty: () => [], getFieldById: () => undefined, getJobsByField: () => [], getOutcomeByJob: () => undefined,
  getClientSummary: () => ({ propertyCount: 0, fieldCount: 0, jobCount: 0, lastJobDate: null }),
  getPropertySummary: () => ({ fieldCount: 0, totalHa: 0, jobCount: 0, lastJobDate: null }),
  getFieldSummary: () => ({ jobCount: 0, lastJobDate: null, lastWeed: null, lastEfficacy: null }),
  saveClient: jest.fn(), saveProperty: jest.fn(), saveField: jest.fn(), updateClient: jest.fn(), updateProperty: jest.fn(),
  updateField: jest.fn(), deleteClient: jest.fn(), deleteProperty: jest.fn(), deleteField: jest.fn(),
}));

function baseOperational(overrides: Record<string, unknown> = {}) {
  return {
    mode: 'remote', status: 'ready', clients: [client], properties: [property], fields: [field],
    saving: false, savedAt: null, error: null, refresh: jest.fn(),
    createClient: jest.fn(), updateClient: jest.fn(), archiveClient: jest.fn().mockResolvedValue(undefined),
    createProperty: jest.fn(), updateProperty: jest.fn(), archiveProperty: jest.fn().mockResolvedValue(undefined),
    createField: jest.fn(), updateField: jest.fn(), archiveField: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function route(path: string, element: React.ReactElement) {
  mockParams = {
    ...(path.includes('client-1') ? { clientId: 'client-1' } : {}),
    ...(path.includes('property-1') ? { propertyId: 'property-1' } : {}),
    ...(path.includes('field-1') ? { fieldId: 'field-1' } : {}),
  };
  return render(element);
}

describe('authoritative client/property/field workflow screens', () => {
  beforeEach(() => { mockOperational = baseOperational(); });

  test('does not render a failed client load as the valid empty state', () => {
    mockOperational = baseOperational({ status: 'error', clients: [], properties: [], fields: [], error: { code: 'NETWORK_ERROR', message: 'Offline' } });
    route('/jobs', <ClientList />);
    expect(screen.getByText(/operational data is unavailable/i)).toBeInTheDocument();
    expect(screen.queryByText('No clients yet')).not.toBeInTheDocument();
  });

  test('does not silently discard legacy-only client fields in remote mode', async () => {
    route('/jobs', <ClientList />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Client' }));
    fireEvent.change(await screen.findByRole('textbox', { name: 'Client / Farmer Name' }), { target: { value: 'New Farm' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Notes' }), { target: { value: 'Must be retained' } });
    const saveButtons = screen.getAllByRole('button', { name: 'Add Client' });
    fireEvent.click(saveButtons[saveButtons.length - 1]);

    expect(mockOperational.createClient).not.toHaveBeenCalled();
    expect(screen.getByText(/does not yet support client addresses or notes/i)).toBeInTheDocument();
  });

  test('preserves the client to property detail path using authoritative records', () => {
    route('/jobs/client/client-1', <ClientDetail />);
    expect(screen.getByRole('heading', { name: 'North Farm' })).toBeInTheDocument();
    expect(screen.getByText('Home Block')).toBeInTheDocument();
  });

  test('preserves the property to field detail path using authoritative records', () => {
    route('/jobs/client/client-1/property/property-1', <PropertyDetail />);
    expect(screen.getByRole('heading', { name: 'Home Block' })).toBeInTheDocument();
    expect(screen.getByText('North Paddock')).toBeInTheDocument();
  });

  test('loads the requested field with its authoritative parent chain', () => {
    route('/jobs/client/client-1/property/property-1/field/field-1', <FieldDetail />);
    expect(screen.getByRole('heading', { name: 'North Paddock' })).toBeInTheDocument();
    expect(screen.getByText(/North Farm/)).toBeInTheDocument();
    expect(screen.getByText(/job history is not connected in this production beta slice/i)).toBeInTheDocument();
    expect(screen.queryByText(/No spray jobs recorded yet/i)).not.toBeInTheDocument();
  });

  test('labels destructive confirmation as archive in remote mode and awaits the archive adapter', () => {
    route('/jobs/client/client-1', <ClientDetail />);
    fireEvent.click(screen.getByRole('button', { name: 'Archive client' }));
    expect(screen.getByRole('heading', { name: 'Archive Client?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    expect(mockOperational.archiveClient).toHaveBeenCalledWith('client-1');
  });
});
