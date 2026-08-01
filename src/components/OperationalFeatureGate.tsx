import React from 'react';
import { Alert, Box, Typography } from '@mui/material';
import { useOperationalData } from '../contexts/OperationalDataContext';

interface OperationalFeatureGateProps {
  feature: string;
  children: React.ReactNode;
}

export default function OperationalFeatureGate({ feature, children }: OperationalFeatureGateProps) {
  const { mode } = useOperationalData();
  if (mode !== 'remote') return <>{children}</>;

  return (
    <Box>
      <Typography component="h1" variant="h4" sx={{ mb: 2, fontWeight: 800 }}>{feature}</Typography>
      <Alert severity="info">
        {feature} is not yet connected to production data. This workflow is unavailable in Production Beta.
      </Alert>
    </Box>
  );
}
