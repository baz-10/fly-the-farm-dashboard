import React, { ReactNode } from 'react';
import { Box } from '@mui/material';
import { resolveProductSurface } from '../../productMaturity/surfaces';
import { ComingSoonWorkspace } from './ComingSoonWorkspace';
import { MaturityBadge } from './MaturityBadge';

interface ProductMaturitySurfaceProps {
  pathname: string;
  search: string;
  children: ReactNode;
}

export function ProductMaturitySurface({ pathname, search, children }: ProductMaturitySurfaceProps) {
  const surface = resolveProductSurface(pathname, search);

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
