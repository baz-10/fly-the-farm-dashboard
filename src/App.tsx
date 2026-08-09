import React from 'react';
import { missionOperatorRoles } from './security/operationalRouteRoles';
import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import AuthCallback from './pages/AuthCallback';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import SearchResults from './pages/SearchResults';
import TreatmentDetail from './pages/TreatmentDetail';
import Calculator from './pages/Calculator';
import ClientList from './pages/ClientList';
import ClientDetail from './pages/ClientDetail';
import PropertyDetail from './pages/PropertyDetail';
import FieldDetail from './pages/FieldDetail';
import JobCreate from './pages/JobCreate';
import JobDetail from './pages/JobDetail';
import JobHistory from './pages/JobHistory';
import SprayRecImport from './pages/SprayRecImport';
import Admin from './pages/Admin';
import QuoteList from './pages/QuoteList';
import QuoteCreate from './pages/QuoteCreate';
import QuoteDetail from './pages/QuoteDetail';
import QuoteSettings from './pages/QuoteSettings';
import FinancialsList from './pages/FinancialsList';
import ActualCreate from './pages/ActualCreate';
import ActualDetail from './pages/ActualDetail';
import AircraftManagement from './pages/AircraftManagement';
import JSAManagement from './pages/JSAManagement';
import ComplianceMenu from './pages/ComplianceMenu';
import ComplianceFlight from './pages/ComplianceFlight';
import ComplianceChemical from './pages/ComplianceChemical';
import ComplianceTransport from './pages/ComplianceTransport';
import ComplianceLicensing from './pages/ComplianceLicensing';
import ComplianceEnvironmental from './pages/ComplianceEnvironmental';
import ComplianceVegetation from './pages/ComplianceVegetation';
import ComplianceSafety from './pages/ComplianceSafety';
import ComplianceDocumentation from './pages/ComplianceDocumentation';
import MissionPlanning from './pages/MissionPlanning';
import MissionRegister from './pages/MissionRegister';
import MissionRouteRedirect from './components/MissionRouteRedirect';
import AskFTF from './pages/AskFTF';
import UserLicenseSettings from './pages/UserLicenseSettings';
import { UserLicenseProvider } from './contexts/UserLicenseContext';
import { AircraftProvider } from './contexts/AircraftContext';
import { MissionProvider } from './contexts/MissionContext';
import { WorkPackProvider } from './contexts/WorkPackContext';
import FleetWorkPacks from './pages/FleetWorkPacks';
import { useAuth, UserRole } from './contexts/AuthContext';
import OperationalFeatureGate from './components/OperationalFeatureGate';
import Personnel from './pages/Personnel';
import CustomerAcceptancePublic from './pages/CustomerAcceptancePublic';
import PlatformProtectedRoute from './components/PlatformProtectedRoute';
import PlatformShell from './components/PlatformShell';
import PlatformAdmin from './pages/PlatformAdmin';
import CasaComplianceOverview from './pages/CasaComplianceOverview';
import ReocComplianceWorkspace from './pages/ReocComplianceWorkspace';
import OperationsManualWorkspace from './pages/OperationsManualWorkspace';
import ControlledChecklists from './pages/ControlledChecklists';
import WeatherCentre from './pages/WeatherCentre';
import { AuthorisedProductRoute, ProductRouteSurface } from './components/productMaturity/AuthorisedProductRoute';
import CommercialApplication from './pages/CommercialApplication';
import AcceptOrganisationInvitation from './pages/AcceptOrganisationInvitation';

export { REACHABLE_PRODUCT_ROUTES } from './productMaturity/surfaces';

function WorkflowProviders({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== 'admin' && user?.role !== 'contractor' && !user?.delegatedSupport) return <>{children}</>;

  return (
    <UserLicenseProvider>
      <AircraftProvider>
        <WorkPackProvider>
          <MissionProvider>{children}</MissionProvider>
        </WorkPackProvider>
      </AircraftProvider>
    </UserLicenseProvider>
  );
}

