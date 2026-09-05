import React from 'react';
import { fireEvent, render, screen, waitFor, waitForElementToBeRemoved } from '@testing-library/react';
import ClientList from './ClientList';
import ClientDetail from './ClientDetail';
import PropertyDetail from './PropertyDetail';
import FieldDetail from './FieldDetail';
import JobCreate from './JobCreate';
import JobDetail from './JobDetail';
import JobHistory from './JobHistory';

const client = {
  id: 'client-1', contractorUserId: '', name: 'North Farm', phone: '', email: '', notes: '', rowVersion: 1,
  addresses: [{ label: 'Northern gate', address: '45 Farm Track', locality: 'Roma', state: 'QLD', postcode: '4455', lat: -26.57, lng: 148.79, coordinateSource: 'GEOCODED', locationConfirmedAt: '2026-08-05T00:00:00.000Z' }],
  createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z',
};
const property = {
  id: 'property-1', clientId: 'client-1', name: 'Home Block', address: '45 Farm Track', state: 'QLD', locality: 'Roma', lotPlan: 'LOT-7', lat: -26.57, lng: 148.79, addressSource: 'GEOCODED', locationConfirmedAt: '2026-08-05T00:00:00.000Z', notes: '', rowVersion: 1,
  createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z',
};
const field = {
  id: 'field-1', propertyId: 'property-1', name: 'North Paddock', sizeHa: 12.5, boundary: null, notes: '', rowVersion: 1,
  createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z',
};
const job = {
  id: 'job-1', clientId: 'client-1', propertyId: 'property-1', fieldIds: ['field-1'], reference: 'JOB-42',
  scope: 'Spray lantana', status: 'scheduled', notes: 'Morning access', requestedDate: '2026-08-08', scheduledDate: '2026-08-10',
  rowVersion: 3, createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-02T00:00:00Z',
};
const mission = (overrides: Record<string, unknown> = {}) => ({
  id: 'mission-1', jobId: 'job-1', operatingLocationId: 'location-1', missionNumber: 'FTF-M-001',
  title: 'North Paddock Mission', description: '', status: 'Planning', scheduledStartAt: '2026-08-10T09:00:00Z',
  aircraftIds: [], equipmentKitIds: [], rowVersion: 1, createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-02T00:00:00Z',
  ...overrides,
});

