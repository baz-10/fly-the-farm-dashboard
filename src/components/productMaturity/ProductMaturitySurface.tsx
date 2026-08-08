import React, { createContext, ReactNode } from 'react';
import { Alert, Box, Typography } from '@mui/material';
import { ProductMaturityPathError, resolveProductSurface } from '../../productMaturity/surfaces';
import { ComingSoonWorkspace } from './ComingSoonWorkspace';
import { MaturityBadge } from './MaturityBadge';

export const ProductMaturitySurfaceContext = createContext<string | null>(null);

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

  if (!surface) {
    return <>{children}</>;
  }

  if (surface.entry.maturity === 'COMMERCIALLY_READY' || surface.entry.maturity === 'OPERATIONALLY_READY') {
    return (
      <ProductMaturitySurfaceContext.Provider value={surface.entry.moduleCode}>
        {children}
      </ProductMaturitySurfaceContext.Provider>
    );
  }

  if (surface.entry.maturity === 'COMING_SOON') {
    return <ComingSoonWorkspace entry={surface.entry} />;
  }

  return (
    <ProductMaturitySurfaceContext.Provider value={surface.entry.moduleCode}>
      <Box component="aside" aria-label="Beta availability" sx={{ mb: 2 }}>
        <MaturityBadge entry={surface.entry} />
      </Box>
      {children}
    </ProductMaturitySurfaceContext.Provider>
  );
}
