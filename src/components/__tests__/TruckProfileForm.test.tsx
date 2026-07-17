import { fireEvent, render, screen } from '@testing-library/react';
import TruckProfileForm from '../TruckProfileForm';

test('captures detailed truck identity, operations and administrator-only costs', () => {
  render(<TruckProfileForm showFinancials onSave={jest.fn()} onCancel={jest.fn()} />);

  expect(screen.getByLabelText(/Registration/)).toBeInTheDocument();
  expect(screen.getByLabelText(/Truck name/)).toBeInTheDocument();
  expect(screen.getByLabelText('Payload capacity (kg)')).toBeInTheDocument();
  expect(screen.getByLabelText('Purchase price')).toBeInTheDocument();
  expect(screen.getByLabelText('Cost per kilometre')).toBeInTheDocument();
});

test('does not render financial inputs for operational users', () => {
  render(<TruckProfileForm showFinancials={false} onSave={jest.fn()} onCancel={jest.fn()} />);

  expect(screen.getByLabelText(/Registration/)).toBeInTheDocument();
  expect(screen.queryByLabelText('Purchase price')).not.toBeInTheDocument();
  expect(screen.queryByText('Cost model')).not.toBeInTheDocument();
});

test('requires registration, name and vehicle details before saving', () => {
  const onSave = jest.fn();
  render(<TruckProfileForm showFinancials onSave={onSave} onCancel={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Save truck' }));

  expect(onSave).not.toHaveBeenCalled();
  expect(screen.getByText('Enter the truck registration.')).toBeInTheDocument();
});
