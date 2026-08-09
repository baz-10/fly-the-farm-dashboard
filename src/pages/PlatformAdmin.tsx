import React from 'react';
import { Alert, Box, Card, CardContent, Chip, Stack, Typography } from '@mui/material';
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import AssistedSupport from './platform/AssistedSupport';
import CommercialOnboardingReview from '../components/platform/CommercialOnboardingReview';

export default function PlatformAdmin() {
  return (
    <Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="space-between" gap={2} sx={{ mb: 3 }}>
        <Box>
          <Typography component="h1" variant="h4" fontWeight={850}>Platform Administration</Typography>
          <Typography color="text.secondary">Global configuration, organisations, intelligence and assisted support.</Typography>
        </Box>
        <Chip icon={<AdminPanelSettingsOutlinedIcon />} label="Platform identity" color="success" variant="outlined" />
      </Stack>
      <Alert severity="info" sx={{ mb: 3 }}>
        Platform administrators have no automatic access to organisation operational data. An approved, scoped support session is required.
      </Alert>
      <Card variant="outlined"><CardContent>
        <Typography variant="overline" color="text.secondary">Assisted Support</Typography>
        <Typography variant="h6" fontWeight={750}>Delegated access only</Typography>
        <Typography color="text.secondary">Support requests, organisation approvals and time-limited sessions will appear here.</Typography>
      </CardContent></Card>
      <CommercialOnboardingReview />
      <AssistedSupport />
    </Box>
  );
}
