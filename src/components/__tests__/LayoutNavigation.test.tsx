import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import Layout from '../Layout';

const betaExplanation = 'This feature is available during Private Commercial Beta and is still being refined.';

jest.mock('@mui/material', () => ({
  ...jest.requireActual('@mui/material'),
  useMediaQuery: () => mockIsDesktop,
}));

let mockPathname = '/';
let mockIsDesktop = false;
let mockEntitlements: string[] = [];
const mockGettingStartedRead = jest.fn();
jest.mock('react-router-dom', () => ({
  Outlet: () => <div>Page</div>,
  useLocation: () => ({ pathname: mockPathname, search: '' }),
  useNavigate: () => jest.fn(),
}), { virtual: true });

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'operator@example.com', name: 'Operator', role: 'admin', tier: 'pro', entitlements: mockEntitlements },
    logout: jest.fn(),
  }),
}));

jest.mock('../../services/gettingStartedApi', () => ({
  gettingStartedApi: { read: () => mockGettingStartedRead() },
}));

function renderLayout(pathname = '/jobs/client/client-1/property/property-1') {
  mockPathname = pathname;
  return render(<Layout />);
}

function openNavigation(pathname = '/jobs/client/client-1/property/property-1') {
  renderLayout(pathname);
  fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
}

beforeEach(() => {
  mockIsDesktop = false;
  mockEntitlements = [];
  mockGettingStartedRead.mockReset();
  mockGettingStartedRead.mockReturnValue(new Promise(() => {}));
});

test('shows contextual Getting Started for incomplete onboarding without hiding the main navigation', async () => {
  mockGettingStartedRead.mockResolvedValue({ steps: [{ code: 'BASE', optional: false, state: 'NEEDS_ATTENTION' }] });
  openNavigation('/jobs');

  const navigation = screen.getByRole('navigation', { name: 'Organisation navigation' });
  fireEvent.click(within(navigation).getByRole('button', { name: 'ORGANISATION navigation group' }));
  expect(await within(navigation).findByRole('button', { name: 'Getting Started' })).toBeVisible();
  expect(within(navigation).getByRole('button', { name: 'Home' })).toBeVisible();
  expect(within(navigation).getByRole('button', { name: 'CLIENTS navigation group' })).toBeVisible();
  expect(within(navigation).getByRole('button', { name: 'OPERATIONS navigation group' })).toBeVisible();
});

test('removes only the contextual Getting Started entry when authoritative onboarding is complete', async () => {
  mockGettingStartedRead.mockResolvedValue({ steps: [{ code: 'MISSION', optional: false, state: 'COMPLETE' }] });
  openNavigation('/jobs');

  await act(async () => { await Promise.resolve(); });
  const navigation = screen.getByRole('navigation', { name: 'Organisation navigation' });
  fireEvent.click(within(navigation).getByRole('button', { name: 'ORGANISATION navigation group' }));
  expect(within(navigation).queryByRole('button', { name: 'Getting Started' })).not.toBeInTheDocument();
  expect(within(navigation).getByRole('button', { name: 'Home' })).toBeVisible();
  expect(within(navigation).getByRole('button', { name: 'CLIENTS navigation group' })).toBeVisible();
});

test('active CLIENTS group opens and exposes all client resources in the mobile drawer', () => {
  renderLayout();
  fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));

  const clientsToggle = screen.getByRole('button', { name: 'CLIENTS navigation group' });
  expect(clientsToggle).toHaveAttribute('aria-expanded', 'true');
  const navigation = screen.getByRole('navigation', { name: 'Organisation navigation' });
  expect(within(navigation).getByRole('button', { name: 'Clients' })).toBeVisible();
  expect(within(navigation).getByRole('button', { name: 'Properties' })).toBeVisible();
  expect(within(navigation).getByRole('button', { name: 'Fields' })).toBeVisible();
  expect(within(navigation).getByRole('button', { name: 'Jobs' })).toBeVisible();
});

