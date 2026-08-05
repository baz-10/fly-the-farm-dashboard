import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Typography,
  Box,
  Card,
  CardContent,
  CardActionArea,
  Grid,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stack,
  Alert,
  MenuItem,
  IconButton,
  Divider,
  alpha,
  useTheme,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import BusinessIcon from '@mui/icons-material/Business';
import PlaceIcon from '@mui/icons-material/Place';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import PersonIcon from '@mui/icons-material/Person';
import PhoneIcon from '@mui/icons-material/Phone';
import EmailIcon from '@mui/icons-material/Email';
import HomeIcon from '@mui/icons-material/Home';
import AddressAutocomplete, { AddressResult } from '../components/AddressAutocomplete';
import {
  getPropertySummary,
} from '../services/fieldManagementStore';
import { ALL_STATES, AustralianState } from '../types/chemical';
import { ClientAddress } from '../types/fieldManagement';
import { useOperationalData } from '../contexts/OperationalDataContext';
import { describeOperationalError } from '../services/operationalDataStore';

const defaultPropertyForm = { name: '', address: '', state: 'NSW' as AustralianState, locality: '', lotPlan: '', notes: '', lat: undefined as number | undefined, lng: undefined as number | undefined };
type ClientAddressDraft = ClientAddress & { labelType: string; customLabel: string };
const LOCATION_LABELS = ['Primary address', 'Billing address', 'Site entrance', 'Loading area', 'Office', 'Workshop', 'Custom'];
const addressDraft = (address?: ClientAddress): ClientAddressDraft => {
  const label = address?.label || 'Primary address';
  const standard = LOCATION_LABELS.includes(label) && label !== 'Custom';
  return { label, labelType: standard ? label : 'Custom', customLabel: standard ? '' : label, address: address?.address || '', locality: address?.locality || '', state: address?.state || 'NSW', postcode: address?.postcode || '', lat: address?.lat, lng: address?.lng, coordinateSource: address?.coordinateSource, locationConfirmedAt: address?.locationConfirmedAt };
};

