import React from 'react';
import { Box, Chip, Stack, Typography } from '@mui/material';
import { MissionMapFeature, MissionMapFeatureType } from '../types/missionMap';

export const MAP_FEATURE_LABELS: Record<MissionMapFeatureType, string> = {
  building: 'Buildings',
  obstacle: 'Obstacles',
  'point-of-interest': 'Points of interest',
  'primary-landing-zone': 'Primary landing zone',
  'secondary-landing-zone': 'Secondary landing zone',
  signage: 'Signage',
};

export const MAP_FEATURE_COLORS: Record<MissionMapFeatureType, string> = {
  building: '#7b5e3b',
  obstacle: '#c62828',
  'point-of-interest': '#6a1b9a',
  'primary-landing-zone': '#00897b',
  'secondary-landing-zone': '#1565c0',
  signage: '#ef6c00',
};

export default function MissionMapLegend({ features }: { features: MissionMapFeature[] }) {
  return (
    <Box sx={{ mt: 1.25 }} aria-label="Map key">
      <Typography sx={{ fontSize: '0.72rem', fontWeight: 900, mb: 0.75 }}>Map key</Typography>
      <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
        {(Object.keys(MAP_FEATURE_LABELS) as MissionMapFeatureType[]).map((type) => (
          <Chip
            key={type}
            size="small"
            label={`${MAP_FEATURE_LABELS[type]} (${features.filter((feature) => feature.type === type).length})`}
            icon={<Box component="span" sx={{ width: 9, height: 9, borderRadius: type === 'building' ? 0.5 : '50%', bgcolor: MAP_FEATURE_COLORS[type] }} />}
            sx={{ fontSize: '0.68rem' }}
          />
        ))}
      </Stack>
    </Box>
  );
}
