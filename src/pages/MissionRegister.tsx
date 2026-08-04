import React from 'react';
import { alpha } from '@mui/material/styles';
import { Alert, Box, Button, Chip, CircularProgress, Collapse, InputAdornment, Paper, Stack, TextField, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FlightTakeoffIcon from '@mui/icons-material/FlightTakeoff';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import SearchIcon from '@mui/icons-material/Search';
import { useNavigate } from 'react-router-dom';
import { useMission } from '../contexts/MissionContext';
import { useOperationalData } from '../contexts/OperationalDataContext';
import { MissionRecord } from '../types/mission';
import { getMissionNextAction, groupMissionsForRegister, MissionRegisterSectionDefinition } from '../utils/missionRegister';
import { createMissionSetupDraftsApi, MissionSetupDraft } from '../services/missionSetupDraftsApi';

interface MissionSectionProps extends MissionRegisterSectionDefinition {
  missions: MissionRecord[];
  collapsed?: boolean;
  onToggle?: () => void;
  onOpenMission: (missionId: string) => void;
}

function MissionCard({ mission, color, onOpen }: { mission: MissionRecord; color: string; onOpen: () => void }) {
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
        <Button variant="outlined" endIcon={<OpenInNewIcon />} aria-label={`Open ${mission.missionName}`} onClick={onOpen}>Open</Button>
      </Stack>
    </Paper>
  );
}

function MissionSection({ label, description, color, missions, collapsed = false, onToggle, onOpenMission }: MissionSectionProps) {
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
          ) : missions.map((mission) => <MissionCard key={mission.id} mission={mission} color={color} onOpen={() => onOpenMission(mission.id)} />)}
        </Stack>
      </Collapse>
    </Paper>
  );
}

export default function MissionRegister() {
  const operational = useOperationalData();
  return operational.mode === 'remote' ? <AuthoritativeMissionRegister /> : <LocalMissionRegister />;
}

