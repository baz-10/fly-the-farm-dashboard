import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import MissionRegister from './MissionRegister';
import MissionPlanning from './MissionPlanning';

const client = { id: 'client-1', name: 'North Farm' };
const property = { id: 'property-1', clientId: 'client-1', name: 'Home Block' };
const field = { id: 'field-1', propertyId: 'property-1', name: 'North Paddock' };
const job = {
  id: 'job-1', clientId: 'client-1', propertyId: 'property-1', fieldIds: ['field-1'],
  reference: 'JOB-42', scope: 'Spray lantana', status: 'scheduled', notes: '', rowVersion: 2,
  createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z',
};
const location = {
  id: 'location-1', name: 'Brisbane Base', address: '1 Airfield Rd', timezone: 'Australia/Brisbane', rowVersion: 1,
  createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z',
};
const mission = {
  id: 'mission-1', jobId: 'job-1', operatingLocationId: 'location-1', missionNumber: 'MSN-001',
  title: 'North block spray', description: 'Treat the creek boundary', status: 'Planning',
  scheduledStartAt: '2026-08-10T08:30:00Z', rowVersion: 3,
  createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-02T00:00:00Z',
};

let mockOperational: any;
let mockParams: Record<string, string> = {};
let mockSearch = '';
const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => mockParams,
  useSearchParams: () => [new URLSearchParams(mockSearch), jest.fn()],
}), { virtual: true });
jest.mock('../contexts/OperationalDataContext', () => ({ useOperationalData: () => mockOperational }));
jest.mock('../contexts/MissionContext', () => ({
  useMission: () => { throw new Error('Remote mission screens must not read MissionContext'); },
}));
jest.mock('../components/FieldBoundaryEditor', () => () => <div>Boundary editor</div>);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function operational(overrides: Record<string, unknown> = {}) {
  return {
    mode: 'remote', status: 'ready', clients: [client], properties: [property], fields: [field], jobs: [job],
    operatingLocations: [location], missions: [mission], fieldBoundaryVersions: [], saving: false,
    savedAt: null, lastSaved: null, error: null, refresh: jest.fn(), createMission: jest.fn(),
    updateMission: jest.fn(), archiveMission: jest.fn(), ...overrides,
  };
}

