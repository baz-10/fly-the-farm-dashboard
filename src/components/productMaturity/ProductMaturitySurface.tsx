import React, { ReactNode } from 'react';
import { Box } from '@mui/material';
import { resolveProductSurface } from '../../productMaturity/surfaces';
import { ComingSoonWorkspace } from './ComingSoonWorkspace';
import { MaturityBadge } from './MaturityBadge';

export interface ProductMaturityLocation {
  pathname: string;
  search: string;
}

interface ProductMaturitySurfaceProps {
  location: ProductMaturityLocation;
  children: ReactNode;
}

export function ProductMaturitySurface({ location, children }: ProductMaturitySurfaceProps) {
  const surface = resolveProductSurface(location.pathname, location.search);

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
