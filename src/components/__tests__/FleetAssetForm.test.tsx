import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FleetAssetForm from '../FleetAssetForm';

const base = { id: '33333333-3333-4333-8333-333333333333', name: 'Fly The Farm Base' };

test('keeps asset commands unavailable until authoritative Bases are ready', () => {
  render(<FleetAssetForm locations={[]} locationsReady={false} onSave={jest.fn()} onCancel={jest.fn()} />);
  expect(screen.getByLabelText(/Base/)).toHaveAttribute('aria-disabled', 'true');
  expect(screen.getByRole('button', { name: 'Save asset' })).toBeDisabled();
  expect(screen.getByText('Loading authorised Bases…')).toBeInTheDocument();
});

test('selects one authorised Base and permits a generator without registration or VIN', async () => {
  const user = userEvent.setup();
  const onSave = jest.fn();
  render(<FleetAssetForm locations={[base]} locationsReady onSave={onSave} onCancel={jest.fn()} />);
  expect(screen.getByLabelText(/Base/)).toHaveTextContent(base.name);
  await user.click(screen.getByLabelText('Asset type'));
  await user.click(screen.getByRole('option', { name: 'Generator' }));
  await user.type(screen.getByLabelText(/Asset identifier/), 'GEN-003');
  await user.type(screen.getByLabelText('Serial number'), 'SER-003');
  await user.click(screen.getByRole('button', { name: 'Save asset' }));
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
    operatingLocationId: base.id, assetType: 'generator', assetIdentifier: 'GEN-003', serialNumber: 'SER-003',
  }));
});

test('requires registration only for truck and trailer', async () => {
  const user = userEvent.setup();
  const onSave = jest.fn();
  render(<FleetAssetForm locations={[base]} locationsReady onSave={onSave} onCancel={jest.fn()} />);
  await user.type(screen.getByLabelText(/Asset identifier/), 'FTF-11');
  fireEvent.click(screen.getByRole('button', { name: 'Save asset' }));
  expect(onSave).not.toHaveBeenCalled();
  expect(screen.getByText('Enter the truck registration.')).toBeInTheDocument();
});

test('clears a stale Base when authoritative scope changes', () => {
  const second = { id: '44444444-4444-4444-8444-444444444444', name: 'Second Base' };
  const { rerender } = render(<FleetAssetForm locations={[base]} locationsReady onSave={jest.fn()} onCancel={jest.fn()} />);
  expect(screen.getByLabelText(/Base/)).toHaveTextContent(base.name);
  rerender(<FleetAssetForm locations={[second]} locationsReady onSave={jest.fn()} onCancel={jest.fn()} />);
  expect(screen.getByLabelText(/Base/)).toHaveTextContent(second.name);
});

test('shows one authoritative safe submit error', async () => {
  const user = userEvent.setup();
  render(<FleetAssetForm locations={[base]} locationsReady onSave={jest.fn().mockRejectedValue(new Error('Fleet asset changed. Reference: request-123'))} onCancel={jest.fn()} />);
  await user.type(screen.getByLabelText(/Asset identifier/), 'FTF-11');
  await user.type(screen.getByLabelText(/Registration/), 'FTF-11');
  await user.click(screen.getByRole('button', { name: 'Save asset' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Fleet asset changed. Reference: request-123');
  expect(screen.getAllByText(/Fleet asset changed/)).toHaveLength(1);
});
