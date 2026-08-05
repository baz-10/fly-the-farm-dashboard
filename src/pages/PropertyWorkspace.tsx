import React, { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  MenuItem,
  Stack,
  TextField,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import BusinessIcon from '@mui/icons-material/Business';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HistoryIcon from '@mui/icons-material/History';
import PlaceIcon from '@mui/icons-material/Place';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import AddressAutocomplete, { AddressResult } from '../components/AddressAutocomplete';
import { useOperationalData } from '../contexts/OperationalDataContext';
import { ALL_STATES, AustralianState } from '../types/chemical';
import { ClientAddress, PropertyAddressSource } from '../types/fieldManagement';
import { describeOperationalError } from '../services/operationalDataStore';

type PropertyDraft = {
  clientId: string;
  name: string;
  address: string;
  locality: string;
  state: AustralianState;
  postcode: string;
  lotPlan: string;
  primaryContactName: string;
  accessNotes: string;
  notes: string;
  lat?: number;
  lng?: number;
  addressSource: PropertyAddressSource;
  locationConfirmedAt?: string;
  provenance: string;
};

const emptyDraft = (): PropertyDraft => ({
  clientId: '', name: '', address: '', locality: '', state: 'QLD', postcode: '', lotPlan: '',
  primaryContactName: '', accessNotes: '', notes: '', addressSource: 'MANUAL', provenance: '',
});

const confirmedLocations = (addresses?: ClientAddress[]) => (addresses || []).filter((address) =>
  Number.isFinite(address.lat) && Number.isFinite(address.lng) && Boolean(address.locationConfirmedAt),
);

const sourceLabel = (source?: ClientAddress['coordinateSource']) =>
  source === 'MANUALLY_ADJUSTED' ? 'Manually adjusted' : 'Address search';

export default function PropertyWorkspace() {
  const navigate = useNavigate();
  const theme = useTheme();
  const operational = useOperationalData();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const [moreDetailsOpen, setMoreDetailsOpen] = useState(false);
  const [draft, setDraft] = useState<PropertyDraft>(emptyDraft());
  const [locationError, setLocationError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionReference, setActionReference] = useState('');
  const [mapKey, setMapKey] = useState(0);
  const locationSectionRef = useRef<HTMLDivElement>(null);

  const clientById = useMemo(() => new Map(operational.clients.map((client) => [client.id, client])), [operational.clients]);
  const selectedClient = clientById.get(draft.clientId);
  const selectedClientLocations = confirmedLocations(selectedClient?.addresses);

  const rows = useMemo(() => operational.properties.map((property) => {
    const client = clientById.get(property.clientId);
    const fields = operational.fields.filter((field) => field.propertyId === property.id);
    const area = fields.reduce((total, field) => total + (field.sizeHa || 0), 0);
    const matchingClientLocation = confirmedLocations(client?.addresses).find((location) =>
      location.lat === property.lat && location.lng === property.lng,
    );
    const location = [property.address, property.locality, property.state, matchingClientLocation?.postcode].filter(Boolean).join(', ');
    const searchable = [property.name, client?.name, property.address, property.locality, property.state,
      matchingClientLocation?.postcode, property.lotPlan].filter(Boolean).join(' ').toLowerCase();
    return { property, client, fields, area, location, searchable, matchingClientLocation };
  }), [clientById, operational.fields, operational.properties]);

  const query = search.trim().toLowerCase();
  const filtered = query ? rows.filter((row) => row.searchable.includes(query)) : rows;

  const openCreate = () => {
    setDraft(emptyDraft());
    setLocationError('');
    setActionError('');
    setActionReference('');
    setMoreDetailsOpen(false);
    setMapKey((current) => current + 1);
    setDialogOpen(true);
  };

  const selectClient = (clientId: string) => {
    setDraft((current) => ({ ...emptyDraft(), name: current.name, clientId }));
    setLocationError('');
    setMapKey((current) => current + 1);
  };

  const inheritLocation = (location: ClientAddress) => {
    setDraft((current) => ({
      ...current,
      address: location.address,
      locality: location.locality,
      state: location.state,
      postcode: location.postcode,
      lat: location.lat,
      lng: location.lng,
      addressSource: location.coordinateSource === 'MANUALLY_ADJUSTED' ? 'MANUAL' : 'GEOCODED',
      locationConfirmedAt: undefined,
      provenance: `Inherited from Client location · ${location.label} · ${sourceLabel(location.coordinateSource)}`,
    }));
    setLocationError('');
    setMapKey((current) => current + 1);
  };

  const selectAddress = (result: AddressResult) => {
    setDraft((current) => ({
      ...current,
      address: result.address,
      locality: result.locality,
      state: result.state,
      postcode: result.postcode,
      lat: result.lat,
      lng: result.lng,
      addressSource: result.coordinateSource === 'MANUALLY_ADJUSTED' ? 'MANUAL' : 'GEOCODED',
      locationConfirmedAt: result.locationConfirmedAt,
      provenance: result.coordinateSource === 'MANUALLY_ADJUSTED' ? 'Manually adjusted Property location' : 'Address search',
    }));
    if (result.locationConfirmedAt) setLocationError('');
  };

  const focusLocation = () => {
    locationSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    locationSectionRef.current?.focus({ preventScroll: true });
  };

  const saveProperty = async () => {
    setActionError('');
    setActionReference('');
    if (!draft.clientId || !draft.name.trim()) {
      setActionError('Select a Client and enter a Property name before saving.');
      return;
    }
    if (!Number.isFinite(draft.lat) || !Number.isFinite(draft.lng) || !draft.locationConfirmedAt) {
      setLocationError('Choose a saved Client location or search for an address, then confirm the Property location before saving.');
      focusLocation();
      return;
    }
    try {
      const property = await operational.createProperty({
        clientId: draft.clientId,
        name: draft.name.trim(),
        address: draft.address.trim(),
        state: draft.state,
        locality: draft.locality.trim(),
        postcode: draft.postcode.trim(),
        lotPlan: draft.lotPlan.trim(),
        lat: draft.lat,
        lng: draft.lng,
        addressSource: draft.addressSource,
        locationConfirmedAt: draft.locationConfirmedAt,
        primaryContactName: draft.primaryContactName.trim(),
        accessNotes: draft.accessNotes.trim(),
        notes: draft.notes.trim(),
      });
      setDialogOpen(false);
      setDraft(emptyDraft());
      navigate(`/jobs/client/${property.clientId}/property/${property.id}`);
    } catch (error) {
      setActionError(describeOperationalError(error));
      const reference = (error as { details?: { correlationId?: unknown } })?.details?.correlationId;
      setActionReference(typeof reference === 'string' ? reference : '');
    }
  };

  return <Box>
    <Box className="ftf-animate-in" sx={{ mb: 3.5 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'flex-end' }, mb: 2.5, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="overline" color="primary.main" fontWeight={900} letterSpacing={1.5}>CLIENT WORKSPACE</Typography>
          <Typography variant="h3" sx={{ fontWeight: 900, color: 'primary.dark', fontSize: { xs: '1.8rem', md: '2.5rem' }, lineHeight: 1.05 }}>Properties</Typography>
          <Typography variant="body2" color="text.secondary">Find a property, see who owns it and open its fields and work history.</Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate} sx={{ borderRadius: '10px', px: 3, minHeight: 44, fontWeight: 800 }}>Add Property</Button>
      </Box>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} alignItems={{ xs: 'stretch', sm: 'center' }}>
        <TextField type="search" placeholder="Search by property, client or location" value={search} onChange={(event) => setSearch(event.target.value)} size="small" fullWidth inputProps={{ 'aria-label': 'Search properties' }} sx={{ maxWidth: 620, '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: '10px' } }} />
        <Button variant="text" endIcon={<ExpandMoreIcon sx={{ transform: moreActionsOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />} onClick={() => setMoreActionsOpen((open) => !open)} aria-expanded={moreActionsOpen} aria-controls="property-secondary-actions" sx={{ whiteSpace: 'nowrap', fontWeight: 750 }}>More property actions</Button>
      </Stack>
      <Collapse in={moreActionsOpen}>
        <Stack id="property-secondary-actions" direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ pt: 1.5 }}>
          <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={() => navigate('/jobs/import')}>Import Spray Rec</Button>
          <Button variant="outlined" startIcon={<HistoryIcon />} onClick={() => navigate('/jobs/history')}>Job History</Button>
        </Stack>
      </Collapse>
    </Box>

    {operational.status === 'loading' && <Alert severity="info" sx={{ mb: 3 }}>Loading operational data…</Alert>}
    {operational.status === 'unauthorised' && <Alert severity="error" sx={{ mb: 3 }}>You are not authorised to view this organisation's Properties.</Alert>}
    {operational.status === 'error' && <Alert severity="error" sx={{ mb: 3 }} action={<Button color="inherit" size="small" onClick={() => void operational.refresh()}>Retry</Button>}>Properties are unavailable. No cached business records are being shown.</Alert>}

    {operational.status === 'ready' && filtered.length === 0 && <Box sx={{ textAlign: 'center', py: 8 }}>
      <BusinessIcon sx={{ fontSize: 44, color: alpha(theme.palette.text.secondary, 0.3), mb: 1.5 }} />
      <Typography variant="h6" fontWeight={750}>{rows.length ? 'No Properties match this search' : 'No Properties yet'}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, mb: 2.5 }}>{rows.length ? 'Try a Property name, Client, address or locality.' : 'Add the first Property and reuse a confirmed Client location.'}</Typography>
      {!rows.length && <Button variant="outlined" startIcon={<AddIcon />} onClick={openCreate}>Add Property</Button>}
    </Box>}

    <Grid container spacing={2} className="ftf-animate-in-delay-1">
      {filtered.map(({ property, client, fields, area, location, matchingClientLocation }) => <Grid size={{ xs: 12, md: 6 }} key={property.id}>
        <Card elevation={0} sx={{ height: '100%', border: `1.5px solid ${alpha(theme.palette.primary.main, 0.1)}`, borderRadius: '14px' }}>
          <CardContent sx={{ p: { xs: 2.25, sm: 2.75 }, pb: 1.25 }}>
            <Stack direction="row" spacing={1.5} alignItems="flex-start">
              <Box sx={{ width: 44, height: 44, flex: '0 0 auto', borderRadius: '12px', bgcolor: alpha(theme.palette.secondary.main, 0.09), display: 'flex', alignItems: 'center', justifyContent: 'center' }}><BusinessIcon color="secondary" /></Box>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="h6" fontWeight={800}>{property.name}</Typography>
                <Typography variant="body2" color="text.secondary">{client?.name || 'Client unavailable'}</Typography>
              </Box>
            </Stack>
            <Stack spacing={0.75} sx={{ mt: 2 }}>
              <Stack direction="row" spacing={0.75} alignItems="flex-start"><PlaceIcon sx={{ fontSize: 17, color: 'text.disabled', mt: 0.2 }} /><Typography variant="body2" color="text.secondary">{location || 'Location details not recorded'}</Typography></Stack>
              {matchingClientLocation && <Typography variant="caption" color="text.secondary">Matches Client location: {matchingClientLocation.label}</Typography>}
            </Stack>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 2 }}>
              <Chip size="small" label={`${fields.length} ${fields.length === 1 ? 'Field' : 'Fields'}`} />
              <Chip size="small" label={`${Number(area.toFixed(1))} ha`} variant="outlined" />
            </Stack>
          </CardContent>
          <CardActions sx={{ px: { xs: 2.25, sm: 2.75 }, pb: 2.25, justifyContent: 'flex-end' }}>
            <Button endIcon={<ArrowForwardIcon />} aria-label={`Open ${property.name}`} onClick={() => navigate(`/jobs/client/${property.clientId}/property/${property.id}`)} sx={{ fontWeight: 800 }}>Open Property</Button>
          </CardActions>
        </Card>
      </Grid>)}
    </Grid>

    <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
      <DialogTitle sx={{ fontWeight: 800 }}>Add Property</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          {actionError && <Alert severity="error" sx={{ alignItems: 'flex-start' }}>
            <Typography variant="subtitle2" fontWeight={800}>Property could not be saved</Typography>
            <Typography variant="body2">{actionError}</Typography>
            {actionReference && <details><summary>View technical details</summary><Typography variant="caption">Reference: {actionReference}</Typography></details>}
          </Alert>}
          <TextField select label="Select Client" value={draft.clientId} onChange={(event) => selectClient(event.target.value)} required fullWidth>
            {operational.clients.map((client) => <MenuItem key={client.id} value={client.id}>{client.name}</MenuItem>)}
          </TextField>

          {selectedClient && <>
            <TextField label="Property name" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} required autoFocus fullWidth />
            <Box ref={locationSectionRef} role="group" aria-label="Property location" tabIndex={-1} sx={{ outline: 'none' }}>
              <Divider><Typography variant="caption" color="text.secondary" fontWeight={700}>Property location *</Typography></Divider>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>Search for the Property, adjust the pin if needed, then confirm the final map location.</Typography>
              {locationError && <Alert severity="error" sx={{ mt: 1.5, alignItems: 'flex-start', '& .MuiAlert-message': { minWidth: 0, whiteSpace: 'normal', overflowWrap: 'anywhere' } }}>
                <Typography variant="subtitle2" fontWeight={800}>Location not confirmed</Typography>
                <Typography variant="body2">{locationError}</Typography>
              </Alert>}
              {selectedClientLocations.length > 0 && <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" fontWeight={800}>Start from a saved Client location</Typography>
                <Typography variant="caption" color="text.secondary">Select a known location, then confirm or adjust it for this Property.</Typography>
                <Stack spacing={1} sx={{ mt: 1 }}>
                  {selectedClientLocations.map((location, index) => <Button key={`${location.label}-${index}`} variant="outlined" onClick={() => inheritLocation(location)} aria-label={`${location.label}: ${location.address || location.locality}`} sx={{ justifyContent: 'flex-start', textAlign: 'left', py: 1.25 }}>
                    <Box><Typography variant="body2" fontWeight={800}>{location.label}</Typography><Typography variant="caption" color="text.secondary">{[location.address, location.locality, location.state, location.postcode].filter(Boolean).join(', ')} · {sourceLabel(location.coordinateSource)}</Typography></Box>
                  </Button>)}
                </Stack>
              </Box>}
              <Box sx={{ mt: 2 }}>
                <AddressAutocomplete key={mapKey} label="Search Property Address" initialValue={draft.address} lat={draft.lat} lng={draft.lng} coordinateSource={draft.addressSource === 'MANUAL' ? 'MANUALLY_ADJUSTED' : 'GEOCODED'} locationConfirmedAt={draft.locationConfirmedAt} onSelect={selectAddress} mapHeight={320} />
              </Box>
              {draft.provenance && <Alert severity={draft.locationConfirmedAt ? 'success' : 'info'} sx={{ mt: 1.5 }}><Typography variant="body2" fontWeight={750}>{draft.provenance}</Typography><Typography variant="caption">This Property location is separate from the Client’s saved location.</Typography></Alert>}
            </Box>

            <Button variant="text" endIcon={<ExpandMoreIcon sx={{ transform: moreDetailsOpen ? 'rotate(180deg)' : 'none' }} />} onClick={() => setMoreDetailsOpen((open) => !open)} aria-expanded={moreDetailsOpen} sx={{ alignSelf: 'flex-start' }}>More Property details</Button>
            <Collapse in={moreDetailsOpen}>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 4 }}><TextField select label="State" value={draft.state} onChange={(event) => setDraft((current) => ({ ...current, state: event.target.value as AustralianState }))} fullWidth>{ALL_STATES.map((state) => <MenuItem key={state} value={state}>{state}</MenuItem>)}</TextField></Grid>
                <Grid size={{ xs: 12, sm: 8 }}><TextField label="Nearest town" value={draft.locality} onChange={(event) => setDraft((current) => ({ ...current, locality: event.target.value }))} fullWidth /></Grid>
                <Grid size={{ xs: 12, sm: 6 }}><TextField label="Lot / plan reference" value={draft.lotPlan} onChange={(event) => setDraft((current) => ({ ...current, lotPlan: event.target.value }))} fullWidth /></Grid>
                <Grid size={{ xs: 12, sm: 6 }}><TextField label="Primary Property contact" value={draft.primaryContactName} onChange={(event) => setDraft((current) => ({ ...current, primaryContactName: event.target.value }))} fullWidth /></Grid>
                <Grid size={{ xs: 12 }}><TextField label="Access information" value={draft.accessNotes} onChange={(event) => setDraft((current) => ({ ...current, accessNotes: event.target.value }))} multiline rows={2} fullWidth /></Grid>
                <Grid size={{ xs: 12 }}><TextField label="Property notes" value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} multiline rows={2} fullWidth /></Grid>
              </Grid>
            </Collapse>
          </>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}><Button onClick={() => setDialogOpen(false)}>Cancel</Button><Button variant="contained" onClick={() => void saveProperty()} disabled={!draft.clientId || !draft.name.trim() || operational.saving}>{operational.saving ? 'Saving…' : 'Save Property'}</Button></DialogActions>
    </Dialog>
  </Box>;
}
