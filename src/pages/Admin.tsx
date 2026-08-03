import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography,
  Box,
  Card,
  CardContent,
  CardActionArea,
  Grid,
  Stack,
  Chip,
  TextField,
  alpha,
  useTheme,
} from '@mui/material';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import FlightTakeoffIcon from '@mui/icons-material/FlightTakeoff';
import PersonIcon from '@mui/icons-material/Person';
import AssignmentIcon from '@mui/icons-material/Assignment';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useAuth } from '../contexts/AuthContext';
import {
  getAllContractorStats,
  getAllClientsUnscoped,
  getJobs,
} from '../services/fieldManagementStore';
import AdminSourceManager from '../components/AdminSourceManager';
import AdminSourceExtraction from '../components/AdminSourceExtraction';
import AuthoritativeChemicalReviews from '../components/AuthoritativeChemicalReviews';
import AdminDocumentSourcing from '../components/AdminDocumentSourcing';
import OrganisationBranding from '../components/admin/OrganisationBranding';

export default function Admin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const theme = useTheme();
  const [search, setSearch] = useState('');

  if (user?.role !== 'admin') {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Typography variant="h6" color="error">Access denied</Typography>
      </Box>
    );
  }

  const contractors = getAllContractorStats();
  const allClients = getAllClientsUnscoped();
  const allJobs = getJobs();

  const filteredContractors = contractors.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase())
  );

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
              Network Overview
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Fly the Farm admin — all contractors and clients
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Summary stats */}
      <Grid container spacing={2} sx={{ mb: 4 }} className="ftf-animate-in">
        {[
          { label: 'Contractors', value: contractors.length, icon: <FlightTakeoffIcon />, color: '#4caf50' },
          { label: 'Total Clients', value: allClients.length, icon: <PersonIcon />, color: '#2196f3' },
          { label: 'Total Jobs', value: allJobs.length, icon: <AssignmentIcon />, color: theme.palette.primary.main },
        ].map((s) => (
          <Grid size={{ xs: 12, sm: 4 }} key={s.label}>
            <Card elevation={0} sx={{
              bgcolor: alpha(s.color, 0.04),
              border: `1px solid ${alpha(s.color, 0.12)}`,
              borderRadius: '14px',
            }}>
              <CardContent sx={{ textAlign: 'center', py: 3, '&:last-child': { pb: 3 } }}>
                {React.cloneElement(s.icon, { sx: { fontSize: 24, color: s.color, mb: 0.5 } })}
                <Typography variant="h3" sx={{ fontWeight: 800, color: s.color, fontFamily: '"Outfit", system-ui', lineHeight: 1.2 }}>
                  {s.value}
                </Typography>
                <Typography variant="caption" color="text.secondary" fontWeight={600}>{s.label}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Contractor list */}
      <Typography variant="h6" sx={{ fontWeight: 700, color: 'primary.dark', mb: 2 }}>
        Spray Contractors
      </Typography>

      {contractors.length > 3 && (
        <TextField
          placeholder="Search contractors..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          size="small"
          fullWidth
          sx={{ maxWidth: 400, mb: 3 }}
        />
      )}

      <Grid container spacing={2} className="ftf-animate-in-delay-1">
        {filteredContractors.map((contractor) => (
          <Grid size={{ xs: 12, sm: 6, md: 4 }} key={contractor.id}>
            <Card elevation={0} sx={{
              height: '100%',
              border: `1.5px solid ${alpha('#4caf50', 0.12)}`,
              borderRadius: '14px',
              '&:hover': {
                borderColor: alpha('#4caf50', 0.3),
                transform: 'translateY(-2px)',
                boxShadow: `0 8px 24px ${alpha('#4caf50', 0.08)}`,
              },
            }}>
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                  <Box sx={{
                    width: 44, height: 44, borderRadius: '12px',
                    bgcolor: alpha('#4caf50', 0.08),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <FlightTakeoffIcon sx={{ color: '#4caf50' }} />
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="h6" sx={{ fontSize: '1.05rem', fontWeight: 700, lineHeight: 1.2 }}>
                      {contractor.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">{contractor.email}</Typography>
                  </Box>
                </Box>

                <Stack direction="row" spacing={2}>
                  <Box>
                    <Typography variant="h5" sx={{ fontWeight: 800, color: '#2196f3', fontFamily: '"Outfit", system-ui', lineHeight: 1 }}>
                      {contractor.clientCount}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">Clients</Typography>
                  </Box>
                  <Box>
                    <Typography variant="h5" sx={{ fontWeight: 800, color: theme.palette.primary.main, fontFamily: '"Outfit", system-ui', lineHeight: 1 }}>
                      {contractor.jobCount}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">Jobs</Typography>
                  </Box>
                </Stack>

                {contractor.inviteCode && (
                  <Box sx={{ mt: 1.5 }}>
                    <Chip
                      label={`Code: ${contractor.inviteCode}`}
                      size="small"
                      sx={{
                        fontFamily: 'monospace', fontWeight: 700, fontSize: '0.7rem',
                        bgcolor: alpha('#4caf50', 0.08), color: '#4caf50',
                      }}
                    />
                  </Box>
                )}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {filteredContractors.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography variant="body2" color="text.secondary">
            {contractors.length === 0 ? 'No contractors registered yet.' : 'No contractors match your search.'}
          </Typography>
        </Box>
      )}

      {/* Source Manager */}
      <Box sx={{ mt: 6 }} className="ftf-animate-in-delay-1">
        <OrganisationBranding />
      </Box>

      {/* Source Manager */}
      <Box sx={{ mt: 6 }} className="ftf-animate-in-delay-1">
        <AdminSourceManager />
      </Box>

      {/* Source Extraction */}
      <Box sx={{ mt: 6 }} className="ftf-animate-in-delay-1">
        <AdminSourceExtraction />
      </Box>

      {/* Chemical Intake */}
      <Box sx={{ mt: 6 }} className="ftf-animate-in-delay-1">
        <AuthoritativeChemicalReviews />
      </Box>

      {/* Document Sourcing */}
      <Box sx={{ mt: 6 }} className="ftf-animate-in-delay-1">
        <AdminDocumentSourcing />
      </Box>
    </Box>
  );
}
