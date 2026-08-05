import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import Layout from '../Layout';

jest.mock('@mui/material', () => ({
  ...jest.requireActual('@mui/material'),
  useMediaQuery: () => false,
}));

let mockPathname = '/';
jest.mock('react-router-dom', () => ({
  Outlet: () => <div>Page</div>,
  useLocation: () => ({ pathname: mockPathname, search: '' }),
  useNavigate: () => jest.fn(),
}), { virtual: true });

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'operator@example.com', name: 'Operator', role: 'admin', tier: 'pro', entitlements: [] },
    logout: jest.fn(),
  }),
}));

function renderLayout(pathname = '/jobs/client/client-1/property/property-1') {
  mockPathname = pathname;
  return render(<Layout />);
}

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
