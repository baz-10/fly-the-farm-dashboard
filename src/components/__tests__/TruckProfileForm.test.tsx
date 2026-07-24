import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TruckProfileForm from '../TruckProfileForm';

test('captures detailed truck identity, operations and administrator-only costs', () => {
  render(<TruckProfileForm showFinancials onSave={vi.fn()} onCancel={vi.fn()} />);

  expect(screen.getByLabelText(/Registration/)).toBeInTheDocument();
  expect(screen.getByLabelText(/Asset name/)).toBeInTheDocument();
  expect(screen.getByLabelText('Payload capacity (kg)')).toBeInTheDocument();
  expect(screen.getByLabelText('Purchase price')).toBeInTheDocument();
  expect(screen.getByLabelText('Cost per kilometre')).toBeInTheDocument();
});

test('does not render financial inputs for operational users', () => {
  render(<TruckProfileForm showFinancials={false} onSave={vi.fn()} onCancel={vi.fn()} />);

  expect(screen.getByLabelText(/Registration/)).toBeInTheDocument();
  expect(screen.queryByLabelText('Purchase price')).not.toBeInTheDocument();
  expect(screen.queryByText('Cost model')).not.toBeInTheDocument();
});

test('requires registration, name and vehicle details before saving', () => {
  const onSave = vi.fn();
  render(<TruckProfileForm showFinancials onSave={onSave} onCancel={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Save truck' }));

  expect(onSave).not.toHaveBeenCalled();
  expect(screen.getByText('Enter the truck registration.')).toBeInTheDocument();
});

test('creates a trailer deployment profile', async () => {
  const user = userEvent.setup();
  const onSave = vi.fn();
  render(<TruckProfileForm showFinancials={false} onSave={onSave} onCancel={vi.fn()} />);

  await user.click(screen.getByLabelText('Asset type'));
  await user.click(screen.getByRole('option', { name: 'Trailer' }));
  await user.type(screen.getByLabelText(/Asset name/), 'Chemical trailer');
  await user.type(screen.getByLabelText(/Registration/), 'tr-01');
  await user.type(screen.getByLabelText(/Manufacturer/), 'Custom');
  await user.type(screen.getByLabelText(/Model/), 'Spray deck');
  await user.click(screen.getByRole('button', { name: 'Save trailer' }));

  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
    assetType: 'trailer', name: 'Chemical trailer', registration: 'TR-01',
  }));
});
