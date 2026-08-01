import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ClientList from './ClientList';
import ClientDetail from './ClientDetail';
import PropertyDetail from './PropertyDetail';
import FieldDetail from './FieldDetail';
import JobCreate from './JobCreate';
import JobDetail from './JobDetail';
import JobHistory from './JobHistory';

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
const job = {
  id: 'job-1', clientId: 'client-1', propertyId: 'property-1', fieldIds: ['field-1'], reference: 'JOB-42',
  scope: 'Spray lantana', status: 'scheduled', notes: 'Morning access', requestedDate: '2026-08-08', scheduledDate: '2026-08-10',
  rowVersion: 3, createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-02T00:00:00Z',
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
jest.mock('../components/FieldBoundaryEditor', () => (props: any) => <div>
  Boundary editor
  <button onClick={() => props.onCoordsChange?.([[-27, 153], [-27, 154], [-28, 154]])}>Draw test boundary</button>
</div>);
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
    saving: false, savedAt: null, lastSaved: null, error: null, refresh: jest.fn(),
    createClient: jest.fn(), updateClient: jest.fn(), archiveClient: jest.fn().mockResolvedValue(undefined),
    createProperty: jest.fn(), updateProperty: jest.fn(), archiveProperty: jest.fn().mockResolvedValue(undefined),
    createField: jest.fn(), updateField: jest.fn(), archiveField: jest.fn().mockResolvedValue(undefined),
    createJob: jest.fn().mockResolvedValue(job), updateJob: jest.fn(), archiveJob: jest.fn().mockResolvedValue(undefined),
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
  beforeEach(() => { mockOperational = baseOperational(); });

  test('does not render a failed client load as the valid empty state', () => {
    mockOperational = baseOperational({ status: 'error', clients: [], properties: [], fields: [], error: { code: 'NETWORK_ERROR', message: 'Offline' } });
    route('/jobs', <ClientList />);
    expect(screen.getByText(/operational data is unavailable/i)).toBeInTheDocument();
    expect(screen.queryByText('No clients yet')).not.toBeInTheDocument();
  });

  test('preserves navigation buttons for the explicitly gated remote job workflows', () => {
    route('/jobs', <ClientList />);
    fireEvent.click(screen.getByRole('button', { name: 'Import Spray Rec' }));
    expect(mockNavigate).toHaveBeenCalledWith('/jobs/import');
    fireEvent.click(screen.getByRole('button', { name: 'Job History' }));
    expect(mockNavigate).toHaveBeenCalledWith('/jobs/history');
  });

  test('does not show a saved confirmation from an unrelated resource', () => {
    mockOperational = baseOperational({
      savedAt: '2026-08-01T01:00:00Z',
      lastSaved: { resource: 'property', recordId: 'property-1', at: '2026-08-01T01:00:00Z' },
    });
    route('/jobs/client/client-1', <ClientDetail />);
    expect(screen.queryByText('Saved.')).not.toBeInTheDocument();
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
