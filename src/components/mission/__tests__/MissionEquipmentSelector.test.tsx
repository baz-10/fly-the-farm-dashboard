import { fireEvent, render, screen } from '@testing-library/react';
import MissionEquipmentSelector from '../MissionEquipmentSelector';
import { Aircraft, EquipmentKit } from '../../../types/aircraft';

const aircraft = [
  {
    id: 't100-001', registration: 'FTF-T100-001', model: 'DJI Agras T100',
    status: 'operational', operationalLimits: { maxPayloadWeight: 110 },
  },
  {
    id: 't50-001', registration: 'DJI-T50-001', model: 'DJI Agras T50',
    status: 'operational', operationalLimits: { maxPayloadWeight: 40 },
  },
] as Aircraft[];

const kits = [
  {
    id: 't100-base', name: 'T100 Spray Base', compatibleAircraft: ['T100'],
    specifications: { weight: 75 }, operationalData: { status: 'available' },
  },
  {
    id: 't50-kit', name: 'T50 Spray Kit', compatibleAircraft: ['T50'],
    specifications: { weight: 32 }, operationalData: { status: 'available' },
  },
] as EquipmentKit[];

test('shows model-compatible kits without requiring aircraft configurations', () => {
  const onKitChange = jest.fn();
  render(
    <MissionEquipmentSelector
      aircraft={aircraft}
      equipmentKits={kits}
      selectedAircraftId="t100-001"
      selectedKitId=""
      onAircraftChange={jest.fn()}
      onKitChange={onKitChange}
    />,
  );

  fireEvent.mouseDown(screen.getByLabelText('Equipment Kit'));
  expect(screen.getByRole('option', { name: 'T100 Spray Base' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'T50 Spray Kit' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('option', { name: 'T100 Spray Base' }));
  expect(onKitChange).toHaveBeenCalledWith('t100-base');
});
