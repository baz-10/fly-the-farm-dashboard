import React from 'react';
import { Box, Stack, Typography } from '@mui/material';

export interface PlatformBrandProps {
  compact?: boolean;
  inverse?: boolean;
}

export function PlatformBrand({ compact = false, inverse = false }: PlatformBrandProps) {
  const colour = inverse ? '#f4f8f4' : '#0b2b18';

  return (
    <Stack
      direction="row"
      alignItems="center"
      justifyContent="center"
      spacing={1.2}
      aria-label="Spray Command"
      sx={{ color: colour }}
    >
      <Box
        data-testid="spray-command-waypoint-mark"
        aria-hidden="true"
        sx={{
          width: compact ? 32 : 42,
          height: compact ? 32 : 42,
          position: 'relative',
          flex: '0 0 auto',
          '&::before': {
            content: '""',
            position: 'absolute',
            inset: compact ? 5 : 6,
            border: `2px solid ${colour}`,
            transform: 'rotate(45deg)',
            borderRadius: '3px',
          },
          '&::after': {
            content: '""',
            position: 'absolute',
            width: compact ? 8 : 10,
            height: compact ? 8 : 10,
            borderRadius: '50%',
            bgcolor: colour,
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            boxShadow: `0 ${compact ? 11 : 14}px 0 -3px ${colour}`,
          },
        }}
      />
      {!compact && (
        <Typography
          component="span"
          sx={{
            color: 'inherit',
            fontFamily: '"Outfit", system-ui, sans-serif',
            fontSize: { xs: '1.12rem', sm: '1.3rem' },
            fontWeight: 850,
            letterSpacing: '0.16em',
            whiteSpace: 'nowrap',
          }}
        >
          SPRAY COMMAND
        </Typography>
      )}
    </Stack>
  );
}

export default PlatformBrand;