function AuthoritativeMissionRegister() {
  const navigate = useNavigate();
  const operational = useOperationalData();
  const [search, setSearch] = React.useState('');
  const [setupDrafts,setSetupDrafts]=React.useState<MissionSetupDraft[]>([]);
  const draftsApi=React.useMemo(()=>createMissionSetupDraftsApi(),[]);
  React.useEffect(()=>{void draftsApi.list().then(setSetupDrafts).catch(()=>setSetupDrafts([]));},[draftsApi]);
  const normalizedSearch = search.trim().toLowerCase();
  const missions = operational.missions.filter((mission) => !normalizedSearch || [
    mission.title, mission.missionNumber, mission.description,
    operational.jobs.find((job) => job.id === mission.jobId)?.reference || '',
    operational.operatingLocations.find((location) => location.id === mission.operatingLocationId)?.name || '',
  ].some((value) => value.toLowerCase().includes(normalizedSearch)));

  const content = () => {
    if (operational.status === 'idle' || operational.status === 'loading') {
      return <Stack alignItems="center" spacing={1.5} sx={{ py: 8 }}><CircularProgress size={32} /><Typography color="text.secondary">Loading authoritative missions…</Typography></Stack>;
    }
    if (operational.status === 'unauthorised') {
      return <Alert severity="error">You are not authorised to view missions for this operational session.</Alert>;
    }
    if (operational.status === 'error') {
      return <Alert severity="error">Authoritative mission register is unavailable. No browser mission records have been substituted.</Alert>;
    }
    if (missions.length === 0) {
      if (normalizedSearch && operational.missions.length > 0) {
        return <Paper variant="outlined" sx={{ p: 5, textAlign: 'center', borderRadius: 2.5 }}><Typography sx={{ fontWeight: 800 }}>No missions match your search</Typography><Typography color="text.secondary">Clear or change the search to see authoritative Planning missions.</Typography></Paper>;
      }
      return <Paper variant="outlined" sx={{ p: 5, textAlign: 'center', borderRadius: 2.5 }}><Typography sx={{ fontWeight: 800 }}>No Planning missions</Typography><Typography color="text.secondary">The authoritative mission register returned no active Planning missions.</Typography></Paper>;
    }
    return (
      <Stack spacing={1.25}>
        {missions.map((mission) => {
          const job = operational.jobs.find((record) => record.id === mission.jobId);
          const location = operational.operatingLocations.find((record) => record.id === mission.operatingLocationId);
          return (
            <Paper key={mission.id} variant="outlined" sx={{ p: { xs: 1.5, md: 2 }, borderRadius: 2, borderLeft: '5px solid', borderLeftColor: 'warning.main' }}>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
                <Box sx={{ flex: 1 }}>
                  <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
                    <Typography sx={{ fontWeight: 900 }}>{mission.title}</Typography>
                    <Chip size="small" label={mission.missionNumber} sx={{ fontWeight: 800 }} />
                    <Chip size="small" color="warning" variant="outlined" label="Planning · Not ready for operations" />
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                    {job?.reference || 'Job unavailable'} · {location?.name || 'Operating location unavailable'} · {mission.scheduledStartAt ? new Date(mission.scheduledStartAt).toLocaleString('en-AU') : 'Start not scheduled'}
                  </Typography>
                </Box>
                <Button variant="outlined" endIcon={<OpenInNewIcon />} aria-label={`Open ${mission.title}`} onClick={() => navigate(`/missions/${encodeURIComponent(mission.id)}`)}>Open</Button>
              </Stack>
            </Paper>
          );
        })}
      </Stack>
    );
  };

  return (
    <Box sx={{ maxWidth: 1440, mx: 'auto', px: { xs: 2, md: 3.5 }, py: { xs: 2.5, md: 4 } }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2} sx={{ mb: 3 }}>
        <Box>
          <Stack direction="row" spacing={1.25} alignItems="center"><FlightTakeoffIcon color="primary" /><Typography variant="h4" sx={{ fontWeight: 900, letterSpacing: '-0.035em' }}>Missions</Typography></Stack>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>Authoritative Planning missions. Operational readiness and authorisation are not connected.</Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/missions/new')} sx={{ alignSelf: { xs: 'stretch', sm: 'center' } }}>New Mission</Button>
      </Stack>
      <Alert severity="warning" sx={{ mb: 2 }}>Remote missions remain Planning and not ready for operations until aircraft, crew, compliance and authorisation dependencies are connected.</Alert>
      {setupDrafts.length>0&&<Paper component="section" variant="outlined" sx={{p:{xs:1.5,md:2},mb:2,borderRadius:2.5,borderLeft:'5px solid',borderLeftColor:'info.main'}}><Typography component="h2" sx={{fontWeight:900,mb:1}}>Mission setup drafts</Typography><Stack spacing={1}>{setupDrafts.map(draft=><Stack key={draft.id} direction={{xs:'column',sm:'row'}} justifyContent="space-between" alignItems={{sm:'center'}} spacing={1}><Box><Typography fontWeight={800}>Draft Mission setup</Typography><Typography variant="body2" color="text.secondary">Step {draft.currentStep+1} of 10 · Last saved {new Date(draft.updatedAt).toLocaleString('en-AU')}</Typography></Box><Stack direction="row" spacing={1}><Button variant="contained" onClick={()=>navigate(`/missions/new?draftId=${encodeURIComponent(draft.id)}`)}>Continue setup</Button><Button color="error" onClick={()=>void draftsApi.archive(draft.id,draft.rowVersion).then(()=>setSetupDrafts(values=>values.filter(x=>x.id!==draft.id)))}>Archive</Button></Stack></Stack>)}</Stack></Paper>}
      <Paper variant="outlined" sx={{ p: { xs: 1.5, md: 2 }, mb: 2, borderRadius: 2 }}>
        <TextField fullWidth size="small" label="Search missions" value={search} onChange={(event) => setSearch(event.target.value)} InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
      </Paper>
      {content()}
    </Box>
  );
}

function LocalMissionRegister() {
  const navigate = useNavigate();
  const { missions, isLoading, error } = useMission();
  const [search, setSearch] = React.useState('');
  const [completedCollapsed, setCompletedCollapsed] = React.useState(true);
  const sections = React.useMemo(() => groupMissionsForRegister(missions, search), [missions, search]);

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
      {isLoading ? <Stack alignItems="center" sx={{ py: 8 }}><CircularProgress size={32} /></Stack> : (
        <Stack spacing={2}>
          {sections.map(({ key, ...section }) => <MissionSection key={key} {...section} collapsed={key === 'completed' ? completedCollapsed : false} onToggle={key === 'completed' ? () => setCompletedCollapsed((current) => !current) : undefined} onOpenMission={(missionId) => navigate(`/missions/${encodeURIComponent(missionId)}`)} />)}
        </Stack>
      )}
    </Box>
  );
}
