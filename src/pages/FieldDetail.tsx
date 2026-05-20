import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Typography,
  Box,
  Card,
  CardContent,
  Grid,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stack,
  Alert,
  IconButton,
  Chip,
  alpha,
  useTheme,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import GrassIcon from '@mui/icons-material/Grass';
import AssignmentIcon from '@mui/icons-material/Assignment';
import AddIcon from '@mui/icons-material/Add';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import ScienceIcon from '@mui/icons-material/Science';
import BugReportIcon from '@mui/icons-material/BugReport';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import MapIcon from '@mui/icons-material/Map';
import DownloadIcon from '@mui/icons-material/Download';
import ForestIcon from '@mui/icons-material/Forest';
import {
  getFieldById,
  getPropertyById,
  getClientById,
  updateField,
  updateProperty,
  deleteField,
  getJobsByField,
  getOutcomeByJob,
} from '../services/fieldManagementStore';
import { JobRecord, BoundaryFileRef, LatLng } from '../types/fieldManagement';
import FieldBoundaryEditor from '../components/FieldBoundaryEditor';

export default function FieldDetail() {
  const { clientId, propertyId, fieldId } = useParams<{ clientId: string; propertyId: string; fieldId: string }>();
  const navigate = useNavigate();
  const theme = useTheme();

  const [field, setField] = useState(() => getFieldById(fieldId || ''));
  const [property, setProperty] = useState(() => getPropertyById(propertyId || ''));
  const [client] = useState(() => getClientById(clientId || ''));
  const [jobs] = useState(() => getJobsByField(fieldId || ''));
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', sizeHa: '', notes: '' });
  const [editBoundaryCoords, setEditBoundaryCoords] = useState<LatLng[]>([]);
  const [editBoundaryFile, setEditBoundaryFile] = useState<BoundaryFileRef | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  if (!field || !property || !client) {
    return (
      <Box>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(`/jobs/client/${clientId}/property/${propertyId}`)} sx={{ mb: 2 }}>Back</Button>
        <Alert severity="error">Field not found.</Alert>
      </Box>
    );
  }

  const handleStartEdit = () => {
    setEditForm({ name: field.name, sizeHa: String(field.sizeHa || ''), notes: field.notes });
    setEditBoundaryCoords(field.boundaryCoords || []);
    setEditBoundaryFile(field.boundary);
    setEditing(true);
  };

  const handleSaveEdit = () => {
    const updated = updateField(field.id, {
      name: editForm.name,
      sizeHa: parseFloat(editForm.sizeHa) || 0,
      notes: editForm.notes,
      boundaryCoords: editBoundaryCoords.length >= 3 ? editBoundaryCoords : undefined,
      boundary: editBoundaryFile,
    });
    setField(updated);
    setEditing(false);
  };

  const handleDelete = () => {
    deleteField(field.id);
    navigate(`/jobs/client/${clientId}/property/${propertyId}`);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  const parseBoundingBox = (text: string): BoundaryFileRef['boundingBox'] | undefined => {
    try {
      const coordRegex = /<coordinates[^>]*>([\s\S]*?)<\/coordinates>/gi;
      const coords: { lat: number; lng: number }[] = [];
      let match;
      while ((match = coordRegex.exec(text)) !== null) {
        match[1].trim().split(/\s+/).forEach((triple) => {
          const [lng, lat] = triple.split(',').map(Number);
          if (!isNaN(lat) && !isNaN(lng)) coords.push({ lat, lng });
        });
      }
      if (coords.length === 0) return undefined;
      return {
        north: Math.max(...coords.map((c) => c.lat)),
        south: Math.min(...coords.map((c) => c.lat)),
        east: Math.max(...coords.map((c) => c.lng)),
        west: Math.min(...coords.map((c) => c.lng)),
      };
    } catch {
      return undefined;
    }
  };

  const handleBoundaryUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['kml', 'shp', 'kmz'].includes(ext || '')) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      let boundingBox: BoundaryFileRef['boundingBox'] | undefined;

      // Parse KML for bounding box
      if (ext === 'kml') {
        try {
          const text = atob(dataUrl.split(',')[1]);
          boundingBox = parseBoundingBox(text);
        } catch { /* skip parsing */ }
      }

      const boundary: BoundaryFileRef = {
        fileName: file.name,
        fileType: ext as 'kml' | 'shp' | 'kmz',
        sizeBytes: file.size,
        dataUrl,
        boundingBox,
        uploadedAt: new Date().toISOString(),
      };
      const updated = updateField(field.id, { boundary });
      setField(updated);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRemoveBoundary = () => {
    const updated = updateField(field.id, { boundary: null });
    setField(updated);
  };

  const handleDownloadBoundary = () => {
    if (!field.boundary) return;
    const a = document.createElement('a');
    a.href = field.boundary.dataUrl;
    a.download = field.boundary.fileName;
    a.click();
  };

  const getEfficacyColor = (rating: number) => {
    if (rating >= 4) return { bg: alpha('#4caf50', 0.1), color: '#2e7d32' };
    if (rating >= 3) return { bg: alpha('#ff9800', 0.1), color: '#e65100' };
    return { bg: alpha('#f44336', 0.1), color: '#c62828' };
  };

  return (
    <Box>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate(`/jobs/client/${clientId}/property/${propertyId}`)}
        sx={{ mb: 3, color: 'text.secondary', fontWeight: 600, '&:hover': { color: 'primary.main' } }}
      >
        {property.name}
      </Button>

      {/* Field Info */}
      <Card elevation={0} sx={{ mb: 4, border: `1.5px solid ${alpha(theme.palette.primary.main, 0.1)}`, borderRadius: '16px' }} className="ftf-animate-in">
        <CardContent sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box sx={{
                width: 56, height: 56, borderRadius: '14px',
                bgcolor: alpha(theme.palette.primary.main, 0.08),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <GrassIcon sx={{ fontSize: 28, color: 'primary.main' }} />
              </Box>
              <Box>
                <Typography variant="h4" sx={{ fontWeight: 800, fontSize: { xs: '1.4rem', md: '1.75rem' }, color: 'primary.dark' }}>
                  {field.name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {client.name} &bull; {property.name}
                </Typography>
              </Box>
            </Box>
            <Stack direction="row" spacing={0.5}>
              <IconButton size="small" onClick={handleStartEdit}><EditIcon fontSize="small" /></IconButton>
              <IconButton size="small" onClick={() => setDeleteConfirm(true)} sx={{ color: 'error.main' }}><DeleteIcon fontSize="small" /></IconButton>
            </Stack>
          </Box>

          <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
            {field.sizeHa > 0 && (
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 800, color: 'secondary.main', fontFamily: '"Outfit", system-ui', lineHeight: 1 }}>
                  {field.sizeHa}
                </Typography>
                <Typography variant="caption" color="text.secondary">Hectares</Typography>
              </Box>
            )}
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 800, color: 'primary.main', fontFamily: '"Outfit", system-ui', lineHeight: 1 }}>
                {jobs.length}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {jobs.length === 1 ? 'Job' : 'Jobs'}
              </Typography>
            </Box>
          </Stack>

          {field.notes && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2, lineHeight: 1.6 }}>
              {field.notes}
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* Boundary / Map */}
      <Card elevation={0} sx={{ mb: 4, border: `1.5px solid ${alpha(theme.palette.primary.main, 0.1)}`, borderRadius: '16px' }} className="ftf-animate-in">
        <CardContent sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <MapIcon sx={{ color: 'primary.main', fontSize: 20 }} />
            <Typography variant="subtitle1" fontWeight={700} color="primary.dark">Field Boundary</Typography>
            <Stack direction="row" spacing={1} sx={{ ml: 'auto' }} alignItems="center">
              {property.lotPlan && (
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<ForestIcon />}
                  onClick={() => navigate(`/compliance/vegetation?lotPlan=${encodeURIComponent(property.lotPlan)}&propertyId=${property.id}&fieldId=${field.id}`)}
                  sx={{ borderRadius: '8px', fontWeight: 700 }}
                >
                  Check PMAV
                </Button>
              )}
              {field.sizeHa > 0 && field.boundaryCoords && field.boundaryCoords.length >= 3 && (
                <Chip label={`${field.sizeHa} ha`} size="small" color="primary" sx={{ fontWeight: 700 }} />
              )}
            </Stack>
          </Box>

          {field.boundaryCoords && field.boundaryCoords.length >= 3 ? (
            <Stack spacing={2}>
              <FieldBoundaryEditor
                coords={field.boundaryCoords}
                onCoordsChange={() => {}}
                onAreaChange={() => {}}
                propertyLat={property?.lat}
                propertyLng={property?.lng}
                mapHeight={350}
                readOnly
              />

              {field.boundary && (
                <Box sx={{
                  p: 2, borderRadius: '12px',
                  bgcolor: alpha(theme.palette.primary.main, 0.03),
                  border: `1px solid ${alpha(theme.palette.primary.main, 0.08)}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  flexWrap: 'wrap', gap: 1.5,
                }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <UploadFileIcon sx={{ color: 'primary.main' }} />
                    <Box>
                      <Typography variant="body2" fontWeight={700}>{field.boundary.fileName}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {field.boundary.fileType.toUpperCase()} &bull; {formatFileSize(field.boundary.sizeBytes)}
                      </Typography>
                    </Box>
                  </Box>
                  <IconButton size="small" onClick={handleDownloadBoundary} title="Download">
                    <DownloadIcon fontSize="small" />
                  </IconButton>
                </Box>
              )}
            </Stack>
          ) : (
            <Box sx={{ textAlign: 'center', py: 3 }}>
              <UploadFileIcon sx={{ fontSize: 36, color: alpha(theme.palette.text.secondary, 0.3), mb: 1 }} />
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                No boundary set. Edit this field to draw a boundary or upload a KML/SHP file.
              </Typography>
              <Button
                variant="outlined"
                startIcon={<EditIcon />}
                onClick={handleStartEdit}
                sx={{ borderRadius: '10px', fontWeight: 600 }}
              >
                Add Boundary
              </Button>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Job History */}
      <Box className="ftf-animate-in-delay-1">
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, color: 'primary.dark' }}>Spray Jobs</Typography>
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={() => navigate(`/jobs/client/${clientId}/property/${propertyId}/field/${field.id}/new-job`)}
            sx={{ borderRadius: '10px', fontWeight: 700 }}
          >
            Record Job
          </Button>
        </Box>

        {jobs.length === 0 ? (
          <Card elevation={0} sx={{ border: `1.5px dashed ${alpha(theme.palette.primary.main, 0.15)}`, borderRadius: '14px' }}>
            <CardContent sx={{ textAlign: 'center', py: 5 }}>
              <AssignmentIcon sx={{ fontSize: 40, color: alpha(theme.palette.text.secondary, 0.3), mb: 1.5 }} />
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                No spray jobs recorded yet. Record your first job to start tracking outcomes.
              </Typography>
              <Button
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={() => navigate(`/jobs/client/${clientId}/property/${propertyId}/field/${field.id}/new-job`)}
                sx={{ borderRadius: '10px' }}
              >
                Record First Job
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Stack spacing={2}>
            {jobs.map((job) => {
              const outcome = getOutcomeByJob(job.id);
              return (
                <Card
                  key={job.id}
                  elevation={0}
                  sx={{
                    border: `1.5px solid ${alpha(theme.palette.primary.main, 0.1)}`,
                    borderRadius: '14px',
                    cursor: 'pointer',
                    '&:hover': {
                      borderColor: alpha(theme.palette.primary.main, 0.3),
                      transform: 'translateY(-1px)',
                    },
                  }}
                  onClick={() => navigate(`/jobs/client/${clientId}/property/${propertyId}/field/${field.id}/job/${job.id}`)}
                >
                  <CardContent sx={{ p: 2.5 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                      <Box>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                          <CalendarTodayIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                          <Typography variant="subtitle2" fontWeight={700}>
                            {new Date(job.dateSprayed).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </Typography>
                        </Stack>
                        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <BugReportIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                            <Typography variant="body2" color="text.secondary">{job.weedTarget || 'No target'}</Typography>
                          </Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <ScienceIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                            <Typography variant="body2" color="text.secondary">
                              {job.chemicals?.length > 0
                                ? job.chemicals.map((c) => c.product).filter(Boolean).join(', ') || 'No chemical'
                                : job.chemicalUsed || 'No chemical'}
                            </Typography>
                          </Box>
                        </Stack>
                      </Box>
                      <Stack direction="row" spacing={1} alignItems="center">
                        {outcome ? (
                          <Chip
                            label={`${outcome.efficacyRating}/5`}
                            size="small"
                            sx={{
                              fontWeight: 700,
                              bgcolor: getEfficacyColor(outcome.efficacyRating).bg,
                              color: getEfficacyColor(outcome.efficacyRating).color,
                            }}
                          />
                        ) : (
                          <Chip label="No outcome" size="small" variant="outlined" sx={{ fontSize: '0.65rem' }} />
                        )}
                      </Stack>
                    </Box>
                    {job.notes && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                        {job.notes.length > 100 ? `${job.notes.slice(0, 100)}...` : job.notes}
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </Stack>
        )}
      </Box>

      {/* Edit Field Dialog */}
      <Dialog open={editing} onClose={() => setEditing(false)} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle sx={{ fontWeight: 700 }}>Edit Field</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="Field Name" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required fullWidth />
              <TextField
                label="Size (hectares)"
                type="number"
                value={editForm.sizeHa}
                onChange={(e) => setEditForm({ ...editForm, sizeHa: e.target.value })}
                sx={{ minWidth: 160 }}
                helperText={editBoundaryCoords.length >= 3 ? 'Auto-calculated from boundary' : ''}
              />
            </Stack>

            <Typography variant="subtitle2" fontWeight={700} color="primary.dark">
              Field Boundary
            </Typography>

            <FieldBoundaryEditor
              coords={editBoundaryCoords}
              onCoordsChange={setEditBoundaryCoords}
              onAreaChange={(ha) => {
                if (ha > 0) setEditForm((prev) => ({ ...prev, sizeHa: ha.toFixed(1) }));
              }}
              onBoundaryFile={setEditBoundaryFile}
              propertyLat={property?.lat}
              propertyLng={property?.lng}
              onPropertyPinMove={(lat, lng) => {
                if (property) {
                  const updated = updateProperty(property.id, { lat, lng });
                  setProperty(updated);
                }
              }}
              mapHeight={380}
            />

            <TextField label="Notes" value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} multiline rows={2} fullWidth />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setEditing(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveEdit} sx={{ borderRadius: '10px', fontWeight: 700 }}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={deleteConfirm} onClose={() => setDeleteConfirm(false)} PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle sx={{ fontWeight: 700 }}>Delete Field?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            This will permanently delete <strong>{field.name}</strong> and all its job records.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setDeleteConfirm(false)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDelete} sx={{ borderRadius: '10px', fontWeight: 700 }}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
