import React from 'react';
import { Chip, Tooltip } from '@mui/material';
import { ProductMaturityEntry } from '../../productMaturity/types';

export const BETA_AVAILABILITY_EXPLANATION =
  'This feature is available during Private Commercial Beta and is still being refined.';

export const COMING_SOON_AVAILABILITY_EXPLANATION =
  'This feature will be available in a future release.';

export const maturityAvailabilityExplanation = (entry: ProductMaturityEntry): string | null => {
  if (entry.maturity === 'BETA') return BETA_AVAILABILITY_EXPLANATION;
  if (entry.maturity === 'COMING_SOON') return COMING_SOON_AVAILABILITY_EXPLANATION;
  return null;
};

interface MaturityBadgeProps {
  entry: ProductMaturityEntry;
  showComingSoon?: boolean;
  interactive?: boolean;
}

export function MaturityBadge({ entry, showComingSoon = false, interactive }: MaturityBadgeProps) {
  const label = entry.maturity === 'BETA'
    ? 'Beta'
    : entry.maturity === 'COMING_SOON' && showComingSoon
      ? 'Coming Soon'
      : null;

  if (!label) return null;
  const isInteractive = interactive ?? entry.maturity === 'BETA';

  const chip = (
    <Chip
      aria-label={label}
      label={label}
      size="small"
      tabIndex={isInteractive ? 0 : undefined}
      variant="outlined"
      sx={{
        fontWeight: 600,
        letterSpacing: '0.01em',
      }}
    />
  );

  return entry.maturity === 'BETA' ? (
    <Tooltip title={BETA_AVAILABILITY_EXPLANATION} enterTouchDelay={0} disableFocusListener={!isInteractive}>
      {chip}
    </Tooltip>
  ) : chip;
}
