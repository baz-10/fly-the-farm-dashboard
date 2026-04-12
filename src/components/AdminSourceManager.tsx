import React, { useState, useEffect } from 'react';
import {
  Typography,
  Box,
  Card,
  CardContent,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  alpha,
  Stack,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import StorageIcon from '@mui/icons-material/Storage';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import {
  getTrackedChemicals,
  refreshChemical,
  refreshAllChemicals,
  SourceRecordWithFlags,
} from '../services/sourceManagerStore';

type FilterMode = 'all' | 'attention' | 'healthy';

function sourceStatusChip(status: SourceRecordWithFlags['sourceStatus']) {
  switch (status) {
    case 'available':
      return <Chip label="Available" size="small" sx={{ bgcolor: alpha('#4caf50', 0.1), color: '#2e7d32', fontWeight: 700, fontSize: '0.7rem' }} />;
    case 'partial':
      return <Chip label="Partial" size="small" sx={{ bgcolor: alpha('#ff9800', 0.1), color: '#e65100', fontWeight: 700, fontSize: '0.7rem' }} />;
    case 'not_found':
      return <Chip label="Not Found" size="small" sx={{ bgcolor: alpha('#f44336', 0.08), color: '#c62828', fontWeight: 700, fontSize: '0.7rem' }} />;
  }
}

function docButton(available: boolean, url: string, label: string) {
  if (available && url) {
    return (
      <Button
        component="a"
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        size="small"
        variant="outlined"
        endIcon={<OpenInNewIcon sx={{ fontSize: '14px !important' }} />}
        sx={{
          textTransform: 'none',
          fontWeight: 700,
          fontSize: '0.75rem',
          borderRadius: '8px',
          px: 1.5,
          py: 0.5,
          color: '#2e7d32',
          borderColor: alpha('#4caf50', 0.4),
          bgcolor: alpha('#4caf50', 0.06),
          cursor: 'pointer',
          '&:hover': {
            bgcolor: alpha('#4caf50', 0.16),
            borderColor: '#4caf50',
          },
        }}
      >
        {label}
      </Button>
    );
  }
  return (
    <Chip
      label="Missing"
      size="small"
      sx={{ bgcolor: alpha('#9e9e9e', 0.1), color: '#616161', fontWeight: 600, fontSize: '0.7rem', minWidth: 52 }}
    />
  );
}

function flagChips(record: SourceRecordWithFlags) {
  const { flags } = record;
  if (flags.healthy) {
    return <Chip label="Healthy" size="small" sx={{ bgcolor: alpha('#4caf50', 0.08), color: '#2e7d32', fontWeight: 600, fontSize: '0.7rem' }} />;
  }

  const chips: React.ReactNode[] = [];
  if (flags.stale) {
    chips.push(
      <Chip key="stale" label="Stale" size="small"
        sx={{ bgcolor: alpha('#ff9800', 0.1), color: '#e65100', fontWeight: 600, fontSize: '0.65rem' }} />
    );
  }
  if (flags.missingLabel) {
    chips.push(
      <Chip key="label" label="Missing Label" size="small"
        sx={{ bgcolor: alpha('#f44336', 0.08), color: '#c62828', fontWeight: 600, fontSize: '0.65rem' }} />
    );
  }
  if (flags.missingSds) {
    chips.push(
      <Chip key="sds" label="Missing SDS" size="small"
        sx={{ bgcolor: alpha('#f44336', 0.08), color: '#c62828', fontWeight: 600, fontSize: '0.65rem' }} />
    );
  }
  if (flags.conflict) {
    chips.push(
      <Chip key="conflict" label="Conflict" size="small"
        sx={{ bgcolor: alpha('#9c27b0', 0.08), color: '#6a1b9a', fontWeight: 600, fontSize: '0.65rem' }} />
    );
  }
  return <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>{chips}</Stack>;
}

function formatDate(iso: string): string {
  if (!iso) return '\u2014';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
      + ' ' + d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

const filterButtonSx = (active: boolean) => ({
  textTransform: 'none' as const,
  fontWeight: active ? 700 : 500,
  fontSize: '0.8rem',
  borderRadius: '10px',
  px: 2,
  bgcolor: active ? alpha('#1e4d2b', 0.08) : 'transparent',
  color: active ? 'primary.dark' : 'text.secondary',
  border: active ? '1px solid' : '1px solid transparent',
  borderColor: active ? alpha('#1e4d2b', 0.2) : 'transparent',
  '&:hover': { bgcolor: alpha('#1e4d2b', 0.06) },
});

export default function AdminSourceManager() {
  const [records, setRecords] = useState<SourceRecordWithFlags[]>([]);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [refreshingKey, setRefreshingKey] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterMode>('all');

  useEffect(() => {
    setRecords(getTrackedChemicals());
  }, []);


  const handleRefresh = (chemical: string) => {
    setRefreshingKey(chemical);
    setTimeout(() => {
      refreshChemical(chemical);
      setRecords(getTrackedChemicals());
      setRefreshingKey(null);
    }, 300);
  };

  const handleRefreshAll = () => {
    setRefreshingAll(true);
    setTimeout(() => {
      refreshAllChemicals();
      setRecords(getTrackedChemicals());
      setRefreshingAll(false);
    }, 500);
  };

  // Derived counts
  const staleCount = records.filter((r) => r.flags.stale).length;
  const missingLabelCount = records.filter((r) => r.flags.missingLabel).length;
  const missingSdsCount = records.filter((r) => r.flags.missingSds).length;
  const conflictCount = records.filter((r) => r.flags.conflict).length;
  const attentionCount = records.filter((r) => r.flags.needsAttention).length;
  const healthyCount = records.filter((r) => r.flags.healthy).length;

  // Filtered records
  const filtered = records.filter((r) => {
    if (filter === 'attention') return r.flags.needsAttention;
    if (filter === 'healthy') return r.flags.healthy;
    return true;
  });

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
        <Box sx={{
          width: 48, height: 48, borderRadius: '12px',
          bgcolor: alpha('#2196f3', 0.08),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <StorageIcon sx={{ fontSize: 24, color: '#2196f3' }} />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, color: 'primary.dark' }}>
            Source Manager
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage label and SDS source status for Fly The Farm chemicals.
          </Typography>
        </Box>
        <Button
          variant="outlined"
          size="small"
          startIcon={<RefreshIcon />}
          onClick={handleRefreshAll}
          disabled={refreshingAll}
          sx={{ textTransform: 'none', fontWeight: 600, borderRadius: '10px' }}
        >
          {refreshingAll ? 'Refreshing...' : 'Refresh All'}
        </Button>
      </Box>

      {/* Summary counts */}
      {records.length > 0 && (
        <Stack direction="row" spacing={2} sx={{ mt: 2, flexWrap: 'wrap' }} useFlexGap>
          <Chip label={`${healthyCount} Healthy`} size="small"
            sx={{ bgcolor: alpha('#4caf50', 0.08), color: '#2e7d32', fontWeight: 600, fontSize: '0.75rem' }} />
          {staleCount > 0 && (
            <Chip label={`${staleCount} Stale`} size="small"
              sx={{ bgcolor: alpha('#ff9800', 0.08), color: '#e65100', fontWeight: 600, fontSize: '0.75rem' }} />
          )}
          {missingLabelCount > 0 && (
            <Chip label={`${missingLabelCount} Missing Label`} size="small"
              sx={{ bgcolor: alpha('#f44336', 0.06), color: '#c62828', fontWeight: 600, fontSize: '0.75rem' }} />
          )}
          {missingSdsCount > 0 && (
            <Chip label={`${missingSdsCount} Missing SDS`} size="small"
              sx={{ bgcolor: alpha('#f44336', 0.06), color: '#c62828', fontWeight: 600, fontSize: '0.75rem' }} />
          )}
          {conflictCount > 0 && (
            <Chip label={`${conflictCount} Conflict`} size="small"
              sx={{ bgcolor: alpha('#9c27b0', 0.06), color: '#6a1b9a', fontWeight: 600, fontSize: '0.75rem' }} />
          )}
        </Stack>
      )}

      {/* Filter */}
      <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
        <Button size="small" sx={filterButtonSx(filter === 'all')} onClick={() => setFilter('all')}>
          All ({records.length})
        </Button>
        <Button size="small" sx={filterButtonSx(filter === 'attention')} onClick={() => setFilter('attention')}>
          Needs Attention ({attentionCount})
        </Button>
        <Button size="small" sx={filterButtonSx(filter === 'healthy')} onClick={() => setFilter('healthy')}>
          Healthy ({healthyCount})
        </Button>
      </Stack>

      {/* Table */}
      <Card elevation={0} sx={{ mt: 2, border: '1px solid', borderColor: alpha('#000', 0.08), borderRadius: '14px' }}>
        <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, fontSize: '0.75rem', color: 'text.secondary', py: 1.5, borderBottom: '2px solid', borderColor: alpha('#000', 0.06) } }}>
                  <TableCell>Chemical</TableCell>
                  <TableCell align="center">Label</TableCell>
                  <TableCell align="center">SDS</TableCell>
                  <TableCell>Source Status</TableCell>
                  <TableCell>Status Flags</TableCell>
                  <TableCell>Last Checked</TableCell>
                  <TableCell>Notes</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow
                    key={r.chemical}
                    sx={{
                      '&:last-child td': { borderBottom: 0 },
                      '& td': { py: 1.5 },
                      bgcolor: r.flags.needsAttention ? alpha('#ff9800', 0.02) : 'transparent',
                    }}
                  >
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {r.chemical}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      {docButton(r.labelAvailable, r.labelUrl, 'Open Label')}
                    </TableCell>
                    <TableCell align="center">
                      {docButton(r.sdsAvailable, r.sdsUrl, 'Open SDS')}
                    </TableCell>
                    <TableCell>{sourceStatusChip(r.sourceStatus)}</TableCell>
                    <TableCell>{flagChips(r)}</TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {formatDate(r.lastCheckedAt)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {r.notes}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        startIcon={<RefreshIcon sx={{ fontSize: 16 }} />}
                        onClick={() => handleRefresh(r.chemical)}
                        disabled={refreshingKey === r.chemical || refreshingAll}
                        sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.75rem', borderRadius: '8px', minWidth: 0 }}
                      >
                        {refreshingKey === r.chemical ? '...' : 'Refresh'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                      <Typography variant="body2" color="text.secondary">
                        {records.length === 0
                          ? 'No tracked chemicals. Click Refresh All to initialise.'
                          : 'No chemicals match this filter.'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Footer summary */}
      {records.length > 0 && (
        <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
          <Typography variant="caption" color="text.secondary">
            {records.filter((r) => r.sourceStatus === 'available').length} of {records.length} sources available
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {records.filter((r) => r.labelAvailable).length} labels loaded
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {records.filter((r) => r.sdsAvailable).length} SDS loaded
          </Typography>
        </Stack>
      )}
    </Box>
  );
}