export default function ClientDetail() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const theme = useTheme();
  const operational = useOperationalData();

  const client = operational.clients.find((record) => record.id === clientId);
  const properties = operational.properties.filter((record) => record.clientId === clientId);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', phone: '', email: '', notes: '' });
  const [editAddresses, setEditAddresses] = useState<ClientAddressDraft[]>([]);
  const [propDialogOpen, setPropDialogOpen] = useState(false);
  const [propForm, setPropForm] = useState(defaultPropertyForm);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [actionError, setActionError] = useState('');

  if (operational.status === 'loading') {
    return <Alert severity="info">Loading client…</Alert>;
  }

  if (operational.status === 'error' || operational.status === 'unauthorised') {
    return (
      <Box>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/jobs')} sx={{ mb: 2 }}>Back</Button>
        <Alert severity="error">
          {operational.status === 'unauthorised' ? 'You are not authorised to view this client.' : 'Operational data is unavailable. This client could not be loaded.'}
        </Alert>
      </Box>
    );
  }

  if (!client) {
    return (
      <Box>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/jobs')} sx={{ mb: 2 }}>Back</Button>
        <Alert severity="error">Client not found.</Alert>
      </Box>
    );
  }

  const handleStartEdit = () => {
    setEditForm({ name: client.name, phone: client.phone, email: client.email, notes: client.notes });
    setEditAddresses(client.addresses?.length ? client.addresses.map(addressDraft) : [addressDraft()]);
    setEditing(true);
  };

  const handleSaveEdit = async () => {
    const locations = editAddresses.filter((a) => a.address.trim() || a.locality.trim());
    if (!locations.length || locations.some((a) => !Number.isFinite(a.lat) || !Number.isFinite(a.lng) || !a.locationConfirmedAt)) {
      setActionError('Search for and confirm at least one client location before saving.');
      return;
    }
    if (locations.some((a) => a.labelType === 'Custom' && (a.customLabel.trim().length < 2 || /^custom$/i.test(a.customLabel.trim())))) { setActionError('Enter a meaningful custom location label.'); return; }
    const addresses: ClientAddress[] = locations.map(({ labelType, customLabel, ...address }) => ({ ...address, label: labelType === 'Custom' ? customLabel.trim() : labelType }));
    try {
      await operational.updateClient(client.id, { ...editForm, addresses: addresses.length > 0 ? addresses : undefined });
      setEditing(false);
      setActionError('');
    } catch (error) {
      setActionError(describeOperationalError(error));
    }
  };

  const updateEditAddress = (index: number, updates: Partial<ClientAddressDraft>) => {
    setEditAddresses((prev) => prev.map((a, i) => i === index ? { ...a, ...updates } : a));
  };

  const handleDelete = async () => {
    try {
      await operational.archiveClient(client.id);
      navigate('/jobs');
    } catch (error) {
      setDeleteConfirm(false);
      setActionError(describeOperationalError(error));
    }
  };

  const handleSaveProperty = async () => {
    if (!propForm.name.trim()) return;
    if (operational.mode === 'remote' && (propForm.locality.trim() || propForm.lotPlan.trim() || propForm.notes.trim() || propForm.lat !== undefined || propForm.lng !== undefined)) {
      setActionError('Production Beta currently saves the property name, address, and state only. Remove town, lot/plan, notes, and map-pin details before saving.');
      return;
    }
    try {
      const property = await operational.createProperty({ ...propForm, clientId: client.id });
      setPropDialogOpen(false);
      setPropForm(defaultPropertyForm);
      setActionError('');
      navigate(`/jobs/client/${client.id}/property/${property.id}`);
    } catch (error) {
      setActionError(describeOperationalError(error));
    }
  };

  return (
    <Box>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate('/jobs')}
        sx={{ mb: 3, color: 'text.secondary', fontWeight: 600, '&:hover': { color: 'primary.main' } }}
      >
        All Clients
      </Button>

      {actionError && <Alert severity="error" sx={{ mb: 2 }}>{actionError}</Alert>}
      {operational.lastSaved?.resource === 'client' && operational.lastSaved.recordId === client.id && !actionError && <Alert severity="success" sx={{ mb: 2 }}>Saved.</Alert>}

      {/* Client Info */}
      <Card elevation={0} sx={{ mb: 4, border: `1.5px solid ${alpha(theme.palette.primary.main, 0.1)}`, borderRadius: '16px' }} className="ftf-animate-in">
        <CardContent sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box sx={{
                width: 56, height: 56, borderRadius: '14px',
                bgcolor: alpha(theme.palette.primary.main, 0.08),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <PersonIcon sx={{ fontSize: 28, color: 'primary.main' }} />
              </Box>
              <Box>
                <Typography variant="h4" sx={{ fontWeight: 800, fontSize: { xs: '1.4rem', md: '1.75rem' }, color: 'primary.dark' }}>
                  {client.name}
                </Typography>
              </Box>
            </Box>
            <Stack direction="row" spacing={0.5}>
              <IconButton size="small" onClick={handleStartEdit}><EditIcon fontSize="small" /></IconButton>
              <IconButton aria-label={operational.mode === 'remote' ? 'Archive client' : 'Delete client'} size="small" onClick={() => setDeleteConfirm(true)} sx={{ color: 'error.main' }}><DeleteIcon fontSize="small" /></IconButton>
            </Stack>
          </Box>

          <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
            {client.phone && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <PhoneIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                <Typography variant="body2" color="text.secondary">{client.phone}</Typography>
              </Box>
            )}
            {client.email && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <EmailIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                <Typography variant="body2" color="text.secondary">{client.email}</Typography>
              </Box>
            )}
          </Stack>

          {client.addresses && client.addresses.length > 0 && (
            <Box sx={{ mt: 2 }}>
              {client.addresses.map((addr, idx) => (
                <Box key={idx} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75, mb: 0.75 }}>
                  <HomeIcon sx={{ fontSize: 16, color: 'text.secondary', mt: 0.25 }} />
                  <Box>
                    <Typography variant="caption" color="text.disabled" fontWeight={600}>{addr.label}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {[addr.address, addr.locality, addr.state, addr.postcode].filter(Boolean).join(', ')}
                    </Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          )}

          {client.notes && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, lineHeight: 1.6 }}>
              {client.notes}
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* Properties */}
      <Box className="ftf-animate-in-delay-1">
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, color: 'primary.dark' }}>Properties</Typography>
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setPropDialogOpen(true)}
            sx={{ borderRadius: '10px', fontWeight: 700 }}
          >
            Add Property
          </Button>
        </Box>

        {properties.length === 0 ? (
          <Card elevation={0} sx={{ border: `1.5px dashed ${alpha(theme.palette.primary.main, 0.15)}`, borderRadius: '14px' }}>
            <CardContent sx={{ textAlign: 'center', py: 5 }}>
              <BusinessIcon sx={{ fontSize: 40, color: alpha(theme.palette.text.secondary, 0.3), mb: 1.5 }} />
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                No properties added yet. Add a property to start managing fields.
              </Typography>
              <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setPropDialogOpen(true)} sx={{ borderRadius: '10px' }}>
                Add Property
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Grid container spacing={2}>
            {properties.map((prop) => {
              const summary = operational.mode === 'local'
                ? getPropertySummary(prop.id)
                : {
                    fieldCount: operational.fields.filter((field) => field.propertyId === prop.id).length,
                    totalHa: operational.fields.filter((field) => field.propertyId === prop.id).reduce((total, field) => total + field.sizeHa, 0),
                    jobCount: null,
                    lastJobDate: null,
                  };
              return (
                <Grid size={{ xs: 12, sm: 6 }} key={prop.id}>
                  <Card elevation={0} sx={{
                    height: '100%',
                    border: `1.5px solid ${alpha(theme.palette.secondary.main, 0.12)}`,
                    borderRadius: '14px',
                    '&:hover': {
                      borderColor: alpha(theme.palette.secondary.main, 0.3),
                      transform: 'translateY(-2px)',
                      '& .card-arrow': { opacity: 1, transform: 'translateX(0)' },
                    },
                  }}>
                    <CardActionArea onClick={() => navigate(`/jobs/client/${client.id}/property/${prop.id}`)} sx={{ height: '100%' }}>
                      <CardContent sx={{ p: 2.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                          <Box sx={{
                            width: 40, height: 40, borderRadius: '10px',
                            bgcolor: alpha(theme.palette.secondary.main, 0.08),
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <BusinessIcon sx={{ color: 'secondary.main', fontSize: 20 }} />
                          </Box>
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="subtitle1" fontWeight={700}>{prop.name}</Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <PlaceIcon sx={{ fontSize: 12, color: 'text.secondary' }} />
                              <Typography variant="caption" color="text.secondary">
                                {prop.locality ? `${prop.locality}, ` : ''}{prop.state}
                              </Typography>
                            </Box>
                          </Box>
                        </Box>
                        <Stack direction="row" spacing={2}>
                          <Typography variant="caption" color="text.secondary">
                            <Box component="span" fontWeight={700} color="text.primary">{summary.fieldCount}</Box> field{summary.fieldCount !== 1 ? 's' : ''}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            <Box component="span" fontWeight={700} color="text.primary">{summary.totalHa.toFixed(0)}</Box> ha
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            <Box component="span" fontWeight={700} color="text.primary">{summary.jobCount ?? '—'}</Box> job{summary.jobCount !== 1 ? 's' : ''}
                          </Typography>
                        </Stack>
                        <Box className="card-arrow" sx={{
                          display: 'flex', justifyContent: 'flex-end', mt: 1,
                          opacity: 0, transform: 'translateX(-8px)', transition: 'all 0.2s ease',
                        }}>
                          <ArrowForwardIcon sx={{ fontSize: 16, color: 'secondary.main' }} />
                        </Box>
                      </CardContent>
                    </CardActionArea>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        )}
      </Box>

      {/* Add Property Dialog */}
      <Dialog open={propDialogOpen} onClose={() => setPropDialogOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle sx={{ fontWeight: 700 }}>Add Property</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            <TextField label="Property Name" value={propForm.name} onChange={(e) => setPropForm({ ...propForm, name: e.target.value })} required autoFocus fullWidth />
            <AddressAutocomplete
              label="Search Property Address"
              initialValue={propForm.address}
              onSelect={(result: AddressResult) => {
                setPropForm((prev) => ({
                  ...prev,
                  address: result.address,
                  locality: result.locality,
                  state: result.state,
                  lat: result.lat,
                  lng: result.lng,
                }));
              }}
              lat={propForm.lat}
              lng={propForm.lng}
              mapHeight={180}
            />
            <Stack direction="row" spacing={2}>
              <TextField
                label="State"
                select
                value={propForm.state}
                onChange={(e) => setPropForm({ ...propForm, state: e.target.value as AustralianState })}
                sx={{ minWidth: 120 }}
              >
                {ALL_STATES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </TextField>
              <TextField label="Nearest Town" value={propForm.locality} onChange={(e) => setPropForm({ ...propForm, locality: e.target.value })} fullWidth />
            </Stack>
            <TextField label="Lot / Plan Reference" value={propForm.lotPlan} onChange={(e) => setPropForm({ ...propForm, lotPlan: e.target.value })} fullWidth />
            <TextField label="Notes" value={propForm.notes} onChange={(e) => setPropForm({ ...propForm, notes: e.target.value })} multiline rows={2} fullWidth />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setPropDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => void handleSaveProperty()} disabled={!propForm.name.trim() || operational.saving} sx={{ borderRadius: '10px', fontWeight: 700 }}>
            {operational.saving ? 'Saving…' : 'Add Property'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Client Dialog */}
      <Dialog open={editing} onClose={() => setEditing(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle sx={{ fontWeight: 700 }}>Edit Client</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            <TextField label="Name" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required fullWidth />
            <TextField label="Phone" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} fullWidth />
            <TextField label="Email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} fullWidth />

            <Divider sx={{ pt: 0.5 }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                Addresses
              </Typography>
            </Divider>

            {editAddresses.map((addr, idx) => (
              <Box key={idx} sx={{
                p: 2, borderRadius: '12px',
                border: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
                bgcolor: alpha(theme.palette.primary.main, 0.01),
              }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                  <TextField
                    label="Location label"
                    value={addr.labelType}
                    onChange={(e) => updateEditAddress(idx, { labelType: e.target.value })}
                    size="small"
                    sx={{ width: 140 }}
                    select
                  >
                    {LOCATION_LABELS.map((l) => (
                      <MenuItem key={l} value={l}>{l}</MenuItem>
                    ))}
                  </TextField>
                  {editAddresses.length > 1 && (
                    <IconButton size="small" onClick={() => setEditAddresses((prev) => prev.filter((_, i) => i !== idx))} sx={{ color: 'error.main' }}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  )}
                </Box>
                <Stack spacing={1.5}>
                  {addr.labelType === 'Custom' && <TextField label="Custom location label" required value={addr.customLabel} onChange={(e) => updateEditAddress(idx, { customLabel: e.target.value })} size="small" fullWidth />}
                  <AddressAutocomplete
                    label="Search Address"
                    initialValue={addr.address}
                    lat={addr.lat}
                    lng={addr.lng}
                    coordinateSource={addr.coordinateSource}
                    locationConfirmedAt={addr.locationConfirmedAt}
                    onSelect={(result: AddressResult) => {
                      updateEditAddress(idx, {
                        address: result.address,
                        locality: result.locality,
                        state: result.state,
                        postcode: result.postcode,
                        lat: result.lat,
                        lng: result.lng,
                        coordinateSource: result.coordinateSource,
                        locationConfirmedAt: result.locationConfirmedAt,
                      });
                    }}
                    mapHeight={220}
                  />
                  <Stack direction="row" spacing={1.5}>
                    <TextField
                      label="Town / Locality"
                      value={addr.locality}
                      onChange={(e) => updateEditAddress(idx, { locality: e.target.value })}
                      size="small"
                      fullWidth
                    />
                    <TextField
                      label="State"
                      select
                      value={addr.state}
                      onChange={(e) => updateEditAddress(idx, { state: e.target.value as AustralianState })}
                      size="small"
                      sx={{ minWidth: 90 }}
                    >
                      {ALL_STATES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                    </TextField>
                    <TextField
                      label="Postcode"
                      value={addr.postcode}
                      onChange={(e) => updateEditAddress(idx, { postcode: e.target.value })}
                      size="small"
                      sx={{ width: 110 }}
                    />
                  </Stack>
                </Stack>
              </Box>
            ))}

            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={() => setEditAddresses((prev) => [...prev, addressDraft()])}
              sx={{ alignSelf: 'flex-start', fontWeight: 600 }}
            >
              Add Another Address
            </Button>

            <TextField label="Notes" value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} multiline rows={2} fullWidth />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setEditing(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => void handleSaveEdit()} disabled={operational.saving} sx={{ borderRadius: '10px', fontWeight: 700 }}>{operational.saving ? 'Saving…' : 'Save'}</Button>
        </DialogActions>
      </Dialog>

      {/* Archive/Delete Confirm */}
      <Dialog open={deleteConfirm} onClose={() => setDeleteConfirm(false)} PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle sx={{ fontWeight: 700 }}>{operational.mode === 'remote' ? 'Archive Client?' : 'Delete Client?'}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {operational.mode === 'remote'
              ? <>This will archive <strong>{client.name}</strong>. Active properties must be archived first.</>
              : <>This will permanently delete <strong>{client.name}</strong> and all their properties, fields, and job records.</>}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setDeleteConfirm(false)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={() => void handleDelete()} disabled={operational.saving} sx={{ borderRadius: '10px', fontWeight: 700 }}>
            {operational.saving ? 'Saving…' : operational.mode === 'remote' ? 'Archive' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
