import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
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
import { UserLicenseProvider } from './contexts/UserLicenseContext';
import { AircraftProvider } from './contexts/AircraftContext';
import { MissionProvider } from './contexts/MissionContext';
import { useAuth } from './contexts/AuthContext';

function WorkflowProviders({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== 'admin' && user?.role !== 'contractor') return <>{children}</>;

  return (
    <UserLicenseProvider>
      <AircraftProvider>
        <MissionProvider>{children}</MissionProvider>
      </AircraftProvider>
    </UserLicenseProvider>
  );
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
          <Route path="/" element={<Home />} />
          <Route path="/database" element={<Dashboard />} />
          <Route path="/search" element={<SearchResults />} />
          <Route path="/treatment/:id" element={<TreatmentDetail />} />
          <Route path="/calculator" element={<Calculator />} />
          <Route path="/jobs" element={<ClientList />} />
          <Route path="/jobs/import" element={<SprayRecImport />} />
          <Route path="/jobs/history" element={<JobHistory />} />
          <Route path="/jobs/client/:clientId" element={<ClientDetail />} />
          <Route path="/jobs/client/:clientId/property/:propertyId" element={<PropertyDetail />} />
          <Route path="/jobs/client/:clientId/property/:propertyId/field/:fieldId" element={<FieldDetail />} />
          <Route path="/jobs/client/:clientId/property/:propertyId/field/:fieldId/new-job" element={<JobCreate />} />
          <Route path="/jobs/client/:clientId/property/:propertyId/field/:fieldId/job/:jobId" element={<JobDetail />} />
          <Route path="/quotes" element={<QuoteList />} />
          <Route path="/quotes/new" element={<QuoteCreate />} />
          <Route path="/quotes/settings" element={<QuoteSettings />} />
          <Route path="/quotes/:quoteId" element={<QuoteDetail />} />
          <Route path="/financials" element={<FinancialsList />} />
          <Route path="/financials/new" element={<ActualCreate />} />
          <Route path="/financials/:actualId" element={<ActualDetail />} />
          <Route path="/aircraft" element={<ProtectedRoute allowedRoles={['admin', 'contractor']}><AircraftManagement /></ProtectedRoute>} />
          <Route path="/jsa" element={<JSAManagement />} />
          <Route path="/mission-planning" element={<ProtectedRoute allowedRoles={['admin', 'contractor']}><MissionPlanning /></ProtectedRoute>} />
          <Route path="/compliance" element={<ComplianceMenu />} />
          <Route path="/compliance/flight" element={<ComplianceFlight />} />
          <Route path="/compliance/chemical" element={<ComplianceChemical />} />
          <Route path="/compliance/transport" element={<ComplianceTransport />} />
          <Route path="/compliance/licensing" element={<ComplianceLicensing />} />
          <Route path="/compliance/environmental" element={<ComplianceEnvironmental />} />
          <Route path="/compliance/vegetation" element={<ComplianceVegetation />} />
          <Route path="/compliance/safety" element={<ComplianceSafety />} />
          <Route path="/compliance/documentation" element={<ComplianceDocumentation />} />
          <Route path="/admin" element={<Admin />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
