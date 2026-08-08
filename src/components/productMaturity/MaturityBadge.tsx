import React from 'react';
import { Chip, Tooltip } from '@mui/material';
import { ProductMaturityEntry } from '../../productMaturity/types';

const BETA_TOOLTIP = 'This feature is available during Private Commercial Beta and is still being refined.';

interface MaturityBadgeProps {
  entry: ProductMaturityEntry;
  showComingSoon?: boolean;
  interactive?: boolean;
}

export function MaturityBadge({ entry, showComingSoon = false, interactive = true }: MaturityBadgeProps) {
  const label = entry.maturity === 'BETA'
    ? 'Beta'
    : entry.maturity === 'COMING_SOON' && showComingSoon
      ? 'Coming Soon'
      : null;

  if (!label) return null;

  const chip = (
    <Chip
      aria-label={label}
      label={label}
      size="small"
      tabIndex={interactive ? 0 : undefined}
      variant="outlined"
      sx={{
        fontWeight: 600,
        letterSpacing: '0.01em',
      }}
    />
  );

  return entry.maturity === 'BETA' ? (
    <Tooltip title={BETA_TOOLTIP} enterTouchDelay={0} disableFocusListener={!interactive}>
      {chip}
    </Tooltip>
  ) : chip;
}
