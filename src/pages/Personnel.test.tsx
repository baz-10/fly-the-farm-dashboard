import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Personnel from './Personnel';

const record = {
  id: 'person-1', rowVersion: 1, fullName: 'Alex Operator', engagementStatus: 'employee', isActive: true,
  operatingLocationIds: ['location-1'], operationalRoles: ['pilot'], internalUserId: null, arn: null, credentials: [],
};
const mockSecondRecord = {
  ...record, id: 'person-2', fullName: 'Sam Loader', internalUserId: 'member-2',
};
let mockOperationalMode = 'remote';
let mockCredentialMaturity = 'BETA';
let mockSearchParams = new URLSearchParams();
const mockNavigate = jest.fn();
const mockCreate = jest.fn();

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useSearchParams: () => [mockSearchParams],
}), { virtual: true });

jest.mock('../contexts/OperationalDataContext', () => ({
  useOperationalData: () => ({ mode: mockOperationalMode, operatingLocations: [{ id: 'location-1', name: 'Farm' }] }),
}));
jest.mock('../services/personnelApi', () => ({
  PersonnelApiError: class PersonnelApiError extends Error {},
  createPersonnelApi: () => ({ list: jest.fn().mockResolvedValue([record, mockSecondRecord]), create: mockCreate }),
}));
jest.mock('../services/personnelIdentityApi', () => ({ createPersonnelIdentityApi: () => ({}) }));
jest.mock('../services/operationalApi', () => ({
  createOperationalApi: () => ({ session: jest.fn().mockResolvedValue({ permissions: [] }) }),
}));
jest.mock('../productMaturity/registry', () => {
  const actual = jest.requireActual('../productMaturity/registry');
  return {
    ...actual,
    getMaturityEntry: (moduleCode: string, workflowCode?: string) => {
      const entry = actual.getMaturityEntry(moduleCode, workflowCode);
      return moduleCode === 'personnel' && workflowCode === 'casa-credentials'
        ? { ...entry, maturity: mockCredentialMaturity }
        : entry;
    },
    getWorkflowMaturityEntry: (moduleCode: string, workflowCode: string) => {
      const entry = actual.getWorkflowMaturityEntry(moduleCode, workflowCode);
      return moduleCode === 'personnel' && workflowCode === 'casa-credentials'
        ? { ...entry, maturity: mockCredentialMaturity }
        : entry;
    },
  };
});
jest.mock('../components/personnel/PersonnelCredentialEditor', () => () => <button type="button">Add CASA credential</button>);
jest.mock('../components/personnel/PersonnelIdentityLinker', () => () => <button type="button">Link identity</button>);

test('marks the CASA credentials workflow Beta without downgrading the Personnel workspace', async () => {
  mockOperationalMode = 'remote';
  mockCredentialMaturity = 'BETA';
  render(<Personnel />);

  expect(await screen.findByText('Alex Operator')).toBeVisible();
  expect(screen.getByText('Sam Loader')).toBeVisible();
  expect(screen.getAllByLabelText('Beta')).toHaveLength(1);
  expect(screen.getAllByRole('button', { name: 'Add CASA credential' })).toHaveLength(2);
  expect(screen.getAllByRole('button', { name: 'Link identity' })).toHaveLength(2);
});

test('keeps identity linking available when the CASA credentials boundary is unavailable', async () => {
  mockOperationalMode = 'remote';
  mockCredentialMaturity = 'COMING_SOON';
  render(<Personnel />);

  expect(await screen.findByText('Alex Operator')).toBeVisible();
  expect(screen.getByText('Sam Loader')).toBeVisible();
  expect(screen.getAllByRole('region', { name: 'Personnel CASA Credentials' })).toHaveLength(1);
  expect(screen.getAllByRole('heading', { name: 'Personnel CASA Credentials' })).toHaveLength(1);
  expect(document.querySelectorAll('#personnel-casa-credentials-coming-soon')).toHaveLength(1);
  expect(screen.queryByRole('button', { name: 'Add CASA credential' })).not.toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'Link identity' })).toHaveLength(2);
});

test('uses customer-safe availability wording outside the Production Beta backend', () => {
  mockOperationalMode = 'local';
  render(<Personnel />);

  expect(screen.getByRole('alert')).toHaveTextContent('Personnel records are unavailable in this environment.');
  expect(screen.getByRole('alert')).not.toHaveTextContent(/legacy/i);
});

test('returns to Getting Started only after an authoritative Personnel save', async () => {
  mockOperationalMode = 'remote';
  mockSearchParams = new URLSearchParams('onboarding=personnel&returnTo=%2Fgetting-started');
  mockCreate.mockResolvedValue(record);
  render(<Personnel />);

  await screen.findByText('Alex Operator');
  fireEvent.change(screen.getByRole('textbox', { name: 'Full name' }), { target: { value: 'Taylor Observer' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create Personnel' }));
  await waitFor(() => expect(mockCreate).toHaveBeenCalled());
  fireEvent.click(await screen.findByRole('button', { name: 'Return to Getting Started' }));
  expect(mockNavigate).toHaveBeenCalledWith('/getting-started');
});
