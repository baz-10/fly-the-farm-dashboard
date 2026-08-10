import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import GettingStarted from '../pages/GettingStarted';

const mockNavigate = jest.fn();
const mockRead = jest.fn();

jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }), { virtual: true });
jest.mock('../services/gettingStartedApi', () => ({ gettingStartedApi: { read: () => mockRead() } }));
jest.mock('../components/AddressAutocomplete', () => () => <div>Address search</div>);

const projection = {
  organisation: { id: 'organisation-1', name: 'Western Downs Aerial Application', displayName: 'Western Downs Aerial Application' },
  base: {
    id: 'base-1', name: 'Dalby Base', address: '1 Airstrip Road, Dalby QLD 4405', timezone: 'Australia/Brisbane',
    latitude: -27.1817, longitude: 151.2621, addressSource: 'ADDRESS_SEARCH', locationConfirmedAt: null,
    rowVersion: 4, createdAt: '2026-08-09T00:00:00.000Z', updatedAt: '2026-08-09T00:00:00.000Z',
  },
  operationalReadiness: {
    state: 'GETTING_STARTED', headline: 'Your workspace is taking shape', summary: 'Complete the remaining essentials.',
    missionAuthorisationClaim: false, completedSteps: 1, requiredSteps: 9, requiredActions: [], advisories: [], primaryAction: null,
    personnel: { state: 'NOT_RECORDED', headline: 'Personnel is not recorded yet', reason: 'Add eligible Personnel.', route: '/personnel' },
  },
  nextAction: { code: 'CONFIRM_BASE', label: 'Confirm your Base', route: '/getting-started#base', stepCode: 'BASE' },
  steps: [{
    code: 'BASE', label: 'Base', state: 'NEEDS_ATTENTION', summary: 'Confirm the address and map location for your Base.', count: 1, optional: false,
    action: { code: 'CONFIRM_BASE', label: 'Confirm your Base', route: '/getting-started#base' },
  }],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRead.mockResolvedValue(projection);
});

test('moves focus to the stable Base confirmation landmark after CONFIRM_BASE navigation', async () => {
  render(<GettingStarted />);

  const recommendation = await screen.findByRole('region', { name: 'Recommended next action' });
  const action = await within(recommendation)
    .findByRole('button', { name: 'Confirm your Base' });
  fireEvent.click(action);

  const heading = document.getElementById('confirm-base-heading');
  expect(mockNavigate).toHaveBeenCalledWith('/getting-started#base');
  expect(heading).not.toBeNull();
  expect(heading).toHaveFocus();
});
