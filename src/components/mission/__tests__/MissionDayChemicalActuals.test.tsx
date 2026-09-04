import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MissionDayChemicalActuals from '../MissionDayChemicalActuals';
import type { MissionDayChemicalActualRevision, MissionDayChemicalProposal } from '../../../types/missionOperations';

const plan: MissionDayChemicalProposal[] = [{
  plannedLineId: '11111111-1111-4111-8111-111111111111',
  platformProductId: null,
  platformProductVersionId: null,
  registerEntryId: null,
  productName: 'Example Herbicide',
  rate: '2.000000',
  rateUnit: 'L_HA',
  plannedQuantity: '20.000000',
  quantityUnit: 'L',
  productSnapshot: {},
}];

const actual: MissionDayChemicalActualRevision = {
  id: '22222222-2222-4222-8222-222222222222',
  missionId: '33333333-3333-4333-8333-333333333333',
  operatingDayId: '44444444-4444-4444-8444-444444444444',
  packageRevisionId: '55555555-5555-4555-8555-555555555555',
  plannedChemicalRevisionId: '66666666-6666-4666-8666-666666666666',
  revisionNumber: 1,
  confirmationState: 'CONFIRMED',
  changedFromPlan: false,
  materialVariance: false,
  operationStartedAtConfirmation: null,
  notes: null,
  confirmedByInternalUserId: '77777777-7777-4777-8777-777777777777',
  confirmedAt: '2026-09-05T00:00:00.000Z',
  lines: [{
    id: '88888888-8888-4888-8888-888888888888',
    fieldId: '99999999-9999-4999-8999-999999999999',
    plannedLineId: plan[0].plannedLineId,
    platformProductId: null,
    platformProductVersionId: null,
    registerEntryId: null,
    productName: 'Example Herbicide',
    rate: '2.000000',
    rateUnit: 'L_HA',
    appliedQuantity: '18.000000',
    quantityUnit: 'L',
    batchLot: 'LOT-42',
    aircraftId: null,
    productSnapshot: {},
  }],
};

test('labels planned chemicals as proposals until confirmed', () => {
  render(<MissionDayChemicalActuals plan={plan} actual={null} fieldOptions={[]} onConfirm={jest.fn()} />);
  expect(screen.getByText('Proposed from Mission plan')).toBeVisible();
  expect(screen.queryByText('Actual application recorded')).not.toBeInTheDocument();
  expect(screen.getByText('Example Herbicide')).toBeVisible();
});

test('requires an exact Field and explicit confirmation before recording proposed values', async () => {
  const user = userEvent.setup();
  const onConfirm = jest.fn().mockResolvedValue(undefined);
  render(<MissionDayChemicalActuals
    plan={plan}
    actual={null}
    fieldOptions={[{ id: actual.lines[0].fieldId, label: 'North Field' }]}
    onConfirm={onConfirm}
  />);

  await user.selectOptions(screen.getByRole('combobox', { name: 'Field for Example Herbicide' }), actual.lines[0].fieldId);
  await user.type(screen.getByLabelText('Batch or lot for Example Herbicide'), 'LOT-42');
  await user.click(screen.getByRole('button', { name: 'Confirm chemical actuals' }));

  await waitFor(() => expect(onConfirm).toHaveBeenCalledWith({
    lines: [expect.objectContaining({
      fieldId: actual.lines[0].fieldId,
      plannedLineId: plan[0].plannedLineId,
      productName: 'Example Herbicide',
      rate: '2.000000',
      appliedQuantity: '20.000000',
      batchLot: 'LOT-42',
    })],
    notes: null,
  }));
});

test('renders persisted actual evidence and its post-operation variance without relabelling the plan', () => {
  render(<MissionDayChemicalActuals plan={plan} actual={{ ...actual, changedFromPlan: true, materialVariance: true }} fieldOptions={[]} onConfirm={jest.fn()} />);
  expect(screen.getByText('Actual application recorded')).toBeVisible();
  expect(screen.getByText('18.000000 L')).toBeVisible();
  expect(screen.getByText(/Variance retained against the approved Mission plan/)).toBeVisible();
  expect(screen.getByText('Proposed from Mission plan')).toBeVisible();
});
