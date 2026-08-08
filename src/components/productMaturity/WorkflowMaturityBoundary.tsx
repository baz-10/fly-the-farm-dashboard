import React, { ReactNode } from 'react';
import { Alert, Box } from '@mui/material';
import {
  getWorkflowMaturityEntry,
  ProductMaturityConfigurationError,
} from '../../productMaturity/registry';
import { ProductMaturityEntry } from '../../productMaturity/types';
import { ComingSoonWorkspace } from './ComingSoonWorkspace';
import { MaturityBadge } from './MaturityBadge';

interface WorkflowMaturityBoundaryProps {
  moduleCode: string;
  workflowCode: string;
  children: ReactNode;
}

export function WorkflowMaturityBoundary({ moduleCode, workflowCode, children }: WorkflowMaturityBoundaryProps) {
  let entry: ProductMaturityEntry;
  try {
    entry = getWorkflowMaturityEntry(moduleCode, workflowCode);
  } catch (error) {
    if (error instanceof ProductMaturityConfigurationError) {
      return <Alert severity="error">This workflow is unavailable. Please contact support.</Alert>;
    }
    throw error;
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
