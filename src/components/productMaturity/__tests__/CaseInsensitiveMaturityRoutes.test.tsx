import React from 'react';
import { render, screen } from '@testing-library/react';
// The installed v7 package advertises a missing CommonJS `main`; importing its
// real distribution entry keeps this integration test on React Router itself.
import { MemoryRouter, Route, Routes } from '../../../../node_modules/react-router-dom/dist/index.js';
import { AuthorisedProductRoute } from '../AuthorisedProductRoute';
import Admin from '../../../pages/Admin';

let mockAuth: any;

jest.mock('react-router', () => {
  const { TextDecoder, TextEncoder } = require('util');
  Object.assign(global, { TextDecoder, TextEncoder });
  return require('../../../../node_modules/react-router/dist/development/index.js');
}, { virtual: true });
jest.mock('react-router/dom', () => require('../../../../node_modules/react-router/dist/development/dom-export.js'), { virtual: true });
jest.mock('react-router-dom', () => require('../../../../node_modules/react-router-dom/dist/index.js'), { virtual: true });
jest.mock('../../../contexts/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('../../../services/fieldManagementStore', () => ({
  setCurrentUser: jest.fn(),
  getAllContractorStats: jest.fn(() => []),
  getAllClientsUnscoped: jest.fn(() => []),
  getJobs: jest.fn(() => []),
}));
jest.mock('../../admin/OrganisationBranding', () => () => <div>Organisation Branding available</div>);
jest.mock('../../admin/OrganisationSupportAccess', () => () => <div>Organisation Assisted Support available</div>);
jest.mock('../../AuthoritativeChemicalReviews', () => () => <div>Authoritative Chemical Reviews available</div>);
jest.mock('../../AdminSourceManager', () => () => <MockBrowserLocalWorkflow />);
jest.mock('../../AdminSourceExtraction', () => () => <MockBrowserLocalWorkflow />);
jest.mock('../../AdminDocumentSourcing', () => () => <MockBrowserLocalWorkflow />);

const user = (role: string) => ({
  id: `${role}-1`, email: `${role}@example.com`, name: role, role, tier: 'pro', entitlements: [],
});

function MockBrowserLocalWorkflow() {
  window.localStorage.setItem('browser-local-workflow-mounted', 'true');
  return <button type="button">Run browser-local workflow</button>;
}

function renderProtectedPath(path: string, routePattern: string, role = 'contractor', children = <MockBrowserLocalWorkflow />) {
  mockAuth = { isAuthenticated: true, isLoading: false, user: user(role) };
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<div>Home redirect</div>} />
        <Route
          path={routePattern}
          element={(
            <AuthorisedProductRoute allowedRoles={['admin', 'contractor']}>
              {children}
            </AuthorisedProductRoute>
          )}
        />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => window.localStorage.clear());

test.each([
  ['/QUOTES', '/quotes', 'Quotes'],
  ['/Quotes', '/quotes', 'Quotes'],
  ['/FINANCIALS', '/financials', 'Financials'],
  ['/COMPLIANCE/TRANSPORT', '/compliance/transport', 'Transport and Storage'],
  ['/Compliance/Safety', '/compliance/safety', 'Safety and PPE'],
  ['/compliance/DOCUMENTATION', '/compliance/documentation', 'Documentation and Audit'],
])('authorised navigation to %s preserves the Coming Soon boundary before local code mounts', async (path, routePattern, heading) => {
  renderProtectedPath(path, routePattern);

  expect(await screen.findByRole('heading', { name: heading })).toBeVisible();
  expect(screen.getByText('Coming Soon')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Run browser-local workflow' })).not.toBeInTheDocument();
  expect(window.localStorage.getItem('browser-local-workflow-mounted')).toBeNull();
});

test.each([
  ['/%71uotes', '/quotes', 'Quotes'],
  ['/%66inancials', '/financials', 'Financials'],
  ['/%63ompliance/transport', '/compliance/transport', 'Transport and Storage'],
  ['/jobs/%69mport', '/jobs/import', 'Spray Recommendation Import'],
])('authorised encoded navigation to %s preserves the Coming Soon boundary before local code mounts', async (path, routePattern, heading) => {
  renderProtectedPath(path, routePattern);

  expect(await screen.findByRole('heading', { name: heading })).toBeVisible();
  expect(screen.getByText('Coming Soon')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Run browser-local workflow' })).not.toBeInTheDocument();
  expect(window.localStorage.getItem('browser-local-workflow-mounted')).toBeNull();
});

test.each([
  ['/QUOTES', '/quotes', 'client'],
  ['/COMPLIANCE/TRANSPORT', '/compliance/transport', 'production_beta_acceptance'],
  ['/%71uotes', '/quotes', 'production_beta_acceptance'],
])('unauthorised navigation to %s fails its role guard before maturity presentation', async (path, routePattern, role) => {
  renderProtectedPath(path, routePattern, role);

  expect(await screen.findByText('Home redirect')).toBeVisible();
  expect(screen.queryByText('Coming Soon')).not.toBeInTheDocument();
  expect(window.localStorage.getItem('browser-local-workflow-mounted')).toBeNull();
});

test.each(['/ADMIN', '/Admin'])('case-insensitive admin navigation keeps nested browser-local workflows constrained at heading level two', async path => {
  renderProtectedPath(path, '/admin', 'admin', <Admin />);

  expect(await screen.findByRole('heading', { name: 'Organisation Administration' })).toBeVisible();
  expect(screen.getAllByText('Coming Soon')).toHaveLength(3);
  expect(screen.getByRole('heading', { name: 'Organisation Network and Source Manager', level: 2 })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Run browser-local workflow' })).not.toBeInTheDocument();
  expect(window.localStorage.getItem('browser-local-workflow-mounted')).toBeNull();
});

test('encoded admin navigation keeps nested browser-local workflows constrained', async () => {
  renderProtectedPath('/%61dmin', '/admin', 'admin', <Admin />);

  expect(await screen.findByRole('heading', { name: 'Organisation Administration' })).toBeVisible();
  expect(screen.getAllByText('Coming Soon')).toHaveLength(3);
  expect(screen.queryByRole('button', { name: 'Run browser-local workflow' })).not.toBeInTheDocument();
  expect(window.localStorage.getItem('browser-local-workflow-mounted')).toBeNull();
});

test('malformed dynamic path encoding fails closed without mounting an authorised child', async () => {
  const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    renderProtectedPath('/treatment/%ZZ', '/treatment/:id');

    expect(await screen.findByRole('heading', { name: 'Page unavailable' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Run browser-local workflow' })).not.toBeInTheDocument();
    expect(window.localStorage.getItem('browser-local-workflow-mounted')).toBeNull();
  } finally {
    warning.mockRestore();
  }
});

test('malformed dynamic path still fails an unauthorised role guard before availability presentation', async () => {
  const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    renderProtectedPath('/treatment/%ZZ', '/treatment/:id', 'client');

    expect(await screen.findByText('Home redirect')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Page unavailable' })).not.toBeInTheDocument();
    expect(window.localStorage.getItem('browser-local-workflow-mounted')).toBeNull();
  } finally {
    warning.mockRestore();
  }
});
