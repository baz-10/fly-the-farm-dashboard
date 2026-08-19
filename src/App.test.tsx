import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import App from './App';

let mockOperationalMode = 'remote';

jest.mock('./contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1', role: 'contractor' } }) }));
jest.mock('./contexts/OperationalDataContext', () => ({ useOperationalData: () => ({ mode: mockOperationalMode }) }));
jest.mock('react-router-dom', () => {
  const React = require('react');
  const Route = () => null;
  const matches = (pattern: string | undefined, path: string) => {
    if (!pattern) return false;
    const patternParts = pattern.split('/');
    const pathParts = path.split('/');
    return patternParts.length === pathParts.length && patternParts.every((part, index) => part.startsWith(':') || part === pathParts[index]);
  };
  const findRoute = (children: React.ReactNode, path: string): React.ReactElement | null => {
    for (const child of React.Children.toArray(children) as React.ReactElement<any>[]) {
      if (matches(child.props.path, path)) return child.props.element;
      const nested = findRoute(child.props.children, path);
      if (nested) return nested;
    }
    return null;
  };
  return {
    BrowserRouter: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Routes: ({ children }: { children: React.ReactNode }) => findRoute(children, globalThis.window.location.pathname),
    Route,
    Navigate: ({ to }: { to: string }) => <output data-testid="route-redirect" data-to={to} />,
    useNavigate: () => jest.fn(),
    useParams: () => ({}),
    useLocation: () => ({ pathname: globalThis.window.location.pathname, search: globalThis.window.location.search }),
    Outlet: () => null,
  };
}, { virtual: true });
jest.mock('react-leaflet', () => ({
  MapContainer: () => null,
  TileLayer: () => null,
  Marker: () => null,
  Polygon: () => null,
  Polyline: () => null,
  Popup: () => null,
  Circle: () => null,
  useMap: () => ({}),
  useMapEvents: () => ({}),
}), { virtual: true });
jest.mock('./components/Layout', () => () => null);
jest.mock('./components/ProtectedRoute', () => ({ children }: { children: React.ReactNode }) => <>{children}</>);
jest.mock('./pages/Login', () => () => null);
jest.mock('./pages/Register', () => () => <div>Create account form</div>);
jest.mock('./pages/CustomerAcceptancePublic', () => () => <div>Customer outcome portal</div>);
jest.mock('./pages/Home', () => () => null);
jest.mock('./pages/Dashboard', () => () => null);
jest.mock('./pages/SearchResults', () => () => null);
jest.mock('./pages/TreatmentDetail', () => () => null);
jest.mock('./pages/Calculator', () => () => null);
jest.mock('./pages/ClientList', () => () => null);
jest.mock('./pages/ClientDetail', () => () => null);
jest.mock('./pages/PropertyDetail', () => () => null);
jest.mock('./pages/FieldDetail', () => () => null);
jest.mock('./pages/JobCreate', () => () => <div>Legacy browser job creator</div>);
jest.mock('./pages/JobDetail', () => () => <div>Legacy browser job detail</div>);
jest.mock('./pages/Admin', () => () => null);
jest.mock('./pages/QuoteList', () => () => null);
jest.mock('./pages/QuoteCreate', () => () => null);
jest.mock('./pages/QuoteDetail', () => () => null);
jest.mock('./pages/QuoteSettings', () => () => null);
jest.mock('./pages/FinancialsList', () => () => null);
jest.mock('./pages/ActualCreate', () => () => null);
jest.mock('./pages/ActualDetail', () => () => null);
jest.mock('./pages/AircraftManagement', () => () => null);
jest.mock('./pages/JSAManagement', () => () => null);
jest.mock('./pages/ComplianceMenu', () => () => null);
jest.mock('./pages/ComplianceFlight', () => () => null);
jest.mock('./pages/ComplianceChemical', () => () => null);
jest.mock('./pages/ComplianceTransport', () => () => null);
jest.mock('./pages/ComplianceLicensing', () => () => null);
jest.mock('./pages/ComplianceEnvironmental', () => () => null);
jest.mock('./pages/ComplianceVegetation', () => () => null);
jest.mock('./pages/ComplianceSafety', () => () => null);
jest.mock('./pages/ComplianceDocumentation', () => () => null);
jest.mock('./pages/MissionPlanning', () => () => null);
jest.mock('./pages/MissionRegister', () => () => null);
jest.mock('./pages/AskFTF', () => () => null);
jest.mock('./pages/UserLicenseSettings', () => () => null);
jest.mock('./pages/FleetWorkPacks', () => () => null);
jest.mock('./contexts/UserLicenseContext', () => ({ UserLicenseProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock('./contexts/AircraftContext', () => ({ AircraftProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock('./contexts/MissionContext', () => ({ MissionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock('./contexts/WorkPackContext', () => ({ WorkPackProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock('./contexts/FleetAssetContext', () => ({ FleetAssetProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock('./pages/JobHistory', () => () => <div>Legacy browser job history</div>);
jest.mock('./pages/ReocComplianceWorkspace', () => () => <div>Dedicated ReOC workspace</div>);
jest.mock('./pages/OperationsManualWorkspace', () => () => <div>Dedicated Operations Manual workspace</div>);

describe('App', () => {
  afterEach(cleanup);

  test('does not expose the browser-local Spray Recommendation Import workflow in remote mode', () => {
    mockOperationalMode = 'remote';
    window.history.pushState({}, '', '/jobs/import');

    render(<App />);

    expect(screen.getByRole('heading', { name: 'Spray Recommendation Import' })).toBeVisible();
    expect(screen.getByText('Coming Soon')).toBeVisible();
    expect(screen.queryByText(/upload a spray recommendation pdf/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Choose PDF File' })).not.toBeInTheDocument();
  });

  test.each([
    ['/customer-acceptance/customer-token', 'Customer outcome portal'],
  ])('presents the public Beta state on %s without replacing its lifecycle', (path, expected) => {
    window.history.pushState({}, '', path);
    render(<App />);

    expect(screen.getByLabelText('Beta')).toBeVisible();
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  test('redirects the legacy registration URL before it can render self-provisioning', () => {
    window.history.pushState({}, '', '/register');
    render(<App />);

    expect(screen.getByTestId('route-redirect')).toHaveAttribute('data-to', '/apply');
    expect(screen.queryByText('Create account form')).not.toBeInTheDocument();
  });

  test.each([
    ['/jobs/history', 'Legacy browser job history'],
    ['/jobs/client/client-1/property/property-1/field/field-1/new-job', 'Legacy browser job creator'],
    ['/jobs/client/client-1/property/property-1/field/field-1/job/job-1', 'Legacy browser job detail'],
  ])('connects direct remote navigation to %s after the screen owns authoritative records', (path, expected) => {
    mockOperationalMode = 'remote';
    window.history.pushState({}, '', path);
    render(<App />);
    expect(screen.getByText(expected)).toBeInTheDocument();
    expect(screen.queryByText(/not yet connected to production data/i)).not.toBeInTheDocument();
  });

  test('preserves the existing Job History route in local development mode', () => {
    mockOperationalMode = 'local';
    window.history.pushState({}, '', '/jobs/history');
    render(<App />);
    expect(screen.getByText('Legacy browser job history')).toBeInTheDocument();
  });

  test.each([
    ['/compliance/reoc', 'Dedicated ReOC workspace'],
    ['/compliance/operations-manual', 'Dedicated Operations Manual workspace'],
  ])('connects the protected compliance evidence route %s', (path, expected) => {
    mockOperationalMode = 'remote';
    window.history.pushState({}, '', path);
    render(<App />);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });
});