describe('remote authoritative mission workflow', () => {
  beforeEach(() => {
    mockOperational = operational();
    mockParams = {};
    mockSearch = '';
    mockNavigate.mockReset();
  });

  test('lists only authoritative Planning missions with explicit not-ready language', () => {
    render(<MissionRegister />);
    expect(screen.getByText('North block spray')).toBeInTheDocument();
    expect(screen.getByText('Planning · Not ready for operations')).toBeInTheDocument();
    expect(screen.queryByText('Authorised')).not.toBeInTheDocument();
    expect(screen.queryByText(/ready to fly/i)).not.toBeInTheDocument();
  });

  test.each([
    ['loading', /loading authoritative missions/i],
    ['error', /authoritative mission register is unavailable/i],
    ['unauthorised', /not authorised to view missions/i],
  ])('does not render remote %s as a valid empty mission register', (status, expected) => {
    mockOperational = operational({ status, missions: [], error: { code: 'NETWORK_ERROR', message: 'Offline' } });
    render(<MissionRegister />);
    expect(screen.getByText(expected)).toBeInTheDocument();
    expect(screen.queryByText(/No Planning missions/i)).not.toBeInTheDocument();
  });

  test('renders a valid authoritative empty register only after a successful load', () => {
    mockOperational = operational({ missions: [] });
    render(<MissionRegister />);
    expect(screen.getByText(/No Planning missions/i)).toBeInTheDocument();
  });

  test('distinguishes a search with no matches from an authoritative empty register', () => {
    render(<MissionRegister />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Search missions' }), { target: { value: 'no-such-mission' } });
    expect(screen.getByText(/No missions match your search/i)).toBeInTheDocument();
    expect(screen.queryByText(/No Planning missions/i)).not.toBeInTheDocument();
  });

  test('loads bookmarked mission detail from authoritative state and suppresses operational claims', () => {
    mockParams = { missionId: 'mission-1' };
    render(<MissionPlanning />);
    expect(screen.getByRole('heading', { name: 'North block spray' })).toBeInTheDocument();
    expect(screen.getByText(/Planning only · Not ready for operations/i)).toBeInTheDocument();
    expect(screen.getByText(/aircraft, equipment, personnel, chemicals, maps, weather, JSA, risk controls, authorisation, completion, pack and financials are unavailable/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Authorise|Authorize/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/APVMA Compliant/i)).not.toBeInTheDocument();
  });

  test('creates a mission under the bookmarked authoritative job and waits for confirmation', async () => {
    const save = deferred<any>();
    const createMission = jest.fn().mockReturnValue(save.promise);
    mockOperational = operational({ missions: [], createMission });
    mockParams = { clientId: 'client-1', propertyId: 'property-1', fieldId: 'field-1', jobId: 'job-1' };
    render(<MissionPlanning />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Mission number' }), { target: { value: 'MSN-099' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Mission title' }), { target: { value: 'Creek run' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), { target: { value: 'Treat creek edge' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Mission' }));
    expect(createMission).toHaveBeenCalledWith(expect.objectContaining({
      jobId: 'job-1', operatingLocationId: 'location-1', missionNumber: 'MSN-099', title: 'Creek run',
      description: 'Treat creek edge', status: 'Planning', scheduledStartAt: expect.any(String),
    }));
    expect(mockNavigate).not.toHaveBeenCalled();
    save.resolve({ ...mission, id: 'mission-99', title: 'Creek run' });
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/missions/mission-99'));
  });

  test('blocks save rather than discarding entered unsupported operational values', () => {
    mockOperational = operational({ missions: [] });
    mockSearch = 'jobId=job-1';
    render(<MissionPlanning />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Mission number' }), { target: { value: 'MSN-099' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Mission title' }), { target: { value: 'Creek run' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Aircraft planning (not connected)' }), { target: { value: 'DJI T50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Mission' }));
    expect(mockOperational.createMission).not.toHaveBeenCalled();
    expect(screen.getByText(/unsupported operational values were entered and were not saved/i)).toBeInTheDocument();
  });

  test('keeps conflict detail visible and does not replace the confirmed mission', async () => {
    const conflict = Object.assign(new Error('Changed'), { code: 'VERSION_CONFLICT', currentVersion: 4, status: 409 });
    mockOperational = operational({ updateMission: jest.fn().mockRejectedValue(conflict) });
    mockParams = { missionId: 'mission-1' };
    render(<MissionPlanning />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Mission title' }), { target: { value: 'Lost edit' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update Mission' }));
    expect(await screen.findByText(/record changed on the server/i)).toBeInTheDocument();
    expect(mockOperational.updateMission).toHaveBeenCalledWith('mission-1', expect.objectContaining({ title: 'Lost edit', status: 'Planning' }));
  });

  test('keeps an unscheduled existing mission blank and persists an explicitly cleared schedule as null', async () => {
    mockOperational = operational({
      missions: [{ ...mission, scheduledStartAt: null }],
      updateMission: jest.fn().mockResolvedValue({ ...mission, scheduledStartAt: null, rowVersion: 4 }),
    });
    mockParams = { missionId: 'mission-1' };
    render(<MissionPlanning />);
    expect(screen.getByLabelText('Scheduled start')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Update Mission' }));
    await waitFor(() => expect(mockOperational.updateMission).toHaveBeenCalledWith(
      'mission-1', expect.objectContaining({ scheduledStartAt: null }),
    ));
  });

  test('archives a Planning mission only after controlled confirmation', async () => {
    const archive = deferred<void>();
    mockOperational = operational({ archiveMission: jest.fn().mockReturnValue(archive.promise) });
    mockParams = { missionId: 'mission-1' };
    render(<MissionPlanning />);
    fireEvent.click(screen.getByRole('button', { name: 'Archive Mission' }));
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    expect(mockNavigate).not.toHaveBeenCalled();
    archive.resolve();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/missions'));
  });

  test.each([
    ['loading', /loading authoritative mission/i],
    ['error', /authoritative mission planning is unavailable/i],
    ['unauthorised', /not authorised to view this mission/i],
  ])('keeps bookmarked mission %s distinct from not-found', (status, expected) => {
    mockOperational = operational({ status, missions: [] });
    mockParams = { missionId: 'mission-1' };
    render(<MissionPlanning />);
    expect(screen.getByText(expected)).toBeInTheDocument();
    expect(screen.queryByText(/mission was not found/i)).not.toBeInTheDocument();
  });

  test('rejects a stale or cross-tenant mission bookmark without legacy fallback', () => {
    mockOperational = operational({ missions: [] });
    mockParams = { missionId: 'other-tenant-mission' };
    render(<MissionPlanning />);
    expect(screen.getByText(/authoritative mission was not found/i)).toBeInTheDocument();
  });

  test('requires an active authoritative operating location before create', () => {
    mockOperational = operational({ missions: [], operatingLocations: [] });
    mockSearch = 'jobId=job-1';
    render(<MissionPlanning />);
    expect(screen.getByText(/no active authorised operating location is available/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Mission' })).toBeDisabled();
  });
});
