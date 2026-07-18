import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MissionDeploymentWorkPack from '../MissionDeploymentWorkPack';
import { Aircraft, EquipmentKit } from '../../../types/aircraft';
import { DeploymentAsset, MissionWorkPackDraft, WorkPackTemplate } from '../../../types/workPack';

const truck = { id: 'truck-1', name: 'Support truck', registration: 'FTF123', assetType: 'truck', status: 'available' } as DeploymentAsset;
const trailer = { id: 'trailer-1', name: 'Spray trailer', registration: 'TRL123', assetType: 'trailer', status: 'available' } as DeploymentAsset;
const aircraft = [
  { id: 't50-1', registration: 'T50 ONE', model: 'DJI Agras T50', status: 'operational', operationalLimits: { maxPayloadWeight: 40 } },
  { id: 't100-1', registration: 'T100 ONE', model: 'DJI Agras T100', status: 'operational', operationalLimits: { maxPayloadWeight: 110 } },
  { id: 't50-2', registration: 'T50 TWO', model: 'DJI Agras T50', status: 'operational', operationalLimits: { maxPayloadWeight: 40 } },
  { id: 't50-3', registration: 'T50 THREE', model: 'DJI Agras T50', status: 'operational', operationalLimits: { maxPayloadWeight: 40 } },
] as Aircraft[];
const kits = [
  { id: 't50-kit', name: 'T50 Spray Kit', compatibleAircraft: ['T50'], specifications: { weight: 30 }, operationalData: { status: 'available' } },
  { id: 't100-kit', name: 'T100 Spray Kit', compatibleAircraft: ['T100'], specifications: { weight: 80 }, operationalData: { status: 'available' } },
] as EquipmentKit[];
const template = {
  id: 'template-1', name: 'Two-aircraft spray', description: 'Standard deployment', status: 'active', truckId: truck.id,
  aircraftAssignments: [{ id: 'slot-1', aircraftId: 't50-1', kitId: 't50-kit', label: 'Lead' }],
  crewRequirements: [{ id: 'crew-1', role: 'pilot', quantity: 2, notes: 'Two licensed pilots' }],
  checklist: ['Confirm chemical manifest'], notes: 'Template notes', createdAt: '2026-01-01', updatedAt: '2026-01-01',
} as WorkPackTemplate;

function renderEditor(options: { assets?: DeploymentAsset[]; templates?: WorkPackTemplate[]; value?: MissionWorkPackDraft } = {}) {
  const onChange = jest.fn();
  render(<MissionDeploymentWorkPack assets={options.assets ?? [truck, trailer]} templates={options.templates ?? [template]} aircraft={aircraft} equipmentKits={kits} value={options.value} onChange={onChange} />);
  return { onChange };
}

async function expand() {
  await userEvent.click(screen.getByRole('button', { name: /Deployment Work Pack \(Optional\)/i }));
}

test('allows a mission to continue with no deployment assets', async () => {
  renderEditor({ assets: [], value: undefined });
  await expand();
  expect(screen.getByText('No deployment assets added — continue without one.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Skip for now' })).toBeEnabled();
});

test('supports a trailer and tow notes without a managed truck', async () => {
  const user = userEvent.setup();
  const { onChange } = renderEditor({ assets: [trailer], value: undefined });
  await expand();
  await user.click(screen.getByRole('checkbox', { name: 'Spray trailer' }));
  await user.type(screen.getByLabelText('Tow vehicle registration'), '123ABC');
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
    assets: [trailer], towVehicle: expect.objectContaining({ registration: '123ABC' }),
  }));
});

test('applies a saved template and shows its crew and checklist summary', async () => {
  const user = userEvent.setup();
  const { onChange } = renderEditor();
  await expand();
  await user.click(screen.getByLabelText('Saved template'));
  await user.click(screen.getByRole('option', { name: 'Two-aircraft spray' }));
  await user.click(screen.getByRole('button', { name: 'Apply template' }));
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
    sourceTemplateId: template.id,
    assets: [expect.objectContaining({ id: truck.id })],
  }));
  expect(screen.getByText(/2 × pilot/i)).toBeInTheDocument();
  expect(screen.getByText(/Confirm chemical manifest/)).toBeInTheDocument();
});

