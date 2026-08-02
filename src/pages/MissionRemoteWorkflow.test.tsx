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
  aircraftIds: ['aircraft-1'], equipmentKitIds: ['kit-1'],
  createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-02T00:00:00Z',
};

let mockOperational: any;
let mockParams: Record<string, string> = {};
let mockSearch = '';
const mockNavigate = jest.fn();
const mockMissionMapGet = jest.fn();
const mockMissionMapSave = jest.fn();
const mockMissionMapUploadSourceFile = jest.fn();
const mockMissionMapHistory = jest.fn();
const missionAircraft = {
  id: 'aircraft-1', operatingLocationId: 'location-1', registration: 'VH-FTF1', model: 'DJI Agras T50',
  status: 'operational', serviceabilityState: 'serviceable', missionReady: true,
  operationalLimits: { maxPayloadWeight: 40 }, maxWindSpeed: 18, maxAltitude: 120,
};
const missionKit = {
  id: 'kit-1', operatingLocationId: 'location-1', name: 'T50 Spray Kit', type: 'spray-system',
  compatibleAircraft: ['aircraft-1'], specifications: { weight: 10 }, operationalData: { status: 'available' },
};

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => mockParams,
  useSearchParams: () => [new URLSearchParams(mockSearch), jest.fn()],
}), { virtual: true });
jest.mock('../contexts/OperationalDataContext', () => ({ useOperationalData: () => mockOperational }));
jest.mock('../contexts/AircraftContext', () => ({
  useAircraft: () => ({
    aircraft: [missionAircraft], equipmentKits: [missionKit], configurations: [],
    isLoading: false, error: null, getCompatibleKits: () => [missionKit], validateConfiguration: () => true,
  }),
}));
jest.mock('../services/missionMapsApi', () => ({
  createMissionMapsApi: () => ({ get: mockMissionMapGet, save: mockMissionMapSave, history: mockMissionMapHistory, uploadSourceFile: mockMissionMapUploadSourceFile }),
  MissionMapsApiError: class MissionMapsApiError extends Error {},
}));
jest.mock('../contexts/MissionContext', () => ({
  useMission: () => { throw new Error('Remote mission screens must not read MissionContext'); },
}));
jest.mock('../components/FieldBoundaryEditor', () => (props: any) => <div>
  Boundary editor
  <span>Boundary points {props.coords.length}</span>
  {props.onBoundaryFile && <button onClick={() => {
    const polygon = [[-27, 153], [-27, 153.01], [-27.01, 153.01], [-27.01, 153]];
    props.onCoordsChange(polygon);
    props.onPolygonsChange([polygon]);
    props.onBoundaryFile({
      fileName: 'mission-boundary.kml', fileType: 'kml', sizeBytes: 512,
      dataUrl: 'data:application/vnd.google-earth.kml+xml;base64,ZmFrZQ==',
      sourceCrs: 'EPSG:4326',
      boundingBox: { north: -27, south: -27.01, east: 153.01, west: 153 },
      uploadedAt: '2026-08-02T00:00:00Z',
    });
  }}>Simulate KML import</button>}
</div>);

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
    mockMissionMapGet.mockReset().mockResolvedValue(null);
    mockMissionMapSave.mockReset();
    mockMissionMapUploadSourceFile.mockReset().mockResolvedValue({
      id: '44444444-4444-4444-8444-444444444444', originalFilename: 'mission-boundary.kml',
      sourceFormat: 'kml', checksum: 'a'.repeat(64), originalCrs: 'EPSG:4326',
    });
    mockMissionMapHistory.mockReset().mockResolvedValue([]);
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
    mockOperational = operational({ missions: [], createMission: jest.fn().mockResolvedValue(mission) });
    render(<MissionRegister />);
    expect(screen.getByText(/No Planning missions/i)).toBeInTheDocument();
  });

  test('distinguishes a search with no matches from an authoritative empty register', () => {
    render(<MissionRegister />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Search missions' }), { target: { value: 'no-such-mission' } });
    expect(screen.getByText(/No missions match your search/i)).toBeInTheDocument();
    expect(screen.queryByText(/No Planning missions/i)).not.toBeInTheDocument();
  });

  test('restores the approved Mission Planner while accurately gating incomplete downstream capabilities', () => {
    mockParams = { missionId: 'mission-1' };
    render(<MissionPlanning />);
    expect(screen.getByRole('heading', { name: 'Mission Planner' })).toBeInTheDocument();
    expect(screen.getByText(/Draft · Planning incomplete/i)).toBeInTheDocument();
    expect(screen.getByText('Mission Boundary')).toBeInTheDocument();
    expect(screen.getByText('Mission Details')).toBeInTheDocument();
    expect(screen.getByText('Aircraft & Equipment')).toBeInTheDocument();
    expect(screen.getByText(/Mission maps and Personnel assignments are authoritative/i)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Aircraft' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Equipment Kit' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Authorise|Authorize/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/APVMA Compliant/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Aircraft — unavailable/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Equipment — unavailable/i)).not.toBeInTheDocument();
  });

  test('resolves authoritative parent records instead of asking for duplicate entry', () => {
    mockParams = { missionId: 'mission-1' };
    render(<MissionPlanning />);
    expect(screen.getByText('North Farm')).toBeInTheDocument();
    expect(screen.getByText('Home Block')).toBeInTheDocument();
    expect(screen.getByText('North Paddock')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Client' })).not.toBeInTheDocument();
  });

  test('opens the preserved map editor only after authoritative map load succeeds', async () => {
    mockParams = { missionId: 'mission-1' };
    render(<MissionPlanning />);
    expect(await screen.findByText('Boundary editor')).toBeInTheDocument();
    expect(mockMissionMapGet).toHaveBeenCalledWith('mission-1');
    expect(screen.getByRole('button', { name: 'Save Mission Map' })).toBeInTheDocument();
    expect(screen.queryByText(/Maps — unavailable/i)).not.toBeInTheDocument();
  });

  test('preserves KML import provenance when saving authoritative Mission geometry', async () => {
    mockParams = { missionId: 'mission-1' };
    mockMissionMapGet.mockResolvedValue({
      version: 1, notes: '', geometries: [{
        id: 'geometry-1', role: 'operational_boundary', geometryType: 'Polygon',
        geometry: { type: 'Polygon', coordinates: [[[153, -27], [153.01, -27], [153.01, -27.01], [153, -27.01], [153, -27]]] },
        sourceCrs: 'EPSG:4326', canonicalCrs: 'EPSG:4326', provenance: 'drawn',
        validationState: 'valid', areaHectares: 100, lengthMetres: null, label: 'Operational boundary', notes: '', sourceFileId: null,
      }],
    });
    mockMissionMapSave.mockResolvedValue({ version: 1, notes: '', geometries: [] });
    render(<MissionPlanning />);
    expect(await screen.findByText('Boundary editor')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Simulate KML import' }));
    expect(await screen.findByText('Boundary points 4')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save Mission Map' }));
    await waitFor(() => expect(mockMissionMapUploadSourceFile).toHaveBeenCalledWith('mission-1', expect.objectContaining({
      fileName: 'mission-boundary.kml', fileType: 'kml', sourceCrs: 'EPSG:4326',
      validationResult: expect.objectContaining({ state: 'valid' }),
    })));
    await waitFor(() => expect(mockMissionMapSave).toHaveBeenCalledWith('mission-1', expect.objectContaining({
      geometries: expect.arrayContaining([expect.objectContaining({
        provenance: 'imported_kml',
        notes: 'Imported from mission-boundary.kml',
        sourceFileId: '44444444-4444-4444-8444-444444444444',
      })]),
    })));
  });

  test('does not disguise a failed authoritative geometry load as an empty valid map', async () => {
    mockMissionMapGet.mockRejectedValue(new Error('Database unavailable'));
    mockParams = { missionId: 'mission-1' };
    render(<MissionPlanning />);
    expect(await screen.findByText(/No empty or browser-stored map has been substituted/i)).toBeInTheDocument();
    expect(screen.queryByText('Boundary editor')).not.toBeInTheDocument();
  });

  test('shows immutable Mission-map revision and imported-source evidence', async () => {
    mockParams = { missionId: 'mission-1' };
    mockMissionMapHistory.mockResolvedValue([{ version: 2, createdAt: '2026-08-02T01:00:00Z', createdBy: 'user-1', notes: 'Imported west block', geometries: [{
      role: 'operational_boundary', sourceFileId: '44444444-4444-4444-8444-444444444444',
      sourceFile: { id: '44444444-4444-4444-8444-444444444444', originalFilename: 'west-block.kml', sourceFormat: 'kml', checksum: 'a'.repeat(64), originalCrs: 'EPSG:4326' },
    }] }, { version: 1, createdAt: '2026-08-02T00:00:00Z', createdBy: 'user-1', notes: '', geometries: [] }]);
    render(<MissionPlanning />);
    expect(await screen.findByText('Boundary editor')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View map revision history' }));
    expect(await screen.findByText('Mission Map Revision History')).toBeInTheDocument();
    expect(await screen.findByText('Version 2')).toBeInTheDocument();
    expect(screen.getByText('Version 1')).toBeInTheDocument();
    expect(screen.getByText(/west-block\.kml/)).toBeInTheDocument();
    expect(screen.getByText(new RegExp('a{64}'))).toBeInTheDocument();
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

  test('does not let disconnected downstream capabilities block a valid Draft save', async () => {
    mockOperational = operational({ missions: [], createMission: jest.fn().mockResolvedValue(mission) });
    mockSearch = 'jobId=job-1';
    render(<MissionPlanning />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Mission number' }), { target: { value: 'MSN-099' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Mission title' }), { target: { value: 'Creek run' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Mission' }));
    expect(mockOperational.createMission).toHaveBeenCalledWith(expect.objectContaining({ status: 'Planning' }));
    expect(screen.getByText(/Draft is unauthorised and not ready to fly/i)).toBeInTheDocument();
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

  test('persists authoritative Aircraft and Equipment assignments with the Draft Mission version', async () => {
    const updateMission = jest.fn().mockResolvedValue({ ...mission, rowVersion: 4 });
    mockOperational = operational({ updateMission });
    mockParams = { missionId: 'mission-1' };
    render(<MissionPlanning />);
    expect(screen.getByRole('combobox', { name: 'Aircraft' })).toHaveTextContent('VH-FTF1');
    expect(screen.getByRole('combobox', { name: 'Equipment Kit' })).toHaveTextContent('T50 Spray Kit');
    fireEvent.click(screen.getByRole('button', { name: 'Update Mission' }));
    await waitFor(() => expect(updateMission).toHaveBeenCalledWith('mission-1', expect.objectContaining({
      aircraftIds: ['aircraft-1'], equipmentKitIds: ['kit-1'],
    })));
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
