import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardActions, CardContent, Chip, Collapse, Dialog, DialogActions,
  DialogContent, DialogTitle, Grid, MenuItem, Stack, TextField, Typography, alpha, useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import AssignmentIcon from '@mui/icons-material/Assignment';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HistoryIcon from '@mui/icons-material/History';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import FlightTakeoffIcon from '@mui/icons-material/FlightTakeoff';
import { useOperationalData } from '../contexts/OperationalDataContext';
import { deriveJobMissionAction } from '../utils/jobMissionAction';

type JobStart = { clientId: string; propertyId: string; fieldId: string };
const emptyStart = (): JobStart => ({ clientId: '', propertyId: '', fieldId: '' });

const formatDate = (value?: string) => value
  ? new Date(`${value.length === 10 ? `${value}T00:00:00` : value}`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
  : 'Date not set';

const statusLabel = (status: string) => status.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function JobWorkspace() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('returnTo') === '/getting-started' ? '/getting-started' : null;
  const onboardingAction = searchParams.get('onboarding');
  const theme = useTheme();
  const operational = useOperationalData();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const [start, setStart] = useState<JobStart>(emptyStart());

  const clientById = useMemo(() => new Map(operational.clients.map((client) => [client.id, client])), [operational.clients]);
  const propertyById = useMemo(() => new Map(operational.properties.map((property) => [property.id, property])), [operational.properties]);
  const fieldById = useMemo(() => new Map(operational.fields.map((field) => [field.id, field])), [operational.fields]);
  const availableProperties = operational.properties.filter((property) => property.clientId === start.clientId);
  const availableFields = operational.fields.filter((field) => field.propertyId === start.propertyId);
  const selectedField = fieldById.get(start.fieldId);

  const rows = useMemo(() => [...operational.jobs]
    .sort((a, b) => (b.scheduledDate || b.requestedDate || b.createdAt).localeCompare(a.scheduledDate || a.requestedDate || a.createdAt))
    .map((job) => {
      const client = clientById.get(job.clientId);
      const property = propertyById.get(job.propertyId);
      const fields = job.fieldIds.map((id) => fieldById.get(id)).filter(Boolean);
      const missionCount = operational.missions.filter((mission) => mission.jobId === job.id).length;
      const missionAction = deriveJobMissionAction(job.id, operational.missions);
      const searchable = [job.reference, job.scope, job.status, job.notes, client?.name, property?.name,
        ...fields.map((field) => field?.name)].filter(Boolean).join(' ').toLowerCase();
      return { job, client, property, fields, missionCount, missionAction, searchable };
    }), [clientById, fieldById, operational.jobs, operational.missions, propertyById]);
  const query = search.trim().toLowerCase();
  const filtered = query ? rows.filter((row) => row.searchable.includes(query)) : rows;

  const openCreate = () => {
    setStart(emptyStart());
    setDialogOpen(true);
  };

  useEffect(() => {
    if (onboardingAction === 'job') {
      setStart(emptyStart());
      setDialogOpen(true);
    }
  }, [onboardingAction]);

  const continueToJob = () => {
    if (!start.clientId || !start.propertyId || !start.fieldId) return;
    const suffix = returnTo ? '?returnTo=%2Fgetting-started' : '';
    navigate(`/jobs/client/${start.clientId}/property/${start.propertyId}/field/${start.fieldId}/new-job${suffix}`);
  };

  return <Box>
    <Box className="ftf-animate-in" sx={{ mb: 3.5 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'flex-end' }, mb: 2.5, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="overline" color="primary.main" fontWeight={900} letterSpacing={1.5}>OPERATIONS WORKSPACE</Typography>
          <Typography variant="h3" sx={{ fontWeight: 900, color: 'primary.dark', fontSize: { xs: '1.8rem', md: '2.5rem' }, lineHeight: 1.05 }}>Jobs</Typography>
          <Typography variant="body2" color="text.secondary">Find current or past work, open it directly or start a new Job from known Field details.</Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate} sx={{ borderRadius: '10px', px: 3, minHeight: 44, fontWeight: 800 }}>Add Job</Button>
      </Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} alignItems={{ xs: 'stretch', sm: 'center' }}>
        <TextField type="search" placeholder="Search by Job, Client, Property, Field or status" value={search} onChange={(event) => setSearch(event.target.value)} size="small" fullWidth inputProps={{ 'aria-label': 'Search jobs' }} sx={{ maxWidth: 620, '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: '10px' } }} />
        <Button variant="text" endIcon={<ExpandMoreIcon sx={{ transform: moreActionsOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />} onClick={() => setMoreActionsOpen((open) => !open)} aria-expanded={moreActionsOpen} aria-controls="job-secondary-actions" sx={{ whiteSpace: 'nowrap', fontWeight: 750 }}>More job actions</Button>
      </Stack>
      <Collapse in={moreActionsOpen}>
        <Stack id="job-secondary-actions" direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ pt: 1.5 }}>
          <Button variant="outlined" startIcon={<HistoryIcon />} onClick={() => navigate('/jobs/history')}>Job History</Button>
          <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={() => navigate('/jobs/import')}>Import Spray Rec</Button>
        </Stack>
      </Collapse>
    </Box>

    {operational.status === 'loading' && <Alert severity="info" sx={{ mb: 3 }}>Loading Jobs…</Alert>}
    {operational.status === 'unauthorised' && <Alert severity="error" sx={{ mb: 3 }}>You are not authorised to view this organisation's Jobs.</Alert>}
    {operational.status === 'error' && <Alert severity="error" sx={{ mb: 3 }} action={<Button color="inherit" size="small" onClick={() => void operational.refresh()}>Retry</Button>}>Jobs are unavailable. No cached business records are being shown.</Alert>}

    {operational.status === 'ready' && filtered.length === 0 && <Box sx={{ textAlign: 'center', py: 8 }}>
      <AssignmentIcon sx={{ fontSize: 44, color: alpha(theme.palette.text.secondary, 0.3), mb: 1.5 }} />
      <Typography variant="h6" fontWeight={750}>{rows.length ? 'No Jobs match this search' : 'No Jobs yet'}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, mb: 2.5 }}>{rows.length ? 'Try a Job reference, Client, Property, Field or status.' : 'Start the first Job from an existing Field.'}</Typography>
      {!rows.length && <Button variant="outlined" startIcon={<AddIcon />} onClick={openCreate}>Add Job</Button>}
    </Box>}

    <Grid container spacing={2} className="ftf-animate-in-delay-1">
      {filtered.map(({ job, client, property, fields, missionCount, missionAction }) => {
        const firstField = fields[0];
        const routeReady = Boolean(client && property && firstField);
        const openMissionAction = () => {
          if (!routeReady) return;
          if (missionAction.destination === 'create') {
            navigate(`/jobs/client/${job.clientId}/property/${job.propertyId}/field/${firstField?.id}/job/${job.id}/new-mission`);
          } else if (missionAction.destination === 'mission' && missionAction.missionId) {
            navigate(`/missions/${missionAction.missionId}`);
          } else {
            navigate(`/missions?jobId=${job.id}`);
          }
        };
        return <Grid size={{ xs: 12, md: 6 }} key={job.id}>
          <Card elevation={0} sx={{ height: '100%', border: `1.5px solid ${alpha(theme.palette.primary.main, 0.1)}`, borderRadius: '14px' }}>
            <CardContent sx={{ p: { xs: 2.25, sm: 2.75 }, pb: 1.25 }}>
              <Stack direction="row" spacing={1.5} justifyContent="space-between" alignItems="flex-start">
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="h6" fontWeight={850}>{job.reference}</Typography>
                  <Typography variant="body1" fontWeight={700}>{job.scope || 'Work scope not recorded'}</Typography>
                </Box>
                <Chip label={statusLabel(job.status)} size="small" color={job.status === 'completed' ? 'success' : 'default'} variant="outlined" />
              </Stack>
              <Stack spacing={0.5} sx={{ mt: 1.75 }}>
                <Typography variant="body2" fontWeight={750}>{client?.name || 'Client unavailable'}</Typography>
                <Typography variant="body2" color="text.secondary">{property?.name || 'Property unavailable'}</Typography>
                <Typography variant="body2" color="text.secondary">{fields.map((field) => field?.name).filter(Boolean).join(', ') || 'Field unavailable'}</Typography>
              </Stack>
              <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 1.75 }}><CalendarTodayIcon sx={{ fontSize: 17, color: 'text.disabled' }} /><Typography variant="body2" color="text.secondary">{job.scheduledDate ? `Scheduled ${formatDate(job.scheduledDate)}` : job.requestedDate ? `Requested ${formatDate(job.requestedDate)}` : formatDate(job.createdAt)}</Typography></Stack>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 2 }}><Chip size="small" label={`${fields.length} ${fields.length === 1 ? 'Field' : 'Fields'}`} /><Chip size="small" label={`${missionCount} ${missionCount === 1 ? 'Mission' : 'Missions'}`} variant="outlined" /></Stack>
              <Typography variant="body2" fontWeight={800} color="primary.dark" sx={{ mt: 1.5 }}>{missionAction.summary}</Typography>
              {!routeReady && <Alert severity="warning" sx={{ mt: 2 }}>This Job's parent records are incomplete. Open it from its authoritative Field after the relationship is restored.</Alert>}
            </CardContent>
            <CardActions sx={{ px: { xs: 2.25, sm: 2.75 }, pb: 2.25, justifyContent: 'flex-end', flexWrap: 'wrap', gap: 0.5 }}>
              <Button endIcon={<ArrowForwardIcon />} aria-label={`Open ${job.reference}`} disabled={!routeReady} onClick={() => navigate(`/jobs/client/${job.clientId}/property/${job.propertyId}/field/${firstField?.id}/job/${job.id}`)} sx={{ fontWeight: 800 }}>Open Job</Button>
              <Button variant="contained" startIcon={<FlightTakeoffIcon />} aria-label={`${missionAction.label} for ${job.reference}`} disabled={!routeReady} onClick={openMissionAction} sx={{ fontWeight: 800 }}>{missionAction.label}</Button>
            </CardActions>
          </Card>
        </Grid>;
      })}
    </Grid>

    <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
      <DialogTitle sx={{ fontWeight: 800 }}>Add Job</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Choose where the work will occur. Spray Command will carry this context into the existing Job form.</Typography>
        <Stack spacing={2}>
          <TextField select label="Select Client" value={start.clientId} onChange={(event) => setStart({ clientId: event.target.value, propertyId: '', fieldId: '' })} required fullWidth>
            {operational.clients.map((client) => <MenuItem key={client.id} value={client.id}>{client.name}</MenuItem>)}
          </TextField>
          {start.clientId && <TextField select label="Select Property" value={start.propertyId} onChange={(event) => setStart((current) => ({ ...current, propertyId: event.target.value, fieldId: '' }))} required fullWidth>
            {availableProperties.map((property) => <MenuItem key={property.id} value={property.id}>{property.name}</MenuItem>)}
          </TextField>}
          {start.propertyId && <TextField select label="Select Field" value={start.fieldId} onChange={(event) => setStart((current) => ({ ...current, fieldId: event.target.value }))} required fullWidth>
            {availableFields.map((field) => <MenuItem key={field.id} value={field.id}>{field.name}</MenuItem>)}
          </TextField>}
          {selectedField && <Alert severity="info"><Typography variant="body2" fontWeight={800}>{selectedField.name}</Typography><Typography variant="caption">{Number((selectedField.sizeHa || 0).toFixed(1))} ha · Known Field details will be reused.</Typography></Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}><Button onClick={() => setDialogOpen(false)}>Cancel</Button><Button variant="contained" onClick={continueToJob} disabled={!start.fieldId}>Continue to Job details</Button></DialogActions>
    </Dialog>
  </Box>;
}
