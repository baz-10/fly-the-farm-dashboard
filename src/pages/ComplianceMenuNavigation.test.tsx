import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from '../../node_modules/react-router-dom/dist/index.js';
import ComplianceMenu from './ComplianceMenu';
import { AuthorisedProductRoute } from '../components/productMaturity/AuthorisedProductRoute';

let mockAuth: any;

jest.mock('react-router', () => {
  const { TextDecoder, TextEncoder } = require('util');
  Object.assign(global, { TextDecoder, TextEncoder });
  return require('../../node_modules/react-router/dist/development/index.js');
}, { virtual: true });
jest.mock('react-router/dom', () => require('../../node_modules/react-router/dist/development/dom-export.js'), { virtual: true });
jest.mock('react-router-dom', () => require('../../node_modules/react-router-dom/dist/index.js'), { virtual: true });
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('../services/fieldManagementStore', () => ({ setCurrentUser: jest.fn() }));

const user = (role: string) => ({
  id: `${role}-1`, email: `${role}@example.com`, name: role, role, tier: 'pro', entitlements: [],
});

function BrowserLocalCompliance() {
  window.localStorage.setItem('browser-local-compliance-mounted', 'true');
  return <button type="button">Write local compliance record</button>;
}

function ComplianceRoutes({ initialPath, role }: { initialPath: string; role: string }) {
  mockAuth = { isAuthenticated: true, isLoading: false, user: user(role) };
  return (
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/" element={<div>Home redirect</div>} />
        <Route path="/compliance/library" element={<ComplianceMenu />} />
        {['transport', 'safety'].map(area => (
          <Route
            key={area}
            path={`/compliance/${area}`}
            element={(
              <AuthorisedProductRoute allowedRoles={['admin', 'contractor']}>
                <BrowserLocalCompliance />
              </AuthorisedProductRoute>
            )}
          />
        ))}
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => window.localStorage.clear());

test.each([
  ['Chemical Transport & Storage', 'Transport and Storage'],
  ['Safety & PPE Compliance', 'Safety and PPE'],
])('opens the guarded availability route from the discoverable %s card without mounting its local workflow', async (cardName, heading) => {
  render(<ComplianceRoutes initialPath="/compliance/library" role="contractor" />);

  const card = screen.getByRole('button', { name: new RegExp(cardName) });
  expect(card).toBeEnabled();
  fireEvent.click(card);

  expect(await screen.findByRole('heading', { name: heading })).toBeVisible();
  expect(screen.getByText('Coming Soon')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Write local compliance record' })).not.toBeInTheDocument();
  expect(window.localStorage.getItem('browser-local-compliance-mounted')).toBeNull();
});

test.each(['client', 'production_beta_acceptance'])('denies direct compliance workflow navigation for the unauthorised %s role before availability disclosure', async role => {
  render(<ComplianceRoutes initialPath="/compliance/transport" role={role} />);

  expect(await screen.findByText('Home redirect')).toBeVisible();
  expect(screen.queryByText('Coming Soon')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Write local compliance record' })).not.toBeInTheDocument();
  expect(window.localStorage.getItem('browser-local-compliance-mounted')).toBeNull();
});
