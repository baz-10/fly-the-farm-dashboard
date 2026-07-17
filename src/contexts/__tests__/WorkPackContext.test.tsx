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
  const { trucks, templates, createTruck, createTemplate, instantiateTemplate } = useWorkPacks();
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
      <span data-testid="trucks">{trucks.length}</span>
      <span data-testid="templates">{templates.length}</span>
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
});
