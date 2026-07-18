import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WorkPackProvider, useWorkPacks } from '../WorkPackContext';
import { PERSISTENCE_KEYS } from '../../services/persistence';
import { TruckProfileInput, WorkPackTemplateInput } from '../../types/workPack';
import * as persistence from '../../services/persistence';

let mockCurrentRole: 'admin' | 'contractor' = 'admin';
jest.mock('../AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1', role: mockCurrentRole } }),
}));

const truck: TruckProfileInput = {
  registration: 'FTF-TRUCK-01',
  name: 'Primary Spray Truck',
  manufacturer: 'Isuzu',
  model: 'NPS',
  year: 2025,
  vin: 'VIN-001',
  ownershipType: 'financed',
  payloadCapacityKg: 5000,
  operationalNotes: 'Carries two aircraft',
  status: 'available',
  costs: {
    purchasePrice: 180000,
    currentValue: 170000,
    financePaymentMonthly: 3200,
    registrationAnnual: 1800,
    insuranceAnnual: 6500,
    depreciationAnnual: 18000,
    servicingAnnual: 6000,
    tyresAnnual: 3000,
    fuelCostPerLitre: 2,
    averageFuelLitresPer100Km: 22,
    costPerHour: 48,
    costPerDay: 480,
    costPerKm: 1.2,
  },
};

function Probe() {
  const { assets, trucks, templates, createAsset, createTruck, createTemplate, instantiateTemplate } = useWorkPacks();
  const create = async () => {
    const truckId = await createTruck(truck);
    const template: WorkPackTemplateInput = {
      name: 'Standard Spray Pack',
      description: 'Reusable setup',
      status: 'active',
      truckId,
      assetIds: [truckId, 'trailer-1'],
      aircraftAssignments: [{ id: 'slot-1', aircraftId: 'aircraft-1', kitId: 'kit-1', label: 'Lead', carryingAssetId: 'trailer-1' }],
      crewRequirements: [],
      checklist: [],
      notes: '',
    };
    const templateId = await createTemplate(template);
    instantiateTemplate(templateId, 'job-1');
  };
  return (
    <div>
      <button onClick={create}>create</button>
      <button onClick={() => createAsset({ ...truck, assetType: 'trailer', name: 'Spray trailer' })}>create trailer</button>
      {assets.map((asset) => <span key={asset.id}>{asset.assetType}:{asset.name}</span>)}
      <span data-testid="trucks">{trucks.length}</span>
      <span data-testid="templates">{templates.length}</span>
    </div>
  );
}

function LegacyTruckMutationProbe() {
  const { assets, updateTruck, archiveTruck } = useWorkPacks();
  const trailer = assets.find((asset) => asset.id === 'trailer-1');

  return (
    <div>
      <button onClick={() => updateTruck('trailer-1', { name: 'Changed through truck API' })}>update trailer as truck</button>
      <button onClick={() => archiveTruck('trailer-1')}>archive trailer as truck</button>
      <span data-testid="trailer-name">{trailer?.name}</span>
      <span data-testid="trailer-status">{trailer?.status}</span>
    </div>
  );
}

function StateProbe() {
  const { assets, loadError, saveError, createAsset, updateAsset } = useWorkPacks();
  return <div>
    <span data-testid="asset-cost">{assets[0]?.costs ? 'has-costs' : 'no-costs'}</span>
    <span data-testid="load-error">{loadError || ''}</span>
    <span data-testid="save-error">{saveError || ''}</span>
    <button onClick={() => createAsset({ ...truck, assetType: 'truck' })}>change store</button>
    <button onClick={() => assets[0] && updateAsset(assets[0].id, { operationalNotes: 'Contractor updated notes' })}>edit operations</button>
  </div>;
}

