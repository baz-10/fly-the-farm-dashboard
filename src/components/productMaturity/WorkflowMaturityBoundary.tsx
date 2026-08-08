import React, { ReactNode } from 'react';
import { Box } from '@mui/material';
import { getMaturityEntry } from '../../productMaturity/registry';
import { ComingSoonWorkspace } from './ComingSoonWorkspace';
import { MaturityBadge } from './MaturityBadge';

interface WorkflowMaturityBoundaryProps {
  moduleCode: string;
  workflowCode: string;
  children: ReactNode;
}

export function WorkflowMaturityBoundary({ moduleCode, workflowCode, children }: WorkflowMaturityBoundaryProps) {
  const entry = getMaturityEntry(moduleCode, workflowCode);

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
