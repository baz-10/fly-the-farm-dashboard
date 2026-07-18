import { fireEvent, render, screen } from '@testing-library/react';
import WorkPackTemplateForm from '../WorkPackTemplateForm';
import { Aircraft, EquipmentKit } from '../../types/aircraft';
import { DeploymentAsset, TruckProfile } from '../../types/workPack';

const trucks = [{ id: 'truck-1', name: 'Primary Spray Truck', registration: 'FTF-01', status: 'available' }] as TruckProfile[];
const assets = [
  { ...trucks[0], assetType: 'truck' },
  { id: 'trailer-1', name: 'Chemical Trailer', registration: 'TRL-01', status: 'available', assetType: 'trailer' },
] as DeploymentAsset[];
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
  fireEvent.click(screen.getByRole('checkbox', { name: /Primary Spray Truck/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Add aircraft' }));

  expect(screen.getByText('Aircraft 1')).toBeInTheDocument();
  expect(screen.getByText('Crew requirements')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save template' })).toBeInTheDocument();
});

test('selects multiple independent assets and assigns an aircraft and kit to a trailer', () => {
  const onSave = jest.fn();
  render(
    <WorkPackTemplateForm
      assets={assets}
      trucks={trucks}
      aircraft={aircraft}
      equipmentKits={kits}
      onSave={onSave}
      onCancel={jest.fn()}
    />,
  );

  fireEvent.change(screen.getByLabelText(/Template name/), { target: { value: 'Trailer deployment' } });
  fireEvent.click(screen.getByRole('checkbox', { name: /Primary Spray Truck/ }));
  fireEvent.click(screen.getByRole('checkbox', { name: /Chemical Trailer/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Add aircraft' }));
  fireEvent.mouseDown(screen.getByLabelText('Carrying asset for slot 1'));
  fireEvent.click(screen.getByRole('option', { name: /Chemical Trailer/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Save template' }));

  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
    assetIds: ['truck-1', 'trailer-1'],
    truckId: 'truck-1',
    aircraftAssignments: [expect.objectContaining({ aircraftId: 't100-001', kitId: 't100-base', carryingAssetId: 'trailer-1' })],
  }));
});