let mockOperational: any;
let mockParams: Record<string, string> = {};
let mockSearchParams = new URLSearchParams();
const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => mockParams,
  useSearchParams: () => [mockSearchParams],
  Navigate: () => null,
}), { virtual: true });
jest.mock('../contexts/OperationalDataContext', () => ({ useOperationalData: () => mockOperational }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1', role: 'contractor' } }) }));
jest.mock('../components/AddressAutocomplete', () => (props: any) => <div>
  Address search
  {props.lat !== undefined && props.lng !== undefined && <span>Map location {props.lat}, {props.lng}</span>}
  <button onClick={() => props.onSelect?.({ address: '1 Farm Road', locality: 'Roma', state: 'QLD', postcode: '4455', lat: -26.57, lng: 148.79, displayName: '1 Farm Road, Roma', coordinateSource: 'GEOCODED' })}>Choose test address</button>
  <button onClick={() => props.onSelect?.({ address: '1 Farm Road', locality: 'Roma', state: 'QLD', postcode: '4455', lat: -26.5701, lng: 148.7901, displayName: '1 Farm Road, Roma', coordinateSource: 'MANUALLY_ADJUSTED', locationConfirmedAt: '2026-08-06T01:00:00.000Z' })}>Confirm adjusted location</button>
</div>);
jest.mock('../components/FieldBoundaryEditor', () => (props: any) => <div>
  Boundary editor
  <button onClick={() => { props.onCoordsChange?.([[-27, 153], [-27, 154], [-28, 154]]); props.onAreaChange?.(20); }}>Draw test boundary</button>
</div>);
jest.mock('../components/AddressLocationMap', () => (props: any) => <button onClick={() => props.onLocationChange?.(-26.571, 148.791)}>Move access pin</button>);
jest.mock('../services/fieldManagementStore', () => ({
  getClients: () => [], getClientById: () => undefined, getPropertiesByClient: () => [], getPropertyById: () => undefined,
  getFieldsByProperty: () => [], getFieldById: () => undefined, getJobsByField: () => [], getJobs: () => [], getJobById: () => undefined,
  getOutcomeByJob: () => undefined,
  getClientSummary: () => ({ propertyCount: 0, fieldCount: 0, jobCount: 0, lastJobDate: null }),
  getPropertySummary: () => ({ fieldCount: 0, totalHa: 0, jobCount: 0, lastJobDate: null }),
  getFieldSummary: () => ({ jobCount: 0, lastJobDate: null, lastWeed: null, lastEfficacy: null }),
  saveClient: jest.fn(), saveProperty: jest.fn(), saveField: jest.fn(), updateClient: jest.fn(), updateProperty: jest.fn(),
  updateField: jest.fn(), deleteClient: jest.fn(), deleteProperty: jest.fn(), deleteField: jest.fn(), deleteJob: jest.fn(),
  saveJob: jest.fn(), updateJob: jest.fn(), saveOutcome: jest.fn(), updateOutcome: jest.fn(),
}));
jest.mock('../services/financialsStore', () => ({ getActualByJobId: () => undefined }));
jest.mock('../services/askFtfReportStore', () => ({ getReportsForJob: () => [] }));
jest.mock('../services/quoteStore', () => ({ getQuoteById: () => undefined, updateQuote: jest.fn() }));
jest.mock('../utils/clientReportPdf', () => ({ generateClientReportPdf: jest.fn() }));

function baseOperational(overrides: Record<string, unknown> = {}) {
  return {
    mode: 'remote', status: 'ready', clients: [client], properties: [property], fields: [field], jobs: [job],
    operatingLocations: [], fieldBoundaryVersions: [],
    missions: [],
    saving: false, savedAt: null, lastSaved: null, error: null, refresh: jest.fn(),
    createClient: jest.fn(), updateClient: jest.fn(), archiveClient: jest.fn().mockResolvedValue(undefined),
    createProperty: jest.fn(), updateProperty: jest.fn(), archiveProperty: jest.fn().mockResolvedValue(undefined),
    createField: jest.fn(), updateField: jest.fn(), archiveField: jest.fn().mockResolvedValue(undefined),
    createJob: jest.fn().mockResolvedValue(job), updateJob: jest.fn(), archiveJob: jest.fn().mockResolvedValue(undefined),
    createMission: jest.fn(), updateMission: jest.fn(), archiveMission: jest.fn(),
    refreshFieldBoundary: jest.fn().mockResolvedValue(null), createFieldBoundaryVersion: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function route(path: string, element: React.ReactElement) {
  mockParams = {
    ...(path.includes('client-1') ? { clientId: 'client-1' } : {}),
    ...(path.includes('property-1') ? { propertyId: 'property-1' } : {}),
    ...(path.includes('field-1') ? { fieldId: 'field-1' } : {}),
    ...(path.includes('job-1') ? { jobId: 'job-1' } : {}),
  };
  return render(element);
}

describe('authoritative client/property/field workflow screens', () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
    mockNavigate.mockReset();
    mockOperational = baseOperational();
  });

  test('does not render a failed client load as the valid empty state', () => {
    mockOperational = baseOperational({ status: 'error', clients: [], properties: [], fields: [], error: { code: 'NETWORK_ERROR', message: 'Offline' } });
    route('/jobs', <ClientList />);
    expect(screen.getByText(/operational data is unavailable/i)).toBeInTheDocument();
    expect(screen.queryByText('No clients yet')).not.toBeInTheDocument();
  });

  test('preserves navigation buttons for the explicitly gated remote job workflows', () => {
    route('/jobs', <ClientList />);
    fireEvent.click(screen.getByRole('button', { name: 'More client actions' }));
    fireEvent.click(screen.getByRole('button', { name: 'Import Spray Rec' }));
    expect(mockNavigate).toHaveBeenCalledWith('/jobs/import');
    fireEvent.click(screen.getByRole('button', { name: 'Job History' }));
    expect(mockNavigate).toHaveBeenCalledWith('/jobs/history');
  });

  test('presents Clients around finding, opening and adding client work', () => {
    route('/jobs', <ClientList />);
    expect(screen.getByRole('heading', { name: 'Clients' })).toBeInTheDocument();
    expect(screen.getByText('Find a client, then open their properties, fields and work history.')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search clients' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add Client' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Open North Farm' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Import CSV' })).not.toBeInTheDocument();
  });

  test('presents a dedicated Properties workspace with dominant search, open and add actions', () => {
    mockSearchParams = new URLSearchParams('view=properties');
    route('/jobs?view=properties', <ClientList />);
    expect(screen.getByRole('heading', { name: 'Properties' })).toBeInTheDocument();
    expect(screen.getByText('Find a property, see who owns it and open its fields and work history.')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search properties' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add Property' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Open Home Block' })).toBeVisible();
    expect(screen.getByText('North Farm')).toBeVisible();
    expect(screen.getByText(/45 Farm Track/)).toBeVisible();
    expect(screen.getByText('1 Field')).toBeVisible();
    expect(screen.getByText('12.5 ha')).toBeVisible();
    expect(screen.getByRole('button', { name: 'More property actions' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Add Client' })).not.toBeInTheDocument();
  });

  test.each(['home block', 'north farm', '45 farm track', 'roma', 'qld', '4455', 'lot-7'])(
    'searches Properties using %s',
    (query) => {
      mockSearchParams = new URLSearchParams('view=properties');
      route('/jobs?view=properties', <ClientList />);
      fireEvent.change(screen.getByRole('searchbox', { name: 'Search properties' }), { target: { value: query } });
      expect(screen.getByRole('button', { name: 'Open Home Block' })).toBeVisible();
    },
  );

  test('opens a Property directly from the workspace', () => {
    mockSearchParams = new URLSearchParams('view=properties');
    route('/jobs?view=properties', <ClientList />);
    fireEvent.click(screen.getByRole('button', { name: 'Open Home Block' }));
    expect(mockNavigate).toHaveBeenCalledWith('/jobs/client/client-1/property/property-1');
  });

  test('presents a dedicated Fields workspace with dominant search, open and add actions', () => {
    mockSearchParams = new URLSearchParams('view=fields');
    route('/jobs?view=fields', <ClientList />);
    expect(screen.getByRole('heading', { name: 'Fields' })).toBeInTheDocument();
    expect(screen.getByText('Find a Field, see its Property and Client, then open its operational history.')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search fields' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add Field' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Open North Paddock' })).toBeVisible();
    expect(screen.getByText('Home Block')).toBeVisible();
    expect(screen.getByText('North Farm')).toBeVisible();
    expect(screen.getByText('12.5 ha')).toBeVisible();
    expect(screen.getByText('Boundary not recorded')).toBeVisible();
    expect(screen.getByRole('button', { name: 'More field actions' })).toBeVisible();
  });

  test.each(['north paddock', 'home block', 'north farm', '45 farm track', 'roma', 'qld', 'lot-7'])(
    'searches Fields using %s',
    (query) => {
      mockSearchParams = new URLSearchParams('view=fields');
      route('/jobs?view=fields', <ClientList />);
      fireEvent.change(screen.getByRole('searchbox', { name: 'Search fields' }), { target: { value: query } });
      expect(screen.getByRole('button', { name: 'Open North Paddock' })).toBeVisible();
    },
  );

  test('opens a Field directly from the workspace', () => {
    mockSearchParams = new URLSearchParams('view=fields');
    route('/jobs?view=fields', <ClientList />);
    fireEvent.click(screen.getByRole('button', { name: 'Open North Paddock' }));
    expect(mockNavigate).toHaveBeenCalledWith('/jobs/client/client-1/property/property-1/field/field-1');
  });

  test('creates a Field from Client and Property context with optional authoritative boundary', async () => {
    const created = { ...field, id: 'field-new', name: 'South Paddock', sizeHa: 20 };
    mockOperational.createField.mockResolvedValue(created);
    mockSearchParams = new URLSearchParams('view=fields');
    route('/jobs?view=fields', <ClientList />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Field' }));
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Select Client' }));
    fireEvent.click(await screen.findByRole('option', { name: 'North Farm' }));
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Select Property' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Home Block' }));
    expect(screen.getAllByText('45 Farm Track, Roma, QLD').some((element) => element.closest('[role="dialog"]'))).toBe(true);
    expect(screen.getByText('Boundary editor')).toBeVisible();
    fireEvent.change(screen.getByRole('textbox', { name: 'Field name' }), { target: { value: 'South Paddock' } });
    fireEvent.click(screen.getByRole('button', { name: 'Draw test boundary' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Field' }));
    await waitFor(() => expect(mockOperational.createField).toHaveBeenCalledWith(expect.objectContaining({
      propertyId: 'property-1', name: 'South Paddock', sizeHa: 20,
    })));
    expect(mockOperational.createFieldBoundaryVersion).toHaveBeenCalledWith('field-new', [[-27, 153], [-27, 154], [-28, 154]]);
    expect(mockOperational.updateClient).not.toHaveBeenCalled();
    expect(mockOperational.updateProperty).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/jobs/client/client-1/property/property-1/field/field-new');
  });

  test('requires explicit confirmation before saving an optional Field access point', async () => {
    mockOperational.createField.mockResolvedValue({ ...field, id: 'field-access', name: 'South Paddock' });
    mockSearchParams = new URLSearchParams('view=fields');
    route('/jobs?view=fields', <ClientList />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Field' }));
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Select Client' }));
    fireEvent.click(await screen.findByRole('option', { name: 'North Farm' }));
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Select Property' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Home Block' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Field name' }), { target: { value: 'South Paddock' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add field access / launch point' }));
    expect(screen.getByRole('button', { name: 'Save Field' })).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Access point label' }), { target: { value: 'North gate' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Move access pin' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm access point' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Field' }));
    await waitFor(() => expect(mockOperational.createField).toHaveBeenCalledWith(expect.objectContaining({
      accessPoint: expect.objectContaining({ label: 'North gate', lat: -26.571, lng: 148.791, coordinateSource: 'MANUALLY_ADJUSTED', locationConfirmedAt: expect.any(String) }),
    })));
  });

  test('presents a dedicated Jobs workspace with dominant search, open and add actions', () => {
    mockSearchParams = new URLSearchParams('view=jobs');
    route('/jobs?view=jobs', <ClientList />);
    expect(screen.getByRole('heading', { name: 'Jobs' })).toBeInTheDocument();
    expect(screen.getByText('Find current or past work, open it directly or start a new Job from known Field details.')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search jobs' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add Job' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Open JOB-42' })).toBeVisible();
    expect(screen.getByText('North Farm')).toBeVisible();
    expect(screen.getByText('Home Block')).toBeVisible();
    expect(screen.getByText('North Paddock')).toBeVisible();
    expect(screen.getByText('Spray lantana')).toBeVisible();
    expect(screen.getByRole('button', { name: 'More job actions' })).toBeVisible();
  });

  test.each(['job-42', 'spray lantana', 'scheduled', 'north farm', 'home block', 'north paddock'])(
    'searches Jobs using %s',
    (query) => {
      mockSearchParams = new URLSearchParams('view=jobs');
      route('/jobs?view=jobs', <ClientList />);
      fireEvent.change(screen.getByRole('searchbox', { name: 'Search jobs' }), { target: { value: query } });
      expect(screen.getByRole('button', { name: 'Open JOB-42' })).toBeVisible();
    },
  );

  test('opens a Job directly from the workspace', () => {
    mockSearchParams = new URLSearchParams('view=jobs');
    route('/jobs?view=jobs', <ClientList />);
    fireEvent.click(screen.getByRole('button', { name: 'Open JOB-42' }));
    expect(mockNavigate).toHaveBeenCalledWith('/jobs/client/client-1/property/property-1/field/field-1/job/job-1');
  });

  test('creates a Mission directly from a Job with no Missions using inherited context', () => {
    mockSearchParams = new URLSearchParams('view=jobs');
    route('/jobs?view=jobs', <ClientList />);
    fireEvent.click(screen.getByRole('button', { name: 'Create Mission for JOB-42' }));
    expect(mockNavigate).toHaveBeenCalledWith('/jobs/client/client-1/property/property-1/field/field-1/job/job-1/new-mission');
  });

  test('continues the single authoritative Draft Mission directly', () => {
    mockOperational = baseOperational({ missions: [mission()] });
    mockSearchParams = new URLSearchParams('view=jobs');
    route('/jobs?view=jobs', <ClientList />);
    expect(screen.getByText('1 Draft Mission')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Continue Mission for JOB-42' }));
    expect(mockNavigate).toHaveBeenCalledWith('/missions/mission-1');
  });

  test('opens the Mission register filtered to a Job when multiple Missions exist', () => {
    mockOperational = baseOperational({ missions: [mission(), mission({ id: 'mission-2', status: 'Completed' })] });
    mockSearchParams = new URLSearchParams('view=jobs');
    route('/jobs?view=jobs', <ClientList />);
    fireEvent.click(screen.getByRole('button', { name: 'Open Missions for JOB-42' }));
    expect(mockNavigate).toHaveBeenCalledWith('/missions?jobId=job-1');
  });

  test('starts Job creation from inherited Client, Property and Field context', async () => {
    mockSearchParams = new URLSearchParams('view=jobs');
    route('/jobs?view=jobs', <ClientList />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Job' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Client' }), { target: { value: 'client-1' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'North Paddock' }));
    expect(screen.getByText('1 Property · 1 Field · 12.5000 ha')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Job details' }));
    expect(mockNavigate).toHaveBeenCalledWith('/jobs/client/client-1/property/property-1/field/field-1/new-job');
    expect(mockOperational.updateClient).not.toHaveBeenCalled();
    expect(mockOperational.updateProperty).not.toHaveBeenCalled();
    expect(mockOperational.updateField).not.toHaveBeenCalled();
  });

  test('does not render a failed Jobs load as an empty register', () => {
    mockOperational = baseOperational({ status: 'error', jobs: [], error: { code: 'NETWORK_ERROR', message: 'Offline' } });
    mockSearchParams = new URLSearchParams('view=jobs');
    route('/jobs?view=jobs', <ClientList />);
    expect(screen.getByText(/Jobs are unavailable/i)).toBeVisible();
    expect(screen.queryByText('No Jobs yet')).not.toBeInTheDocument();
  });

  test('inherits a confirmed Client location without mutating the Client and saves authoritative Property context', async () => {
    const created = { ...property, id: 'property-new', name: 'South Block' };
    mockOperational.createProperty.mockResolvedValue(created);
    mockSearchParams = new URLSearchParams('view=properties');
    route('/jobs?view=properties', <ClientList />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Property' }));
    fireEvent.mouseDown(await screen.findByRole('combobox', { name: 'Select Client' }));
    fireEvent.click(await screen.findByRole('option', { name: 'North Farm' }));
    expect(screen.getByRole('button', { name: /Northern gate/ })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Northern gate/ }));
    expect(screen.getByText(/Inherited from Client location/)).toBeVisible();
    expect(screen.getByText('Map location -26.57, 148.79')).toBeVisible();
    fireEvent.change(screen.getByRole('textbox', { name: 'Property name' }), { target: { value: 'South Block' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm adjusted location' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Property' }));
    await waitFor(() => expect(mockOperational.createProperty).toHaveBeenCalledWith(expect.objectContaining({
      clientId: 'client-1', name: 'South Block', address: '1 Farm Road', locality: 'Roma', state: 'QLD',
      lat: -26.5701, lng: 148.7901, addressSource: 'MANUAL',
    })));
    expect(mockOperational.updateClient).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/jobs/client/client-1/property/property-new');
  });

  test('opens Property onboarding and returns only after the authoritative Property save', async () => {
    const created = { ...property, id: 'property-onboarding', name: 'Onboarding Block' };
    mockOperational.createProperty.mockResolvedValue(created);
    mockSearchParams = new URLSearchParams('view=properties&onboarding=property&returnTo=%2Fgetting-started');
    route('/jobs?view=properties&onboarding=property&returnTo=%2Fgetting-started', <ClientList />);

    expect(await screen.findByRole('dialog', { name: 'Add Property' })).toBeVisible();
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Select Client' }));
    fireEvent.click(await screen.findByRole('option', { name: 'North Farm' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Property name' }), { target: { value: 'Onboarding Block' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm adjusted location' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Property' }));

    await waitFor(() => expect(mockOperational.createProperty).toHaveBeenCalled());
    expect(mockNavigate).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Return to Getting Started' }));
    expect(mockNavigate).toHaveBeenCalledWith('/getting-started');
  });

  test('opens Field onboarding and returns only after the authoritative Field save', async () => {
    mockOperational.createField.mockResolvedValue({ ...field, id: 'field-onboarding', name: 'Onboarding Field' });
    mockSearchParams = new URLSearchParams('view=fields&onboarding=field&returnTo=%2Fgetting-started');
    route('/jobs?view=fields&onboarding=field&returnTo=%2Fgetting-started', <ClientList />);

    expect(await screen.findByRole('dialog', { name: 'Add Field' })).toBeVisible();
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Select Client' }));
    fireEvent.click(await screen.findByRole('option', { name: 'North Farm' }));
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Select Property' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Home Block' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Field name' }), { target: { value: 'Onboarding Field' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Field' }));

    await waitFor(() => expect(mockOperational.createField).toHaveBeenCalled());
    expect(mockNavigate).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Return to Getting Started' }));
    expect(mockNavigate).toHaveBeenCalledWith('/getting-started');
  });

  test('preserves Getting Started context through Job selection and returns only after authoritative Job save', async () => {
    mockSearchParams = new URLSearchParams('view=jobs&onboarding=job&returnTo=%2Fgetting-started');
    const workspace = route('/jobs?view=jobs&onboarding=job&returnTo=%2Fgetting-started', <ClientList />);
    expect(await screen.findByRole('dialog', { name: 'Add Job' })).toBeVisible();
    fireEvent.change(screen.getByRole('combobox', { name: 'Client' }), { target: { value: 'client-1' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'North Paddock' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Job details' }));
    expect(mockNavigate).toHaveBeenCalledWith('/jobs/client/client-1/property/property-1/field/field-1/new-job?returnTo=%2Fgetting-started');

    workspace.unmount();
    mockNavigate.mockReset();
    mockSearchParams = new URLSearchParams('returnTo=%2Fgetting-started');
    route('/jobs/client/client-1/property/property-1/field/field-1/new-job?returnTo=%2Fgetting-started', <JobCreate />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Job Reference' }), { target: { value: 'JOB-ONBOARDING' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Weed Target' }), { target: { value: 'Spray lantana' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Job' }));

    await waitFor(() => expect(mockOperational.createJob).toHaveBeenCalled());
    expect(mockNavigate).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Return to Getting Started' }));
    expect(mockNavigate).toHaveBeenCalledWith('/getting-started');
  });

  test('keeps Property form state and focuses location guidance when confirmation is missing', async () => {
    const scrollIntoView = jest.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
    mockSearchParams = new URLSearchParams('view=properties');
    route('/jobs?view=properties', <ClientList />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Property' }));
    fireEvent.mouseDown(await screen.findByRole('combobox', { name: 'Select Client' }));
    fireEvent.click(await screen.findByRole('option', { name: 'North Farm' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Property name' }), { target: { value: 'South Block' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Property' }));
    expect(mockOperational.createProperty).not.toHaveBeenCalled();
    expect(screen.getByText('Location not confirmed')).toBeVisible();
    expect(screen.getByText('Choose a saved Client location or search for an address, then confirm the Property location before saving.')).toBeVisible();
    expect(screen.getByRole('group', { name: 'Property location' })).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Property name' })).toHaveValue('South Block');
  });

  test('keeps a rejected Property save visible inside the active dialog with operator work intact', async () => {
    const failure = Object.assign(new Error('Property could not be saved.'), {
      code: 'VALIDATION_ERROR', status: 400, details: { correlationId: 'property-save-reference' },
    });
    mockOperational.createProperty.mockRejectedValue(failure);
    mockSearchParams = new URLSearchParams('view=properties');
    route('/jobs?view=properties', <ClientList />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Property' }));
    fireEvent.mouseDown(await screen.findByRole('combobox', { name: 'Select Client' }));
    fireEvent.click(await screen.findByRole('option', { name: 'North Farm' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Property name' }), { target: { value: 'Genuine South Block' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm adjusted location' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Property' }));

    const dialog = screen.getByRole('dialog', { name: 'Add Property' });
    expect(await screen.findByText('Property could not be saved.')).toBeVisible();
    expect(dialog).toContainElement(screen.getByText('Property could not be saved.'));
    expect(screen.getByRole('textbox', { name: 'Property name' })).toHaveValue('Genuine South Block');
    expect(screen.getByText('Map location -26.5701, 148.7901')).toBeVisible();
  });

  test('does not show a saved confirmation from an unrelated resource', () => {
    mockOperational = baseOperational({
      savedAt: '2026-08-01T01:00:00Z',
      lastSaved: { resource: 'property', recordId: 'property-1', at: '2026-08-01T01:00:00Z' },
    });
    route('/jobs/client/client-1', <ClientDetail />);
    expect(screen.queryByText('Saved.')).not.toBeInTheDocument();
  });

  test('requires an explicitly confirmed authoritative client location before saving', async () => {
    const scrollIntoView = jest.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
    route('/jobs', <ClientList />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Client' }));
    fireEvent.change(await screen.findByRole('textbox', { name: 'Client / Farmer Name' }), { target: { value: 'New Farm' } });
    const saveButtons = screen.getAllByRole('button', { name: 'Add Client' });
    fireEvent.click(saveButtons[saveButtons.length - 1]);
    expect(mockOperational.createClient).not.toHaveBeenCalled();
    const locationSection = screen.getByRole('group', { name: 'Client locations' });
    expect(screen.getByText('Location not confirmed')).toBeVisible();
    expect(screen.getByText('Search for an address or place the pin on the map, then select Confirm location before saving the Client.')).toBeVisible();
    expect(locationSection).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Client / Farmer Name' })).toHaveValue('New Farm');
  });

  test('saves a searched and manually adjusted Client location after explicit confirmation', async () => {
    mockOperational.createClient.mockResolvedValue({ ...client, id: 'client-new', name: 'New Farm' });
    route('/jobs', <ClientList />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Client' }));
    fireEvent.change(await screen.findByRole('textbox', { name: 'Client / Farmer Name' }), { target: { value: 'New Farm' } });
    fireEvent.click(screen.getByRole('button', { name: 'Choose test address' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm adjusted location' }));
    const saveButtons = screen.getAllByRole('button', { name: 'Add Client' });
    fireEvent.click(saveButtons[saveButtons.length - 1]);
    await waitFor(() => expect(mockOperational.createClient).toHaveBeenCalledWith(expect.objectContaining({
      name: 'New Farm',
      addresses: [expect.objectContaining({ address: '1 Farm Road', lat: -26.5701, lng: 148.7901, coordinateSource: 'MANUALLY_ADJUSTED', locationConfirmedAt: '2026-08-06T01:00:00.000Z' })],
    })));
  });

  test('opens the existing Client workflow from Getting Started and offers an explicit return after save', async () => {
    mockOperational.createClient.mockResolvedValue({ ...client, id: 'client-onboarding', name: 'Onboarding Farm' });
    mockSearchParams = new URLSearchParams('onboarding=client&returnTo=%2Fgetting-started');
    route('/jobs?onboarding=client&returnTo=%2Fgetting-started', <ClientList />);

    const clientDialog = await screen.findByRole('dialog', { name: 'Add New Client' });
    expect(clientDialog).toBeVisible();
    fireEvent.change(screen.getByRole('textbox', { name: 'Client / Farmer Name' }), { target: { value: 'Onboarding Farm' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm adjusted location' }));
    const saveButtons = screen.getAllByRole('button', { name: 'Add Client' });
    fireEvent.click(saveButtons[saveButtons.length - 1]);

    await waitForElementToBeRemoved(clientDialog);
    expect(await screen.findByRole('button', { name: 'Return to Getting Started' })).toBeVisible();
    expect(mockNavigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Return to Getting Started' }));
    expect(mockNavigate).toHaveBeenCalledWith('/getting-started');
  });

  test('reveals and requires a meaningful Custom client location label', async () => {
    route('/jobs', <ClientList />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Client' }));
    fireEvent.mouseDown(screen.getByLabelText('Location label'));
    fireEvent.click(await screen.findByRole('option', { name: 'Custom' }));
    expect(screen.getByRole('textbox', { name: 'Custom location label' })).toBeRequired();
    expect(screen.queryByText('Other')).not.toBeInTheDocument();
  });

  test('preserves the client to property detail path using authoritative records', () => {
    route('/jobs/client/client-1', <ClientDetail />);
    expect(screen.getByRole('heading', { name: 'North Farm' })).toBeInTheDocument();
    expect(screen.getByText('Home Block')).toBeInTheDocument();
  });

  test('creates a Property under its Client with confirmed location and operational details', async () => {
    mockOperational.createProperty.mockResolvedValue({ ...property, id: 'property-new', name: 'The Gums - Tara' });
    route('/jobs/client/client-1', <ClientDetail />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Property' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Property Name' }), { target: { value: 'The Gums - Tara' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm adjusted location' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Lot / Plan Reference' }), { target: { value: 'Gums - Tara Branch Line' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Notes' }), { target: { value: 'Access from the branch line.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Property' }));

    await waitFor(() => expect(mockOperational.createProperty).toHaveBeenCalledWith(expect.objectContaining({
      clientId: 'client-1',
      name: 'The Gums - Tara',
      address: '1 Farm Road',
      locality: 'Roma',
      state: 'QLD',
      postcode: '4455',
      lotPlan: 'Gums - Tara Branch Line',
      notes: 'Access from the branch line.',
      lat: -26.5701,
      lng: 148.7901,
      addressSource: 'MANUAL',
      locationConfirmedAt: '2026-08-06T01:00:00.000Z',
    })));
  });

  test('preserves the property to field detail path using authoritative records', () => {
    route('/jobs/client/client-1/property/property-1', <PropertyDetail />);
    expect(screen.getByRole('heading', { name: 'Home Block' })).toBeInTheDocument();
    expect(screen.getByText('North Paddock')).toBeInTheDocument();
  });

  test('loads the requested field with its authoritative parent chain', async () => {
    route('/jobs/client/client-1/property/property-1/field/field-1', <FieldDetail />);
    await waitFor(() => expect(mockOperational.refreshFieldBoundary).toHaveBeenCalledWith('field-1'));
    await waitFor(() => expect(screen.queryByText(/loading authoritative boundary/i)).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'North Paddock' })).toBeInTheDocument();
    expect(screen.getByText(/North Farm/)).toBeInTheDocument();
    expect(screen.getByText('Spray lantana')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Record Job' })).toBeEnabled();
    expect(screen.queryByText(/job history is not connected/i)).not.toBeInTheDocument();
  });

  test('saves edited boundary geometry through the version command and reloads it on direct route', async () => {
    route('/jobs/client/client-1/property/property-1/field/field-1', <FieldDetail />);
    await waitFor(() => expect(mockOperational.refreshFieldBoundary).toHaveBeenCalledWith('field-1'));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh boundary' }));
    await waitFor(() => expect(mockOperational.refreshFieldBoundary).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: 'Edit field' }));
    fireEvent.click(screen.getByRole('button', { name: 'Draw test boundary' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mockOperational.createFieldBoundaryVersion).toHaveBeenCalledWith(
      'field-1', [[-27, 153], [-27, 154], [-28, 154]],
    ));
  });

  test('does not present a remote field as boundary-empty until the authoritative load confirms empty', async () => {
    const load = deferred<null>();
    mockOperational = baseOperational({ refreshFieldBoundary: jest.fn().mockReturnValue(load.promise) });
    route('/jobs/client/client-1/property/property-1/field/field-1', <FieldDetail />);
    expect(screen.getByText(/loading authoritative boundary/i)).toBeInTheDocument();
    expect(screen.queryByText(/No boundary set/i)).not.toBeInTheDocument();
    load.resolve(null);
    expect(await screen.findByText(/No boundary set/i)).toBeInTheDocument();
  });

  test.each([
    [Object.assign(new Error('Offline'), { code: 'NETWORK_ERROR' }), /authoritative boundary is unavailable/i],
    [Object.assign(new Error('Forbidden'), { status: 403, code: 'FORBIDDEN' }), /not authorised to view this boundary/i],
    [Object.assign(new Error('Missing'), { status: 404, code: 'NOT_FOUND' }), /authoritative boundary was not found/i],
  ])('keeps remote boundary load failure distinct from confirmed empty', async (failure, expected) => {
    mockOperational = baseOperational({ refreshFieldBoundary: jest.fn().mockRejectedValue(failure) });
    route('/jobs/client/client-1/property/property-1/field/field-1', <FieldDetail />);
    expect(await screen.findByText(expected)).toBeInTheDocument();
    expect(screen.queryByText(/No boundary set/i)).not.toBeInTheDocument();
  });

  test('creates a remote job from authoritative route parents and supported workflow values', async () => {
    route('/jobs/client/client-1/property/property-1/field/field-1/new-job', <JobCreate />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Job Reference' }), { target: { value: 'JOB-99' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Weed Target' }), { target: { value: 'Spray lantana' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Notes' }), { target: { value: 'Gate code 2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Job' }));
    await waitFor(() => expect(mockOperational.createJob).toHaveBeenCalledWith(expect.objectContaining({
      clientId: 'client-1', propertyId: 'property-1', fieldIds: ['field-1'], reference: 'JOB-99',
      scope: 'Spray lantana', notes: 'Gate code 2', scheduledDate: expect.any(String),
    })));
  });

  test('submits every Field selected through a multi-property compatibility route', async () => {
    const secondProperty = { ...property, id: 'property-2', name: 'River Flats' };
    const secondField = { ...field, id: 'field-2', propertyId: 'property-2', name: 'River Block', sizeHa: 32.2 };
    mockOperational = baseOperational({ properties: [property, secondProperty], fields: [field, secondField] });
    mockSearchParams = new URLSearchParams('fieldIds=field-1%2Cfield-2');
    route('/jobs/client/client-1/property/property-1/field/field-1/new-job', <JobCreate />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Job Reference' }), { target: { value: 'JOB-MULTI' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Weed Target' }), { target: { value: 'Spray lantana' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Job' }));

    await waitFor(() => expect(mockOperational.createJob).toHaveBeenCalledWith(expect.objectContaining({
      clientId: 'client-1', propertyId: 'property-1', fieldIds: ['field-1', 'field-2'], reference: 'JOB-MULTI',
    })));
  });

  test('drops a foreign-client Field seeded through the Job scope query', async () => {
    const otherClient = { ...client, id: 'client-2', name: 'South Farm' };
    const otherProperty = { ...property, id: 'property-2', clientId: 'client-2', name: 'South Block' };
    const otherField = { ...field, id: 'field-2', propertyId: 'property-2', name: 'South Field' };
    mockOperational = baseOperational({ clients: [client, otherClient], properties: [property, otherProperty], fields: [field, otherField] });
    mockSearchParams = new URLSearchParams('fieldIds=field-1%2Cfield-2');
    route('/jobs/client/client-1/property/property-1/field/field-1/new-job', <JobCreate />);

    expect(screen.getByText('1 Property · 1 Field · 12.5000 ha')).toBeVisible();
    fireEvent.change(screen.getByRole('textbox', { name: 'Job Reference' }), { target: { value: 'JOB-SANITISED' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Weed Target' }), { target: { value: 'Spray lantana' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Job' }));

    await waitFor(() => expect(mockOperational.createJob).toHaveBeenCalledWith(expect.objectContaining({
      clientId: 'client-1', propertyId: 'property-1', fieldIds: ['field-1'], reference: 'JOB-SANITISED',
    })));
  });

  test('blocks remote save when an unsupported operator value was entered', async () => {
    route('/jobs/client/client-1/property/property-1/field/field-1/new-job', <JobCreate />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Job Reference' }), { target: { value: 'JOB-99' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Weed Target' }), { target: { value: 'Spray lantana' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Drone Model' }), { target: { value: 'T50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Job' }));
    expect(mockOperational.createJob).not.toHaveBeenCalled();
    expect(await screen.findByText(/chemical, weather, spray recommendation, operator, quote and compliance values are not yet supported/i)).toBeInTheDocument();
  });

  test.each([
    ['Product / Brand', 'combobox', 'Glyphosate'],
    ['Active Ingredient', 'textbox', 'glyphosate'],
    ['Rate per hectare', 'textbox', '2 L/ha'],
  ])('blocks remote save when unsupported chemical row field %s is entered', async (label, role, value) => {
    route('/jobs/client/client-1/property/property-1/field/field-1/new-job', <JobCreate />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Job Reference' }), { target: { value: 'JOB-99' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Weed Target' }), { target: { value: 'Spray lantana' } });
    fireEvent.change(screen.getByRole(role as any, { name: label }), { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Job' }));
    expect(mockOperational.createJob).not.toHaveBeenCalled();
    expect(await screen.findByText(/chemical, weather, spray recommendation, operator, quote and compliance values are not yet supported/i)).toBeInTheDocument();
  });

  test.each([
    ['loading', /loading job form/i],
    ['error', /authoritative job workflow is unavailable/i],
    ['unauthorised', /not authorised to create a job/i],
  ])('renders remote operational %s before evaluating the direct-route parent chain', (status, expected) => {
    mockOperational = baseOperational({ status, clients: [], properties: [], fields: [], jobs: [] });
    route('/jobs/client/client-1/property/property-1/field/field-1/new-job', <JobCreate />);
    expect(screen.getByText(expected)).toBeInTheDocument();
    expect(screen.queryByText('Field not found.')).not.toBeInTheDocument();
  });

  test('loads and archives authoritative job detail without presenting local subrecords as server data', async () => {
    route('/jobs/client/client-1/property/property-1/field/field-1/job/job-1', <JobDetail />);
    expect(screen.getByRole('heading', { name: /JOB-42/ })).toBeInTheDocument();
    expect(screen.getByText(/outcomes, reports, financials and compliance records are unavailable/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Archive job' }));
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(mockOperational.archiveJob).toHaveBeenCalledWith('job-1'));
  });

  test('starts an authoritative mission under the current job through a bookmark-safe route', () => {
    route('/jobs/client/client-1/property/property-1/field/field-1/job/job-1', <JobDetail />);
    fireEvent.click(screen.getByRole('button', { name: 'Create Mission' }));
    expect(mockNavigate).toHaveBeenCalledWith('/jobs/client/client-1/property/property-1/field/field-1/job/job-1/new-mission');
  });

  test('job history lists authoritative jobs and distinguishes failed load from empty', () => {
    route('/jobs/history', <JobHistory />);
    expect(screen.getByText('JOB-42')).toBeInTheDocument();

    mockOperational = baseOperational({ status: 'error', jobs: [], clients: [], properties: [], fields: [] });
    route('/jobs/history', <JobHistory />);
    expect(screen.getByText(/job history could not be loaded/i)).toBeInTheDocument();
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