test('adds mixed aircraft up to three and filters each row to compatible kits', async () => {
  const user = userEvent.setup();
  renderEditor({ templates: [] });
  await expand();
  await user.click(screen.getByRole('button', { name: 'Add aircraft' }));
  const firstRow = screen.getByTestId('aircraft-assignment-0');
  await user.click(within(firstRow).getByLabelText('Aircraft'));
  await user.click(screen.getByRole('option', { name: /T50 ONE/ }));
  await user.click(within(firstRow).getByLabelText('Equipment kit'));
  expect(screen.getByRole('option', { name: 'T50 Spray Kit' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'T100 Spray Kit' })).not.toBeInTheDocument();
  await user.keyboard('{Escape}');
  await user.click(screen.getByRole('button', { name: 'Add aircraft' }));
  await user.click(screen.getByRole('button', { name: 'Add aircraft' }));
  expect(screen.getAllByTestId(/aircraft-assignment-/)).toHaveLength(3);
  expect(screen.getByRole('button', { name: 'Add aircraft' })).toBeDisabled();
});

test('selects a carrying asset per aircraft and clears everything', async () => {
  const user = userEvent.setup();
  const value: MissionWorkPackDraft = { assets: [truck, trailer], aircraftAssignments: [{ id: 'slot', aircraftId: 't50-1', kitId: 't50-kit', label: 'Lead' }] };
  const { onChange } = renderEditor({ value });
  await expand();
  await user.click(screen.getByLabelText('Carrying asset'));
  await user.click(screen.getByRole('option', { name: 'Spray trailer' }));
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ aircraftAssignments: [expect.objectContaining({ carryingAssetId: trailer.id })] }));
  await user.click(screen.getByRole('button', { name: 'Skip for now' }));
  expect(onChange).toHaveBeenLastCalledWith(undefined);
});

test('clears an aircraft carrying assignment when its asset is removed', async () => {
  const user = userEvent.setup();
  const value: MissionWorkPackDraft = {
    assets: [truck, trailer],
    aircraftAssignments: [{ id: 'slot', aircraftId: 't50-1', kitId: 't50-kit', label: 'Lead' }],
  };
  const { onChange } = renderEditor({ value });
  await expand();
  await user.click(screen.getByLabelText('Carrying asset'));
  await user.click(screen.getByRole('option', { name: 'Spray trailer' }));
  await user.click(screen.getByRole('checkbox', { name: 'Spray trailer' }));

  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
    assets: [truck],
    aircraftAssignments: [expect.not.objectContaining({ carryingAssetId: trailer.id })],
  }));
});

test('synchronizes the template selector when a mission value is rerendered', async () => {
  const archivedTemplate = { ...template, id: 'template-archived', name: 'Archived template', status: 'archived' } as WorkPackTemplate;
  const secondTemplate = { ...template, id: 'template-2', name: 'Second active template' } as WorkPackTemplate;
  const onChange = jest.fn();
  const view = render(
    <MissionDeploymentWorkPack assets={[truck, trailer]} templates={[template, secondTemplate, archivedTemplate]} aircraft={aircraft} equipmentKits={kits} value={{ sourceTemplateId: template.id }} onChange={onChange} />,
  );
  await expand();
  expect(screen.getByLabelText('Saved template')).toHaveTextContent(template.name);

  view.rerender(
    <MissionDeploymentWorkPack assets={[truck, trailer]} templates={[template, secondTemplate, archivedTemplate]} aircraft={aircraft} equipmentKits={kits} value={{ sourceTemplateId: secondTemplate.id }} onChange={onChange} />,
  );
  expect(screen.getByLabelText('Saved template')).toHaveTextContent(secondTemplate.name);

  view.rerender(
    <MissionDeploymentWorkPack assets={[truck, trailer]} templates={[template, secondTemplate, archivedTemplate]} aircraft={aircraft} equipmentKits={kits} value={{ sourceTemplateId: archivedTemplate.id }} onChange={onChange} />,
  );
  expect(screen.getByLabelText('Saved template').parentElement?.querySelector('input')).toHaveValue('');

  view.rerender(
    <MissionDeploymentWorkPack assets={[truck, trailer]} templates={[template, secondTemplate, archivedTemplate]} aircraft={aircraft} equipmentKits={kits} value={{ sourceTemplateId: 'missing-template' }} onChange={onChange} />,
  );
  expect(screen.getByLabelText('Saved template').parentElement?.querySelector('input')).toHaveValue('');
});
