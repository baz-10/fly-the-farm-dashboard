import React, { ReactNode, useContext } from 'react';
import { Alert, Box } from '@mui/material';
import {
  getMaturityEntry,
  getWorkflowMaturityEntry,
  ProductMaturityConfigurationError,
} from '../../productMaturity/registry';
import { ProductMaturityEntry } from '../../productMaturity/types';
import { ComingSoonWorkspace } from './ComingSoonWorkspace';
import { MaturityBadge } from './MaturityBadge';
import { ProductMaturitySurfaceContext } from './ProductMaturitySurface';

interface WorkflowMaturityBoundaryProps {
  moduleCode: string;
  workflowCode: string;
  children: ReactNode;
}

export function WorkflowMaturityBoundary({ moduleCode, workflowCode, children }: WorkflowMaturityBoundaryProps) {
  const surfaceModuleCode = useContext(ProductMaturitySurfaceContext);
  let entry: ProductMaturityEntry;
  let moduleEntry: ProductMaturityEntry;
  try {
    entry = getWorkflowMaturityEntry(moduleCode, workflowCode);
    moduleEntry = getMaturityEntry(moduleCode);
  } catch (error) {
    if (error instanceof ProductMaturityConfigurationError) {
      return <Alert severity="error">This workflow is unavailable. Please contact support.</Alert>;
    }
    throw error;
  }

  if (surfaceModuleCode === moduleCode && entry.maturity === moduleEntry.maturity) {
    return <>{children}</>;
  }

  if (entry.maturity === 'COMMERCIALLY_READY' || entry.maturity === 'OPERATIONALLY_READY') {
    return <>{children}</>;
  }

  if (entry.maturity === 'COMING_SOON') {
    return <ComingSoonWorkspace entry={entry} headingLevel="h2" />;
  }

  return (
    <>
      <Box component="aside" aria-label="Beta availability" sx={{ mb: 2 }}>
        <MaturityBadge entry={entry} />
      </Box>
      {children}
    </>
  );
}
