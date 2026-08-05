import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardActions, CardContent, Chip, Collapse, Dialog, DialogActions,
  DialogContent, DialogTitle, Grid, MenuItem, Stack, TextField, Typography, alpha, useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import GrassIcon from '@mui/icons-material/Grass';
import HistoryIcon from '@mui/icons-material/History';
import MapIcon from '@mui/icons-material/Map';
import PlaceIcon from '@mui/icons-material/Place';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import FieldBoundaryEditor from '../components/FieldBoundaryEditor';
import { useOperationalData } from '../contexts/OperationalDataContext';
import { describeOperationalError } from '../services/operationalDataStore';
import { LatLng } from '../types/fieldManagement';

type FieldDraft = { clientId: string; propertyId: string; name: string; area: number; coords: LatLng[] };
const emptyDraft = (): FieldDraft => ({ clientId: '', propertyId: '', name: '', area: 0, coords: [] });

export default function FieldWorkspace() {
  const navigate = useNavigate();
  const theme = useTheme();
  const operational = useOperationalData();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const [draft, setDraft] = useState<FieldDraft>(emptyDraft());
  const [actionError, setActionError] = useState('');

  const clients = useMemo(() => new Map(operational.clients.map((client) => [client.id, client])), [operational.clients]);
  const properties = useMemo(() => new Map(operational.properties.map((property) => [property.id, property])), [operational.properties]);
  const selectedProperty = properties.get(draft.propertyId);
  const availableProperties = operational.properties.filter((property) => property.clientId === draft.clientId);

  const rows = useMemo(() => operational.fields.map((field) => {
    const property = properties.get(field.propertyId);
    const client = property ? clients.get(property.clientId) : undefined;
    const linkedJobs = operational.jobs.filter((job) => job.fieldIds.includes(field.id));
    const linkedMissions = operational.missions.filter((mission) => linkedJobs.some((job) => job.id === mission.jobId));
    const location = property ? [property.address, property.locality, property.state].filter(Boolean).join(', ') : '';
    const searchable = [field.name, property?.name, client?.name, property?.address, property?.locality,
      property?.state, property?.lotPlan].filter(Boolean).join(' ').toLowerCase();
    return { field, property, client, linkedJobs, linkedMissions, location, searchable };
  }), [clients, operational.fields, operational.jobs, operational.missions, properties]);
  const query = search.trim().toLowerCase();
  const filtered = query ? rows.filter((row) => row.searchable.includes(query)) : rows;

  const openCreate = () => {
    setDraft(emptyDraft());
    setActionError('');
    setDialogOpen(true);
  };

  const saveField = async () => {
    if (!draft.propertyId || !draft.name.trim()) return;
    try {
      const created = await operational.createField({
        propertyId: draft.propertyId,
        name: draft.name.trim(),
        sizeHa: draft.area,
        boundary: null,
        boundaryCoords: draft.coords.length >= 3 ? draft.coords : undefined,
        notes: '',
      });
      if (draft.coords.length >= 3) await operational.createFieldBoundaryVersion(created.id, draft.coords);
      const parent = properties.get(created.propertyId);
      setDialogOpen(false);
      setDraft(emptyDraft());
      navigate(`/jobs/client/${parent?.clientId || draft.clientId}/property/${created.propertyId}/field/${created.id}`);
    } catch (error) {
      setActionError(describeOperationalError(error));
    }
  };

  return <Box>
    <Box className="ftf-animate-in" sx={{ mb: 3.5 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'flex-end' }, mb: 2.5, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="overline" color="primary.main" fontWeight={900} letterSpacing={1.5}>FIELD WORKSPACE</Typography>
          <Typography variant="h3" sx={{ fontWeight: 900, color: 'primary.dark', fontSize: { xs: '1.8rem', md: '2.5rem' }, lineHeight: 1.05 }}>Fields</Typography>
          <Typography variant="body2" color="text.secondary">Find a Field, see its Property and Client, then open its operational history.</Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate} sx={{ borderRadius: '10px', px: 3, minHeight: 44, fontWeight: 800 }}>Add Field</Button>
      </Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} alignItems={{ xs: 'stretch', sm: 'center' }}>
        <TextField type="search" placeholder="Search by Field, Property, Client or location" value={search} onChange={(event) => setSearch(event.target.value)} size="small" fullWidth inputProps={{ 'aria-label': 'Search fields' }} sx={{ maxWidth: 620, '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: '10px' } }} />
        <Button variant="text" endIcon={<ExpandMoreIcon sx={{ transform: moreActionsOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />} onClick={() => setMoreActionsOpen((open) => !open)} aria-expanded={moreActionsOpen} aria-controls="field-secondary-actions" sx={{ whiteSpace: 'nowrap', fontWeight: 750 }}>More field actions</Button>
      </Stack>
      <Collapse in={moreActionsOpen}>
        <Stack id="field-secondary-actions" direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ pt: 1.5 }}>
          <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={() => navigate('/jobs/import')}>Import Spray Rec</Button>
          <Button variant="outlined" startIcon={<HistoryIcon />} onClick={() => navigate('/jobs/history')}>Job History</Button>
        </Stack>
      </Collapse>
    </Box>

    {actionError && <Alert severity="error" sx={{ mb: 2 }}>{actionError}</Alert>}
    {operational.status === 'loading' && <Alert severity="info" sx={{ mb: 3 }}>Loading operational data…</Alert>}
    {operational.status === 'unauthorised' && <Alert severity="error" sx={{ mb: 3 }}>You are not authorised to view this organisation's Fields.</Alert>}
    {operational.status === 'error' && <Alert severity="error" sx={{ mb: 3 }} action={<Button color="inherit" size="small" onClick={() => void operational.refresh()}>Retry</Button>}>Fields are unavailable. No cached business records are being shown.</Alert>}

    {operational.status === 'ready' && filtered.length === 0 && <Box sx={{ textAlign: 'center', py: 8 }}>
      <GrassIcon sx={{ fontSize: 44, color: alpha(theme.palette.text.secondary, 0.3), mb: 1.5 }} />
      <Typography variant="h6" fontWeight={750}>{rows.length ? 'No Fields match this search' : 'No Fields yet'}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, mb: 2.5 }}>{rows.length ? 'Try a Field, Property, Client or location.' : 'Add the first Field under an existing Property.'}</Typography>
      {!rows.length && <Button variant="outlined" startIcon={<AddIcon />} onClick={openCreate}>Add Field</Button>}
    </Box>}

    <Grid container spacing={2} className="ftf-animate-in-delay-1">
      {filtered.map(({ field, property, client, linkedJobs, linkedMissions, location }) => <Grid size={{ xs: 12, md: 6 }} key={field.id}>
        <Card elevation={0} sx={{ height: '100%', border: `1.5px solid ${alpha(theme.palette.primary.main, 0.1)}`, borderRadius: '14px' }}>
          <CardContent sx={{ p: { xs: 2.25, sm: 2.75 }, pb: 1.25 }}>
            <Stack direction="row" spacing={1.5} alignItems="flex-start">
              <Box sx={{ width: 44, height: 44, flex: '0 0 auto', borderRadius: '12px', bgcolor: alpha(theme.palette.success.main, 0.09), display: 'flex', alignItems: 'center', justifyContent: 'center' }}><GrassIcon color="success" /></Box>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="h6" fontWeight={800}>{field.name}</Typography>
                <Typography variant="body2" color="text.secondary">{property?.name || 'Property unavailable'}</Typography>
                <Typography variant="caption" color="text.secondary">{client?.name || 'Client unavailable'}</Typography>
              </Box>
            </Stack>
            <Stack spacing={0.75} sx={{ mt: 2 }}>
              <Stack direction="row" spacing={0.75} alignItems="flex-start"><PlaceIcon sx={{ fontSize: 17, color: 'text.disabled', mt: 0.2 }} /><Typography variant="body2" color="text.secondary">{location || 'Property location not recorded'}</Typography></Stack>
              <Stack direction="row" spacing={0.75} alignItems="center"><MapIcon sx={{ fontSize: 17, color: 'text.disabled' }} /><Typography variant="body2" color="text.secondary">{field.fieldBoundaryVersionId || (field.boundaryCoords?.length || 0) >= 3 ? 'Boundary recorded' : 'Boundary not recorded'}</Typography></Stack>
            </Stack>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 2 }}>
              <Chip size="small" label={`${Number((field.sizeHa || 0).toFixed(1))} ha`} />
              <Chip size="small" label={`${linkedJobs.length} ${linkedJobs.length === 1 ? 'Job' : 'Jobs'}`} variant="outlined" />
              {linkedMissions.length > 0 && <Chip size="small" label={`${linkedMissions.length} ${linkedMissions.length === 1 ? 'Mission' : 'Missions'}`} variant="outlined" />}
            </Stack>
          </CardContent>
          <CardActions sx={{ px: { xs: 2.25, sm: 2.75 }, pb: 2.25, justifyContent: 'flex-end' }}>
            <Button endIcon={<ArrowForwardIcon />} aria-label={`Open ${field.name}`} disabled={!property || !client} onClick={() => navigate(`/jobs/client/${client?.id}/property/${property?.id}/field/${field.id}`)} sx={{ fontWeight: 800 }}>Open Field</Button>
          </CardActions>
        </Card>
      </Grid>)}
    </Grid>

    <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
      <DialogTitle sx={{ fontWeight: 800 }}>Add Field</DialogTitle>
      <DialogContent>
        <Stack spacing={2.25} sx={{ mt: 1 }}>
          <TextField select label="Select Client" value={draft.clientId} onChange={(event) => setDraft({ ...emptyDraft(), clientId: event.target.value })} required fullWidth>
            {operational.clients.map((client) => <MenuItem key={client.id} value={client.id}>{client.name}</MenuItem>)}
          </TextField>
          {draft.clientId && <TextField select label="Select Property" value={draft.propertyId} onChange={(event) => setDraft((current) => ({ ...current, propertyId: event.target.value, coords: [], area: 0 }))} required fullWidth>
            {availableProperties.map((property) => <MenuItem key={property.id} value={property.id}>{property.name}</MenuItem>)}
          </TextField>}
          {selectedProperty && <>
            <Alert severity="info" icon={<PlaceIcon />}><Typography variant="body2" fontWeight={800}>{selectedProperty.name}</Typography><Typography variant="caption">{[selectedProperty.address, selectedProperty.locality, selectedProperty.state].filter(Boolean).join(', ') || 'Property location not recorded'}</Typography></Alert>
            <TextField label="Field name" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} required fullWidth autoFocus />
            <Box>
              <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 0.5 }}>Field boundary</Typography>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.25 }}>Draw or upload the boundary now, or add it later from the Field.</Typography>
              <FieldBoundaryEditor coords={draft.coords} onCoordsChange={(coords) => setDraft((current) => ({ ...current, coords }))} onAreaChange={(area) => setDraft((current) => ({ ...current, area }))} propertyLat={selectedProperty.lat} propertyLng={selectedProperty.lng} initialAddress={selectedProperty.address} mapHeight={360} />
              <Typography variant="body2" fontWeight={800} sx={{ mt: 1 }}>{draft.area > 0 ? `${Number(draft.area.toFixed(2))} ha calculated from boundary` : 'Area will be calculated from the saved boundary.'}</Typography>
            </Box>
          </>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}><Button onClick={() => setDialogOpen(false)}>Cancel</Button><Button variant="contained" onClick={() => void saveField()} disabled={!draft.propertyId || !draft.name.trim() || operational.saving}>{operational.saving ? 'Saving…' : 'Save Field'}</Button></DialogActions>
    </Dialog>
  </Box>;
}
