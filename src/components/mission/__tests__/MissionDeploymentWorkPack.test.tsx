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
  assetIds: [truck.id, trailer.id],
  aircraftAssignments: [{ id: 'slot-1', aircraftId: 't50-1', kitId: 't50-kit', label: 'Lead' }],
  crewRequirements: [{ id: 'crew-1', role: 'pilot', quantity: 2, notes: 'Two licensed pilots' }],
  checklist: ['Confirm chemical manifest'], notes: 'Template notes', createdAt: '2026-01-01', updatedAt: '2026-01-01',
} as WorkPackTemplate;

function renderEditor(options: { assets?: DeploymentAsset[]; templates?: WorkPackTemplate[]; value?: MissionWorkPackDraft; role?: 'admin' | 'contractor' } = {}) {
  const onChange = jest.fn();
  render(<MissionDeploymentWorkPack assets={options.assets ?? [truck, trailer]} templates={options.templates ?? [template]} aircraft={aircraft} equipmentKits={kits} value={options.value} showFinancials={options.role === 'admin'} onChange={onChange} />);
  return { onChange };
}

test('hides deployment costs from contractors', async () => {
  renderEditor({ role: 'contractor', value: { estimatedDeploymentCost: 1250, costingComplete: true } });
  await expand();
  expect(screen.queryByText('Estimated deployment cost')).not.toBeInTheDocument();
  expect(screen.queryByText(/1,250/)).not.toBeInTheDocument();
  expect(screen.queryByText('Costing complete')).not.toBeInTheDocument();
  expect(screen.queryByText('Costing incomplete')).not.toBeInTheDocument();
});

test('shows incomplete costing only to administrators', async () => {
  renderEditor({ role: 'admin', value: { estimatedDeploymentCost: 1250, costingComplete: false } });
  await expand();
  expect(screen.getByText('Estimated deployment cost')).toBeInTheDocument();
  expect(screen.getByText('$1,250.00')).toBeInTheDocument();
  expect(screen.getByText('Costing incomplete')).toBeInTheDocument();
});

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
    assets: [expect.objectContaining({ id: truck.id }), expect.objectContaining({ id: trailer.id })],
  }));
  expect(screen.getByLabelText('Crew quantity: pilot')).toHaveValue(2);
  expect(screen.getByLabelText('Work-pack checklist')).toHaveValue('Confirm chemical manifest');
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
    <MissionDeploymentWorkPack assets={[truck, trailer]} templates={[template, secondTemplate, archivedTemplate]} aircraft={aircraft} equipmentKits={kits} value={{ sourceTemplateId: template.id }} showFinancials={false} onChange={onChange} />,
  );
  await expand();
  expect(screen.getByLabelText('Saved template')).toHaveTextContent(template.name);

  view.rerender(
    <MissionDeploymentWorkPack assets={[truck, trailer]} templates={[template, secondTemplate, archivedTemplate]} aircraft={aircraft} equipmentKits={kits} value={{ sourceTemplateId: secondTemplate.id }} showFinancials={false} onChange={onChange} />,
  );
  expect(screen.getByLabelText('Saved template')).toHaveTextContent(secondTemplate.name);

  view.rerender(
    <MissionDeploymentWorkPack assets={[truck, trailer]} templates={[template, secondTemplate, archivedTemplate]} aircraft={aircraft} equipmentKits={kits} value={{ sourceTemplateId: archivedTemplate.id }} showFinancials={false} onChange={onChange} />,
  );
  expect(screen.getByLabelText('Saved template').parentElement?.querySelector('input')).toHaveValue('');

  view.rerender(
    <MissionDeploymentWorkPack assets={[truck, trailer]} templates={[template, secondTemplate, archivedTemplate]} aircraft={aircraft} equipmentKits={kits} value={{ sourceTemplateId: 'missing-template' }} showFinancials={false} onChange={onChange} />,
  );
  expect(screen.getByLabelText('Saved template').parentElement?.querySelector('input')).toHaveValue('');
});

