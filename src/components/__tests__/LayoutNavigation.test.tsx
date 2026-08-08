import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import Layout from '../Layout';

jest.mock('@mui/material', () => ({
  ...jest.requireActual('@mui/material'),
  useMediaQuery: () => mockIsDesktop,
}));

let mockPathname = '/';
let mockIsDesktop = false;
let mockEntitlements: string[] = [];
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

test('shows Beta beside classified Weather and Chemical surfaces, without cluttering Operationally Ready destinations', () => {
  const weather = renderLayout('/weather');
  expect(screen.getByLabelText('Beta')).toBeInTheDocument();

  weather.unmount();
  const aircraft = renderLayout('/aircraft');
  expect(screen.queryByLabelText('Beta')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Coming Soon')).not.toBeInTheDocument();

  aircraft.unmount();
  openNavigation('/database');
  const database = screen.getByRole('button', { name: 'Chemical Database' });
  expect(within(database).getByLabelText('Beta')).toBeVisible();
});

test('keeps Coming Soon destinations discoverable and uses the same maturity state in mobile navigation', () => {
  mockEntitlements = ['legacyAskFtf'];
  openNavigation('/ask-ftf');

  const intelligence = screen.getByRole('button', { name: 'Operational Intelligence' });
  expect(intelligence).toBeVisible();
  expect(within(intelligence).getByLabelText('Coming Soon')).toBeVisible();
  expect(screen.queryByText(/Legacy/i)).not.toBeInTheDocument();
});

test('collapsed desktop tooltips describe maturity once and retain standalone Home', async () => {
  mockIsDesktop = true;
  renderLayout('/database');

  const database = screen.getByRole('button', { name: 'Chemical Database' });
  fireEvent.mouseOver(database);

  expect(await screen.findByRole('tooltip')).toHaveTextContent('Chemical Database — Beta');
  expect(screen.getByRole('button', { name: 'Home' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'HOME navigation group' })).not.toBeInTheDocument();
});
