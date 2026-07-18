import React from 'react';
import { Box, Button, Chip, IconButton, Paper, Stack, TextField, Typography } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import ZoomInMapIcon from '@mui/icons-material/ZoomInMap';
import { MissionBoundaryPolygon } from '../types/missionBoundary';
import { MissionMapFeature } from '../types/missionMap';
import { removeBoundaryPolygon, removeBoundaryVertex } from '../utils/missionBoundaryEditing';
import { MAP_FEATURE_COLORS, MAP_FEATURE_LABELS } from './MissionMapLegend';

interface Props {
  boundaries: MissionBoundaryPolygon[];
  features: MissionMapFeature[];
  onBoundariesChange: (boundaries: MissionBoundaryPolygon[]) => void;
  onFeaturesChange: (features: MissionMapFeature[]) => void;
  onZoom?: (kind: 'boundary' | 'feature', id: string) => void;
}

export default function MissionMapFeatureRegister({ boundaries, features, onBoundariesChange, onFeaturesChange, onZoom }: Props) {
  const updateFeature = (id: string, changes: Partial<MissionMapFeature>) => onFeaturesChange(features.map((feature) => feature.id === id ? { ...feature, ...changes } : feature));
  const updateBoundary = (id: string, changes: Partial<MissionBoundaryPolygon>) => onBoundariesChange(boundaries.map((boundary) => boundary.id === id ? { ...boundary, ...changes } : boundary));
  return <Box sx={{ mt: 1.5 }} aria-label="Editable map key">
    <Typography fontWeight={900} mb={1}>Editable map key</Typography>
    <Stack spacing={1}>
      {boundaries.map((boundary, polygonIndex) => <Paper key={boundary.id} variant="outlined" sx={{ p: 1.25 }}><Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}><Chip label="Boundary · Shape" color="primary" /><TextField size="small" label={`Boundary ${polygonIndex + 1} name`} value={boundary.name} onChange={(event) => updateBoundary(boundary.id, { name: event.target.value })} /><TextField size="small" label={`Boundary ${polygonIndex + 1} notes`} value={boundary.notes} onChange={(event) => updateBoundary(boundary.id, { notes: event.target.value })} sx={{ flex: 1 }} /><Typography variant="body2" color="text.secondary">{boundary.coordinates.length} vertices</Typography><Stack direction="row" spacing={0.25} sx={{ flexWrap: 'wrap' }}>{boundary.coordinates.map((_, vertexIndex) => <Button key={vertexIndex} size="small" aria-label={`Delete vertex ${vertexIndex + 1} from Boundary ${polygonIndex + 1}`} onClick={() => {
        const result = removeBoundaryVertex(boundaries, boundary.id, vertexIndex);
        if (result.requiresPolygonDeleteConfirmation) { if (window.confirm(`${boundary.name} cannot have fewer than three points. Delete this polygon?`)) onBoundariesChange(removeBoundaryPolygon(boundaries, boundary.id)); return; }
        onBoundariesChange(result.polygons);
      }}>Point {vertexIndex + 1} ×</Button>)}</Stack><IconButton aria-label={`Zoom to Boundary ${polygonIndex + 1}`} onClick={() => onZoom?.('boundary', boundary.id)}><ZoomInMapIcon /></IconButton><IconButton aria-label={`Delete Boundary ${polygonIndex + 1}`} color="error" onClick={() => { if (window.confirm(`Delete ${boundary.name}? The mission will be preserved.`)) onBoundariesChange(removeBoundaryPolygon(boundaries, boundary.id)); }}><DeleteIcon /></IconButton></Stack></Paper>)}
      {features.map((feature) => <Paper key={feature.id} variant="outlined" sx={{ p: 1.25, borderLeft: `5px solid ${MAP_FEATURE_COLORS[feature.type]}` }}><Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}><Chip label={`${MAP_FEATURE_LABELS[feature.type]} · ${feature.geometry.type === 'Polygon' ? 'Shape' : feature.geometry.type.replace('String', '')}`} /><TextField size="small" label={`Name ${feature.label}`} value={feature.name ?? feature.label} onChange={(event) => updateFeature(feature.id, { name: event.target.value })} /><TextField size="small" label={`Notes ${feature.label}`} value={feature.notes || ''} onChange={(event) => updateFeature(feature.id, { notes: event.target.value })} sx={{ flex: 1 }} /><IconButton aria-label={`Zoom to ${feature.name || feature.label}`} onClick={() => onZoom?.('feature', feature.id)}><ZoomInMapIcon /></IconButton><IconButton aria-label={`Delete ${feature.name || feature.label}`} color="error" onClick={() => { if (feature.geometry.type === 'Point' || window.confirm(`Delete ${feature.name || feature.label}?`)) onFeaturesChange(features.filter((candidate) => candidate.id !== feature.id)); }}><DeleteIcon /></IconButton></Stack></Paper>)}
      {boundaries.length === 0 && features.length === 0 && <Typography variant="body2" color="text.secondary">Draw or import map items to build the key.</Typography>}
    </Stack>
  </Box>;
}
