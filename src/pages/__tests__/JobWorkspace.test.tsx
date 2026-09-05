import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import JobWorkspace from '../JobWorkspace';

const mockNavigate = jest.fn();
const mockOperational = {
  status: 'ready',
  clients: [{ id: 'client-1', name: 'North Farm' }],
  properties: [
    { id: 'property-1', clientId: 'client-1', name: 'Home Block' },
    { id: 'property-2', clientId: 'client-1', name: 'River Flats' },
  ],
  fields: [
    { id: 'field-1', propertyId: 'property-1', name: 'North 40', sizeHa: 20.5 },
    { id: 'field-2', propertyId: 'property-2', name: 'River Block', sizeHa: 32.2 },
  ],
  jobs: [], missions: [],
};

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useSearchParams: () => [new URLSearchParams()],
}), { virtual: true });
jest.mock('../../contexts/OperationalDataContext', () => ({ useOperationalData: () => mockOperational }));

beforeEach(() => mockNavigate.mockReset());

test('carries a multi-property Field scope into the Job form while retaining a primary compatibility route', async () => {
  const user = userEvent.setup();
  render(<JobWorkspace />);
  await user.click(screen.getAllByRole('button', { name: 'Add Job' })[0]);
  fireEvent.change(screen.getByRole('combobox', { name: 'Client' }), { target: { value: 'client-1' } });
  await user.click(screen.getByRole('checkbox', { name: 'North 40' }));
  await user.click(screen.getByRole('button', { name: 'Add fields from another Property' }));
  await user.click(screen.getByRole('checkbox', { name: 'River Block' }));
  expect(screen.getByText('2 Properties · 2 Fields · 52.7000 ha')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Continue to Job details' }));

  expect(mockNavigate).toHaveBeenCalledWith('/jobs/client/client-1/property/property-1/field/field-1/new-job?fieldIds=field-1%2Cfield-2');
});