test('navigation groups expand through normal button interaction', () => {
  renderLayout('/');
  fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
  const complianceToggle = screen.getByRole('button', { name: 'COMPLIANCE navigation group' });
  expect(complianceToggle).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(complianceToggle);
  expect(complianceToggle).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('button', { name: 'CASA Compliance' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Checklists' })).toBeVisible();
});

test('Home is a permanent standalone action outside every accordion group', () => {
  renderLayout('/');
  fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));

  const navigation = screen.getByRole('navigation', { name: 'Organisation navigation' });
  const home = within(navigation).getByRole('button', { name: 'Home' });
  expect(home).toBeVisible();
  expect(home).toHaveAttribute('aria-current', 'page');
  expect(within(navigation).queryByRole('button', { name: 'HOME navigation group' })).not.toBeInTheDocument();
  expect(within(navigation).getAllByRole('button', { name: 'Home' })).toHaveLength(1);
});

test('Home remains visible when every accordion group is collapsed', () => {
  renderLayout('/jobs');
  fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
  const clients = screen.getByRole('button', { name: 'CLIENTS navigation group' });
  fireEvent.click(clients);
  expect(clients).toHaveAttribute('aria-expanded', 'false');
  expect(screen.getByRole('button', { name: 'Home' })).toBeVisible();
});

test('shows navigation maturity beside Chemical without cluttering Operationally Ready destinations', () => {
  const aircraft = renderLayout('/aircraft');
  expect(screen.queryByLabelText('Beta')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Coming Soon')).not.toBeInTheDocument();

  aircraft.unmount();
  openNavigation('/database');
  const database = screen.getByRole('button', { name: 'Chemical Database' });
  expect(within(database).getByLabelText('Beta')).toBeVisible();
  expect(database).toHaveAccessibleName('Chemical Database');
  expect(database).toHaveAccessibleDescription(betaExplanation);
  expect(within(database).getByLabelText('Beta')).not.toHaveAttribute('tabindex', '0');
});

test('keeps Coming Soon destinations discoverable and uses the same maturity state in mobile navigation', () => {
  mockEntitlements = ['legacyAskFtf'];
  openNavigation('/ask-ftf');

  const intelligence = screen.getByRole('button', { name: 'Operational Intelligence' });
  expect(intelligence).toBeVisible();
  expect(intelligence).toHaveAccessibleName('Operational Intelligence');
  expect(intelligence).toHaveAccessibleDescription('This feature will be available in a future release.');
  expect(within(intelligence).getByLabelText('Coming Soon')).toBeVisible();
  expect(within(intelligence).getByLabelText('Coming Soon')).not.toHaveAttribute('tabindex', '0');
  expect(screen.queryByText(/Legacy/i)).not.toBeInTheDocument();
});

test('collapsed desktop keyboard focus provides the full approved Beta explanation once', async () => {
  mockIsDesktop = true;
  renderLayout('/database');

  const database = screen.getByRole('button', { name: 'Chemical Database' });
  expect(database).toHaveAccessibleName('Chemical Database');
  expect(database).toHaveAccessibleDescription(`Chemical Database — ${betaExplanation}`);
  act(() => database.focus());

  const tooltip = await screen.findByRole('tooltip');
  expect(tooltip).toHaveTextContent(`Chemical Database — ${betaExplanation}`);
  expect(tooltip).toHaveAttribute('id');
  expect(database).toHaveAttribute('aria-describedby', tooltip.id);
  expect(screen.getAllByRole('tooltip')).toHaveLength(1);
  expect(within(database).queryByLabelText('Beta')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Home' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'HOME navigation group' })).not.toBeInTheDocument();
});

test('expanded mobile navigation groups expose maturity through the item description without adding a nested tab stop', () => {
  openNavigation('/database');

  const intelligenceGroup = screen.getByRole('button', { name: 'INTELLIGENCE navigation group' });
  expect(intelligenceGroup).toHaveAttribute('aria-expanded', 'true');
  const database = screen.getByRole('button', { name: 'Chemical Database' });
  expect(database).toHaveAccessibleName('Chemical Database');
  expect(database).toHaveAccessibleDescription(betaExplanation);
  expect(within(database).queryByRole('button')).not.toBeInTheDocument();
});
