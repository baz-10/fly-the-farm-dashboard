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
  Chip,
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
import GrassIcon from '@mui/icons-material/Grass';
import LandscapeIcon from '@mui/icons-material/Landscape';
import {
  getFieldSummary,
} from '../services/fieldManagementStore';
import { ALL_STATES } from '../types/chemical';
import { AustralianState } from '../types/chemical';
import AddressAutocomplete, { AddressResult } from '../components/AddressAutocomplete';
import FieldBoundaryEditor from '../components/FieldBoundaryEditor';
import { LatLng, BoundaryFileRef } from '../types/fieldManagement';
import { useOperationalData } from '../contexts/OperationalDataContext';
import { describeOperationalError } from '../services/operationalDataStore';

const defaultFieldForm = { name: '', sizeHa: '', notes: '' };

export default function PropertyDetail() {
  const { clientId, propertyId } = useParams<{ clientId: string; propertyId: string }>();
  const navigate = useNavigate();
  const theme = useTheme();
  const operational = useOperationalData();

  const property = operational.properties.find((record) => record.id === propertyId && record.clientId === clientId);
  const client = operational.clients.find((record) => record.id === clientId);
  const fields = operational.fields.filter((record) => record.propertyId === propertyId);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', address: '', state: 'NSW' as AustralianState, locality: '', lotPlan: '', notes: '', lat: undefined as number | undefined, lng: undefined as number | undefined });
  const [fieldDialogOpen, setFieldDialogOpen] = useState(false);
  const [fieldForm, setFieldForm] = useState(defaultFieldForm);
  const [fieldBoundaryCoords, setFieldBoundaryCoords] = useState<LatLng[]>([]);
  const [fieldBoundaryFile, setFieldBoundaryFile] = useState<BoundaryFileRef | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [actionError, setActionError] = useState('');

  if (operational.status === 'loading') return <Alert severity="info">Loading property…</Alert>;

  if (operational.status === 'error' || operational.status === 'unauthorised') {
    return (
      <Box>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(`/jobs/client/${clientId}`)} sx={{ mb: 2 }}>Back</Button>
        <Alert severity="error">
          {operational.status === 'unauthorised' ? 'You are not authorised to view this property.' : 'Operational data is unavailable. This property could not be loaded.'}
        </Alert>
      </Box>
    );
  }

  if (!property || !client) {
    return (
      <Box>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(`/jobs/client/${clientId}`)} sx={{ mb: 2 }}>Back</Button>
        <Alert severity="error">Property not found.</Alert>
      </Box>
    );
  }

  const handleStartEdit = () => {
    setEditForm({
      name: property.name,
      address: property.address,
      state: property.state,
      locality: property.locality,
      lotPlan: property.lotPlan,
      notes: property.notes,
      lat: property.lat,
      lng: property.lng,
    });
    setEditing(true);
  };

  const handleSaveEdit = async () => {
    if (operational.mode === 'remote' && (editForm.locality.trim() || editForm.lotPlan.trim() || editForm.notes.trim() || editForm.lat !== undefined || editForm.lng !== undefined)) {
      setActionError('Production Beta currently saves the property name, address, and state only. Remove town, lot/plan, notes, and map-pin details before saving.');
      return;
    }
    try {
      await operational.updateProperty(property.id, editForm);
      setEditing(false);
      setActionError('');
    } catch (error) {
      setActionError(describeOperationalError(error));
    }
  };

  const handleDelete = async () => {
    try {
      await operational.archiveProperty(property.id);
      navigate(`/jobs/client/${clientId}`);
    } catch (error) {
      setDeleteConfirm(false);
      setActionError(describeOperationalError(error));
    }
  };

  const handleSaveField = async () => {
    if (!fieldForm.name.trim()) return;
    if (operational.mode === 'remote' && (fieldForm.notes.trim() || fieldBoundaryCoords.length > 0 || fieldBoundaryFile)) {
      setActionError('Production Beta does not yet support field notes or boundary-version writes. Remove them before saving; field name and area are supported.');
      return;
    }
    try {
      const field = await operational.createField({
        propertyId: property.id,
        name: fieldForm.name,
        sizeHa: parseFloat(fieldForm.sizeHa) || 0,
        boundary: fieldBoundaryFile,
        boundaryCoords: fieldBoundaryCoords.length >= 3 ? fieldBoundaryCoords : undefined,
        notes: fieldForm.notes,
      });
      setFieldDialogOpen(false);
      setFieldForm(defaultFieldForm);
      setFieldBoundaryCoords([]);
      setFieldBoundaryFile(null);
      setActionError('');
      navigate(`/jobs/client/${clientId}/property/${property.id}/field/${field.id}`);
    } catch (error) {
      setActionError(describeOperationalError(error));
    }
  };

  const totalHa = fields.reduce((sum, f) => sum + (f.sizeHa || 0), 0);

  return (
    <Box>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate(`/jobs/client/${clientId}`)}
        sx={{ mb: 3, color: 'text.secondary', fontWeight: 600, '&:hover': { color: 'primary.main' } }}
      >
        {client.name}
      </Button>

      {actionError && <Alert severity="error" sx={{ mb: 2 }}>{actionError}</Alert>}
      {operational.lastSaved?.resource === 'property' && operational.lastSaved.recordId === property.id && !actionError && <Alert severity="success" sx={{ mb: 2 }}>Saved.</Alert>}

      {/* Property Info */}
      <Card elevation={0} sx={{ mb: 4, border: `1.5px solid ${alpha(theme.palette.secondary.main, 0.12)}`, borderRadius: '16px' }} className="ftf-animate-in">
        <CardContent sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box sx={{
                width: 56, height: 56, borderRadius: '14px',
                bgcolor: alpha(theme.palette.secondary.main, 0.08),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <BusinessIcon sx={{ fontSize: 28, color: 'secondary.main' }} />
              </Box>
              <Box>
                <Typography variant="h4" sx={{ fontWeight: 800, fontSize: { xs: '1.4rem', md: '1.75rem' }, color: 'primary.dark' }}>
                  {property.name}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
                  <PlaceIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                  <Typography variant="body2" color="text.secondary">
                    {property.locality ? `${property.locality}, ` : ''}{property.state}
                  </Typography>
                </Box>
              </Box>
            </Box>
            <Stack direction="row" spacing={0.5}>
              <IconButton size="small" onClick={handleStartEdit}><EditIcon fontSize="small" /></IconButton>
              <IconButton aria-label={operational.mode === 'remote' ? 'Archive property' : 'Delete property'} size="small" onClick={() => setDeleteConfirm(true)} sx={{ color: 'error.main' }}><DeleteIcon fontSize="small" /></IconButton>
            </Stack>
          </Box>

          <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
            {property.address && (
              <Typography variant="body2" color="text.secondary">{property.address}</Typography>
            )}
            {property.lotPlan && (
              <Chip label={`Lot/Plan: ${property.lotPlan}`} size="small" variant="outlined" sx={{ borderRadius: '8px' }} />
            )}
          </Stack>

          {property.notes && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, lineHeight: 1.6 }}>
              {property.notes}
            </Typography>
          )}

          <Stack direction="row" spacing={3} sx={{ mt: 2 }}>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 800, color: 'secondary.main', fontFamily: '"Outfit", system-ui', lineHeight: 1 }}>
                {fields.length}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {fields.length === 1 ? 'Field' : 'Fields'}
              </Typography>
            </Box>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 800, color: 'primary.main', fontFamily: '"Outfit", system-ui', lineHeight: 1 }}>
                {totalHa.toFixed(0)}
              </Typography>
              <Typography variant="caption" color="text.secondary">Hectares</Typography>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      {/* Fields */}
      <Box className="ftf-animate-in-delay-1">
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, color: 'primary.dark' }}>Fields</Typography>
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setFieldDialogOpen(true)}
            sx={{ borderRadius: '10px', fontWeight: 700 }}
          >
            Add Field
          </Button>
        </Box>

        {fields.length === 0 ? (
          <Card elevation={0} sx={{ border: `1.5px dashed ${alpha(theme.palette.secondary.main, 0.15)}`, borderRadius: '14px' }}>
            <CardContent sx={{ textAlign: 'center', py: 5 }}>
              <LandscapeIcon sx={{ fontSize: 40, color: alpha(theme.palette.text.secondary, 0.3), mb: 1.5 }} />
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                No fields added yet. Add a field to start recording spray jobs.
              </Typography>
              <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setFieldDialogOpen(true)} sx={{ borderRadius: '10px' }}>
                Add Field
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Grid container spacing={2}>
            {fields.map((field) => {
              const summary = operational.mode === 'local'
                ? getFieldSummary(field.id)
                : { jobCount: null, lastJobDate: null, lastWeed: null, lastEfficacy: null };
              return (
                <Grid size={{ xs: 12, sm: 6 }} key={field.id}>
                  <Card elevation={0} sx={{
                    height: '100%',
                    border: `1.5px solid ${alpha(theme.palette.primary.main, 0.1)}`,
                    borderRadius: '14px',
                    '&:hover': {
                      borderColor: alpha(theme.palette.primary.main, 0.3),
                      transform: 'translateY(-2px)',
                      '& .card-arrow': { opacity: 1, transform: 'translateX(0)' },
                    },
                  }}>
                    <CardActionArea onClick={() => navigate(`/jobs/client/${clientId}/property/${property.id}/field/${field.id}`)} sx={{ height: '100%' }}>
                      <CardContent sx={{ p: 2.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                          <Box sx={{
                            width: 40, height: 40, borderRadius: '10px',
                            bgcolor: alpha(theme.palette.primary.main, 0.08),
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <GrassIcon sx={{ color: 'primary.main', fontSize: 20 }} />
                          </Box>
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="subtitle1" fontWeight={700}>{field.name}</Typography>
                            {field.sizeHa > 0 && (
                              <Typography variant="caption" color="text.secondary">{field.sizeHa} ha</Typography>
                            )}
                          </Box>
                        </Box>
                        <Stack direction="row" spacing={2}>
                          <Typography variant="caption" color="text.secondary">
                            <Box component="span" fontWeight={700} color="text.primary">{summary.jobCount ?? '—'}</Box> job{summary.jobCount !== 1 ? 's' : ''}
                          </Typography>
                          {summary.lastWeed && (
                            <Typography variant="caption" color="text.secondary">
                              Last: {summary.lastWeed}
                            </Typography>
                          )}
                          {summary.lastEfficacy && (
                            <Chip
                              label={`${summary.lastEfficacy}/5`}
                              size="small"
                              sx={{
                                height: 20, fontSize: '0.65rem', fontWeight: 700,
                                bgcolor: summary.lastEfficacy >= 4 ? alpha('#4caf50', 0.1) : summary.lastEfficacy >= 3 ? alpha('#ff9800', 0.1) : alpha('#f44336', 0.1),
                                color: summary.lastEfficacy >= 4 ? '#2e7d32' : summary.lastEfficacy >= 3 ? '#e65100' : '#c62828',
                              }}
                            />
                          )}
                        </Stack>
                        <Box className="card-arrow" sx={{
                          display: 'flex', justifyContent: 'flex-end', mt: 1,
                          opacity: 0, transform: 'translateX(-8px)', transition: 'all 0.2s ease',
                        }}>
                          <ArrowForwardIcon sx={{ fontSize: 16, color: 'primary.main' }} />
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

      {/* Add Field Dialog */}
      <Dialog open={fieldDialogOpen} onClose={() => { setFieldDialogOpen(false); setFieldBoundaryCoords([]); setFieldBoundaryFile(null); }} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle sx={{ fontWeight: 700 }}>Add Field / Paddock</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="Field Name" value={fieldForm.name} onChange={(e) => setFieldForm({ ...fieldForm, name: e.target.value })} required autoFocus fullWidth />
              <TextField
                label="Size (hectares)"
                type="number"
                value={fieldForm.sizeHa}
                onChange={(e) => setFieldForm({ ...fieldForm, sizeHa: e.target.value })}
                sx={{ minWidth: 160 }}
                helperText={fieldBoundaryCoords.length >= 3 ? 'Auto-calculated from boundary' : ''}
              />
            </Stack>

            <Typography variant="subtitle2" fontWeight={700} color="primary.dark">
              Field Boundary
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mt: -1.5 }}>
              Draw boundary points on the map or upload a KML/SHP file. The area will be calculated automatically.
            </Typography>

            <FieldBoundaryEditor
              coords={fieldBoundaryCoords}
              onCoordsChange={setFieldBoundaryCoords}
              onAreaChange={(ha) => {
                if (ha > 0) setFieldForm((prev) => ({ ...prev, sizeHa: ha.toFixed(1) }));
              }}
              onBoundaryFile={setFieldBoundaryFile}
              propertyLat={property.lat}
              propertyLng={property.lng}
              onPropertyPinMove={operational.mode === 'local' ? (lat, lng) => {
                void operational.updateProperty(property.id, { lat, lng }).catch((error) => {
                  setActionError(describeOperationalError(error));
                });
              } : undefined}
              mapHeight={380}
            />

            <TextField label="Notes" value={fieldForm.notes} onChange={(e) => setFieldForm({ ...fieldForm, notes: e.target.value })} multiline rows={2} fullWidth />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => { setFieldDialogOpen(false); setFieldBoundaryCoords([]); setFieldBoundaryFile(null); }}>Cancel</Button>
          <Button variant="contained" onClick={() => void handleSaveField()} disabled={!fieldForm.name.trim() || operational.saving} sx={{ borderRadius: '10px', fontWeight: 700 }}>
            {operational.saving ? 'Saving…' : 'Add Field'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Property Dialog */}
      <Dialog open={editing} onClose={() => setEditing(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle sx={{ fontWeight: 700 }}>Edit Property</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            <TextField label="Property Name" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required fullWidth />
            <AddressAutocomplete
              label="Search Property Address"
              initialValue={editForm.address}
              lat={editForm.lat}
              lng={editForm.lng}
              onSelect={(result: AddressResult) => {
                setEditForm((prev) => ({
                  ...prev,
                  address: result.address,
                  locality: result.locality,
                  state: result.state,
                  lat: result.lat,
                  lng: result.lng,
                }));
              }}
              mapHeight={180}
            />
            <Stack direction="row" spacing={2}>
              <TextField
                label="State"
                select
                value={editForm.state}
                onChange={(e) => setEditForm({ ...editForm, state: e.target.value as AustralianState })}
                sx={{ minWidth: 120 }}
              >
                {ALL_STATES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </TextField>
              <TextField label="Nearest Town" value={editForm.locality} onChange={(e) => setEditForm({ ...editForm, locality: e.target.value })} fullWidth />
            </Stack>
            <TextField label="Lot / Plan Reference" value={editForm.lotPlan} onChange={(e) => setEditForm({ ...editForm, lotPlan: e.target.value })} fullWidth />
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
        <DialogTitle sx={{ fontWeight: 700 }}>{operational.mode === 'remote' ? 'Archive Property?' : 'Delete Property?'}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {operational.mode === 'remote'
              ? <>This will archive <strong>{property.name}</strong>. Active fields must be archived first.</>
              : <>This will permanently delete <strong>{property.name}</strong> and all its fields and job records.</>}
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