describe('WorkPackContext', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
    mockCurrentRole = 'admin';
  });

  test('persists truck profiles and reusable templates', async () => {
    render(<WorkPackProvider><Probe /></WorkPackProvider>);
    fireEvent.click(await screen.findByText('create'));

    await waitFor(() => expect(screen.getByTestId('trucks')).toHaveTextContent('1'));
    await waitFor(() => expect(screen.getByTestId('templates')).toHaveTextContent('1'));
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(PERSISTENCE_KEYS.workPacks) || '{}');
      expect(stored.trucks).toHaveLength(1);
      expect(stored.templates).toHaveLength(1);
      expect(stored.templates[0]).toEqual(expect.objectContaining({
        assetIds: expect.arrayContaining([stored.trucks[0].id, 'trailer-1']),
        aircraftAssignments: [expect.objectContaining({ carryingAssetId: 'trailer-1' })],
      }));
    });
  });

  test('normalises legacy trucks and persists independent trailers', async () => {
    const now = new Date().toISOString();
    localStorage.setItem(PERSISTENCE_KEYS.workPacks, JSON.stringify({
      trucks: [{ ...truck, id: 'truck-1', name: 'Legacy truck', createdAt: now, updatedAt: now }],
      templates: [],
      snapshots: [],
    }));

    render(<WorkPackProvider><Probe /></WorkPackProvider>);

    expect(await screen.findByText('truck:Legacy truck')).toBeInTheDocument();
    fireEvent.click(screen.getByText('create trailer'));
    expect(await screen.findByText('trailer:Spray trailer')).toBeInTheDocument();

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(PERSISTENCE_KEYS.workPacks) || '{}');
      expect(stored.assets).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'truck-1', assetType: 'truck', name: 'Legacy truck' }),
        expect.objectContaining({ assetType: 'trailer', name: 'Spray trailer' }),
      ]));
      expect(stored.trucks).toEqual([
        expect.objectContaining({ id: 'truck-1', name: 'Legacy truck' }),
      ]);
    });
  });

  test('does not update a trailer through the legacy truck API', async () => {
    const now = new Date().toISOString();
    localStorage.setItem(PERSISTENCE_KEYS.workPacks, JSON.stringify({
      assets: [{ ...truck, id: 'trailer-1', assetType: 'trailer', name: 'Spray trailer', createdAt: now, updatedAt: now }],
      templates: [],
      snapshots: [],
    }));

    render(<WorkPackProvider><LegacyTruckMutationProbe /></WorkPackProvider>);

    expect(await screen.findByTestId('trailer-name')).toHaveTextContent('Spray trailer');
    fireEvent.click(screen.getByText('update trailer as truck'));
    await waitFor(() => expect(screen.getByTestId('trailer-name')).toHaveTextContent('Spray trailer'));
  });

  test('does not retire a trailer through the legacy truck API', async () => {
    const now = new Date().toISOString();
    localStorage.setItem(PERSISTENCE_KEYS.workPacks, JSON.stringify({
      assets: [{ ...truck, id: 'trailer-1', assetType: 'trailer', name: 'Spray trailer', createdAt: now, updatedAt: now }],
      templates: [],
      snapshots: [],
    }));

    render(<WorkPackProvider><LegacyTruckMutationProbe /></WorkPackProvider>);

    expect(await screen.findByTestId('trailer-status')).toHaveTextContent('available');
    fireEvent.click(screen.getByText('archive trailer as truck'));
    await waitFor(() => expect(screen.getByTestId('trailer-status')).toHaveTextContent('available'));
  });

  test('removes financial fields from the contractor runtime store', async () => {
    mockCurrentRole = 'contractor';
    const now = new Date().toISOString();
    localStorage.setItem(PERSISTENCE_KEYS.workPacks, JSON.stringify({
      assets: [{ ...truck, id: 'truck-1', assetType: 'truck', createdAt: now, updatedAt: now }],
      templates: [], snapshots: [],
    }));

    render(<WorkPackProvider><StateProbe /></WorkPackProvider>);

    expect(await screen.findByTestId('asset-cost')).toHaveTextContent('no-costs');
  });

  test('preserves privileged local costing through a contractor edit and later admin reload', async () => {
    mockCurrentRole = 'contractor';
    const now = new Date().toISOString();
    localStorage.setItem(PERSISTENCE_KEYS.workPacks, JSON.stringify({
      assets: [{ ...truck, id: 'truck-1', assetType: 'truck', createdAt: now, updatedAt: now }],
      templates: [], snapshots: [],
    }));

    const contractorView = render(<WorkPackProvider><StateProbe /></WorkPackProvider>);
    expect(await screen.findByTestId('asset-cost')).toHaveTextContent('no-costs');
    fireEvent.click(screen.getByText('edit operations'));
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(PERSISTENCE_KEYS.workPacks) || '{}');
      expect(stored.assets[0].operationalNotes).toBe('Contractor updated notes');
      expect(stored.assets[0].costs.costPerDay).toBe(480);
    });
    contractorView.unmount();

    mockCurrentRole = 'admin';
    render(<WorkPackProvider><StateProbe /></WorkPackProvider>);
    expect(await screen.findByTestId('asset-cost')).toHaveTextContent('has-costs');
  });

  test('exposes a load error while keeping mission planning usable', async () => {
    jest.spyOn(persistence, 'readSharedValue').mockRejectedValueOnce(new Error('Network unavailable'));

    render(<WorkPackProvider><StateProbe /></WorkPackProvider>);

    expect(await screen.findByTestId('load-error')).toHaveTextContent('Network unavailable');
    expect(screen.getByText('change store')).toBeEnabled();
  });

  test('exposes a save error instead of swallowing a failed write', async () => {
    jest.spyOn(persistence, 'writeSharedValue').mockRejectedValueOnce(new Error('Save failed'));
    render(<WorkPackProvider><StateProbe /></WorkPackProvider>);
    await screen.findByTestId('save-error');

    fireEvent.click(screen.getByText('change store'));

    await waitFor(() => expect(screen.getByTestId('save-error')).toHaveTextContent('Save failed'));
  });
});
