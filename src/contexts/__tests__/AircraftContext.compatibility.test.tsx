import { render, screen, waitFor } from '@testing-library/react';
import { AircraftProvider, useAircraft } from '../AircraftContext';
import { PERSISTENCE_KEYS } from '../../services/persistence';
import { Aircraft, EquipmentKit } from '../../types/aircraft';

const aircraft = (id: string, registration: string): Aircraft => ({
  id,
  registration,
  manufacturer: 'DJI',
  model: 'DJI Agras T100',
  serialNumber: `${id}-serial`,
  mtow: 149.9,
  maxAltitude: 120,
  maxWindSpeed: 28,
  maintenanceDates: {} as Aircraft['maintenanceDates'],
  insurance: {} as Aircraft['insurance'],
  status: 'operational',
  assignedKits: [],
  operationalLimits: { maxPayloadWeight: 110 } as Aircraft['operationalLimits'],
  documentation: {} as Aircraft['documentation'],
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
});

const sprayBase: EquipmentKit = {
  id: 't100-spray-base',
  name: 'T100 Spray Base',
  type: 'spray-system',
  description: 'T100 spray base',
  specifications: { weight: 75 } as EquipmentKit['specifications'],
  components: [],
  operationalData: { status: 'available' } as EquipmentKit['operationalData'],
  financialData: {} as EquipmentKit['financialData'],
  compatibleAircraft: ['T100'],
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

function CompatibilityProbe() {
  const { isLoading, getCompatibleKits, validateConfiguration } = useAircraft();
  if (isLoading) return <span>loading</span>;

  const first = getCompatibleKits('t100-001').map((kit) => kit.id).join(',');
  const second = getCompatibleKits('t100-002').map((kit) => kit.id).join(',');
  return (
    <div>
      <span data-testid="first">{first}</span>
      <span data-testid="second">{second}</span>
      <span data-testid="valid">{String(validateConfiguration('t100-002', 't100-spray-base'))}</span>
    </div>
  );
}

describe('AircraftContext model compatibility', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(PERSISTENCE_KEYS.aircraft, JSON.stringify({
      aircraft: [
        aircraft('t100-001', 'FTF-T100-001'),
        aircraft('t100-002', 'FTF-T100-002'),
      ],
      equipmentKits: [sprayBase],
      configurations: [],
    }));
  });

  test('shares one model-compatible kit across T100 registrations without configurations', async () => {
    render(
      <AircraftProvider>
        <CompatibilityProbe />
      </AircraftProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('first')).toHaveTextContent('t100-spray-base'));
    expect(screen.getByTestId('second')).toHaveTextContent('t100-spray-base');
    expect(screen.getByTestId('valid')).toHaveTextContent('true');
  });
});
