import React from 'react';
import { render, screen } from '@testing-library/react';
import { AuthorisedProductRoute } from '../AuthorisedProductRoute';

let mockAuth: any;
let mockPathname = '/';

jest.mock('../../../contexts/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('../../../services/fieldManagementStore', () => ({ setCurrentUser: jest.fn() }));
jest.mock('react-router-dom', () => ({
  Navigate: ({ to }: { to: string }) => <div>Redirected to {to}</div>,
  useLocation: () => ({ pathname: mockPathname, search: '' }),
}), { virtual: true });

const user = (role: string, entitlements: string[] = []) => ({
  id: `${role}-1`, email: `${role}@example.com`, name: role, role, tier: 'pro', entitlements,
});

function renderRoute(path: string, route: React.ReactElement) {
  mockPathname = path;
  return render(route);
}

beforeEach(() => {
  mockAuth = { isAuthenticated: true, isLoading: false, user: user('contractor') };
});

test.each(['production_beta_acceptance', 'client'])(
  'denies a direct Coming Soon URL to the unauthorised %s role before revealing its destination',
  async role => {
    mockAuth.user = user(role);
    renderRoute('/quotes', (
      <AuthorisedProductRoute allowedRoles={['admin', 'contractor']}>
        <button type="button">Create quote</button>
      </AuthorisedProductRoute>
    ));

    expect(await screen.findByText('Redirected to /')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Quotes' })).not.toBeInTheDocument();
    expect(screen.queryByText('Coming Soon')).not.toBeInTheDocument();
  }
);

test('denies a manipulated entitlement route before revealing its Coming Soon destination', async () => {
  mockAuth.user = user('admin');
  renderRoute('/ask-ftf', (
    <AuthorisedProductRoute allowedRoles={['admin', 'contractor']} requiredEntitlement="legacyAskFtf">
      <button type="button">Run intelligence request</button>
    </AuthorisedProductRoute>
  ));

  expect(await screen.findByText('Redirected to /')).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Operational Intelligence' })).not.toBeInTheDocument();
  expect(screen.queryByText('Coming Soon')).not.toBeInTheDocument();
});

test('keeps an authorised Beta route usable with its maturity presentation', async () => {
  renderRoute('/weather', (
    <AuthorisedProductRoute allowedRoles={['admin', 'contractor']}>
      <button type="button">Refresh weather</button>
    </AuthorisedProductRoute>
  ));

  expect(await screen.findByLabelText('Beta')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Refresh weather' })).toBeEnabled();
});

test('presents maturity only after an authorised route guard succeeds', async () => {
  renderRoute('/quotes', (
    <AuthorisedProductRoute allowedRoles={['admin', 'contractor']}>
      <button type="button">Create quote</button>
    </AuthorisedProductRoute>
  ));

  expect(await screen.findByRole('heading', { name: 'Quotes' })).toBeVisible();
  expect(screen.getByText('Coming Soon')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Create quote' })).not.toBeInTheDocument();
});
