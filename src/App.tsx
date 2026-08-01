import React from 'react';
import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Register from './pages/Register';
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
import { useAuth } from './contexts/AuthContext';
import OperationalFeatureGate from './components/OperationalFeatureGate';

function WorkflowProviders({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== 'admin' && user?.role !== 'contractor') return <>{children}</>;

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
  if (user?.role === 'client') {
    const clientPath = user.clientRecordId
      ? `/jobs/client/${encodeURIComponent(user.clientRecordId)}`
      : '/jobs';
    return <Navigate to={clientPath} replace />;
  }
  return <Home />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          element={
            <ProtectedRoute>
              <WorkflowProviders>
                <Layout />
              </WorkflowProviders>
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<HomeRoute />} />
          <Route path="/database" element={<Dashboard />} />
          <Route path="/search" element={<SearchResults />} />
          <Route path="/treatment/:id" element={<TreatmentDetail />} />
          <Route path="/calculator" element={<ProtectedRoute allowedRoles={['admin', 'contractor']}><Calculator /></ProtectedRoute>} />
          <Route path="/jobs" element={<ClientList />} />
          <Route path="/jobs/import" element={<OperationalFeatureGate feature="Import Spray Rec"><SprayRecImport /></OperationalFeatureGate>} />
          <Route path="/jobs/history" element={<OperationalFeatureGate feature="Job History"><JobHistory /></OperationalFeatureGate>} />
          <Route path="/jobs/client/:clientId" element={<ClientDetail />} />
          <Route path="/jobs/client/:clientId/property/:propertyId" element={<PropertyDetail />} />
          <Route path="/jobs/client/:clientId/property/:propertyId/field/:fieldId" element={<FieldDetail />} />
          <Route path="/jobs/client/:clientId/property/:propertyId/field/:fieldId/new-job" element={<OperationalFeatureGate feature="Record Job"><JobCreate /></OperationalFeatureGate>} />
          <Route path="/jobs/client/:clientId/property/:propertyId/field/:fieldId/job/:jobId" element={<OperationalFeatureGate feature="Job Details"><JobDetail /></OperationalFeatureGate>} />
          <Route path="/quotes" element={<ProtectedRoute allowedRoles={['admin', 'contractor']}><QuoteList /></ProtectedRoute>} />
          <Route path="/quotes/new" element={<ProtectedRoute allowedRoles={['admin', 'contractor']}><QuoteCreate /></ProtectedRoute>} />
          <Route path="/quotes/settings" element={<ProtectedRoute allowedRoles={['admin', 'contractor']}><QuoteSettings /></ProtectedRoute>} />
          <Route path="/quotes/:quoteId" element={<ProtectedRoute allowedRoles={['admin', 'contractor']}><QuoteDetail /></ProtectedRoute>} />
          <Route path="/financials" element={<ProtectedRoute allowedRoles={['admin', 'contractor']}><FinancialsList /></ProtectedRoute>} />
          <Route path="/financials/new" element={<ProtectedRoute allowedRoles={['admin', 'contractor']}><ActualCreate /></ProtectedRoute>} />
          <Route path="/financials/:actualId" element={<ProtectedRoute allowedRoles={['admin', 'contractor']}><ActualDetail /></ProtectedRoute>} />
          <Route path="/ask-ftf" element={<ProtectedRoute allowedRoles={['admin', 'contractor']}><AskFTF /></ProtectedRoute>} />
          <Route path="/aircraft" element={<ProtectedRoute allowedRoles={['admin', 'contractor']}><AircraftManagement /></ProtectedRoute>} />
          <Route path="/fleet-work-packs" element={<ProtectedRoute allowedRoles={['admin', 'contractor']}><FleetWorkPacks /></ProtectedRoute>} />
          <Route path="/jsa" element={<ProtectedRoute allowedRoles={['admin', 'contractor']}><JSAManagement /></ProtectedRoute>} />
          <Route path="/missions" element={<ProtectedRoute allowedRoles={['admin', 'contractor']}><MissionRegister /></ProtectedRoute>} />
          <Route path="/missions/new" element={<ProtectedRoute allowedRoles={['admin', 'contractor']}><MissionPlanning /></ProtectedRoute>} />
          <Route path="/missions/:missionId" element={<ProtectedRoute allowedRoles={['admin', 'contractor']}><MissionPlanning /></ProtectedRoute>} />
          <Route path="/mission-planning" element={<ProtectedRoute allowedRoles={['admin', 'contractor']}><MissionRouteRedirect /></ProtectedRoute>} />
          <Route path="/compliance" element={<ProtectedRoute allowedRoles={['admin', 'contractor']}><ComplianceMenu /></ProtectedRoute>} />
          <Route path="/compliance/flight" element={<ProtectedRoute allowedRoles={['admin', 'contractor']}><ComplianceFlight /></ProtectedRoute>} />
          <Route path="/compliance/chemical" element={<ProtectedRoute allowedRoles={['admin', 'contractor']}><ComplianceChemical /></ProtectedRoute>} />
          <Route path="/compliance/transport" element={<ProtectedRoute allowedRoles={['admin', 'contractor']}><ComplianceTransport /></ProtectedRoute>} />
          <Route path="/compliance/licensing" element={<ProtectedRoute allowedRoles={['admin', 'contractor']}><ComplianceLicensing /></ProtectedRoute>} />
          <Route path="/compliance/environmental" element={<ProtectedRoute allowedRoles={['admin', 'contractor']}><ComplianceEnvironmental /></ProtectedRoute>} />
          <Route path="/compliance/vegetation" element={<ProtectedRoute allowedRoles={['admin', 'contractor']}><ComplianceVegetation /></ProtectedRoute>} />
          <Route path="/compliance/safety" element={<ProtectedRoute allowedRoles={['admin', 'contractor']}><ComplianceSafety /></ProtectedRoute>} />
          <Route path="/compliance/documentation" element={<ProtectedRoute allowedRoles={['admin', 'contractor']}><ComplianceDocumentation /></ProtectedRoute>} />
          <Route path="/license-settings" element={<ProtectedRoute allowedRoles={['admin', 'contractor']}><UserLicenseSettings /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute allowedRoles={['admin']}><Admin /></ProtectedRoute>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
