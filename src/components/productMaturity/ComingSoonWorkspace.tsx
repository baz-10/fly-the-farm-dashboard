import React, { ReactNode } from 'react';
import { Box, Paper, Stack, Typography } from '@mui/material';
import { ProductMaturityEntry } from '../../productMaturity/types';
import { MaturityBadge } from './MaturityBadge';

interface ComingSoonWorkspaceProps {
  entry: ProductMaturityEntry;
  alternativeAction?: ReactNode;
}

export function ComingSoonWorkspace({ entry, alternativeAction }: ComingSoonWorkspaceProps) {
  const headingId = `${entry.moduleCode}-${entry.workflowCode ?? 'workspace'}-coming-soon`;

  return (
    <Paper component="section" aria-labelledby={headingId} variant="outlined" sx={{ maxWidth: 640, mx: 'auto', mt: 4, p: { xs: 3, sm: 4 } }}>
      <Stack spacing={2} alignItems="flex-start">
        <MaturityBadge entry={entry} showComingSoon />
        <Box>
          <Typography id={headingId} component="h1" variant="h5" gutterBottom>
            {entry.customerName}
          </Typography>
          <Typography color="text.secondary">
            {entry.customerName} will be available in a future release.
          </Typography>
        </Box>
        {alternativeAction ? <Box>{alternativeAction}</Box> : null}
      </Stack>
    </Paper>
  );
}
