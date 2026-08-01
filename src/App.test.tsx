import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import App from './App';

let mockOperationalMode = 'remote';

jest.mock('./contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1', role: 'contractor' } }) }));
jest.mock('./contexts/OperationalDataContext', () => ({ useOperationalData: () => ({ mode: mockOperationalMode }) }));
jest.mock('react-router-dom', () => {
  const React = require('react');
  const Route = () => null;
  const findRoute = (children: React.ReactNode, path: string): React.ReactElement | null => {
    for (const child of React.Children.toArray(children) as React.ReactElement<any>[]) {
      if (child.props.path === path) return child.props.element;
      const nested = findRoute(child.props.children, path);
      if (nested) return nested;
    }
    return null;
  };
  return {
    BrowserRouter: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Routes: ({ children }: { children: React.ReactNode }) => findRoute(children, globalThis.window.location.pathname),
    Route,
    Navigate: () => null,
    useNavigate: () => jest.fn(),
    useParams: () => ({}),
    useLocation: () => ({ pathname: globalThis.window.location.pathname }),
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
jest.mock('./pages/Register', () => () => null);
jest.mock('./pages/Home', () => () => null);
jest.mock('./pages/Dashboard', () => () => null);
jest.mock('./pages/SearchResults', () => () => null);
jest.mock('./pages/TreatmentDetail', () => () => null);
jest.mock('./pages/Calculator', () => () => null);
jest.mock('./pages/ClientList', () => () => null);
jest.mock('./pages/ClientDetail', () => () => null);
jest.mock('./pages/PropertyDetail', () => () => null);
jest.mock('./pages/FieldDetail', () => () => null);
jest.mock('./pages/JobCreate', () => () => null);
jest.mock('./pages/JobDetail', () => () => null);
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
jest.mock('./pages/JobHistory', () => () => <div>Legacy browser job history</div>);
jest.mock('./pages/SprayRecImport', () => () => <div>Legacy browser spray recommendation importer</div>);

describe('App', () => {
  afterEach(cleanup);

  test.each([
    ['/jobs/history', 'Job History'],
    ['/jobs/import', 'Import Spray Rec'],
  ])('gates direct remote navigation to %s before legacy browser data can render', (path, feature) => {
    mockOperationalMode = 'remote';
    window.history.pushState({}, '', path);

    render(<App />);

    expect(screen.getByRole('heading', { name: feature })).toBeInTheDocument();
    expect(screen.getByText(/not yet connected to production data/i)).toBeInTheDocument();
    expect(screen.queryByText(/Legacy browser/i)).not.toBeInTheDocument();
  });

  test('preserves the existing Job History route in local development mode', () => {
    mockOperationalMode = 'local';
    window.history.pushState({}, '', '/jobs/history');
    render(<App />);
    expect(screen.getByText('Legacy browser job history')).toBeInTheDocument();
  });
});
