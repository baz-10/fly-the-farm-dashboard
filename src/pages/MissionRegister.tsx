import React from 'react';
import { alpha } from '@mui/material/styles';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import FlightTakeoffIcon from '@mui/icons-material/FlightTakeoff';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import SearchIcon from '@mui/icons-material/Search';
import { useNavigate } from 'react-router-dom';
import { useMission } from '../contexts/MissionContext';
import { MissionRecord, MissionStatus } from '../types/mission';

const STATUS_LABEL: Record<MissionStatus, string> = {
  Planning: 'Planning',
  Approved: 'Authorised',
  Flying: 'In progress',
  Completed: 'Completed',
  Locked: 'Completed',
};

const STATUS_COLOR: Record<MissionStatus, 'default' | 'info' | 'success' | 'warning'> = {
  Planning: 'warning',
  Approved: 'info',
  Flying: 'success',
  Completed: 'default',
  Locked: 'default',
};

type RegisterFilter = 'all' | 'Planning' | 'Authorised' | 'Completed';

function matchesFilter(mission: MissionRecord, filter: RegisterFilter) {
  if (filter === 'all') return true;
  if (filter === 'Authorised') return mission.status === 'Approved' || mission.status === 'Flying';
  if (filter === 'Completed') return mission.status === 'Completed' || mission.status === 'Locked';
  return mission.status === 'Planning';
}

export default function MissionRegister() {
  const navigate = useNavigate();
  const { missions, isLoading, error } = useMission();
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState<RegisterFilter>('all');

  const visibleMissions = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...missions]
      .filter((mission) => matchesFilter(mission, status))
      .filter((mission) => !query || [
        mission.missionName,
        mission.missionNumber,
        mission.location?.name,
        mission.location?.address,
      ].some((value) => value?.toLowerCase().includes(query)))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [missions, search, status]);

  return (
    <Box sx={{ maxWidth: 1440, mx: 'auto', px: { xs: 2, md: 3.5 }, py: { xs: 2.5, md: 4 } }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2} sx={{ mb: 3 }}>
        <Box>
          <Stack direction="row" spacing={1.25} alignItems="center">
            <FlightTakeoffIcon color="primary" />
            <Typography variant="h4" sx={{ fontWeight: 900, letterSpacing: '-0.035em' }}>Missions</Typography>
          </Stack>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            Plan, authorise and review every mission from one register.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/missions/new')} sx={{ alignSelf: { xs: 'stretch', sm: 'center' } }}>
          New Mission
        </Button>
      </Stack>

      <Paper variant="outlined" sx={{ p: { xs: 1.5, md: 2 }, mb: 2, borderRadius: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
          <TextField
            fullWidth
            size="small"
            label="Search missions"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
          />
          <TextField
            select
            size="small"
            label="Status"
            value={status}
            onChange={(event) => setStatus(event.target.value as RegisterFilter)}
            sx={{ minWidth: { md: 210 } }}
          >
            <MenuItem value="all">All missions</MenuItem>
            <MenuItem value="Planning">Planning</MenuItem>
            <MenuItem value="Authorised">Authorised</MenuItem>
            <MenuItem value="Completed">Completed</MenuItem>
          </TextField>
        </Stack>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {isLoading ? (
        <Stack alignItems="center" sx={{ py: 8 }}><CircularProgress size={32} /></Stack>
      ) : visibleMissions.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 6, textAlign: 'center', borderRadius: 2 }}>
          <Typography sx={{ fontWeight: 800 }}>No missions match this view</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>Start a new mission or change the filters.</Typography>
          <Button variant="contained" onClick={() => navigate('/missions/new')}>New Mission</Button>
        </Paper>
      ) : (
        <Stack spacing={1.25}>
          {visibleMissions.map((mission) => (
            <Paper
              key={mission.id}
              variant="outlined"
              sx={(theme) => ({
                p: { xs: 1.5, md: 2 },
                borderRadius: 2,
                transition: 'border-color 150ms ease, box-shadow 150ms ease',
                '&:hover': { borderColor: theme.palette.primary.main, boxShadow: `0 8px 24px ${alpha(theme.palette.primary.main, 0.08)}` },
              })}
            >
              <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ md: 'center' }} spacing={2}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                    <Typography sx={{ fontWeight: 900 }} noWrap>{mission.missionName}</Typography>
                    <Chip size="small" color={STATUS_COLOR[mission.status]} label={STATUS_LABEL[mission.status]} />
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    {mission.missionNumber} · {mission.location?.name || 'Location not set'} · {new Date(mission.scheduledDate).toLocaleDateString('en-AU')}
                  </Typography>
                </Box>
                <Button
                  variant="outlined"
                  endIcon={<OpenInNewIcon />}
                  aria-label={`Open ${mission.missionName}`}
                  onClick={() => navigate(`/missions/${encodeURIComponent(mission.id)}`)}
                >
                  Open
                </Button>
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}
    </Box>
  );
}
