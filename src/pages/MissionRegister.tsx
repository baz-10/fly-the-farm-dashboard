import React from 'react';
import { alpha } from '@mui/material/styles';
import { Alert, Box, Button, Chip, CircularProgress, Collapse, InputAdornment, Paper, Stack, TextField, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DownloadIcon from '@mui/icons-material/Download';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FlightTakeoffIcon from '@mui/icons-material/FlightTakeoff';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import SearchIcon from '@mui/icons-material/Search';
import { useNavigate } from 'react-router-dom';
import { useMission } from '../contexts/MissionContext';
import { MissionRecord } from '../types/mission';
import { downloadMissionPackPdf } from '../utils/missionPackPdf';
import { getMissionNextAction, groupMissionsForRegister, MissionRegisterSectionDefinition } from '../utils/missionRegister';

interface MissionSectionProps extends MissionRegisterSectionDefinition {
  missions: MissionRecord[];
  collapsed?: boolean;
  onToggle?: () => void;
  onOpenMission: (missionId: string) => void;
  onExportMission: (mission: MissionRecord) => void;
}

function MissionCard({
  mission,
  color,
  onOpen,
  onExport,
}: {
  mission: MissionRecord;
  color: string;
  onOpen: () => void;
  onExport: () => void;
}) {
  const aircraftLabel = mission.aircraftConfiguration?.aircraftId || 'Aircraft not assigned';
  return (
    <Paper variant="outlined" sx={{ p: { xs: 1.5, md: 2 }, borderRadius: 2, borderLeft: `5px solid ${color}`, transition: 'box-shadow 150ms ease, transform 150ms ease', '&:hover': { boxShadow: `0 8px 24px ${alpha(color, 0.12)}`, transform: 'translateY(-1px)' } }}>
      <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ md: 'center' }} spacing={2}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap" sx={{ mb: 0.6 }}>
            <Typography sx={{ fontWeight: 900 }} noWrap>{mission.missionName}</Typography>
            <Chip size="small" label={mission.missionNumber} sx={{ fontWeight: 800, height: 22 }} />
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {mission.location?.name || 'Location not set'} · {new Date(mission.scheduledDate).toLocaleDateString('en-AU')} · {aircraftLabel}
          </Typography>
          <Typography sx={{ mt: 0.75, color, fontSize: '0.76rem', fontWeight: 800 }}>{getMissionNextAction(mission)}</Typography>
        </Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            aria-label={`Export Mission Pack for ${mission.missionName}`}
            onClick={onExport}
          >
            Mission Pack
          </Button>
          <Button variant="outlined" endIcon={<OpenInNewIcon />} aria-label={`Open ${mission.missionName}`} onClick={onOpen}>Open</Button>
        </Stack>
      </Stack>
    </Paper>
  );
}

function MissionSection({ label, description, color, missions, collapsed = false, onToggle, onOpenMission, onExportMission }: MissionSectionProps) {
  const countLabel = `${missions.length} mission${missions.length === 1 ? '' : 's'}`;
  const header = (
    <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2} sx={{ width: '100%', textAlign: 'left' }}>
      <Box>
        <Stack direction="row" spacing={1} alignItems="center">
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color, boxShadow: `0 0 0 4px ${alpha(color, 0.12)}` }} />
          <Typography component="h2" sx={{ fontSize: '1.05rem', fontWeight: 900 }}>{label}</Typography>
          <Chip size="small" label={countLabel} sx={{ height: 22, color, bgcolor: alpha(color, 0.09), fontWeight: 800 }} />
        </Stack>
        <Typography sx={{ ml: 2.25, mt: 0.35, fontSize: '0.76rem', color: 'text.secondary' }}>{description}</Typography>
      </Box>
      {onToggle && <ExpandMoreIcon sx={{ color, transform: collapsed ? 'rotate(-90deg)' : 'rotate(0)', transition: 'transform 150ms ease' }} />}
    </Stack>
  );

  return (
    <Paper component="section" variant="outlined" sx={{ p: { xs: 1.5, md: 2 }, borderRadius: 2.5, borderTop: `4px solid ${color}`, bgcolor: alpha(color, 0.018) }}>
      {onToggle ? (
        <Button fullWidth color="inherit" aria-label={`${label}, ${countLabel}, ${collapsed ? 'collapsed' : 'expanded'}`} onClick={onToggle} sx={{ p: 0, textTransform: 'none' }}>{header}</Button>
      ) : header}
      <Collapse in={!collapsed} timeout="auto" unmountOnExit>
        <Stack spacing={1.1} sx={{ mt: 1.75 }}>
          {missions.length === 0 ? (
            <Box sx={{ py: 2, px: 1.5, borderRadius: 1.5, bgcolor: 'background.paper', border: '1px dashed', borderColor: 'divider' }}>
              <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>No missions in this stage.</Typography>
            </Box>
          ) : missions.map((mission) => (
            <MissionCard
              key={mission.id}
              mission={mission}
              color={color}
              onOpen={() => onOpenMission(mission.id)}
              onExport={() => onExportMission(mission)}
            />
          ))}
        </Stack>
      </Collapse>
    </Paper>
  );
}

export default function MissionRegister() {
  const navigate = useNavigate();
  const { missions, isLoading, error } = useMission();
  const [search, setSearch] = React.useState('');
  const [completedCollapsed, setCompletedCollapsed] = React.useState(true);
  const [exportError, setExportError] = React.useState('');
  const sections = React.useMemo(() => groupMissionsForRegister(missions, search), [missions, search]);
  const exportMission = (mission: MissionRecord) => {
    setExportError('');
    try {
      downloadMissionPackPdf(mission);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unknown export error';
      setExportError(`Mission Pack could not be exported: ${message}`);
    }
  };

  return (
    <Box sx={{ maxWidth: 1440, mx: 'auto', px: { xs: 2, md: 3.5 }, py: { xs: 2.5, md: 4 } }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2} sx={{ mb: 3 }}>
        <Box>
          <Stack direction="row" spacing={1.25} alignItems="center"><FlightTakeoffIcon color="primary" /><Typography variant="h4" sx={{ fontWeight: 900, letterSpacing: '-0.035em' }}>Missions</Typography></Stack>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>See what is flying, ready, being planned and completed.</Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/missions/new')} sx={{ alignSelf: { xs: 'stretch', sm: 'center' } }}>New Mission</Button>
      </Stack>

      <Paper variant="outlined" sx={{ p: { xs: 1.5, md: 2 }, mb: 2, borderRadius: 2 }}>
        <TextField fullWidth size="small" label="Search missions" value={search} onChange={(event) => setSearch(event.target.value)} InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {exportError && <Alert severity="error" onClose={() => setExportError('')} sx={{ mb: 2 }}>{exportError}</Alert>}
      {isLoading ? <Stack alignItems="center" sx={{ py: 8 }}><CircularProgress size={32} /></Stack> : (
        <Stack spacing={2}>
          {sections.map(({ key, ...section }) => (
            <MissionSection
              key={key}
              {...section}
              collapsed={key === 'completed' ? completedCollapsed : false}
              onToggle={key === 'completed' ? () => setCompletedCollapsed((current) => !current) : undefined}
              onOpenMission={(missionId) => navigate(`/missions/${encodeURIComponent(missionId)}`)}
              onExportMission={exportMission}
            />
          ))}
        </Stack>
      )}
    </Box>
  );
}
