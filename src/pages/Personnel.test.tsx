import React from 'react';
import { render, screen } from '@testing-library/react';
import Personnel from './Personnel';

const record = {
  id: 'person-1', rowVersion: 1, fullName: 'Alex Operator', engagementStatus: 'employee', isActive: true,
  operatingLocationIds: ['location-1'], operationalRoles: ['pilot'], internalUserId: null, arn: null, credentials: [],
};
let mockOperationalMode = 'remote';

jest.mock('../contexts/OperationalDataContext', () => ({
  useOperationalData: () => ({ mode: mockOperationalMode, operatingLocations: [{ id: 'location-1', name: 'Farm' }] }),
}));
jest.mock('../services/personnelApi', () => ({
  PersonnelApiError: class PersonnelApiError extends Error {},
  createPersonnelApi: () => ({ list: jest.fn().mockResolvedValue([record]) }),
}));
jest.mock('../services/personnelIdentityApi', () => ({ createPersonnelIdentityApi: () => ({}) }));
jest.mock('../services/operationalApi', () => ({
  createOperationalApi: () => ({ session: jest.fn().mockResolvedValue({ permissions: [] }) }),
}));
jest.mock('../components/personnel/PersonnelCredentialEditor', () => () => <button type="button">Add CASA credential</button>);
jest.mock('../components/personnel/PersonnelIdentityLinker', () => () => <button type="button">Link identity</button>);

test('marks the CASA credentials workflow Beta without downgrading the Personnel workspace', async () => {
  mockOperationalMode = 'remote';
  render(<Personnel />);

  expect(await screen.findByText('Alex Operator')).toBeVisible();
  expect(screen.getByLabelText('Beta')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Add CASA credential' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Link identity' })).toBeEnabled();
});

test('uses customer-safe availability wording outside the Production Beta backend', () => {
  mockOperationalMode = 'local';
  render(<Personnel />);

  expect(screen.getByRole('alert')).toHaveTextContent('Personnel records are unavailable in this environment.');
  expect(screen.getByRole('alert')).not.toHaveTextContent(/legacy/i);
});
