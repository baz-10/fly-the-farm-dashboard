import React from 'react';
import {
  Typography,
  Box,
  alpha,
} from '@mui/material';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import { useAuth } from '../contexts/AuthContext';
import AdminSourceManager from '../components/AdminSourceManager';
import AdminSourceExtraction from '../components/AdminSourceExtraction';
import AuthoritativeChemicalReviews from '../components/AuthoritativeChemicalReviews';
import AdminDocumentSourcing from '../components/AdminDocumentSourcing';
import OrganisationBranding from '../components/admin/OrganisationBranding';
import OrganisationSupportAccess from '../components/admin/OrganisationSupportAccess';
import { WorkflowMaturityBoundary } from '../components/productMaturity/WorkflowMaturityBoundary';

export default function Admin() {
  const { user } = useAuth();

  if (user?.role !== 'admin') {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Typography variant="h6" color="error">Access denied</Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Box className="ftf-animate-in" sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
          <Box sx={{
            width: 56, height: 56, borderRadius: '14px',
            bgcolor: alpha('#ff9800', 0.08),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <AdminPanelSettingsIcon sx={{ fontSize: 28, color: '#ff9800' }} />
          </Box>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 800, color: 'primary.dark', fontSize: { xs: '1.4rem', md: '1.75rem' } }}>
              Organisation Administration
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Manage supported organisation settings and review feature availability.
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Source Manager */}
      <Box sx={{ mt: 6 }} className="ftf-animate-in-delay-1">
        <OrganisationSupportAccess />
      </Box>

      {/* Source Manager */}
      <Box sx={{ mt: 6 }} className="ftf-animate-in-delay-1">
        <OrganisationBranding />
      </Box>

      {/* Source Manager */}
      <Box sx={{ mt: 6 }} className="ftf-animate-in-delay-1">
        <WorkflowMaturityBoundary moduleCode="organisation-administration" workflowCode="network-source-manager">
          <AdminSourceManager />
        </WorkflowMaturityBoundary>
      </Box>

      {/* Source Extraction */}
      <Box sx={{ mt: 6 }} className="ftf-animate-in-delay-1">
        <WorkflowMaturityBoundary moduleCode="chemical-intelligence" workflowCode="source-extraction">
          <AdminSourceExtraction />
        </WorkflowMaturityBoundary>
      </Box>

      {/* Chemical Intake */}
      <Box sx={{ mt: 6 }} className="ftf-animate-in-delay-1">
        <AuthoritativeChemicalReviews />
      </Box>

      {/* Document Sourcing */}
      <Box sx={{ mt: 6 }} className="ftf-animate-in-delay-1">
        <WorkflowMaturityBoundary moduleCode="chemical-intelligence" workflowCode="document-sourcing">
          <AdminDocumentSourcing />
        </WorkflowMaturityBoundary>
      </Box>
    </Box>
  );
}
