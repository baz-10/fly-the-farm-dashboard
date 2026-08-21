import React from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Link,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import {
  maintenanceApi,
  type FleetMaintenanceDueFilters,
  type FleetMaintenanceDueRow,
  type FleetMaintenanceDueSummary as FleetMaintenanceDueSummaryResult,
  type MaintenanceAssetSource,
} from '../../services/maintenanceApi';
import type { MaintenanceDueState } from '../../types/fleetMaintenance';

type FleetReader = Pick<typeof maintenanceApi, 'readFleetDueSummary'>;

export interface FleetMaintenanceSummaryProps {
  authorityScopeKey?: string;
  asOf: string;
  bases: Array<{ id: string; name: string }>;
  api?: FleetReader;
  pageSize?: number;
}

const STATE_LABELS: Record<MaintenanceDueState, string> = {
  CURRENT: 'Current',
  DUE_SOON: 'Due soon',
  DUE: 'Due',
  OVERDUE: 'Overdue',
  INSUFFICIENT_DATA: 'Needs attention',
};

const STATE_TONES: Record<MaintenanceDueState, { color: string; borderColor: string; backgroundColor: string }> = {
  CURRENT: { color: '#245f31', borderColor: '#8eb899', backgroundColor: '#edf6ef' },
  DUE_SOON: { color: '#765412', borderColor: '#d3b268', backgroundColor: '#fff8e8' },
  DUE: { color: '#9a3f12', borderColor: '#dda57d', backgroundColor: '#fff5ed' },
  OVERDUE: { color: '#8e201b', borderColor: '#d99b96', backgroundColor: '#fff4f2' },
  INSUFFICIENT_DATA: { color: '#665d45', borderColor: '#bdb39b', backgroundColor: '#f7f5ef' },
};

const SOURCE_LABELS: Record<MaintenanceAssetSource, string> = {
  aircraft: 'Aircraft',
  'equipment-kit': 'Equipment Kit',
  'fleet-asset': 'Fleet asset',
};

function FleetRow({ row }: { row: FleetMaintenanceDueRow }) {
  return (
    <Paper component="li" variant="outlined" sx={{ listStyle: 'none', borderColor: '#d9e4da', borderRadius: 2, overflow: 'hidden' }}>
      <Box sx={{ borderLeft: `4px solid ${STATE_TONES[row.highestState].color}`, px: { xs: 1.75, sm: 2.25 }, py: 1.75 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1.25}>
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
              <Typography variant="h6" sx={{ color: '#0b3217', fontWeight: 900 }}>{row.identity}</Typography>
              <Chip label={SOURCE_LABELS[row.source]} size="small" variant="outlined" />
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {row.requirementCount} {row.requirementCount === 1 ? 'requirement' : 'requirements'}
              {row.attachedAssetCount > 0 ? ` · ${row.attachedAssetCount} attached ${row.attachedAssetCount === 1 ? 'asset' : 'assets'}` : ''}
            </Typography>
          </Box>
          <Stack direction="row" gap={1} alignItems="center" justifyContent={{ xs: 'space-between', sm: 'flex-end' }}>
            <Chip label={STATE_LABELS[row.highestState]} size="small" variant="outlined" sx={{ fontWeight: 850, ...STATE_TONES[row.highestState] }} />
            <Link
              href={`/assets/${row.source}/${row.sourceRecordId}/maintenance`}
              aria-label={`${row.identity} maintenance`}
              underline="none"
              sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: '#245f31', fontWeight: 850, '&:focus-visible': { outline: '3px solid #8eb899', outlineOffset: 2 } }}
            >
              Open <ArrowForwardIcon fontSize="small" />
            </Link>
          </Stack>
        </Stack>
      </Box>
    </Paper>
  );
}

