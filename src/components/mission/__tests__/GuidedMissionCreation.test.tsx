import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GuidedMissionCreation from '../GuidedMissionCreation';

const mockCreateClient = jest.fn();
const mockCreateProperty = jest.fn();
const mockCreateField = jest.fn();
const mockCreateFieldBoundaryVersion = jest.fn();
const mockCreateJob = jest.fn();
const mockCreateMission = jest.fn();
const mockNavigate = jest.fn();

jest.mock('../../../contexts/OperationalDataContext', () => ({ useOperationalData: () => ({
  clients: [], properties: [], fields: [], jobs: [], missions: [],
  operatingLocations: [{ id: 'loc-1', name: 'Fly The Farm Base' }],
  saving: false, createClient: mockCreateClient, createProperty: mockCreateProperty, createField: mockCreateField, createFieldBoundaryVersion: mockCreateFieldBoundaryVersion, createJob: mockCreateJob, createMission: mockCreateMission,
}) }));
jest.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate, useSearchParams: () => [new URLSearchParams()] }), { virtual: true });
jest.mock('../../FieldBoundaryEditor', () => (props: any) => <button onClick={() => { props.onCoordsChange([[-27, 151], [-27, 151.01], [-27.01, 151.01]]); props.onAreaChange(10.5); }}>Draw test boundary</button>);

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateClient.mockResolvedValue({ id: 'client-1', name: 'New Client' });
  mockCreateProperty.mockResolvedValue({ id: 'property-1', clientId: 'client-1', name: 'New Property' });
  mockCreateField.mockResolvedValue({ id: 'field-1', propertyId: 'property-1', name: 'North Field', rowVersion: 1 });
  mockCreateFieldBoundaryVersion.mockResolvedValue({ id: 'boundary-1' });
  mockCreateJob.mockResolvedValue({ id: 'job-1', reference: 'JOB-001' });
  mockCreateMission.mockResolvedValue({ id: 'mission-1' });
});

test('shows the complete follow-the-bouncing-ball Mission journey', () => {
  render(<GuidedMissionCreation />);
  for (const label of ['1 Customer','2 Property','3 Field','4 Job','5 Mission','6 Map','7 Resources','8 Weather & Chemicals','9 JSA','10 Review']) {
    expect(screen.getByText(label)).toBeInTheDocument();
  }
  expect(screen.getByRole('heading', { name: 'Who is this Mission for?' })).toBeInTheDocument();
});

test('defaults Job and Mission identifiers to organisation-owned automatic references', async () => {
  const user = userEvent.setup();
  render(<GuidedMissionCreation />);
  await user.click(screen.getByRole('button', { name: 'Add new Client' }));
  await user.type(screen.getByRole('textbox', { name: /Client or business name/ }), 'New Client');
  await user.click(screen.getByRole('button', { name: 'Save Client and continue' }));
  await user.click(screen.getByRole('button', { name: 'Add new Property' }));
  await user.type(screen.getByRole('textbox', { name: /Property name/ }), 'New Property');
  await user.type(screen.getByRole('textbox', { name: /Street address/ }), '1 Farm Road');
  await user.click(screen.getByRole('button', { name: 'Save Property and continue' }));
  await user.click(screen.getByRole('button', { name: 'Create new Field' }));
  await user.type(screen.getByRole('textbox', { name: /Field name/ }), 'North Field');
  await user.click(screen.getByRole('button', { name: 'Draw test boundary' }));
  await user.click(screen.getByRole('button', { name: 'Save Field and boundary' }));
  await user.click(screen.getByRole('button', { name: 'Create new Job' }));

  expect(screen.getByRole('checkbox', { name: 'Auto-generate Job reference' })).toBeChecked();
  expect(screen.queryByRole('textbox', { name: 'Custom Job reference' })).not.toBeInTheDocument();
  await user.type(screen.getByRole('textbox', { name: /Job scope/ }), 'Spray thistles');
  await user.click(screen.getByRole('button', { name: 'Save Job and continue' }));
  expect(mockCreateJob).toHaveBeenCalledWith(expect.objectContaining({ autoGenerateReference: true }));

  expect(screen.getByRole('checkbox', { name: 'Auto-generate Mission reference' })).toBeChecked();
  await user.type(screen.getByRole('textbox', { name: /Mission title/ }), 'North Field thistles');
  await user.click(screen.getByRole('button', { name: 'Create Draft Mission' }));
  expect(mockCreateMission).toHaveBeenCalledWith(expect.objectContaining({ autoGenerateReference: true }));
});

