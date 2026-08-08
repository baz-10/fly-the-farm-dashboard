import React, { ReactNode } from 'react';
import { Alert, Box, Typography } from '@mui/material';
import { ProductMaturityPathError, resolveProductSurface } from '../../productMaturity/surfaces';
import { ComingSoonWorkspace } from './ComingSoonWorkspace';
import { MaturityBadge } from './MaturityBadge';

interface ProductMaturitySurfaceProps {
  pathname: string;
  search: string;
  children: ReactNode;
}

export function ProductMaturitySurface({ pathname, search, children }: ProductMaturitySurfaceProps) {
  let surface;
  try {
    surface = resolveProductSurface(pathname, search);
  } catch (error) {
    if (!(error instanceof ProductMaturityPathError)) throw error;
    return (
      <Alert severity="warning">
        <Typography component="h1" variant="h5" gutterBottom>Page unavailable</Typography>
        This URL could not be opened safely. Use the application navigation to choose a page.
      </Alert>
    );
  }

  if (!surface || surface.entry.maturity === 'COMMERCIALLY_READY' || surface.entry.maturity === 'OPERATIONALLY_READY') {
    return <>{children}</>;
  }

  if (surface.entry.maturity === 'COMING_SOON') {
    return <ComingSoonWorkspace entry={surface.entry} />;
  }

  return (
    <>
      <Box component="aside" aria-label="Beta availability" sx={{ mb: 2 }}>
        <MaturityBadge entry={surface.entry} />
      </Box>
      {children}
    </>
  );
}
