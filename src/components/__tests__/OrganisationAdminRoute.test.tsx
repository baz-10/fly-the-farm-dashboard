import React from 'react';
import { render, screen } from '@testing-library/react';
import OrganisationAdminRoute from '../OrganisationAdminRoute';

let mockUser: any;

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser }),
}));

jest.mock('react-router-dom', () => ({
  Navigate: ({ to }: { to: string }) => <div>Redirected to {to}</div>,
}), { virtual: true });

beforeEach(() => {
  mockUser = { id: 'admin-1', role: 'admin', identityPlane: 'organisation' };
});

test('admits an Organisation Administrator to ordinary organisation onboarding', () => {
  render(<OrganisationAdminRoute><div>Getting Started workspace</div></OrganisationAdminRoute>);

  expect(screen.getByText('Getting Started workspace')).toBeInTheDocument();
  expect(screen.queryByText(/Redirected/)).not.toBeInTheDocument();
});

test('denies delegated Platform support even when generic role guards would admit support', () => {
  mockUser = {
    id: 'platform-1', role: 'platform', identityPlane: 'platform',
    delegatedSupport: { sessionId: 'support-1', organisationId: 'organisation-1' },
  };

  render(<OrganisationAdminRoute><div>Getting Started workspace</div></OrganisationAdminRoute>);

  expect(screen.queryByText('Getting Started workspace')).not.toBeInTheDocument();
  expect(screen.getByText('Redirected to /')).toBeInTheDocument();
});

test('denies non-admin organisation members', () => {
  mockUser = { id: 'contractor-1', role: 'contractor', identityPlane: 'organisation' };

  render(<OrganisationAdminRoute><div>Getting Started workspace</div></OrganisationAdminRoute>);

  expect(screen.getByText('Redirected to /')).toBeInTheDocument();
});
