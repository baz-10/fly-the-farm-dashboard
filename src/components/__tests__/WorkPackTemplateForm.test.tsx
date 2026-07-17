import { fireEvent, render, screen } from '@testing-library/react';
import WorkPackTemplateForm from '../WorkPackTemplateForm';
import { Aircraft, EquipmentKit } from '../../types/aircraft';
import { TruckProfile } from '../../types/workPack';

const trucks = [{ id: 'truck-1', name: 'Primary Spray Truck', registration: 'FTF-01', status: 'available' }] as TruckProfile[];
const aircraft = [{
  id: 't100-001', registration: 'FTF-T100-001', model: 'DJI Agras T100',
  status: 'operational', operationalLimits: { maxPayloadWeight: 110 },
}] as Aircraft[];
const kits = [{
  id: 't100-base', name: 'T100 Spray Base', compatibleAircraft: ['T100'],
  specifications: { weight: 75 }, operationalData: { status: 'available' },
}] as EquipmentKit[];

test('builds a reusable truck, aircraft, kit and crew setup', () => {
  render(
    <WorkPackTemplateForm
      trucks={trucks}
      aircraft={aircraft}
      equipmentKits={kits}
      onSave={jest.fn()}
      onCancel={jest.fn()}
    />,
  );

  fireEvent.change(screen.getByLabelText(/Template name/), { target: { value: 'Two T100 Spray Crew' } });
  fireEvent.mouseDown(screen.getByLabelText('Truck'));
  fireEvent.click(screen.getByRole('option', { name: /Primary Spray Truck/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Add aircraft' }));

  expect(screen.getByText('Aircraft 1')).toBeInTheDocument();
  expect(screen.getByText('Crew requirements')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save template' })).toBeInTheDocument();
});