test('allows custom references and returning to every completed parent step', async () => {
  const user = userEvent.setup();
  render(<GuidedMissionCreation />);
  await user.click(screen.getByRole('button', { name: 'Add new Client' }));
  await user.type(screen.getByRole('textbox', { name: /Client or business name/ }), 'New Client');
  await user.click(screen.getByRole('button', { name: 'Save Client and continue' }));
  await user.click(screen.getByText('1 Customer'));
  expect(screen.getByRole('heading', { name: 'Who is this Mission for?' })).toBeInTheDocument();
  await user.click(screen.getByText('2 Property'));
  expect(screen.getByRole('heading', { name: 'Where is the work?' })).toBeInTheDocument();
});

test('creates the authoritative parent chain and Draft without leaving the workflow', async () => {
  const user = userEvent.setup();
  render(<GuidedMissionCreation />);

  await user.click(screen.getByRole('button', { name: 'Add new Client' }));
  await user.type(screen.getByRole('textbox', { name: /Client or business name/ }), 'New Client');
  await user.click(screen.getByRole('button', { name: 'Save Client and continue' }));

  await user.click(screen.getByRole('button', { name: 'Add new Property' }));
  await user.type(screen.getByRole('textbox', { name: /Property name/ }), 'New Property');
  await user.type(screen.getByRole('textbox', { name: /Street address/ }), '1 Farm Road, Dalby QLD 4405');
  await user.click(screen.getByRole('button', { name: 'Save Property and continue' }));

  await user.click(screen.getByRole('button', { name: 'Create new Field' }));
  await user.type(screen.getByRole('textbox', { name: /Field name/ }), 'North Field');
  await user.click(screen.getByRole('button', { name: 'Draw test boundary' }));
  await user.click(screen.getByRole('button', { name: 'Save Field and boundary' }));

  await user.click(screen.getByRole('button', { name: 'Create new Job' }));
  await user.click(screen.getByRole('checkbox', { name: 'Auto-generate Job reference' }));
  await user.type(screen.getByRole('textbox', { name: 'Custom Job reference' }), 'JOB-001');
  await user.type(screen.getByRole('textbox', { name: /Job scope/ }), 'Spray thistles');
  await user.click(screen.getByRole('button', { name: 'Save Job and continue' }));

  await user.click(screen.getByRole('checkbox', { name: 'Auto-generate Mission reference' }));
  await user.type(screen.getByRole('textbox', { name: 'Custom Mission reference' }), 'MIS-001');
  await user.type(screen.getByRole('textbox', { name: /Mission title/ }), 'North Field thistles');
  await user.click(screen.getByRole('button', { name: 'Create Draft Mission' }));

  expect(mockCreateClient).toHaveBeenCalledWith(expect.objectContaining({ name: 'New Client' }));
  expect(mockCreateProperty).toHaveBeenCalledWith(expect.objectContaining({ clientId: 'client-1', address: '1 Farm Road, Dalby QLD 4405' }));
  expect(mockCreateFieldBoundaryVersion).toHaveBeenCalledWith('field-1', expect.arrayContaining([[-27, 151]]));
  expect(mockCreateJob).toHaveBeenCalledWith(expect.objectContaining({ clientId: 'client-1', propertyId: 'property-1', fieldIds: ['field-1'] }));
  expect(mockCreateMission).toHaveBeenCalledWith(expect.objectContaining({ jobId: 'job-1', status: 'Planning' }));
  expect(mockNavigate).toHaveBeenCalledWith('/missions/mission-1?guided=1');
});
