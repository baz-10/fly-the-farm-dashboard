import React from 'react';
import { Box, Chip, Stack, Typography } from '@mui/material';
import { MissionMapFeature, MissionMapFeatureType } from '../types/missionMap';
import { MISSION_MAP_FEATURE_DEFINITIONS } from '../utils/missionMapFeatureCatalog';

export const MAP_FEATURE_LABELS = Object.fromEntries(Object.entries(MISSION_MAP_FEATURE_DEFINITIONS).map(([key,value])=>[key,value.label])) as Record<MissionMapFeatureType,string>;

export const MAP_FEATURE_COLORS = Object.fromEntries(Object.entries(MISSION_MAP_FEATURE_DEFINITIONS).map(([key,value])=>[key,value.color])) as Record<MissionMapFeatureType,string>;

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