export function FleetMaintenanceSummary({ authorityScopeKey = '', asOf, bases, api = maintenanceApi, pageSize = 8 }: FleetMaintenanceSummaryProps) {
  const [baseId, setBaseId] = React.useState('');
  const [assetType, setAssetType] = React.useState<MaintenanceAssetSource | ''>('');
  const [state, setState] = React.useState<MaintenanceDueState | ''>('');
  const [rows, setRows] = React.useState<FleetMaintenanceDueRow[]>([]);
  const [page, setPage] = React.useState<FleetMaintenanceDueSummaryResult['page']>();
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [error, setError] = React.useState('');
  const [retry, setRetry] = React.useState(0);
  const generationRef = React.useRef(0);

  const filters = React.useMemo<FleetMaintenanceDueFilters>(() => ({
    ...(baseId ? { baseId } : {}),
    ...(assetType ? { assetType } : {}),
    ...(state ? { state } : {}),
    pageSize,
  }), [assetType, baseId, pageSize, state]);
  const requestScope = React.useMemo(() => ({}), [api, asOf, authorityScopeKey, filters, retry]);
  const [stateScope, setStateScope] = React.useState(requestScope);

  React.useEffect(() => {
    const generation = ++generationRef.current;
    setStateScope(requestScope);
    setRows([]);
    setPage(undefined);
    setLoading(true);
    setLoadingMore(false);
    setError('');
    void api.readFleetDueSummary(asOf, filters).then((summary) => {
      if (generationRef.current !== generation) return;
      setRows(summary.rows);
      setPage(summary.page);
    }).catch((caught) => {
      if (generationRef.current !== generation) return;
      setError(caught instanceof Error ? caught.message : 'Fleet maintenance could not be loaded.');
    }).finally(() => {
      if (generationRef.current === generation) setLoading(false);
    });
    return () => { if (generationRef.current === generation) generationRef.current += 1; };
  }, [api, asOf, filters, requestScope, retry]);

  const scopeMatches = stateScope === requestScope;
  const visibleRows = scopeMatches ? rows : [];
  const visiblePage = scopeMatches ? page : undefined;
  const visibleLoading = !scopeMatches || loading;
  const visibleLoadingMore = scopeMatches && loadingMore;
  const visibleError = scopeMatches ? error : '';

  const loadMore = async () => {
    if (!visiblePage?.nextCursor || visibleLoadingMore) return;
    const generation = generationRef.current;
    setLoadingMore(true);
    setError('');
    try {
      const summary = await api.readFleetDueSummary(asOf, { ...filters, cursor: visiblePage.nextCursor });
      if (generationRef.current !== generation) return;
      setRows((current) => {
        const existing = new Set(current.map((row) => row.registryId));
        return [...current, ...summary.rows.filter((row) => !existing.has(row.registryId))];
      });
      setPage(summary.page);
    } catch (caught) {
      if (generationRef.current !== generation) return;
      setError(caught instanceof Error ? caught.message : 'Fleet maintenance could not be loaded.');
    } finally {
      if (generationRef.current === generation) setLoadingMore(false);
    }
  };

  return (
    <Paper component="section" variant="outlined" aria-labelledby="fleet-maintenance-title" sx={{ mt: 3, p: { xs: 2, md: 2.5 }, borderColor: '#d9e4da', borderRadius: 3 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={1} sx={{ mb: 2 }}>
        <Box>
          <Typography id="fleet-maintenance-title" component="h2" variant="h5" sx={{ color: '#0b3217', fontWeight: 900 }}>Fleet maintenance</Typography>
          <Typography variant="body2" color="text.secondary">Compact due-state attention. Open an asset for evidence and full explanation.</Typography>
        </Box>
        <Chip label={`${visibleRows.length} loaded`} size="small" variant="outlined" sx={{ alignSelf: { xs: 'flex-start', md: 'center' } }} />
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 1.25, mb: 2 }}>
        <TextField select size="small" label="Base" value={baseId} onChange={(event) => setBaseId(event.target.value)}>
          <MenuItem value="">All authorised Bases</MenuItem>
          {bases.map((base) => <MenuItem key={base.id} value={base.id}>{base.name}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Asset type" value={assetType} onChange={(event) => setAssetType(event.target.value as MaintenanceAssetSource | '')}>
          <MenuItem value="">All asset types</MenuItem>
          <MenuItem value="fleet-asset">Fleet asset</MenuItem>
          <MenuItem value="equipment-kit">Equipment Kit</MenuItem>
          <MenuItem value="aircraft">Aircraft</MenuItem>
        </TextField>
        <TextField select size="small" label="Maintenance status" value={state} onChange={(event) => setState(event.target.value as MaintenanceDueState | '')}>
          <MenuItem value="">All maintenance states</MenuItem>
          <MenuItem value="OVERDUE">Overdue</MenuItem>
          <MenuItem value="DUE">Due</MenuItem>
          <MenuItem value="DUE_SOON">Due soon</MenuItem>
          <MenuItem value="INSUFFICIENT_DATA">Needs attention</MenuItem>
          <MenuItem value="CURRENT">Current</MenuItem>
        </TextField>
      </Box>

      {visibleLoading ? (
        <Box role="status" aria-live="polite" sx={{ p: 2, display: 'flex', gap: 1.5, alignItems: 'center' }}><CircularProgress size={22} />Loading Fleet maintenance…</Box>
      ) : visibleError && visibleRows.length === 0 ? (
        <Alert severity="error" action={<Button color="inherit" onClick={() => setRetry((value) => value + 1)}>Try again</Button>}>{visibleError}</Alert>
      ) : visibleRows.length === 0 ? (
        <Alert severity="info">No assets match these maintenance filters.</Alert>
      ) : (
        <>
          {visibleError && <Alert severity="error" sx={{ mb: 1.5 }}>{visibleError}</Alert>}
          <Stack component="ul" role="list" aria-label="Fleet maintenance results" spacing={1} sx={{ p: 0, m: 0 }}>
            {visibleRows.map((row) => <FleetRow key={row.registryId} row={row} />)}
          </Stack>
          {visiblePage?.hasMore && visiblePage.nextCursor && (
            <Button sx={{ mt: 1.5 }} variant="outlined" disabled={visibleLoadingMore} onClick={() => void loadMore()}>
              {visibleLoadingMore ? 'Loading more…' : 'Load more assets'}
            </Button>
          )}
        </>
      )}
    </Paper>
  );
}