function HomeRoute() {
  const { user } = useAuth();
  if (user?.role === 'platform') return <Navigate to={user.delegatedSupport?'/jobs':'/platform'} replace />;
  if (user?.role === 'client') {
    const clientPath = user.clientRecordId
      ? `/jobs/client/${encodeURIComponent(user.clientRecordId)}`
      : '/jobs';
    return <Navigate to={clientPath} replace />;
  }
  return <Home />;
}

function App() {
  const productRoute = (
    children: React.ReactNode,
    options: { allowedRoles?: UserRole[]; requiredEntitlement?: string } = {}
  ) => (
    <AuthorisedProductRoute allowedRoles={options.allowedRoles} requiredEntitlement={options.requiredEntitlement}>
      {children}
    </AuthorisedProductRoute>
  );

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<ProductRouteSurface><Register /></ProductRouteSurface>} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/apply" element={<ProductRouteSurface><CommercialApplication /></ProductRouteSurface>} />
        <Route path="/onboarding/accept" element={<ProductRouteSurface><AcceptOrganisationInvitation /></ProductRouteSurface>} />
        <Route path="/customer-acceptance/:token" element={<ProductRouteSurface><CustomerAcceptancePublic /></ProductRouteSurface>} />
        <Route element={<PlatformProtectedRoute><ProductRouteSurface><PlatformShell /></ProductRouteSurface></PlatformProtectedRoute>}>
          <Route path="/platform" element={<PlatformAdmin />} />
        </Route>
        <Route
          element={
            <ProtectedRoute>
              <WorkflowProviders>
                <Layout />
              </WorkflowProviders>
            </ProtectedRoute>
          }
        >
          <Route path="/" element={productRoute(<HomeRoute />)} />
          <Route path="/database" element={productRoute(<Dashboard />)} />
          <Route path="/search" element={productRoute(<SearchResults />)} />
          <Route path="/treatment/:id" element={productRoute(<TreatmentDetail />)} />
          <Route path="/calculator" element={productRoute(<Calculator />, { allowedRoles: ['admin', 'contractor'] })} />
          <Route path="/jobs" element={productRoute(<ClientList />)} />
          <Route path="/jobs/import" element={productRoute(<OperationalFeatureGate feature="Spray Recommendation Import"><SprayRecImport /></OperationalFeatureGate>)} />
          <Route path="/jobs/history" element={productRoute(<JobHistory />)} />
          <Route path="/jobs/client/:clientId" element={productRoute(<ClientDetail />)} />
          <Route path="/jobs/client/:clientId/property/:propertyId" element={productRoute(<PropertyDetail />)} />
          <Route path="/jobs/client/:clientId/property/:propertyId/field/:fieldId" element={productRoute(<FieldDetail />)} />
          <Route path="/jobs/client/:clientId/property/:propertyId/field/:fieldId/new-job" element={productRoute(<JobCreate />)} />
          <Route path="/jobs/client/:clientId/property/:propertyId/field/:fieldId/job/:jobId" element={productRoute(<JobDetail />)} />
          <Route path="/jobs/client/:clientId/property/:propertyId/field/:fieldId/job/:jobId/new-mission" element={productRoute(<MissionPlanning />, { allowedRoles: missionOperatorRoles })} />
          <Route path="/quotes" element={productRoute(<QuoteList />, { allowedRoles: ['admin', 'contractor'] })} />
          <Route path="/quotes/new" element={productRoute(<QuoteCreate />, { allowedRoles: ['admin', 'contractor'] })} />
          <Route path="/quotes/settings" element={productRoute(<QuoteSettings />, { allowedRoles: ['admin', 'contractor'] })} />
          <Route path="/quotes/:quoteId" element={productRoute(<QuoteDetail />, { allowedRoles: ['admin', 'contractor'] })} />
          <Route path="/financials" element={productRoute(<FinancialsList />, { allowedRoles: ['admin', 'contractor'] })} />
          <Route path="/financials/new" element={productRoute(<ActualCreate />, { allowedRoles: ['admin', 'contractor'] })} />
          <Route path="/financials/:actualId" element={productRoute(<ActualDetail />, { allowedRoles: ['admin', 'contractor'] })} />
          <Route path="/ask-ftf" element={productRoute(<AskFTF />, { allowedRoles: ['admin', 'contractor'], requiredEntitlement: 'legacyAskFtf' })} />
          <Route path="/aircraft" element={productRoute(<AircraftManagement />, { allowedRoles: ['admin', 'contractor'] })} />
          <Route path="/personnel" element={productRoute(<Personnel />, { allowedRoles: ['admin', 'contractor'] })} />
          <Route path="/fleet-work-packs" element={productRoute(<FleetWorkPacks />, { allowedRoles: ['admin', 'contractor'] })} />
          <Route path="/jsa" element={productRoute(<JSAManagement />, { allowedRoles: ['admin', 'contractor'] })} />
          <Route path="/missions" element={productRoute(<MissionRegister />, { allowedRoles: missionOperatorRoles })} />
          <Route path="/missions/new" element={productRoute(<MissionPlanning />, { allowedRoles: missionOperatorRoles })} />
          <Route path="/missions/:missionId" element={productRoute(<MissionPlanning />, { allowedRoles: missionOperatorRoles })} />
          <Route path="/weather" element={productRoute(<WeatherCentre />, { allowedRoles: ['admin', 'contractor'] })} />
          <Route path="/mission-planning" element={productRoute(<MissionRouteRedirect />, { allowedRoles: missionOperatorRoles })} />
          <Route path="/compliance" element={productRoute(<CasaComplianceOverview />, { allowedRoles: ['admin', 'contractor'] })} />
          <Route path="/compliance/reoc" element={productRoute(<ReocComplianceWorkspace />, { allowedRoles: ['admin', 'contractor'] })} />
          <Route path="/compliance/operations-manual" element={productRoute(<OperationsManualWorkspace />, { allowedRoles: ['admin', 'contractor'] })} />
          <Route path="/compliance/library" element={productRoute(<ComplianceMenu />, { allowedRoles: ['admin', 'contractor'] })} />
          <Route path="/compliance/checklists" element={productRoute(<ControlledChecklists />, { allowedRoles: ['admin', 'contractor'] })} />
          <Route path="/compliance/flight" element={productRoute(<ComplianceFlight />, { allowedRoles: ['admin', 'contractor'] })} />
          <Route path="/compliance/chemical" element={productRoute(<ComplianceChemical />, { allowedRoles: ['admin', 'contractor'] })} />
          <Route path="/compliance/transport" element={productRoute(<ComplianceTransport />, { allowedRoles: ['admin', 'contractor'] })} />
          <Route path="/compliance/licensing" element={productRoute(<ComplianceLicensing />, { allowedRoles: ['admin', 'contractor'] })} />
          <Route path="/compliance/environmental" element={productRoute(<ComplianceEnvironmental />, { allowedRoles: ['admin', 'contractor'] })} />
          <Route path="/compliance/vegetation" element={productRoute(<ComplianceVegetation />, { allowedRoles: ['admin', 'contractor'] })} />
          <Route path="/compliance/safety" element={productRoute(<ComplianceSafety />, { allowedRoles: ['admin', 'contractor'] })} />
          <Route path="/compliance/documentation" element={productRoute(<ComplianceDocumentation />, { allowedRoles: ['admin', 'contractor'] })} />
          <Route path="/license-settings" element={productRoute(<UserLicenseSettings />, { allowedRoles: ['admin', 'contractor'] })} />
          <Route path="/admin" element={productRoute(<Admin />, { allowedRoles: ['admin'] })} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
