import React from 'react';
import { Box, Button, Chip, IconButton, Paper, Stack, TextField, Typography } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import ZoomInMapIcon from '@mui/icons-material/ZoomInMap';
import { LatLng } from '../types/fieldManagement';
import { MissionBoundaryMetadata, MissionMapFeature } from '../types/missionMap';
import { MAP_FEATURE_COLORS, MAP_FEATURE_LABELS } from './MissionMapLegend';

interface Props {
  polygons: LatLng[][];
  features: MissionMapFeature[];
  onPolygonsChange: (polygons: LatLng[][]) => void;
  onFeaturesChange: (features: MissionMapFeature[]) => void;
  boundaryMetadata?: MissionBoundaryMetadata[];
  onBoundaryMetadataChange?: (metadata: MissionBoundaryMetadata[]) => void;
  onZoom?: (kind: 'boundary' | 'feature', indexOrId: number | string) => void;
}

export default function MissionMapFeatureRegister({ polygons, features, onPolygonsChange, onFeaturesChange, boundaryMetadata = [], onBoundaryMetadataChange, onZoom }: Props) {
  const updateFeature = (id: string, changes: Partial<MissionMapFeature>) => onFeaturesChange(features.map((feature) => feature.id === id ? { ...feature, ...changes } : feature));
  const updateBoundary = (index: number, changes: Partial<MissionBoundaryMetadata>) => onBoundaryMetadataChange?.(polygons.map((_, polygonIndex) => ({ ...boundaryMetadata[polygonIndex], name: boundaryMetadata[polygonIndex]?.name || `Boundary ${polygonIndex + 1}`, notes: boundaryMetadata[polygonIndex]?.notes || '', ...(polygonIndex === index ? changes : {}) })));
  return <Box sx={{ mt: 1.5 }} aria-label="Editable map key">
    <Typography fontWeight={900} mb={1}>Editable map key</Typography>
    <Stack spacing={1}>
      {polygons.map((polygon, polygonIndex) => <Paper key={boundaryMetadata[polygonIndex]?.id || `boundary-${polygonIndex}`} variant="outlined" sx={{ p: 1.25 }}><Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}><Chip label="Boundary · Shape" color="primary" /><TextField size="small" label={`Boundary ${polygonIndex + 1} name`} value={boundaryMetadata[polygonIndex]?.name ?? `Boundary ${polygonIndex + 1}`} onChange={(event) => updateBoundary(polygonIndex, { name: event.target.value })} /><TextField size="small" label={`Boundary ${polygonIndex + 1} notes`} value={boundaryMetadata[polygonIndex]?.notes ?? ''} onChange={(event) => updateBoundary(polygonIndex, { notes: event.target.value })} sx={{ flex: 1 }} /><Typography variant="body2" color="text.secondary">{polygon.length} vertices</Typography><Stack direction="row" spacing={0.25} sx={{ flexWrap: 'wrap' }}>{polygon.map((_, vertexIndex) => <Button key={vertexIndex} size="small" aria-label={`Delete vertex ${vertexIndex + 1} from Boundary ${polygonIndex + 1}`} onClick={() => {
        if (polygon.length <= 3) { if (window.confirm(`Boundary ${polygonIndex + 1} cannot have fewer than three points. Delete this polygon?`)) { onPolygonsChange(polygons.filter((_, index) => index !== polygonIndex)); onBoundaryMetadataChange?.(boundaryMetadata.filter((_, index) => index !== polygonIndex)); } return; }
        onPolygonsChange(polygons.map((value, index) => index === polygonIndex ? value.filter((__, pointIndex) => pointIndex !== vertexIndex) : value));
      }}>Point {vertexIndex + 1} ×</Button>)}</Stack><IconButton aria-label={`Zoom to Boundary ${polygonIndex + 1}`} onClick={() => onZoom?.('boundary', polygonIndex)}><ZoomInMapIcon /></IconButton><IconButton aria-label={`Delete Boundary ${polygonIndex + 1}`} color="error" onClick={() => { if (window.confirm(`Delete Boundary ${polygonIndex + 1}? The mission will be preserved.`)) { onPolygonsChange(polygons.filter((_, index) => index !== polygonIndex)); onBoundaryMetadataChange?.(boundaryMetadata.filter((_, index) => index !== polygonIndex)); } }}><DeleteIcon /></IconButton></Stack></Paper>)}
      {features.map((feature) => <Paper key={feature.id} variant="outlined" sx={{ p: 1.25, borderLeft: `5px solid ${MAP_FEATURE_COLORS[feature.type]}` }}><Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}><Chip label={`${MAP_FEATURE_LABELS[feature.type]} · ${feature.geometry.type === 'Polygon' ? 'Shape' : feature.geometry.type.replace('String', '')}`} /><TextField size="small" label={`Name ${feature.label}`} value={feature.name ?? feature.label} onChange={(event) => updateFeature(feature.id, { name: event.target.value })} /><TextField size="small" label={`Notes ${feature.label}`} value={feature.notes || ''} onChange={(event) => updateFeature(feature.id, { notes: event.target.value })} sx={{ flex: 1 }} /><IconButton aria-label={`Zoom to ${feature.name || feature.label}`} onClick={() => onZoom?.('feature', feature.id)}><ZoomInMapIcon /></IconButton><IconButton aria-label={`Delete ${feature.name || feature.label}`} color="error" onClick={() => { if (feature.geometry.type === 'Point' || window.confirm(`Delete ${feature.name || feature.label}?`)) onFeaturesChange(features.filter((candidate) => candidate.id !== feature.id)); }}><DeleteIcon /></IconButton></Stack></Paper>)}
      {polygons.length === 0 && features.length === 0 && <Typography variant="body2" color="text.secondary">Draw or import map items to build the key.</Typography>}
    </Stack>
  </Box>;
}