test('edits crew requirements, checklist items, operational notes and supporting equipment', async () => {
  const user = userEvent.setup();
  const { onChange } = renderEditor({ value: {
    assets: [trailer],
    crewRequirements: [{ id: 'crew-1', role: 'support', quantity: 1, notes: '' }],
    checklist: ['Load PPE'],
    notes: 'Initial note',
  } });
  await expand();
  await user.clear(screen.getByLabelText('Crew quantity: support'));
  await user.type(screen.getByLabelText('Crew quantity: support'), '2');
  await user.type(screen.getByLabelText('Crew notes: support'), 'Chemical handler');
  const checklist = screen.getByLabelText('Work-pack checklist');
  await user.clear(checklist);
  await user.type(checklist, 'Load PPE{enter}Confirm radios');
  const notes = screen.getByLabelText('Operational work-pack notes');
  await user.clear(notes);
  await user.type(notes, 'Meet at gate');
  await user.click(screen.getByRole('button', { name: 'Add supporting equipment' }));
  await user.type(screen.getByLabelText('Supporting equipment 1'), 'Generator');
  await user.click(screen.getByLabelText('Carrying asset for supporting equipment 1'));
  await user.click(screen.getByRole('option', { name: 'Spray trailer' }));

  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
    supportingEquipment: [expect.objectContaining({ note: 'Generator', carryingAssetId: 'trailer-1' })],
  }));
  expect(onChange.mock.calls.some(([draft]) => draft?.crewRequirements?.[0]?.quantity === 2)).toBe(true);
  expect(onChange.mock.calls.some(([draft]) => draft?.checklist?.includes('Confirm radios'))).toBe(true);
  expect(onChange.mock.calls.some(([draft]) => draft?.notes === 'Meet at gate')).toBe(true);
});

test('adds an editable crew requirement to a custom mission pack', async () => {
  const user = userEvent.setup();
  const { onChange } = renderEditor({ templates: [], value: {} });
  await expand();
  await user.click(screen.getByRole('button', { name: 'Add crew requirement' }));
  await user.click(screen.getByLabelText('Crew role 1'));
  await user.click(screen.getByRole('option', { name: 'Driver' }));
  await user.clear(screen.getByLabelText('Crew quantity: driver'));
  await user.type(screen.getByLabelText('Crew quantity: driver'), '2');

  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
    crewRequirements: [expect.objectContaining({ role: 'driver', quantity: 2 })],
  }));
});

test('retains and marks missing or unavailable assets when applying an outdated template', async () => {
  const user = userEvent.setup();
  const archivedTrailer = { ...trailer, status: 'retired' } as DeploymentAsset;
  const staleTemplate = { ...template, assetIds: ['missing-truck', archivedTrailer.id] } as WorkPackTemplate;
  const { onChange } = renderEditor({ assets: [archivedTrailer], templates: [staleTemplate] });
  await expand();
  await user.click(screen.getByLabelText('Saved template'));
  await user.click(screen.getByRole('option', { name: staleTemplate.name }));
  await user.click(screen.getByRole('button', { name: 'Apply template' }));

  expect(screen.getByText(/missing-truck.*no longer exists/i)).toBeInTheDocument();
  expect(screen.getByText(/Spray trailer.*retired/i)).toBeInTheDocument();
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
    unavailableAssetReferences: expect.arrayContaining([
      expect.objectContaining({ sourceAssetId: 'missing-truck' }),
      expect.objectContaining({ sourceAssetId: archivedTrailer.id }),
    ]),
  }));
});

test('shows a non-blocking work-pack persistence warning', async () => {
  render(<MissionDeploymentWorkPack assets={[]} templates={[]} aircraft={aircraft} equipmentKits={kits} value={undefined} showFinancials={false} persistenceWarning="Work packs could not be saved" onChange={jest.fn()} />);
  await expand();
  expect(screen.getByText(/Work packs could not be saved.*continue planning/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Skip for now' })).toBeEnabled();
});
