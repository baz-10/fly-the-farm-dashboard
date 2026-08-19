import React from 'react';
import { Alert, Box, Card, CardContent, CircularProgress, Typography } from '@mui/material';
import { Navigate, useParams } from 'react-router-dom';
import { useFleetAssets } from '../contexts/FleetAssetContext';
import { useAircraft } from '../contexts/AircraftContext';
import { AssetContextBar } from '../components/maintenance/AssetContextBar';
import { ASSET_WORKSPACE_SECTIONS, AssetWorkspaceNavigation } from '../components/maintenance/AssetWorkspaceNavigation';
import { AttachedAssetsSummary } from '../components/maintenance/AttachedAssetsSummary';

export default function AssetWorkspace() {
  const { source, id, section = 'overview' } = useParams();
  const fleet = useFleetAssets();
  const aircraft = useAircraft();
  const validSection = ASSET_WORKSPACE_SECTIONS.some(([key]) => key === section);
  if (!validSection) return <Navigate to={`/assets/${source}/${id}/overview`} replace />;

  const loading = fleet.loading || aircraft.isLoading;
  const asset = source === 'fleet-asset'
    ? fleet.assets.find((candidate) => candidate.id === id)
    : source === 'aircraft'
      ? aircraft.aircraft.find((candidate) => candidate.id === id)
      : aircraft.equipmentKits.find((candidate) => candidate.id === id);
  if (loading) return <Box aria-live="polite" sx={{ display: 'flex', gap: 2, alignItems: 'center', p: 4 }}><CircularProgress size={24} />Loading authoritative asset context…</Box>;
  if (!asset) return <Alert severity="warning">This asset is unavailable or outside your organisation and Base scope.</Alert>;

  const record = asset as any;
  const identity = source === 'fleet-asset' ? record.assetIdentifier : source === 'aircraft' ? record.registration : record.name;
  const basePath = `/assets/${source}/${id}`;
  const futureTitle = ASSET_WORKSPACE_SECTIONS.find(([key]) => key === section)?.[1];
  return (
    <Box sx={{ maxWidth: 1440, mx: 'auto', p: { xs: 2, md: 4 } }}>
      <Typography variant="overline">Technical register</Typography>
      <AssetContextBar identity={identity} kind={source === 'fleet-asset' ? 'Fleet asset' : source === 'aircraft' ? 'Aircraft' : 'Equipment Kit'} base={record.operatingLocationId} status={String(record.status)} />
      <AssetWorkspaceNavigation basePath={basePath} />
      {section === 'overview' ? (
        <Box sx={{ mt: 1, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1fr' }, gap: 2 }}>
          <Box>
            <Card><CardContent>
              <Typography variant="h5">Operating overview</Typography>
              <Typography color="text.secondary" sx={{ mt: 1 }}>Identity and source records remain authoritative in their existing registers. Maintenance facts are composed here.</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3,1fr)' }, gap: 2, mt: 3 }}>
                {[['Maintenance', 'Not configured'], ['Meters', 'No readings'], ['Open defects', 'None recorded']].map(([label, value]) => (
                  <Box key={label}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="h6">{value}</Typography></Box>
                ))}
              </Box>
            </CardContent></Card>
          </Box>
          <Box><AttachedAssetsSummary /></Box>
        </Box>
      ) : section === 'components' ? (
        <Card sx={{ mt: 2 }}><CardContent><Typography variant="h5">Components</Typography><Typography color="text.secondary" sx={{ mt: 1 }}>Component tracking is optional. Systems and positions can be configured without assuming a fixed asset geometry.</Typography></CardContent></Card>
      ) : (
        <Card sx={{ mt: 2 }}><CardContent><Typography variant="h5">{futureTitle}</Typography><Typography color="text.secondary" sx={{ mt: 1 }}>This supported Beta workspace is being introduced progressively. Existing authoritative workflows remain available.</Typography></CardContent></Card>
      )}
    </Box>
  );
}
