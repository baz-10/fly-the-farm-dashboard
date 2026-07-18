import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WorkPackProvider, useWorkPacks } from '../WorkPackContext';
import { PERSISTENCE_KEYS } from '../../services/persistence';
import { TruckProfileInput, WorkPackTemplateInput } from '../../types/workPack';

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
      aircraftAssignments: [],
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

describe('WorkPackContext', () => {
  beforeEach(() => localStorage.clear());

  test('persists truck profiles and reusable templates', async () => {
    render(<WorkPackProvider><Probe /></WorkPackProvider>);
    fireEvent.click(await screen.findByText('create'));

    await waitFor(() => expect(screen.getByTestId('trucks')).toHaveTextContent('1'));
    await waitFor(() => expect(screen.getByTestId('templates')).toHaveTextContent('1'));
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(PERSISTENCE_KEYS.workPacks) || '{}');
      expect(stored.trucks).toHaveLength(1);
      expect(stored.templates).toHaveLength(1);
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
});
