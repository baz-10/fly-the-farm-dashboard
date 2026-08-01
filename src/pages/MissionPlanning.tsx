import React from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import AirplanemodeActiveIcon from '@mui/icons-material/AirplanemodeActive';
import AddIcon from '@mui/icons-material/Add';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloudQueueIcon from '@mui/icons-material/CloudQueue';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import FlightTakeoffIcon from '@mui/icons-material/FlightTakeoff';
import ForestIcon from '@mui/icons-material/Forest';
import GavelIcon from '@mui/icons-material/Gavel';
import GrassIcon from '@mui/icons-material/Grass';
import LayersIcon from '@mui/icons-material/Layers';
import MapIcon from '@mui/icons-material/Map';
import SaveIcon from '@mui/icons-material/Save';
import ScienceIcon from '@mui/icons-material/Science';
import SecurityIcon from '@mui/icons-material/Security';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import FieldBoundaryEditor from '../components/FieldBoundaryEditor';
import MissionJsaDialog from '../components/MissionJsaDialog';
import MissionEquipmentSelector from '../components/mission/MissionEquipmentSelector';
import MissionDeploymentWorkPack from '../components/mission/MissionDeploymentWorkPack';
import { useAircraft } from '../contexts/AircraftContext';
import { useAuth } from '../contexts/AuthContext';
import { useMission } from '../contexts/MissionContext';
import { useOperationalData } from '../contexts/OperationalDataContext';
import { useWorkPacks } from '../contexts/WorkPackContext';
import { getLatestVegetationCheckForLotPlan, getSavedVegetationChecks, loadSavedVegetationChecks } from '../services/pmavCheckStore';
import {
  getVegetationCategorySummary,
  hasVegetationReviewCategories,
  sanitizeLotPlan,
} from '../services/pmavService';
import { toClosedGeoJsonRing } from '../utils/boundaryImport';
import { calculateMissionMixVolumes } from '../utils/missionMix';
import { durationPartsToMinutes, minutesToDurationParts } from '../utils/missionDuration';
import { selectWeatherWindow, validateWeatherRequest } from '../utils/missionWeather';
import { buildEmptyMissionSafetyAssessment, evaluateMissionSafety } from '../utils/missionSafety';
import { fetchWeatherForDate, geocodeLocality } from '../services/weatherService';
import { getMissionWorkflowState, MISSION_WORKFLOW_STEPS } from '../utils/missionWorkflow';
import { buildMissionWorkPack, syncPrimaryAircraftConfiguration } from '../utils/missionWorkPack';
import { reopenApprovedJSA, reopenJSAForWorkPackChange } from '../utils/workPackJsa';
import { LatLng, BoundaryFileRef } from '../types/fieldManagement';
import { SavedVegetationCheck } from '../types/pmav';
import { MissionMapFeature } from '../types/missionMap';
import {
  BoundaryFile,
  FlightExecution,
  FlightPlan,
  JSARecord,
  MissionPlanningChemical,
  MissionPlanningState,
  MissionWeatherSnapshot,
  MissionPriority,
  MissionRecord,
  MissionStatus,
  MissionType,
} from '../types/mission';
import { MissionWorkPackDraft } from '../types/workPack';
import { describeOperationalError } from '../services/operationalDataStore';

type MissionPayload = Omit<
  MissionRecord,
  'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'lastModifiedBy' | 'auditTrail' | 'approvals'
>;
type PendingPlannerAction = 'save' | 'authorize' | null;

interface PanelProps {
  title: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  sx?: SxProps<Theme>;
}

const MISSION_TYPES: { value: MissionType; label: string; description: string }[] = [
  {
    value: 'spray',
    label: 'Herbicide Application',
    description: 'Chemical application for weed and pest control',
  },
  {
    value: 'survey',
    label: 'Crop Survey',
    description: 'Monitoring and assessment of crop health',
  },
  {
    value: 'inspection',
    label: 'Infrastructure Inspection',
    description: 'Asset inspection and damage assessment',
  },
  {
    value: 'mapping',
    label: 'Mapping Mission',
    description: 'Boundary, elevation, and paddock mapping',
  },
];

const MISSION_PRIORITIES: { value: MissionPriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

const NEW_MISSION_CHEMICALS: MissionPlanningChemical[] = [
  { product: '', ratePerHa: 0, unit: 'L', totalRequired: 0 },
];

const DEMO_AIRCRAFT = {
  id: 'demo-aircraft',
  registration: 'DJI T50-001',
  model: 'DJI Agras T50',
  maxPayloadWeight: 40,
  maxWindSpeed: 18,
  maxAltitude: 120,
};

const DEMO_CONFIG = {
  id: 'demo-config',
  name: 'K1-T Standard',
  kitName: 'Centrifugal Nozzles',
  tankCapacity: '40 L',
  swathWidth: '9 m',
};

const STATUS_TONE: Record<MissionStatus, 'success' | 'warning' | 'error' | 'info'> = {
  Planning: 'warning',
  Approved: 'success',
  Flying: 'info',
  Completed: 'success',
  Locked: 'info',
};

function formatDateTimeInput(date: Date): string {
  if (Number.isNaN(date.getTime())) {
    return defaultScheduledDateInput();
  }

  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultScheduledDateInput(): string {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  date.setMinutes(0, 0, 0);
  return formatDateTimeInput(date);
}

function toIsoFromInput(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : date.toISOString();
}

function readNumber(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  }).format(value);
}

function createMissionJSA(missionId: string): JSARecord {
  const now = new Date().toISOString();

  return {
    id: `jsa_${Date.now()}`,
    missionId,
    jsaType: 'standard-spray',
    status: 'pending',
    jsaNumber: `JSA-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`,
    completedBy: '',
    missionChecks: buildEmptyMissionSafetyAssessment(),
    hazardIdentification: [
      {
        id: 'wind-drift',
        category: 'environmental',
        description: 'Wind drift toward waterways or sensitive areas',
        riskLevel: 'medium',
        likelihood: 'possible',
        consequence: 'moderate',
        controlMeasures: ['Operate inside approved weather window', 'Maintain buffer zones', 'Monitor gusts continuously'],
        residualRisk: 'low',
      },
      {
        id: 'field-obstacles',
        category: 'operational',
        description: 'Trees, fences, and exclusion zones near mission boundary',
        riskLevel: 'medium',
        likelihood: 'possible',
        consequence: 'moderate',
        controlMeasures: ['Confirm boundary before flight', 'Use visual observer', 'Keep exclusion zones enabled'],
        residualRisk: 'low',
      },
    ],
    safetyRequirements: {
      personnelRequirements: {
        minimumCrewSize: 2,
        requiredQualifications: ['RePL', 'Chemical handling certificate'],
        requiredTraining: ['Aerial application SOP', 'Emergency response briefing'],
      },
      equipmentRequirements: {
        requiredSafetyEquipment: ['PPE kit', 'Spill kit', 'First aid kit'],
        emergencyEquipment: ['Fire extinguisher', 'Emergency landing plan'],
        communicationEquipment: ['UHF radio', 'Mobile phone'],
        backupSystems: ['Spare batteries', 'Manual override'],
      },
      operationalConstraints: {
        weatherLimitations: ['Wind under 18 km/h', 'No active rain', 'Good visibility'],
        proximityRestrictions: ['Maintain waterway buffers', 'Avoid sensitive areas'],
        specialProcedures: ['Pre-flight boundary review', 'Post-flight spray diary check'],
      },
    },
    emergencyProcedures: {
      communicationPlan: {
        primaryContact: 'Chief Remote Pilot',
        secondaryContact: 'Ground observer',
        emergencyServices: ['000'],
      },
      evacuationPlan: 'Move crew upwind to the field access point and isolate chemical source.',
      equipmentFailureProcedures: ['Abort mission', 'Return to home', 'Record issue in flight log'],
      medicalEmergencyPlan: 'Apply SDS first-aid guidance and contact emergency services.',
    },
    signOffs: {
      pilot: {
        userId: 'current_user',
        signature: '',
        signedAt: '',
      },
    },
    createdAt: now,
    updatedAt: now,
  };
}

function Panel({ title, children, icon, action, sx }: PanelProps) {
  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: '8px',
        border: '1px solid rgba(20, 58, 26, 0.1)',
        bgcolor: 'rgba(255, 255, 255, 0.96)',
        boxShadow: '0 12px 28px rgba(10, 31, 10, 0.06)',
        ...sx,
      }}
    >
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            {icon && <Box sx={{ color: 'primary.main', display: 'flex' }}>{icon}</Box>}
            <Typography variant="subtitle2" sx={{ color: 'primary.dark' }}>
              {title}
            </Typography>
          </Stack>
          {action}
        </Stack>
        {children}
      </CardContent>
    </Card>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  const isPlainValue = typeof value === 'string' || typeof value === 'number';

  return (
    <Stack direction="row" justifyContent="space-between" spacing={2} sx={{ py: 0.65 }}>
      <Typography sx={{ fontSize: '0.76rem', color: 'text.secondary' }}>{label}</Typography>
      {isPlainValue ? (
        <Typography component="span" sx={{ fontSize: '0.78rem', fontWeight: 800, textAlign: 'right' }}>
          {value}
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', minWidth: 0 }}>{value}</Box>
      )}
    </Stack>
  );
}

function StatusPill({ label, tone = 'success' }: { label: string; tone?: 'success' | 'warning' | 'error' | 'info' }) {
  const colors = {
    success: '#2e9e3c',
    warning: '#d4860a',
    error: '#c62828',
    info: '#00897b',
  };
  const color = colors[tone];

  return (
    <Chip
      label={label}
      size="small"
      sx={{
        height: 22,
        borderRadius: '6px',
        bgcolor: alpha(color, 0.1),
        color,
        fontSize: '0.68rem',
        fontWeight: 800,
      }}
    />
  );
}

export default function MissionPlanning() {
  const operational = useOperationalData();
  return operational.mode === 'remote' ? <AuthoritativeMissionPlanning /> : <LocalMissionPlanning />;
}

function AuthoritativeMissionPlanning() {
  const operational = useOperationalData();
  const navigate = useNavigate();
  const params = useParams<{ missionId: string; clientId: string; propertyId: string; fieldId: string; jobId: string }>();
  const [searchParams] = useSearchParams();
  const requestedMissionId = params.missionId || '';
  const requestedJobId = params.jobId || searchParams.get('jobId') || '';
  const selectedMission = requestedMissionId
    ? operational.missions.find((record) => record.id === requestedMissionId)
    : undefined;
  const routeJob = requestedJobId ? operational.jobs.find((record) => record.id === requestedJobId
    && (!params.clientId || record.clientId === params.clientId)
    && (!params.propertyId || record.propertyId === params.propertyId)
    && (!params.fieldId || record.fieldIds.includes(params.fieldId))) : undefined;
  const editing = Boolean(requestedMissionId);
  const [jobId, setJobId] = React.useState('');
  const [operatingLocationId, setOperatingLocationId] = React.useState('');
  const [missionNumber, setMissionNumber] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [scheduledStart, setScheduledStart] = React.useState(defaultScheduledDateInput);
  const [unsupportedAircraft, setUnsupportedAircraft] = React.useState('');
  const [actionError, setActionError] = React.useState('');
  const [archiveOpen, setArchiveOpen] = React.useState(false);

  React.useEffect(() => {
    if (editing && selectedMission) {
      setJobId(selectedMission.jobId);
      setOperatingLocationId(selectedMission.operatingLocationId);
      setMissionNumber(selectedMission.missionNumber);
      setTitle(selectedMission.title);
      setDescription(selectedMission.description);
      setScheduledStart(selectedMission.scheduledStartAt
        ? formatDateTimeInput(new Date(selectedMission.scheduledStartAt)) : '');
      setUnsupportedAircraft('');
      setActionError('');
      return;
    }
    if (!editing) {
      setJobId(routeJob?.id || '');
      setOperatingLocationId((current) => operational.operatingLocations.some((record) => record.id === current)
        ? current : operational.operatingLocations[0]?.id || '');
      if (routeJob?.scheduledDate) {
        setScheduledStart(`${routeJob.scheduledDate}T09:00`);
      }
    }
  }, [editing, operational.operatingLocations, routeJob, selectedMission]);

  if (operational.status === 'idle' || operational.status === 'loading') {
    return <Alert severity="info">Loading authoritative mission…</Alert>;
  }
  if (operational.status === 'unauthorised') {
    return <Alert severity="error">You are not authorised to view this mission.</Alert>;
  }
  if (operational.status === 'error') {
    return <Alert severity="error">Authoritative mission planning is unavailable. No browser mission record has been substituted.</Alert>;
  }
  if (editing && !selectedMission) {
    return <Alert severity="error">The authoritative mission was not found. It may be archived, outside this tenant, or unavailable to this session.</Alert>;
  }
  if (requestedJobId && !routeJob && !editing) {
    return <Alert severity="error">The authoritative job was not found for this route.</Alert>;
  }

  const selectedJob = operational.jobs.find((record) => record.id === jobId);
  const selectedLocation = operational.operatingLocations.find((record) => record.id === operatingLocationId);
  const selectedClient = selectedJob && operational.clients.find((record) => record.id === selectedJob.clientId);
  const selectedProperty = selectedJob && operational.properties.find((record) => record.id === selectedJob.propertyId);
  const selectedFields = selectedJob ? operational.fields.filter((record) => selectedJob.fieldIds.includes(record.id)) : [];
  const hasActiveLocation = operational.operatingLocations.length > 0;
  const hasUnsupportedValues = Boolean(unsupportedAircraft.trim());
  const canSave = Boolean(selectedJob && selectedLocation && missionNumber.trim() && title.trim()) && !operational.saving;

  const save = async () => {
    setActionError('');
    if (hasUnsupportedValues) {
      setActionError('Unsupported operational values were entered and were not saved. Clear them before saving the connected Planning fields.');
      return;
    }
    if (!selectedJob || !selectedLocation || !missionNumber.trim() || !title.trim()) {
      setActionError('Mission number, title, authoritative job and active operating location are required.');
      return;
    }
    const payload = {
      jobId: selectedJob.id,
      operatingLocationId: selectedLocation.id,
      missionNumber: missionNumber.trim(),
      title: title.trim(),
      description: description.trim(),
      scheduledStartAt: scheduledStart ? toIsoFromInput(scheduledStart) : null,
      status: 'Planning' as const,
    };
    try {
      if (selectedMission) {
        await operational.updateMission(selectedMission.id, payload);
      } else {
        const confirmed = await operational.createMission(payload);
        navigate(`/missions/${encodeURIComponent(confirmed.id)}`);
      }
    } catch (error) {
      setActionError(describeOperationalError(error));
    }
  };

  const archive = async () => {
    if (!selectedMission) return;
    setActionError('');
    try {
      await operational.archiveMission(selectedMission.id);
      navigate('/missions');
    } catch (error) {
      setArchiveOpen(false);
      setActionError(describeOperationalError(error));
    }
  };

  const unavailableSections = [
    'Aircraft', 'Equipment', 'Personnel', 'Chemicals', 'Maps', 'Weather', 'JSA',
    'Risk controls', 'Authorisation', 'Completion', 'Pack', 'Financials',
  ];

  return (
    <Box sx={{ maxWidth: 1320, mx: 'auto' }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'center' }} spacing={2} sx={{ mb: 3 }}>
        <Box>
          <Typography component="h1" variant="h4" sx={{ fontWeight: 900, color: 'primary.dark' }}>{selectedMission ? title : 'New Mission'}</Typography>
          <Typography color="text.secondary">Connected Planning details for the authoritative job and operating location.</Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center">
          <Chip color="warning" variant="outlined" label="Planning only · Not ready for operations" />
          {selectedMission && <Button color="error" variant="outlined" startIcon={<DeleteOutlineIcon />} onClick={() => setArchiveOpen(true)}>Archive Mission</Button>}
        </Stack>
      </Stack>

      <Alert severity="warning" sx={{ mb: 2 }}>
        This remote slice cannot authorise a mission or mark it ready/compliant. It persists Planning metadata only.
      </Alert>
      {!hasActiveLocation && <Alert severity="error" sx={{ mb: 2 }}>No active authorised operating location is available for this session.</Alert>}
      {actionError && <Alert severity="error" sx={{ mb: 2 }}>{actionError}</Alert>}
      {operational.lastSaved?.resource === 'mission' && operational.lastSaved.recordId === selectedMission?.id && !actionError && <Alert severity="success" sx={{ mb: 2 }}>Saved.</Alert>}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Stack spacing={2}>
            <Card variant="outlined" sx={{ borderRadius: 2.5 }}>
              <CardContent>
                <Typography variant="h6" sx={{ fontWeight: 800, mb: 2 }}>Mission details</Typography>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <TextField select fullWidth label="Job" value={jobId} onChange={(event) => setJobId(event.target.value)} disabled={Boolean(routeJob)}>
                      {operational.jobs.map((record) => <MenuItem key={record.id} value={record.id}>{record.reference} — {record.scope || 'No scope'}</MenuItem>)}
                    </TextField>
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <TextField select fullWidth label="Operating location" value={operatingLocationId} onChange={(event) => setOperatingLocationId(event.target.value)} disabled={!hasActiveLocation}>
                      {operational.operatingLocations.map((record) => <MenuItem key={record.id} value={record.id}>{record.name}</MenuItem>)}
                    </TextField>
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}><TextField required fullWidth label="Mission number" value={missionNumber} onChange={(event) => setMissionNumber(event.target.value)} /></Grid>
                  <Grid size={{ xs: 12, md: 6 }}><TextField required fullWidth label="Mission title" value={title} onChange={(event) => setTitle(event.target.value)} /></Grid>
                  <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth type="datetime-local" label="Scheduled start" value={scheduledStart} onChange={(event) => setScheduledStart(event.target.value)} InputLabelProps={{ shrink: true }} /></Grid>
                  <Grid size={{ xs: 12 }}><TextField fullWidth multiline minRows={3} label="Description" value={description} onChange={(event) => setDescription(event.target.value)} /></Grid>
                </Grid>
              </CardContent>
            </Card>

            <Card variant="outlined" sx={{ borderRadius: 2.5 }}>
              <CardContent>
                <Typography variant="h6" sx={{ fontWeight: 800 }}>Operational planning</Typography>
                <Alert severity="info" sx={{ my: 2 }}>Aircraft, equipment, personnel, chemicals, maps, weather, JSA, risk controls, authorisation, completion, pack and financials are unavailable and are not persisted in this remote Planning slice.</Alert>
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
                  {unavailableSections.map((section) => <Chip key={section} size="small" variant="outlined" label={`${section} — unavailable`} />)}
                </Stack>
                <TextField
                  fullWidth
                  label="Aircraft planning (not connected)"
                  value={unsupportedAircraft}
                  onChange={(event) => setUnsupportedAircraft(event.target.value)}
                  helperText="Any value here blocks save because aircraft planning is not connected or persisted."
                />
              </CardContent>
            </Card>
          </Stack>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Stack spacing={2}>
            <Card variant="outlined" sx={{ borderRadius: 2.5 }}>
              <CardContent>
                <Typography variant="h6" sx={{ fontWeight: 800, mb: 1.5 }}>Authoritative parent chain</Typography>
                <Stack spacing={1}>
                  <Typography variant="body2"><strong>Client:</strong> {selectedClient?.name || 'Select a job'}</Typography>
                  <Typography variant="body2"><strong>Property:</strong> {selectedProperty?.name || 'Select a job'}</Typography>
                  <Typography variant="body2"><strong>Fields:</strong> {selectedFields.map((record) => record.name).join(', ') || 'None'}</Typography>
                  <Typography variant="body2"><strong>Base:</strong> {selectedLocation?.name || 'Select an active location'}</Typography>
                  <Typography variant="body2"><strong>Status:</strong> Planning</Typography>
                </Stack>
              </CardContent>
            </Card>
            <Button variant="contained" startIcon={<SaveIcon />} onClick={() => void save()} disabled={!canSave}>
              {selectedMission ? 'Update Mission' : 'Save Mission'}
            </Button>
            <Button variant="text" onClick={() => navigate('/missions')}>Back to Missions</Button>
          </Stack>
        </Grid>
      </Grid>

      <Dialog open={archiveOpen} onClose={() => setArchiveOpen(false)}>
        <DialogTitle>Archive Mission?</DialogTitle>
        <DialogContent><Typography>This removes the Planning mission from the active register after server confirmation.</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setArchiveOpen(false)}>Cancel</Button>
          <Button color="error" variant="contained" disabled={operational.saving} onClick={() => void archive()}>Archive</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function LocalMissionPlanning() {
  const { user } = useAuth();
  const theme = useTheme();
  const { missionId: requestedMissionId = '' } = useParams<{ missionId: string }>();
  const [searchParams] = useSearchParams();
  const requestedSection = searchParams.get('section') || '';
  const loadedMissionLinkRef = React.useRef('');
  const {
    missions,
    isLoading: missionDataLoading,
    error: missionDataError,
    createMission,
    createAuthorizedMission,
    updateMission,
    deleteMission,
    approveMission,
    transitionMissionStatus,
    updateFlightPlan,
    updateFlightExecution,
    validateMissionReadiness,
  } = useMission();
  const {
    aircraft,
    equipmentKits,
    configurations,
    isLoading: aircraftDataLoading,
    error: aircraftDataError,
    createAircraft,
    createEquipmentKit,
    createConfiguration,
    getCompatibleKits,
    validateConfiguration,
  } = useAircraft();
  const {
    assets: deploymentAssets,
    templates: workPackTemplates,
    loadError: workPackLoadError,
    saveError: workPackSaveError,
  } = useWorkPacks();
  const dataLoading = missionDataLoading || aircraftDataLoading;
  const dataError = missionDataError || aircraftDataError;

  const [missionName, setMissionName] = React.useState('');
  const [clientName, setClientName] = React.useState('');
  const [propertyName, setPropertyName] = React.useState('');
  const [fieldName, setFieldName] = React.useState('');
  const [siteAddress, setSiteAddress] = React.useState('');
  const [siteLatitude, setSiteLatitude] = React.useState<number | undefined>();
  const [siteLongitude, setSiteLongitude] = React.useState<number | undefined>();
  const [missionLotPlan, setMissionLotPlan] = React.useState('');
  const [vegetationReviewAcknowledged, setVegetationReviewAcknowledged] = React.useState(false);
  const [savedVegetationChecks, setSavedVegetationChecks] = React.useState<SavedVegetationCheck[]>(() => getSavedVegetationChecks());
  const [missionType, setMissionType] = React.useState<MissionType>('spray');
  const [priority, setPriority] = React.useState<MissionPriority>('medium');
  const [selectedMissionId, setSelectedMissionId] = React.useState('');
  const [selectedAircraft, setSelectedAircraft] = React.useState(DEMO_AIRCRAFT.id);
  const [selectedKit, setSelectedKit] = React.useState('');
  const [missionWorkPackDraft, setMissionWorkPackDraft] = React.useState<MissionWorkPackDraft | undefined>();
  const [boundaryCoords, setBoundaryCoords] = React.useState<LatLng[]>([]);
  const [boundaryPolygons, setBoundaryPolygons] = React.useState<LatLng[][]>([]);
  const [missionArea, setMissionArea] = React.useState(0);
  const [boundaryFile, setBoundaryFile] = React.useState<BoundaryFileRef | null>(null);
  const [mapFeatures, setMapFeatures] = React.useState<MissionMapFeature[]>([]);
  const [jsaRecord, setJsaRecord] = React.useState<JSARecord>(() => createMissionJSA('draft'));
  const [jsaDialogOpen, setJsaDialogOpen] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const environmentalReviewRef = React.useRef<HTMLDivElement | null>(null);
  const [scheduledDate, setScheduledDate] = React.useState(defaultScheduledDateInput);
  const [estimatedDuration, setEstimatedDuration] = React.useState(120);
  const [applicationRate, setApplicationRate] = React.useState(15);
  const [perimeterKm, setPerimeterKm] = React.useState(0);
  const [bufferZones, setBufferZones] = React.useState(0);
  const [exclusionZones, setExclusionZones] = React.useState(0);
  const [batteryChanges, setBatteryChanges] = React.useState(0);
  const [flightLines, setFlightLines] = React.useState(0);
  const [turnAroundCount, setTurnAroundCount] = React.useState(0);
  const [windDirection, setWindDirection] = React.useState('ESE');
  const [windSpeed, setWindSpeed] = React.useState(12);
  const [windGust, setWindGust] = React.useState(15);
  const [temperature, setTemperature] = React.useState(22);
  const [rainChance, setRainChance] = React.useState(0);
  const [weatherSnapshot, setWeatherSnapshot] = React.useState<MissionWeatherSnapshot | undefined>();
  const [weatherLoading, setWeatherLoading] = React.useState(false);
  const [weatherError, setWeatherError] = React.useState('');
  const [aircraftCost, setAircraftCost] = React.useState(0);
  const [equipmentCost, setEquipmentCost] = React.useState(0);
  const [personnelCost, setPersonnelCost] = React.useState(0);
  const [travelCost, setTravelCost] = React.useState(0);
  const [chemicalCost, setChemicalCost] = React.useState(0);
  const [missionNotes, setMissionNotes] = React.useState('');
  const [chemicals, setChemicals] = React.useState<MissionPlanningChemical[]>(NEW_MISSION_CHEMICALS);
  const [flightAltitude, setFlightAltitude] = React.useState(35);
  const [groundSpeed, setGroundSpeed] = React.useState(18);
  const [lineSpacing, setLineSpacing] = React.useState(9);
  const [overlapForward, setOverlapForward] = React.useState(30);
  const [overlapSide, setOverlapSide] = React.useState(25);
  const [flightAuthorizationComments, setFlightAuthorizationComments] = React.useState('');
  const [completionArea, setCompletionArea] = React.useState(0);
  const [completionFlightTime, setCompletionFlightTime] = React.useState(120);
  const [completionStatus, setCompletionStatus] = React.useState<FlightExecution['results']['missionStatus']>('successful');
  const [completionNotes, setCompletionNotes] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [seedingFleet, setSeedingFleet] = React.useState(false);
  const [pendingPlannerAction, setPendingPlannerAction] = React.useState<PendingPlannerAction>(null);
  const saveDraftHandlerRef = React.useRef<(() => Promise<void>) | null>(null);
  const authorizeMissionHandlerRef = React.useRef<(() => Promise<void>) | null>(null);
  const [notice, setNotice] = React.useState<{ open: boolean; severity: 'success' | 'info' | 'warning' | 'error'; message: string }>({
    open: false,
    severity: 'info',
    message: '',
  });

  React.useEffect(() => {
    let cancelled = false;

    loadSavedVegetationChecks().then((checks) => {
      if (!cancelled) {
        setSavedVegetationChecks(checks);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const realAircraftOptions = aircraft.map((item) => ({
    id: item.id,
    registration: item.registration,
    model: item.model,
    maxPayloadWeight: item.operationalLimits.maxPayloadWeight,
    maxWindSpeed: item.maxWindSpeed,
    maxAltitude: Math.min(item.maxAltitude, 120),
  }));
  const aircraftOptions = realAircraftOptions.length > 0
    ? [
        ...realAircraftOptions,
        ...(realAircraftOptions.some((item) => item.id === selectedAircraft) ? [] : [DEMO_AIRCRAFT]),
      ]
    : [DEMO_AIRCRAFT];

  React.useEffect(() => {
    if (aircraft.length > 0 && !aircraft.some((item) => item.id === selectedAircraft)) {
      setSelectedAircraft(aircraft[0].id);
    }
  }, [aircraft, selectedAircraft]);

  React.useEffect(() => {
    const compatible = getCompatibleKits(selectedAircraft);
    if (!compatible.some((kit) => kit.id === selectedKit)) {
      setSelectedKit(compatible[0]?.id || '');
    }
  }, [getCompatibleKits, selectedAircraft, selectedKit]);

  const selectedAircraftData = aircraftOptions.find((item) => item.id === selectedAircraft) || DEMO_AIRCRAFT;
  const selectedMissionType = MISSION_TYPES.find((item) => item.value === missionType);
  const actualAircraft = aircraft.find((item) => item.id === selectedAircraft);
  const selectedEquipmentKit = equipmentKits.find((item) => item.id === selectedKit);
  const actualConfiguration = configurations.find((item) => (
    item.aircraftId === selectedAircraft && item.kitId === selectedKit
  ));
  const selectedConfiguration = actualConfiguration?.id || '';
  const selectedConfigurationData = selectedEquipmentKit ? {
    kitName: selectedEquipmentKit.name,
    tankCapacity: `${selectedEquipmentKit.specifications.weight} kg kit`,
    swathWidth: actualConfiguration?.performance.sprayRate
      ? `${actualConfiguration.performance.sprayRate.swathWidth} m`
      : 'Not set',
  } : DEMO_CONFIG;
  const selectedMission = missions.find((mission) => mission.id === selectedMissionId);
  const canPersistMission = !!actualAircraft && !!selectedEquipmentKit;
  const effectiveBoundaryPolygons = boundaryPolygons.length
    ? boundaryPolygons
    : boundaryCoords.length ? [boundaryCoords] : [];
  const validBoundaryPolygons = effectiveBoundaryPolygons.filter((polygonCoords) => polygonCoords.length >= 3);
  const allBoundaryCoords = effectiveBoundaryPolygons.flat();
  const boundaryReady = effectiveBoundaryPolygons.length > 0
    && validBoundaryPolygons.length === effectiveBoundaryPolygons.length;
  const cleanMissionLotPlan = sanitizeLotPlan(missionLotPlan);
  const currentVegetationCheck = React.useMemo(
    () => cleanMissionLotPlan
      ? savedVegetationChecks.find((check) => sanitizeLotPlan(check.lotPlan) === cleanMissionLotPlan) || getLatestVegetationCheckForLotPlan(cleanMissionLotPlan)
      : undefined,
    [cleanMissionLotPlan, savedVegetationChecks]
  );
  const vegetationReviewRequired = currentVegetationCheck
    ? hasVegetationReviewCategories(currentVegetationCheck.categories)
    : Boolean(cleanMissionLotPlan);
  const vegetationClearanceReady = Boolean(currentVegetationCheck && !vegetationReviewRequired) || vegetationReviewAcknowledged;
  const vegetationCategorySummary = currentVegetationCheck
    ? getVegetationCategorySummary(currentVegetationCheck.categories)
    : 'No PMAV check saved';
  const vegetationWarningMessage = currentVegetationCheck
    ? vegetationReviewRequired
      ? `${currentVegetationCheck.sourceLabel} for ${currentVegetationCheck.lotPlan} returned ${vegetationCategorySummary}. Environmental review must be acknowledged before approval.`
      : `${currentVegetationCheck.sourceLabel} for ${currentVegetationCheck.lotPlan} is attached.`
    : cleanMissionLotPlan
      ? `No saved PMAV/RVM check found for ${cleanMissionLotPlan}. Open the vegetation screen and save a check, or acknowledge that review has been completed separately.`
      : 'No PMAV lot/plan is attached. Add a lot/plan or acknowledge that PMAV is not required for this mission.';
  const vegetationClearanceLabel = vegetationClearanceReady
    ? currentVegetationCheck && !vegetationReviewRequired ? 'Clear' : 'Acknowledged'
    : currentVegetationCheck ? 'Review required' : 'Needs check';
  const vegetationClearanceTone: 'success' | 'warning' | 'error' | 'info' = vegetationClearanceReady
    ? currentVegetationCheck && !vegetationReviewRequired ? 'success' : 'warning'
    : 'warning';
  const flyingReadinessIssues = selectedMission?.status === 'Approved'
    ? validateMissionReadiness(selectedMission.id, 'Flying')
    : [];
  const completionReadinessIssues = selectedMission?.status === 'Flying'
    ? validateMissionReadiness(selectedMission.id, 'Completed')
    : [];
  const canEditPlanning = !selectedMission || selectedMission.status === 'Planning';
  const canAuthorizePlanning = !selectedMission || ['Planning', 'Approved'].includes(selectedMission.status);
  const canGenerateFlightPlan = !!selectedMission && selectedMission.status === 'Approved';
  const canAuthorizeForFlight = !!selectedMission && selectedMission.status === 'Approved' && !!selectedMission.flightPlan;
  const canStartFlight = !!selectedMission && selectedMission.status === 'Approved' && !!selectedMission.flightPlan && !!selectedMission.approvals.flyingAuthorization;
  const canRecordCompletion = !!selectedMission && selectedMission.status === 'Flying';
  const canCompleteMission = !!selectedMission && selectedMission.status === 'Flying' && !!selectedMission.flightExecution;
  const chemicalRows = chemicals.map((chemical) => ({
    ...chemical,
    totalRequired: roundOne(chemical.ratePerHa * missionArea),
  }));
  const missionMixVolumes = calculateMissionMixVolumes(missionArea, applicationRate, chemicals);
  const totalEstimatedCost = aircraftCost + equipmentCost + personnelCost + travelCost + chemicalCost;
  const durationParts = minutesToDurationParts(estimatedDuration);
  const scheduledMissionDate = new Date(toIsoFromInput(scheduledDate));
  const isCurrentAtMissionDate = (value: string | undefined) => {
    const date = value ? new Date(value) : new Date(Number.NaN);
    return Number.isFinite(date.getTime()) && date > scheduledMissionDate;
  };
  const aircraftPlanningReady = Boolean(
    actualAircraft
    && actualAircraft.status === 'operational'
    && isCurrentAtMissionDate(actualAircraft.maintenanceDates.nextInspectionDue)
    && isCurrentAtMissionDate(actualAircraft.maintenanceDates.nextMajorServiceDue)
    && isCurrentAtMissionDate(actualAircraft.insurance.expiryDate),
  );
  const configurationPlanningReady = Boolean(
    actualAircraft
    && selectedEquipmentKit
    && (!actualConfiguration || actualConfiguration.weightAndBalance.withinLimits)
    && selectedEquipmentKit.operationalData.status === 'available'
    && validateConfiguration(actualAircraft.id, selectedEquipmentKit.id),
  );
  const missionMaxAltitude = Math.min(
    selectedAircraftData.maxAltitude,
    actualConfiguration?.operationalLimits.maxAltitude ?? 120,
    120,
  );
  React.useEffect(() => {
    setFlightAltitude((current) => Math.max(0, Math.min(current, missionMaxAltitude)));
  }, [missionMaxAltitude]);
  const authorizationChecks = [
    { ready: Boolean(missionName.trim()), message: 'Enter a mission name.' },
    { ready: Boolean(clientName.trim()), message: 'Enter a client.' },
    { ready: Boolean(propertyName.trim()), message: 'Enter a property.' },
    { ready: Boolean(fieldName.trim()), message: 'Enter a field.' },
    { ready: boundaryReady, message: 'Draw or upload a valid mission boundary.' },
    { ready: aircraftPlanningReady, message: 'Select an operational aircraft with current inspection, major-service and insurance dates.' },
    { ready: configurationPlanningReady, message: 'Select an available, compatible equipment configuration within weight-and-balance limits.' },
    { ready: applicationRate > 0, message: 'Enter an application rate.' },
    { ready: estimatedDuration > 0, message: 'Enter an estimated duration.' },
    { ready: jsaRecord.status === 'approved' && Boolean(jsaRecord.missionChecks) && evaluateMissionSafety(jsaRecord.missionChecks!).state === 'ready', message: 'Complete the mission checks and reduce every residual risk score below 6.' },
    { ready: vegetationClearanceReady, message: 'Complete or acknowledge the environmental clearance review.' },
  ];
  const authorizationBlockers = authorizationChecks.filter((check) => !check.ready).map((check) => check.message);
  const readinessPercent = Math.round((authorizationChecks.filter((check) => check.ready).length / authorizationChecks.length) * 100);
  const missionWorkflow = getMissionWorkflowState({
    hasMission: Boolean(selectedMission),
    status: selectedMission?.status,
    jsaApproved: jsaRecord.status === 'approved',
    environmentalReviewComplete: vegetationClearanceReady,
    hasFlightPlan: Boolean(selectedMission?.flightPlan),
    hasFlightAuthorization: Boolean(selectedMission?.approvals.flyingAuthorization),
    hasFlightExecution: Boolean(selectedMission?.flightExecution),
  });
  const canDeleteSelectedMission = Boolean(
    selectedMission && ['Planning', 'Approved'].includes(selectedMission.status),
  );
  const flightOperationsUnlocked = Boolean(
    selectedMission && selectedMission.status !== 'Planning',
  );

  const buildBoundaryRecord = (missionId: string): BoundaryFile => {
    const now = new Date().toISOString();
    const boundingBox = boundaryFile?.boundingBox || {
      north: Math.max(...allBoundaryCoords.map((point) => point[0])),
      south: Math.min(...allBoundaryCoords.map((point) => point[0])),
      east: Math.max(...allBoundaryCoords.map((point) => point[1])),
      west: Math.min(...allBoundaryCoords.map((point) => point[1])),
    };
    const geoJsonGeometry = effectiveBoundaryPolygons.length > 1
      ? {
          type: 'MultiPolygon',
          coordinates: validBoundaryPolygons.map((polygonCoords) => [toClosedGeoJsonRing(polygonCoords)]),
        }
      : {
          type: 'Polygon',
          coordinates: [toClosedGeoJsonRing(validBoundaryPolygons[0] || [])],
        };

    return {
      id: `boundary_${Date.now()}`,
      missionId,
      fileName: boundaryFile?.fileName || `${fieldName || 'mission'}-drawn-boundary.geojson`,
      fileType: boundaryFile ? (boundaryFile.fileType === 'shp' ? 'shapefile' : boundaryFile.fileType) : 'geojson',
      fileSize: boundaryFile?.sizeBytes || JSON.stringify(effectiveBoundaryPolygons).length,
      uploadedAt: boundaryFile?.uploadedAt || now,
      uploadedBy: 'current_user',
      fileUrl: boundaryFile?.dataUrl || `data:application/json,${encodeURIComponent(JSON.stringify(geoJsonGeometry))}`,
      originalFileName: boundaryFile?.fileName || `${fieldName || 'mission'}-drawn-boundary.geojson`,
      analysis: {
        status: 'completed',
        analyzedAt: now,
        geometry: {
          totalArea: missionArea,
          perimeter: perimeterKm * 1000,
          boundingBox,
          complexity: allBoundaryCoords.length > 8 ? 'complex' : allBoundaryCoords.length > 5 ? 'moderate' : 'simple',
          isValid: boundaryReady,
          validationErrors: boundaryReady ? [] : ['Boundary needs at least three points'],
        },
        operationalData: {
          estimatedFlightTime: estimatedDuration,
          estimatedBatteryChanges: batteryChanges,
          recommendedOverlap: 30,
          flightLines,
          turnAroundCount,
        },
        riskFactors: vegetationReviewRequired ? [{
          id: 'pmav-vegetation-category',
          type: 'environmental',
          description: vegetationWarningMessage,
          severity: currentVegetationCheck ? 'high' : 'medium',
          mitigationRequired: true,
          bufferZoneRequired: 0,
        }] : [],
        complianceIssues: !vegetationClearanceReady ? [{
          id: 'pmav-environmental-clearance',
          type: 'environmental',
          description: vegetationWarningMessage,
          requiresApproval: true,
          approvalType: 'Environmental clearance / PMAV review',
        }] : [],
      },
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
  };

  const buildPlanningState = (): MissionPlanningState => ({
    clientName,
    propertyName,
    fieldName,
    siteAddress,
    siteLatitude,
    siteLongitude,
    missionNotes,
    boundaryCoords,
    boundaryPolygons: effectiveBoundaryPolygons,
    mapFeatures,
    vegetationClearance: {
      lotPlan: cleanMissionLotPlan,
      checkId: currentVegetationCheck?.id,
      sourceLabel: currentVegetationCheck?.sourceLabel,
      checkedAt: currentVegetationCheck?.checkedAt,
      categories: currentVegetationCheck?.categories,
      reviewStatus: currentVegetationCheck
        ? vegetationReviewRequired ? 'requires-review' : 'clear'
        : cleanMissionLotPlan ? 'not-checked' : 'not-applicable',
      acknowledged: vegetationReviewAcknowledged,
    },
    operation: {
      applicationRateLHa: applicationRate,
      perimeterKm,
      bufferZones,
      exclusionZones,
      estimatedBatteryChanges: batteryChanges,
      flightLines,
      turnAroundCount,
    },
    weatherWindow: {
      startTime: scheduledDate,
      endTime: formatDateTimeInput(new Date(new Date(scheduledDate).getTime() + estimatedDuration * 60 * 1000)),
      windDirection,
      windSpeedKmh: windSpeed,
      windGustKmh: windGust,
      temperatureC: temperature,
      rainChancePercent: rainChance,
    },
    weatherSnapshot,
    chemicals: chemicalRows,
  });

  const buildMissionPayload = (targetMissionId?: string): MissionPayload => {
    const missionId = targetMissionId || `mission_${Date.now()}`;
    const deploymentWorkPack = missionWorkPackDraft
      ? buildMissionWorkPack(missionWorkPackDraft)
      : undefined;
    const aircraftConfiguration = syncPrimaryAircraftConfiguration(deploymentWorkPack, {
      aircraftId: selectedAircraft,
      kitId: selectedKit,
      configurationId: selectedConfiguration,
      estimatedFlightTime: estimatedDuration,
      maxPayloadWeight: selectedAircraftData.maxPayloadWeight,
    });

    return {
      missionNumber: 'MSN-DRAFT',
      status: 'Planning' as MissionStatus,
      missionName: missionName.trim(),
      missionType,
      priority,
      description: missionNotes.trim() || `${selectedMissionType?.label || 'Mission'} for ${clientName.trim()} at ${propertyName.trim()}.`,
      clientId: clientName.trim(),
      location: {
        name: [propertyName.trim(), fieldName.trim()].filter(Boolean).join(' / ') || 'Location not set',
        address: siteAddress.trim() || [fieldName.trim(), propertyName.trim()].filter(Boolean).join(', ') || 'Address not set',
        coordinates: {
          latitude: allBoundaryCoords[0]?.[0] ?? siteLatitude ?? -25.2744,
          longitude: allBoundaryCoords[0]?.[1] ?? siteLongitude ?? 133.7751,
        },
        elevation: 0,
      },
      scheduledDate: toIsoFromInput(scheduledDate),
      estimatedDuration,
      weatherRequirements: {
        maxWindSpeed: selectedAircraftData.maxWindSpeed,
        minVisibility: 5000,
        maxPrecipitationChance: rainChance,
        allowedCloudCover: 80,
      },
      aircraftConfiguration,
      deploymentWorkPack,
      jsaRecord: { ...jsaRecord, missionId, updatedAt: new Date().toISOString() },
      boundaryFiles: boundaryReady ? [buildBoundaryRecord(missionId)] : [],
      financialEstimate: {
        aircraftCost,
        equipmentCost,
        personnelCost,
        travelCost,
        chemicalCost,
        totalEstimatedCost,
      },
      complianceChecks: {
        casaNotification: true,
        airspaceApproval: true,
        localPermits: true,
        environmentalClearance: vegetationClearanceReady,
        insuranceCoverage: true,
      },
      planningState: buildPlanningState(),
    };
  };

  const showNotice = (severity: typeof notice.severity, message: string) => {
    setNotice({ open: true, severity, message });
  };

  const ensureStarterFleet = async () => {
    const futureDate = (daysFromNow: number) => new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    const starterAircraft = aircraft.find((item) => item.serialNumber === 'T50-STARTER-001' || item.registration === 'DJI T50-001');
    const aircraftId = starterAircraft?.id || await createAircraft({
      registration: 'DJI T50-001',
      manufacturer: 'DJI',
      model: 'Agras T50',
      serialNumber: 'T50-STARTER-001',
      activationDate: now,
      mtow: 103,
      maxAltitude: 120,
      maxWindSpeed: 18,
      maintenanceDates: {
        lastInspection: now,
        nextInspectionDue: futureDate(90),
        lastMajorService: now,
        nextMajorServiceDue: futureDate(180),
        totalFlightHours: 0,
        hoursSinceLastService: 0,
      },
      insurance: {
        policyNumber: 'FTF-STARTER-DRONE',
        provider: 'Fly the Farm Insurance',
        expiryDate: futureDate(365),
        coverageAmount: 10000000,
        hullValue: 32000,
      },
      status: 'operational',
      assignedKits: [],
      operationalLimits: {
        minOperatingTemp: 0,
        maxOperatingTemp: 45,
        maxPayloadWeight: 40,
        batteryCycles: 200,
        maxFlightTime: 22,
        serviceRange: 2,
        minimumCrewSize: 2,
      },
      documentation: {
        manuals: ['DJI Agras T50 operator manual'],
        certificates: ['CASA RPA registration'],
        logbooks: ['Starter fleet logbook'],
        complianceChecks: {
          casaCompliant: true,
          lastCasaInspection: now,
          nextCasaInspectionDue: futureDate(180),
        },
      },
    });

    if (!aircraftId) {
      throw new Error('Starter aircraft could not be created.');
    }

    const starterKit = equipmentKits.find((kit) => kit.name === 'K1-T Standard Spray Kit');
    const kitId = starterKit?.id || await createEquipmentKit({
      name: 'K1-T Standard Spray Kit',
      type: 'spray-system',
      description: 'Standard herbicide spray kit for starter mission planning.',
      specifications: {
        weight: 32,
        dimensions: {
          length: 80,
          width: 64,
          height: 48,
        },
        powerRequirement: 600,
        operatingVoltage: '48V',
        temperatureRange: {
          min: 0,
          max: 45,
        },
        weatherResistance: 'IPX6',
      },
      components: [
        {
          id: 'starter-nozzle-bank',
          name: 'Centrifugal nozzle bank',
          partNumber: 'K1T-NOZZLE',
          manufacturer: 'DJI Agriculture',
          quantity: 1,
          unitCost: 2800,
        },
        {
          id: 'starter-flow-meter',
          name: 'Flow meter',
          partNumber: 'K1T-FLOW',
          manufacturer: 'DJI Agriculture',
          quantity: 1,
          unitCost: 650,
        },
      ],
      operationalData: {
        status: 'available',
        totalOperatingHours: 0,
        lastCalibrationDate: now,
        nextCalibrationDue: futureDate(90),
        lastMaintenanceDate: now,
        nextMaintenanceDue: futureDate(120),
        averageSetupTime: 18,
        averagePackupTime: 16,
      },
      financialData: {
        purchasePrice: 14500,
        currentValue: 14500,
        depreciationRate: 18,
        maintenanceCostPerHour: 24,
        insuranceValue: 14500,
      },
      compatibleAircraft: [aircraftId, 'Agras T50', 'DJI Agras T50'],
    });

    if (!kitId) {
      throw new Error('Starter spray kit could not be created.');
    }

    const starterConfiguration = configurations.find((config) => (
      config.aircraftId === aircraftId &&
      config.kitId === kitId &&
      config.configurationName === 'K1-T Standard Spray Configuration'
    ));
    const configurationId = starterConfiguration?.id || await createConfiguration({
      aircraftId,
      kitId,
      configurationName: 'K1-T Standard Spray Configuration',
      weightAndBalance: {
        totalWeight: 32,
        centerOfGravity: {
          x: 0,
          y: 0,
          z: -8,
        },
        momentArm: 0,
        withinLimits: true,
        maxPayloadRemaining: 8,
      },
      operationalLimits: {
        maxWindSpeed: 18,
        maxAltitude: 120,
        maxFlightTime: 22,
        recommendedCrewSize: 2,
        specialRequirements: ['Chemical handling certificate', 'Visual observer'],
      },
      pricingModel: {
        type: 'per-hectare',
        baseRate: 28,
        setupFee: 260,
        minimumCharge: 900,
        additionalFees: [],
      },
      performance: {
        sprayRate: {
          hectaresPerHour: 32,
          litresPerMinute: 8,
          swathWidth: 9,
        },
        enduranceModifier: 0.85,
      },
    });

    if (!configurationId) {
      throw new Error('Starter aircraft configuration could not be created.');
    }

    setSelectedAircraft(aircraftId);
    setSelectedKit(kitId);

    return { aircraftId, configurationId };
  };

  const prepareStarterFleetForAction = async (action: Exclude<PendingPlannerAction, null>) => {
    setSaving(true);
    setPendingPlannerAction(action);

    try {
      await ensureStarterFleet();
      showNotice('info', action === 'save'
        ? 'Starter fleet added. Saving the mission draft now.'
        : 'Starter fleet added. Authorizing the mission now.'
      );
    } catch (error) {
      setPendingPlannerAction(null);
      showNotice('error', error instanceof Error ? error.message : 'Failed to create starter fleet data.');
    } finally {
      setSaving(false);
    }
  };

  const resetPlanner = () => {
    const nextAircraft = aircraft[0]?.id || DEMO_AIRCRAFT.id;
    const nextKit = getCompatibleKits(nextAircraft)[0]?.id || '';

    setSelectedMissionId('');
    setMissionName('');
    setClientName('');
    setPropertyName('');
    setFieldName('');
    setSiteAddress('');
    setSiteLatitude(undefined);
    setSiteLongitude(undefined);
    setMissionLotPlan('');
    setVegetationReviewAcknowledged(false);
    setSavedVegetationChecks(getSavedVegetationChecks());
    setMissionType('spray');
    setPriority('medium');
    setSelectedAircraft(nextAircraft);
    setSelectedKit(nextKit);
    setMissionWorkPackDraft(undefined);
    setBoundaryCoords([]);
    setBoundaryPolygons([]);
    setMissionArea(0);
    setBoundaryFile(null);
    setMapFeatures([]);
    setJsaRecord(createMissionJSA('draft'));
    setJsaDialogOpen(false);
    setDeleteDialogOpen(false);
    setScheduledDate(defaultScheduledDateInput());
    setEstimatedDuration(120);
    setApplicationRate(15);
    setPerimeterKm(0);
    setBufferZones(0);
    setExclusionZones(0);
    setBatteryChanges(0);
    setFlightLines(0);
    setTurnAroundCount(0);
    setWindDirection('ESE');
    setWindSpeed(12);
    setWindGust(15);
    setTemperature(22);
    setRainChance(0);
    setWeatherSnapshot(undefined);
    setWeatherError('');
    setAircraftCost(0);
    setEquipmentCost(0);
    setPersonnelCost(0);
    setTravelCost(0);
    setChemicalCost(0);
    setMissionNotes('');
    setChemicals(NEW_MISSION_CHEMICALS);
    setFlightAltitude(35);
    setGroundSpeed(18);
    setLineSpacing(9);
    setOverlapForward(30);
    setOverlapSide(25);
    setFlightAuthorizationComments('');
    setCompletionArea(0);
    setCompletionFlightTime(120);
    setCompletionStatus('successful');
    setCompletionNotes('');
  };

  const handleDeleteSelectedMission = async () => {
    if (!selectedMission || !canDeleteSelectedMission) {
      showNotice('warning', 'Only Planning or Approved missions can be deleted.');
      return;
    }

    setSaving(true);
    try {
      const deletedMissionName = selectedMission.missionName;
      await deleteMission(selectedMission.id);
      setDeleteDialogOpen(false);
      resetPlanner();
      showNotice('success', `${deletedMissionName} was deleted.`);
    } catch (error) {
      showNotice('error', error instanceof Error ? error.message : 'Failed to delete mission.');
    } finally {
      setSaving(false);
    }
  };

  const loadMissionIntoPlanner = (mission: MissionRecord) => {
    const planning = mission.planningState;
    const locationParts = mission.location.name.split('/').map((part) => part.trim());
    const boundaryAnalysis = mission.boundaryFiles[0]?.analysis;
    const missionAreaHa = boundaryAnalysis?.geometry.totalArea || 0;
    const plannedChemicals = planning?.chemicals?.length
      ? planning.chemicals.map((chemical) => ({
          ...chemical,
          totalRequired: roundOne(chemical.ratePerHa * missionAreaHa),
        }))
      : NEW_MISSION_CHEMICALS;

    setSelectedMissionId(mission.id);
    setMissionName(mission.missionName);
    setClientName(planning?.clientName || mission.clientId);
    setPropertyName(planning?.propertyName || locationParts[0] || 'Property');
    setFieldName(planning?.fieldName || locationParts[1] || 'Field');
    setSiteAddress(planning?.siteAddress || mission.location.address || '');
    setSiteLatitude(planning?.siteLatitude ?? mission.location.coordinates.latitude);
    setSiteLongitude(planning?.siteLongitude ?? mission.location.coordinates.longitude);
    setMissionLotPlan(planning?.vegetationClearance?.lotPlan || '');
    setVegetationReviewAcknowledged(Boolean(planning?.vegetationClearance?.acknowledged || mission.complianceChecks.environmentalClearance));
    setSavedVegetationChecks(getSavedVegetationChecks());
    setMissionType(mission.missionType);
    setPriority(mission.priority);
    setSelectedAircraft(mission.aircraftConfiguration.aircraftId);
    setSelectedKit(
      mission.aircraftConfiguration.kitId
      || configurations.find((config) => config.id === mission.aircraftConfiguration.configurationId)?.kitId
      || '',
    );
    setMissionWorkPackDraft(mission.deploymentWorkPack
      ? {
          sourceTemplateId: mission.deploymentWorkPack.sourceTemplateId,
          assets: mission.deploymentWorkPack.assets,
          towVehicle: mission.deploymentWorkPack.towVehicle,
          aircraftAssignments: mission.deploymentWorkPack.aircraftAssignments,
          supportingEquipment: mission.deploymentWorkPack.supportingEquipment,
          unavailableAssetReferences: mission.deploymentWorkPack.unavailableAssetReferences,
          unavailableAircraftReferences: mission.deploymentWorkPack.unavailableAircraftReferences,
          unavailableKitReferences: mission.deploymentWorkPack.unavailableKitReferences,
          crewRequirements: mission.deploymentWorkPack.crewRequirements,
          checklist: mission.deploymentWorkPack.checklist,
          notes: mission.deploymentWorkPack.notes,
          estimatedDeploymentCost: mission.deploymentWorkPack.estimatedDeploymentCost,
          costingComplete: mission.deploymentWorkPack.costingComplete,
        }
      : undefined);
    const loadedBoundaryCoords = planning?.boundaryCoords?.length ? planning.boundaryCoords : [];
    setBoundaryCoords(loadedBoundaryCoords);
    setBoundaryPolygons(
      planning?.boundaryPolygons?.length
        ? planning.boundaryPolygons
        : loadedBoundaryCoords.length ? [loadedBoundaryCoords] : [],
    );
    setMissionArea(missionAreaHa);
    setBoundaryFile(null);
    setMapFeatures(planning?.mapFeatures || []);
    setJsaRecord(mission.jsaRecord);
    setScheduledDate(formatDateTimeInput(new Date(mission.scheduledDate)));
    setEstimatedDuration(mission.estimatedDuration);
    setApplicationRate(planning?.operation.applicationRateLHa || 15);
    setPerimeterKm(planning?.operation.perimeterKm || roundOne((boundaryAnalysis?.geometry.perimeter || 2840) / 1000));
    setBufferZones(planning?.operation.bufferZones ?? 3);
    setExclusionZones(planning?.operation.exclusionZones ?? 2);
    setBatteryChanges(planning?.operation.estimatedBatteryChanges || boundaryAnalysis?.operationalData.estimatedBatteryChanges || 3);
    setFlightLines(planning?.operation.flightLines || boundaryAnalysis?.operationalData.flightLines || 42);
    setTurnAroundCount(planning?.operation.turnAroundCount || boundaryAnalysis?.operationalData.turnAroundCount || 41);
    setWindDirection(planning?.weatherWindow.windDirection || 'ESE');
    setWindSpeed(planning?.weatherWindow.windSpeedKmh || 12);
    setWindGust(planning?.weatherWindow.windGustKmh || 15);
    setTemperature(planning?.weatherWindow.temperatureC || 22);
    setRainChance(planning?.weatherWindow.rainChancePercent ?? mission.weatherRequirements.maxPrecipitationChance);
    setWeatherSnapshot(planning?.weatherSnapshot);
    setWeatherError('');
    setAircraftCost(mission.financialEstimate.aircraftCost);
    setEquipmentCost(mission.financialEstimate.equipmentCost);
    setPersonnelCost(mission.financialEstimate.personnelCost);
    setTravelCost(mission.financialEstimate.travelCost);
    setChemicalCost(mission.financialEstimate.chemicalCost || 0);
    setMissionNotes(planning?.missionNotes || mission.description);
    setChemicals(plannedChemicals);
    setFlightAltitude(mission.flightPlan?.flightParameters.altitude || 35);
    setGroundSpeed(mission.flightPlan?.flightParameters.groundSpeed || 18);
    setLineSpacing(mission.flightPlan?.flightParameters.lineSpacing || 9);
    setOverlapForward(mission.flightPlan?.flightParameters.overlapForward || 30);
    setOverlapSide(mission.flightPlan?.flightParameters.overlapSide || 25);
    setFlightAuthorizationComments(mission.approvals.flyingAuthorization?.comments || 'Pre-flight checks complete. Weather remains inside operating limits.');
    setCompletionArea(mission.flightExecution?.results.areaCompleted || missionAreaHa);
    setCompletionFlightTime(mission.flightExecution?.actualFlightData.totalFlightTime || mission.estimatedDuration);
    setCompletionStatus(mission.flightExecution?.results.missionStatus || 'successful');
    setCompletionNotes(mission.flightExecution?.results.reasonsForDeviations[0] || 'Coverage complete. No rework required.');
  };

  React.useEffect(() => {
    if (!requestedMissionId) {
      loadedMissionLinkRef.current = '';
      return;
    }
    const requestedLinkKey = `${requestedMissionId}:${requestedSection}`;
    if (loadedMissionLinkRef.current === requestedLinkKey) return;
    const requestedMission = missions.find((mission) => mission.id === requestedMissionId);
    if (!requestedMission) return;
    loadMissionIntoPlanner(requestedMission);
    if (requestedSection === 'jsa') setJsaDialogOpen(true);
    loadedMissionLinkRef.current = requestedLinkKey;
  }, [missions, requestedMissionId, requestedSection]);

  const handleGetWeather = async () => {
    const validationError = validateWeatherRequest(scheduledDate, siteLatitude, siteLongitude, siteAddress);
    if (validationError) {
      setWeatherError(validationError);
      return;
    }

    setWeatherLoading(true);
    setWeatherError('');
    try {
      let latitude = siteLatitude;
      let longitude = siteLongitude;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        const location = await geocodeLocality(siteAddress);
        if (!location) throw new Error(`Could not find weather coordinates for "${siteAddress}".`);
        latitude = location.latitude;
        longitude = location.longitude;
        setSiteLatitude(latitude);
        setSiteLongitude(longitude);
      }

      const result = await fetchWeatherForDate(latitude as number, longitude as number, scheduledDate.slice(0, 10));
      const snapshot = selectWeatherWindow(result.hourly, scheduledDate, estimatedDuration, result.timezone);
      setWeatherSnapshot(snapshot);
      setTemperature(snapshot.temperatureC);
      setWindSpeed(snapshot.windSpeedKmh);
      setWindGust(snapshot.windGustKmh);
      setWindDirection(snapshot.windDirection);
    } catch (error) {
      setWeatherError(error instanceof Error ? error.message : 'Weather could not be retrieved. Existing conditions have been kept.');
    } finally {
      setWeatherLoading(false);
    }
  };

  const updateChemical = (
    index: number,
    field: 'product' | 'ratePerHa' | 'unit',
    value: string
  ) => {
    setJsaRecord(reopenApprovedJSA);
    setChemicals((prev) => prev.map((chemical, chemicalIndex) => {
      if (chemicalIndex !== index) {
        return chemical;
      }

      if (field === 'ratePerHa') {
        return { ...chemical, ratePerHa: readNumber(value, 0) };
      }

      if (field === 'unit') {
        return { ...chemical, unit: value as MissionPlanningChemical['unit'] };
      }

      return { ...chemical, product: value };
    }));
  };

  const addChemical = () => {
    setJsaRecord(reopenApprovedJSA);
    setChemicals((prev) => [
      ...prev,
      {
        product: 'New product',
        ratePerHa: 0,
        unit: 'L',
        totalRequired: 0,
      },
    ]);
  };

  const removeChemical = (index: number) => {
    setJsaRecord(reopenApprovedJSA);
    setChemicals((prev) => prev.filter((_, chemicalIndex) => chemicalIndex !== index));
  };

  const handleSeedStarterFleet = async () => {
    setSeedingFleet(true);
    try {
      await ensureStarterFleet();
      showNotice('success', 'Starter aircraft, spray kit, and configuration are ready for mission authorization.');
    } catch (error) {
      showNotice('error', error instanceof Error ? error.message : 'Failed to create starter fleet data.');
    } finally {
      setSeedingFleet(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!missionName.trim() || !clientName.trim() || !propertyName.trim() || !fieldName.trim()) {
      showNotice('error', 'Enter a mission name, client, property, and field before saving.');
      return;
    }

    if (!canPersistMission) {
      await prepareStarterFleetForAction('save');
      return;
    }

    setSaving(true);
    try {
      const payload = buildMissionPayload(selectedMission?.id);

      if (selectedMission) {
        if (['Flying', 'Completed', 'Locked'].includes(selectedMission.status)) {
          showNotice('error', `Cannot update a mission in ${selectedMission.status} status from the planner.`);
          return;
        }

        const updates = { ...payload } as Partial<MissionRecord>;
        delete updates.missionNumber;
        delete updates.status;
        await updateMission(selectedMission.id, updates);
        showNotice('success', 'Mission plan updated.');
        return;
      }

      const missionId = await createMission(payload);
      if (missionId) {
        setSelectedMissionId(missionId);
        showNotice('success', 'Mission draft saved.');
      } else {
        showNotice('error', 'Mission draft could not be saved.');
      }
    } catch (error) {
      showNotice('error', error instanceof Error ? error.message : 'Failed to save mission draft.');
    } finally {
      setSaving(false);
    }
  };

  const handleAuthorizeMission = async () => {
    if (!missionName.trim() || !clientName.trim() || !propertyName.trim() || !fieldName.trim()) {
      showNotice('error', 'Enter a mission name, client, property, and field before authorization.');
      return;
    }

    if (!boundaryReady) {
      showNotice('error', 'Draw or upload a valid mission boundary before authorization.');
      return;
    }

    if (jsaRecord.status !== 'approved') {
      setJsaDialogOpen(true);
      showNotice('warning', 'Complete and approve the CASA JSA and risk assessment before authorization.');
      return;
    }

    if (!canPersistMission) {
      await prepareStarterFleetForAction('authorize');
      return;
    }

    if (!vegetationClearanceReady) {
      showNotice('warning', vegetationWarningMessage);
      return;
    }

    if (authorizationBlockers.length > 0) {
      showNotice('error', `Mission is not ready: ${authorizationBlockers[0]}`);
      return;
    }

    setSaving(true);
    try {
      if (selectedMission && ['Flying', 'Completed', 'Locked'].includes(selectedMission.status)) {
        showNotice('error', `Cannot re-authorize a mission in ${selectedMission.status} status.`);
        return;
      }

      const missionId = await createAuthorizedMission(
        buildMissionPayload(selectedMission?.id),
        'Mission Planner Authorization',
        'Authorized from the mission planning dashboard.',
        selectedMission?.id
      );

      if (missionId) {
        setSelectedMissionId(missionId);
        showNotice('success', 'Mission authorized and moved to Approved.');
      } else {
        showNotice('error', 'Mission authorization could not be completed.');
      }
    } catch (error) {
      showNotice('error', error instanceof Error ? error.message : 'Failed to authorize mission.');
    } finally {
      setSaving(false);
    }
  };

  const buildFlightPlan = (mission: MissionRecord): FlightPlan => {
    const now = new Date().toISOString();
    const home = allBoundaryCoords[0] || [mission.location.coordinates.latitude, mission.location.coordinates.longitude];
    const plannedAltitude = Math.max(0, Math.min(flightAltitude, missionMaxAltitude));
    const boundaryWaypoints = effectiveBoundaryPolygons.flatMap((polygonCoords, polygonIndex) => (
      polygonCoords.map(([latitude, longitude], pointIndex) => ({
        id: `wp_${polygonIndex + 1}_${pointIndex + 1}`,
        latitude,
        longitude,
        altitude: plannedAltitude,
        action: pointIndex === 0
          ? 'start-spray' as const
          : pointIndex === polygonCoords.length - 1 ? 'stop-spray' as const : 'fly-to' as const,
      }))
    ));
    const waypoints = [
      {
        id: 'wp_home',
        latitude: home[0],
        longitude: home[1],
        altitude: 0,
        action: 'fly-to' as const,
      },
      ...boundaryWaypoints,
      {
        id: 'wp_rtl',
        latitude: home[0],
        longitude: home[1],
        altitude: plannedAltitude,
        action: 'rtl' as const,
      },
    ];

    return {
      id: mission.flightPlan?.id || `flightplan_${Date.now()}`,
      missionId: mission.id,
      planName: `${mission.missionName} operational flight plan`,
      planType: 'automated',
      flightParameters: {
        altitude: plannedAltitude,
        groundSpeed,
        flightPattern: 'parallel',
        overlapForward: missionType === 'spray' ? 0 : overlapForward,
        overlapSide: missionType === 'spray' ? 0 : overlapSide,
        lineSpacing,
      },
      route: {
        waypoints,
        homePosition: {
          latitude: home[0],
          longitude: home[1],
          altitude: 0,
        },
        alternateHomeSites: [
          {
            name: 'Field access point',
            latitude: home[0] + 0.001,
            longitude: home[1] + 0.001,
            altitude: 0,
          },
        ],
      },
      timing: {
        estimatedTotalTime: estimatedDuration + 30 + batteryChanges * 6,
        estimatedFlightTime: estimatedDuration,
        estimatedSetupTime: 18,
        estimatedPackupTime: 12,
        batteryChangeTime: 6,
        requiredBatteryChanges: batteryChanges,
      },
      safetyPlanning: {
        emergencyLandingSites: [
          {
            id: 'els_primary',
            name: 'Primary field edge',
            latitude: home[0],
            longitude: home[1],
            suitabilityRating: 'good',
            notes: 'Clear approach from field access track.',
          },
          {
            id: 'els_secondary',
            name: 'Secondary access point',
            latitude: home[0] + 0.001,
            longitude: home[1] + 0.001,
            suitabilityRating: 'adequate',
            notes: 'Use if primary edge is obstructed.',
          },
        ],
        noFlyZones: exclusionZones > 0
          ? [
              {
                id: 'nfz_boundary_buffer',
                name: 'Mapped exclusion buffer',
                coordinates: allBoundaryCoords.slice(0, Math.min(allBoundaryCoords.length, 4)).map(([latitude, longitude]) => ({
                  latitude,
                  longitude,
                })),
                reason: `${exclusionZones} exclusion zone${exclusionZones === 1 ? '' : 's'} set during planning`,
              },
            ]
          : [],
        contingencyProcedures: [
          'Abort and return to home if gusts exceed aircraft limit.',
          'Pause application before any manual avoidance manoeuvre.',
          'Record deviations and chemical usage after landing.',
        ],
      },
      createdBy: 'current_user',
      approvedBy: mission.approvals.flyingAuthorization?.authorizedBy,
      approvedAt: mission.approvals.flyingAuthorization?.authorizedAt,
      createdAt: mission.flightPlan?.createdAt || now,
      updatedAt: now,
    };
  };

  const buildFlightExecution = (mission: MissionRecord): FlightExecution => {
    const now = new Date();
    const start = new Date(now.getTime() - completionFlightTime * 60 * 1000);
    const areaMissed = Math.max(0, roundOne(missionArea - completionArea));

    return {
      id: mission.flightExecution?.id || `execution_${Date.now()}`,
      missionId: mission.id,
      flightPlanId: mission.flightPlan?.id || `flightplan_${mission.id}`,
      executionDate: now.toISOString(),
      crew: {
        pilot: {
          userId: 'current_user',
          licenseNumber: 'RePL-FTF-001',
          qualifications: ['RePL', 'Chemical handling certificate'],
        },
        visualObserver: {
          userId: 'visual_observer',
          qualifications: ['Visual observer briefing'],
        },
        crp: {
          userId: 'current_user',
          licenseNumber: 'CRP-FTF-001',
          present: true,
        },
      },
      actualFlightData: {
        startTime: start.toISOString(),
        endTime: now.toISOString(),
        totalFlightTime: completionFlightTime,
        actualAltitudes: {
          minimum: Math.max(0, flightAltitude - 3),
          maximum: flightAltitude + 3,
          average: flightAltitude,
        },
        actualGroundSpeed: {
          minimum: Math.max(0, groundSpeed - 3),
          maximum: groundSpeed + 3,
          average: groundSpeed,
        },
        batteryChanges,
        distanceTraveled: roundOne(perimeterKm + flightLines * lineSpacing / 1000),
      },
      deviations: {
        timeDeviation: completionFlightTime - estimatedDuration,
        routeDeviations: [],
        altitudeDeviations: [],
      },
      results: {
        missionStatus: completionStatus,
        areaCompleted: completionArea,
        areaMissed,
        reasonsForDeviations: completionNotes.trim() ? [completionNotes.trim()] : [],
        qualityAssessment: {
          coverageQuality: completionStatus === 'successful' ? 'good' : completionStatus === 'partially-successful' ? 'adequate' : 'poor',
          overlapAchieved: overlapSide,
          gapsIdentified: areaMissed > 0,
          reworkRequired: completionStatus !== 'successful' || areaMissed > 0,
        },
      },
      issues: [],
      postFlightChecks: {
        aircraftInspection: {
          completed: true,
          completedBy: 'current_user',
          completedAt: now.toISOString(),
          issues: [],
        },
        equipmentInspection: {
          completed: true,
          completedBy: 'current_user',
          completedAt: now.toISOString(),
          issues: [],
          cleaningRequired: true,
          calibrationRequired: false,
        },
        dataBackup: {
          completed: true,
          location: 'Mission local archive',
          verifiedIntegrity: true,
        },
      },
      createdAt: mission.flightExecution?.createdAt || now.toISOString(),
      updatedAt: now.toISOString(),
    };
  };

  const handleGenerateFlightPlan = async () => {
    if (!selectedMission) {
      showNotice('info', 'Save the mission draft before generating a flight plan.');
      return;
    }

    if (selectedMission.status !== 'Approved') {
      showNotice('warning', 'Authorize the mission before generating its flight plan.');
      return;
    }

    if (!boundaryReady) {
      showNotice('warning', 'Add a valid mission boundary before generating a flight plan.');
      return;
    }

    setSaving(true);
    try {
      await updateFlightPlan(selectedMission.id, buildFlightPlan(selectedMission));
      showNotice('success', 'Flight plan generated from the current mission area and operating settings.');
    } catch (error) {
      showNotice('error', error instanceof Error ? error.message : 'Failed to generate flight plan.');
    } finally {
      setSaving(false);
    }
  };

  const handleAuthorizeForFlight = async () => {
    if (!selectedMission?.flightPlan) {
      showNotice('warning', 'Generate a flight plan before authorizing flight.');
      return;
    }

    setSaving(true);
    try {
      await approveMission(
        selectedMission.id,
        'flying',
        'Flight Authorization',
        flightAuthorizationComments.trim() || 'Authorized for flight from mission planner.'
      );
      showNotice('success', 'Flight authorization recorded. The mission can now be started.');
    } catch (error) {
      showNotice('error', error instanceof Error ? error.message : 'Failed to authorize flight.');
    } finally {
      setSaving(false);
    }
  };

  const handleStartFlying = async () => {
    if (!selectedMission) {
      showNotice('info', 'Select an approved mission before starting flight.');
      return;
    }

    if (!canStartFlight) {
      showNotice('warning', 'Generate a flight plan and record flight authorization before starting.');
      return;
    }

    setSaving(true);
    try {
      await transitionMissionStatus(selectedMission.id, 'Flying', 'Started from mission planning screen.');
      showNotice('success', 'Mission moved to Flying.');
    } catch (error) {
      showNotice('error', error instanceof Error ? error.message : 'Failed to start mission.');
    } finally {
      setSaving(false);
    }
  };

  const handleReturnToPlanning = async () => {
    if (!selectedMission || selectedMission.status !== 'Approved') {
      showNotice('warning', 'Select an authorized mission before editing its plan.');
      return;
    }

    if (selectedMission.approvals.flyingAuthorization) {
      showNotice('warning', 'Flight authorization has already been recorded. Do not change the mission plan before takeoff.');
      return;
    }

    setSaving(true);
    try {
      await transitionMissionStatus(selectedMission.id, 'Planning', 'Returned to planning for operator changes.');
      showNotice('info', 'Mission returned to Planning. Update the draft, then authorize it again.');
    } catch (error) {
      showNotice('error', error instanceof Error ? error.message : 'Failed to return the mission to planning.');
    } finally {
      setSaving(false);
    }
  };

  const handleRecordCompletion = async () => {
    if (!selectedMission?.flightPlan) {
      showNotice('warning', 'A flight plan is required before recording completion.');
      return;
    }

    setSaving(true);
    try {
      await updateFlightExecution(selectedMission.id, buildFlightExecution(selectedMission));
      showNotice('success', 'Flight execution captured. You can now mark the mission completed.');
    } catch (error) {
      showNotice('error', error instanceof Error ? error.message : 'Failed to record flight execution.');
    } finally {
      setSaving(false);
    }
  };

  const handleCompleteMission = async () => {
    if (!selectedMission?.flightExecution) {
      showNotice('warning', 'Record flight execution before marking the mission completed.');
      return;
    }

    setSaving(true);
    try {
      await approveMission(
        selectedMission.id,
        'completion',
        'Mission Completion',
        completionNotes.trim() || 'Mission completed from mission planner.'
      );
      await transitionMissionStatus(selectedMission.id, 'Completed', 'Completion captured from mission planning screen.');
      showNotice('success', 'Mission marked Completed.');
    } catch (error) {
      showNotice('error', error instanceof Error ? error.message : 'Failed to complete mission.');
    } finally {
      setSaving(false);
    }
  };

  const handlePrimaryWorkflowAction = async () => {
    switch (missionWorkflow.action) {
      case 'save-draft':
        await handleSaveDraft();
        break;
      case 'complete-jsa':
        setJsaDialogOpen(true);
        break;
      case 'review-environment':
        environmentalReviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        showNotice('info', 'Review the environmental evidence, then acknowledge the outcome.');
        break;
      case 'authorize-mission':
        await handleAuthorizeMission();
        break;
      case 'generate-flight-plan':
        await handleGenerateFlightPlan();
        break;
      case 'authorize-flight':
        await handleAuthorizeForFlight();
        break;
      case 'start-flying':
        await handleStartFlying();
        break;
      case 'record-completion':
        await handleRecordCompletion();
        break;
      case 'mark-completed':
        await handleCompleteMission();
        break;
      case 'none':
        break;
    }
  };

  const primaryWorkflowActionDisabled = dataLoading || saving || (
    (missionWorkflow.action === 'complete-jsa' && !canEditPlanning)
    || (missionWorkflow.action === 'review-environment' && !canEditPlanning)
    || (missionWorkflow.action === 'authorize-mission' && !canAuthorizePlanning)
    || (missionWorkflow.action === 'generate-flight-plan' && !canGenerateFlightPlan)
    || (missionWorkflow.action === 'authorize-flight' && !canAuthorizeForFlight)
    || (missionWorkflow.action === 'start-flying' && !canStartFlight)
    || (missionWorkflow.action === 'record-completion' && !canRecordCompletion)
    || (missionWorkflow.action === 'mark-completed' && !canCompleteMission)
    || missionWorkflow.action === 'none'
  );

  saveDraftHandlerRef.current = handleSaveDraft;
  authorizeMissionHandlerRef.current = handleAuthorizeMission;

  React.useEffect(() => {
    if (!pendingPlannerAction || !canPersistMission || saving) {
      return;
    }

    const action = pendingPlannerAction;
    setPendingPlannerAction(null);

    if (action === 'save') {
      void saveDraftHandlerRef.current?.();
      return;
    }

    void authorizeMissionHandlerRef.current?.();
  }, [pendingPlannerAction, canPersistMission, saving]);

  return (
    <Box sx={{ maxWidth: 1500, mx: 'auto' }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', md: 'flex-end' }}
        spacing={2}
        sx={{ mb: 3 }}
      >
        <Stack direction="row" spacing={2} alignItems="center">
          <Box
            sx={{
              width: 54,
              height: 54,
              borderRadius: '8px',
              bgcolor: alpha(theme.palette.primary.main, 0.08),
              color: 'primary.main',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <FlightTakeoffIcon sx={{ fontSize: 32 }} />
          </Box>
          <Box>
            <Typography variant="h3" sx={{ fontWeight: 800, color: 'primary.dark', fontSize: { xs: '2rem', md: '2.6rem' } }}>
              Mission Planner
            </Typography>
            <Typography color="text.secondary" sx={{ fontSize: '1rem' }}>
              Plan and authorize drone missions with complete compliance.
            </Typography>
          </Box>
        </Stack>

        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <StatusPill label={`${readinessPercent}% Planning Ready`} tone={readinessPercent === 100 ? 'success' : 'warning'} />
          {selectedMission && (
            <StatusPill label={`${selectedMission.missionNumber} ${selectedMission.status}`} tone={STATUS_TONE[selectedMission.status]} />
          )}
          <StatusPill label="APVMA Compliant" tone="success" />
          <StatusPill label={`Wind ${windDirection} ${windSpeed}-${windGust} km/h`} tone="info" />
        </Stack>
      </Stack>

      {dataLoading && (
        <Alert severity="info" sx={{ mb: 2, borderRadius: '8px' }}>
          Loading saved fleet and mission data. Planning actions will be available when this finishes.
        </Alert>
      )}

      {dataError && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: '8px' }}>
          {dataError}
        </Alert>
      )}

      <Card
        elevation={0}
        sx={{
          mb: 2,
          borderRadius: '8px',
          border: '1px solid rgba(20, 58, 26, 0.1)',
          bgcolor: 'rgba(255,255,255,0.96)',
        }}
      >
        <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
          <Grid container spacing={1.5}>
            {MISSION_WORKFLOW_STEPS.map((step, index) => {
              const complete = missionWorkflow.completedSteps[index];
              const active = missionWorkflow.activeStep === index && !complete;
              return (
                <Grid key={step.label} size={{ xs: 6, md: 3 }}>
                  <Stack direction="row" alignItems="center" spacing={1.25}>
                    <Box
                      sx={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        display: 'grid',
                        placeItems: 'center',
                        bgcolor: complete
                          ? 'primary.main'
                          : active ? alpha(theme.palette.warning.main, 0.18) : alpha(theme.palette.primary.main, 0.1),
                        color: complete ? 'white' : active ? 'warning.dark' : 'primary.dark',
                        border: active ? `1px solid ${alpha(theme.palette.warning.main, 0.5)}` : '1px solid transparent',
                        fontSize: '0.78rem',
                        fontWeight: 900,
                      }}
                    >
                      {index + 1}
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontSize: '0.82rem', fontWeight: 900, color: active ? 'warning.dark' : 'text.primary' }}>
                        {step.label}
                      </Typography>
                      <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>{step.detail}</Typography>
                    </Box>
                  </Stack>
                </Grid>
              );
            })}
          </Grid>
        </CardContent>
      </Card>

      {!dataLoading && !canPersistMission && (
        <Alert
          severity="info"
          sx={{
            mb: 2,
            borderRadius: '8px',
            alignItems: 'center',
            flexWrap: { xs: 'wrap', sm: 'nowrap' },
            '& .MuiAlert-message': {
              flex: 1,
              minWidth: { xs: 'calc(100% - 40px)', sm: 0 },
            },
            '& .MuiAlert-action': {
              alignItems: 'center',
              justifyContent: 'flex-end',
              width: { xs: '100%', sm: 'auto' },
              pl: { xs: 0, sm: 2 },
              pr: 1,
              pt: { xs: 1, sm: 0 },
            },
          }}
          action={
            <Button
              color="inherit"
              size="small"
              onClick={handleSeedStarterFleet}
              disabled={dataLoading || seedingFleet || saving}
              sx={{ whiteSpace: 'nowrap', minWidth: 144 }}
            >
              {seedingFleet ? 'Adding...' : 'Add starter fleet'}
            </Button>
          }
        >
          No saved aircraft/equipment configuration is available yet. Save Draft or Authorize Mission will add the starter fleet automatically before creating the mission.
        </Alert>
      )}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Panel
            title="Mission Boundary"
            icon={<MapIcon />}
            action={<StatusPill label={`${missionArea.toFixed(1)} ha`} tone="info" />}
            sx={{ overflow: 'hidden' }}
          >
            <Box
              sx={{
                position: 'relative',
                '& .leaflet-control-layers': { borderRadius: '8px', border: '1px solid rgba(20, 58, 26, 0.15)' },
              }}
            >
              <FieldBoundaryEditor
                coords={boundaryCoords}
                polygons={boundaryPolygons}
                onCoordsChange={(coords) => {
                  setBoundaryCoords(coords);
                  setJsaRecord(reopenApprovedJSA);
                }}
                onPolygonsChange={(polygons) => {
                  setBoundaryPolygons(polygons);
                  setJsaRecord(reopenApprovedJSA);
                }}
                onAreaChange={setMissionArea}
                onBoundaryFile={setBoundaryFile}
                features={mapFeatures}
                onFeaturesChange={(features) => {
                  setMapFeatures(features);
                  setJsaRecord(reopenApprovedJSA);
                }}
                initialAddress={siteAddress}
                propertyLat={siteLatitude}
                propertyLng={siteLongitude}
                onAddressSelect={(address, lat, lng) => {
                  setSiteAddress(address);
                  setSiteLatitude(lat);
                  setSiteLongitude(lng);
                  setJsaRecord(reopenApprovedJSA);
                }}
                onPropertyPinMove={(lat, lng) => {
                  setSiteLatitude(lat);
                  setSiteLongitude(lng);
                }}
                mapHeight={580}
              />
              <Box
                sx={{
                  position: 'absolute',
                  left: 16,
                  bottom: 16,
                  zIndex: 500,
                  borderRadius: '8px',
                  bgcolor: 'rgba(6, 36, 7, 0.88)',
                  color: 'white',
                  px: 1.5,
                  py: 1,
                  boxShadow: '0 10px 24px rgba(0,0,0,0.22)',
                }}
              >
                <Stack direction="row" spacing={1} alignItems="center">
                  <CloudQueueIcon sx={{ fontSize: 18, color: '#a8e2af' }} />
                  <Box>
                    <Typography sx={{ fontSize: '0.78rem', fontWeight: 900 }}>
                      {windDirection} {windSpeed}-{windGust} km/h
                    </Typography>
                    <Typography sx={{ fontSize: '0.64rem', color: alpha(theme.palette.common.white, 0.72) }}>Wind direction</Typography>
                  </Box>
                </Stack>
              </Box>
            </Box>

            <Grid container spacing={1.25} sx={{ mt: 1.5 }}>
              {[
                ['Total Area', `${missionArea.toFixed(1)} ha`, <MapIcon />],
                ['Perimeter', `${perimeterKm.toFixed(2)} km`, <LayersIcon />],
                ['Buffer Zones', `${bufferZones} active`, <WarningAmberIcon />],
                ['Exclusion Zones', `${exclusionZones} active`, <GavelIcon />],
              ].map(([label, value, icon]) => (
                <Grid key={String(label)} size={{ xs: 6, md: 3 }}>
                  <Box sx={{ p: 1.25, borderRadius: '8px', bgcolor: alpha(theme.palette.primary.main, 0.04) }}>
                    <Stack direction="row" spacing={0.75} alignItems="center" sx={{ color: 'primary.main', mb: 0.5 }}>
                      {icon}
                      <Typography sx={{ fontSize: '0.7rem', fontWeight: 800, color: 'text.secondary' }}>{label}</Typography>
                    </Stack>
                    <Typography sx={{ fontSize: '1.1rem', fontWeight: 900 }}>{value}</Typography>
                  </Box>
                </Grid>
              ))}
            </Grid>

            <Grid container spacing={1.25} sx={{ mt: 1.5 }}>
              <Grid size={{ xs: 6, md: 2 }}>
                <TextField
                  label="Perimeter km"
                  type="number"
                  value={perimeterKm}
                  onChange={(event) => setPerimeterKm(readNumber(event.target.value, 0))}
                  fullWidth
                  size="small"
                />
              </Grid>
              <Grid size={{ xs: 6, md: 2 }}>
                <TextField
                  label="Buffers"
                  type="number"
                  value={bufferZones}
                  onChange={(event) => setBufferZones(readNumber(event.target.value, 0))}
                  fullWidth
                  size="small"
                />
              </Grid>
              <Grid size={{ xs: 6, md: 2 }}>
                <TextField
                  label="Exclusions"
                  type="number"
                  value={exclusionZones}
                  onChange={(event) => setExclusionZones(readNumber(event.target.value, 0))}
                  fullWidth
                  size="small"
                />
              </Grid>
              <Grid size={{ xs: 6, md: 2 }}>
                <TextField
                  label="Batteries"
                  type="number"
                  value={batteryChanges}
                  onChange={(event) => setBatteryChanges(readNumber(event.target.value, 0))}
                  fullWidth
                  size="small"
                />
              </Grid>
              <Grid size={{ xs: 6, md: 2 }}>
                <TextField
                  label="Flight lines"
                  type="number"
                  value={flightLines}
                  onChange={(event) => setFlightLines(readNumber(event.target.value, 0))}
                  fullWidth
                  size="small"
                />
              </Grid>
              <Grid size={{ xs: 6, md: 2 }}>
                <TextField
                  label="Turns"
                  type="number"
                  value={turnAroundCount}
                  onChange={(event) => setTurnAroundCount(readNumber(event.target.value, 0))}
                  fullWidth
                  size="small"
                />
              </Grid>
            </Grid>

            <Box sx={{ mt: 1.5 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Mission Notes
              </Typography>
              <TextField
                fullWidth
                multiline
                minRows={2}
                value={missionNotes}
                onChange={(event) => setMissionNotes(event.target.value)}
                InputProps={{ sx: { fontSize: '0.86rem' } }}
              />
            </Box>
          </Panel>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Stack spacing={2}>
            <Panel
              title="Mission State"
              icon={<FlightTakeoffIcon />}
              action={
                <Stack direction="row" spacing={0.75} alignItems="center">
                  {canDeleteSelectedMission && selectedMission && (
                    <Tooltip title="Delete mission">
                      <IconButton
                        aria-label={`Delete ${selectedMission.missionName}`}
                        color="error"
                        size="small"
                        onClick={() => setDeleteDialogOpen(true)}
                        disabled={saving}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                  <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={resetPlanner}>
                    New Mission
                  </Button>
                </Stack>
              }
            >
              <Stack spacing={1}>
                {selectedMission ? (
                  <Box sx={{ p: 1.25, borderRadius: '8px', bgcolor: alpha(theme.palette.primary.main, 0.05) }}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontSize: '0.82rem', fontWeight: 900 }} noWrap>
                          {selectedMission.missionNumber}
                        </Typography>
                        <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }} noWrap>
                          {selectedMission.missionName}
                        </Typography>
                      </Box>
                      <StatusPill label={selectedMission.status} tone={STATUS_TONE[selectedMission.status]} />
                    </Stack>
                  </Box>
                ) : (
                  <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>
                    New mission draft
                  </Typography>
                )}

              </Stack>
            </Panel>

            <Panel title="Mission Details" icon={<GrassIcon />}>
              <Stack spacing={1.5}>
                <Grid container spacing={1.25}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField label="Client" required value={clientName} onChange={(event) => setClientName(event.target.value)} fullWidth size="small" />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField label="Property" required value={propertyName} onChange={(event) => setPropertyName(event.target.value)} fullWidth size="small" />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField label="Field / Paddock" required value={fieldName} onChange={(event) => setFieldName(event.target.value)} fullWidth size="small" />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      label="PMAV Lot/Plan"
                      value={missionLotPlan}
                      onChange={(event) => {
                        setMissionLotPlan(sanitizeLotPlan(event.target.value));
                        setVegetationReviewAcknowledged(false);
                      }}
                      placeholder="e.g. 2RP884818"
                      fullWidth
                      size="small"
                      inputProps={{ spellCheck: false }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField label="Mission Name" required value={missionName} onChange={(event) => setMissionName(event.target.value)} fullWidth size="small" />
                  </Grid>
                  <Grid size={{ xs: 12 }}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Mission Type</InputLabel>
                      <Select value={missionType} label="Mission Type" onChange={(event) => setMissionType(event.target.value as MissionType)}>
                        {MISSION_TYPES.map((type) => (
                          <MenuItem key={type.value} value={type.value}>
                            <Box>
                              <Typography sx={{ fontSize: '0.86rem', fontWeight: 700 }}>{type.label}</Typography>
                              <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>{type.description}</Typography>
                            </Box>
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Priority</InputLabel>
                      <Select value={priority} label="Priority" onChange={(event) => setPriority(event.target.value as MissionPriority)}>
                        {MISSION_PRIORITIES.map((item) => (
                          <MenuItem key={item.value} value={item.value}>
                            {item.label}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <TextField
                      label="Duration hours"
                      type="number"
                      value={durationParts.hours}
                      onChange={(event) => setEstimatedDuration(durationPartsToMinutes(readNumber(event.target.value, 0), durationParts.minutes))}
                      fullWidth
                      size="small"
                      inputProps={{ min: 0 }}
                    />
                  </Grid>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <TextField
                      label="Duration minutes"
                      type="number"
                      value={durationParts.minutes}
                      onChange={(event) => setEstimatedDuration(durationPartsToMinutes(durationParts.hours, readNumber(event.target.value, 0)))}
                      fullWidth
                      size="small"
                      inputProps={{ min: 0, max: 59 }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12 }}>
                    <TextField
                      label="Scheduled"
                      type="datetime-local"
                      value={scheduledDate}
                      onChange={(event) => setScheduledDate(event.target.value)}
                      fullWidth
                      size="small"
                      InputLabelProps={{ shrink: true }}
                    />
                  </Grid>
                </Grid>
              </Stack>
            </Panel>

            <Panel title="Aircraft & Equipment" icon={<AirplanemodeActiveIcon />}>
              <Stack spacing={1.5}>
                <MissionEquipmentSelector
                  aircraft={aircraft}
                  equipmentKits={equipmentKits}
                  selectedAircraftId={selectedAircraft}
                  selectedKitId={selectedKit}
                  onAircraftChange={(aircraftId) => {
                    setSelectedAircraft(aircraftId);
                    setJsaRecord(reopenApprovedJSA);
                  }}
                  onKitChange={(kitId) => {
                    setSelectedKit(kitId);
                    setJsaRecord(reopenApprovedJSA);
                  }}
                />
                <Divider />
                <DetailRow label="Spray System" value={selectedConfigurationData.kitName} />
                <DetailRow label="Tank Capacity" value={selectedConfigurationData.tankCapacity} />
                <DetailRow label="Swath Width" value={selectedConfigurationData.swathWidth} />
                <DetailRow label="Payload Limit" value={`${selectedAircraftData.maxPayloadWeight} kg`} />
              </Stack>
            </Panel>

            <MissionDeploymentWorkPack
              assets={deploymentAssets}
              templates={workPackTemplates}
              aircraft={aircraft}
              equipmentKits={equipmentKits}
              value={missionWorkPackDraft}
              showFinancials={user?.role === 'admin'}
              persistenceWarning={workPackLoadError || workPackSaveError}
              onChange={(next) => {
                setJsaRecord((current) => reopenJSAForWorkPackChange(current, missionWorkPackDraft, next));
                setMissionWorkPackDraft(next);
              }}
            />

            <Panel title="Chemical Mix Summary" icon={<ScienceIcon />}>
              <Stack spacing={1.25}>
                <Grid container spacing={1.25}>
                  <Grid size={{ xs: 6 }}>
                    <TextField
                      label="Water L/ha"
                      type="number"
                      value={applicationRate}
                      onChange={(event) => setApplicationRate(readNumber(event.target.value, 0))}
                      fullWidth
                      size="small"
                    />
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <TextField
                      label="Chemical cost"
                      type="number"
                      value={chemicalCost}
                      onChange={(event) => setChemicalCost(readNumber(event.target.value, 0))}
                      fullWidth
                      size="small"
                    />
                  </Grid>
                </Grid>

                {chemicalRows.map((chemical, index) => (
                  <Box key={`chemical-${index}`} sx={{ p: 1, borderRadius: '8px', bgcolor: alpha(theme.palette.primary.main, 0.04) }}>
                    <Grid container spacing={1} alignItems="center">
                      <Grid size={{ xs: 12, sm: 5 }}>
                        <TextField
                          label="Product"
                          value={chemical.product}
                          onChange={(event) => updateChemical(index, 'product', event.target.value)}
                          fullWidth
                          size="small"
                        />
                      </Grid>
                      <Grid size={{ xs: 5, sm: 3 }}>
                        <TextField
                          label="Rate / ha"
                          type="number"
                          value={chemical.ratePerHa}
                          onChange={(event) => updateChemical(index, 'ratePerHa', event.target.value)}
                          fullWidth
                          size="small"
                        />
                      </Grid>
                      <Grid size={{ xs: 4, sm: 2 }}>
                        <FormControl fullWidth size="small">
                          <InputLabel>Unit</InputLabel>
                          <Select value={chemical.unit} label="Unit" onChange={(event) => updateChemical(index, 'unit', event.target.value)}>
                            {['L', 'ml', 'kg', 'g'].map((unit) => (
                              <MenuItem key={unit} value={unit}>
                                {unit}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Grid>
                      <Grid size={{ xs: 3, sm: 2 }}>
                        <Typography sx={{ fontSize: '0.78rem', fontWeight: 900, textAlign: 'right' }}>
                          {chemical.totalRequired} {chemical.unit}
                        </Typography>
                        {chemicals.length > 1 && (
                          <Button
                            size="small"
                            color="error"
                            onClick={() => removeChemical(index)}
                            sx={{ minWidth: 0, px: 0.5, fontSize: '0.64rem' }}
                          >
                            Remove
                          </Button>
                        )}
                      </Grid>
                    </Grid>
                  </Box>
                ))}
                <Divider />
                <DetailRow label="Total tank mix" value={`${missionMixVolumes.totalTankMixLitres.toFixed(1)} L`} />
                <DetailRow label="Liquid chemical" value={`${missionMixVolumes.liquidChemicalLitres.toFixed(1)} L`} />
                <DetailRow label="Water required" value={`${missionMixVolumes.waterRequiredLitres.toFixed(1)} L`} />
                <DetailRow label="Chemical Total" value={formatCurrency(chemicalCost)} />
                <Button variant="outlined" size="small" onClick={addChemical} sx={{ borderRadius: '8px' }}>
                  Add product
                </Button>
              </Stack>
            </Panel>

            <Panel title="Weather Window" icon={<CloudQueueIcon />}>
              <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1} sx={{ mb: 1.5 }}>
                <Box>
                  <Typography sx={{ fontSize: '0.76rem', fontWeight: 800 }}>
                    {weatherSnapshot ? `Forecast retrieved for ${new Date(weatherSnapshot.plannedStart).toLocaleString('en-AU')}` : 'Forecast not retrieved'}
                  </Typography>
                  <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary' }}>
                    Open-Meteo forecast · manual values remain editable
                  </Typography>
                </Box>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={handleGetWeather}
                  disabled={weatherLoading}
                  startIcon={weatherLoading ? <CircularProgress size={15} /> : <CloudQueueIcon />}
                >
                  {weatherLoading ? 'Getting weather' : 'Get Weather'}
                </Button>
              </Stack>
              {weatherError && <Alert severity="warning" sx={{ mb: 1.5 }}>{weatherError}</Alert>}
              <Grid container spacing={1.25}>
                <Grid size={{ xs: 12 }}>
                  <DetailRow
                    label="Window"
                    value={`${formatDateTimeInput(new Date(scheduledDate))} - ${formatDateTimeInput(new Date(new Date(scheduledDate).getTime() + estimatedDuration * 60 * 1000)).slice(11)}`}
                  />
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <TextField
                    label="Wind direction"
                    value={windDirection}
                    onChange={(event) => setWindDirection(event.target.value.toUpperCase())}
                    fullWidth
                    size="small"
                  />
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <TextField
                    label="Wind km/h"
                    type="number"
                    value={windSpeed}
                    onChange={(event) => setWindSpeed(readNumber(event.target.value, 0))}
                    fullWidth
                    size="small"
                  />
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <TextField
                    label="Gust km/h"
                    type="number"
                    value={windGust}
                    onChange={(event) => setWindGust(readNumber(event.target.value, 0))}
                    fullWidth
                    size="small"
                  />
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <TextField
                    label="Temp C"
                    type="number"
                    value={temperature}
                    onChange={(event) => setTemperature(readNumber(event.target.value, 0))}
                    fullWidth
                    size="small"
                  />
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <TextField
                    label="Rain %"
                    type="number"
                    value={rainChance}
                    onChange={(event) => setRainChance(readNumber(event.target.value, 0))}
                    fullWidth
                    size="small"
                  />
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <StatusPill
                    label={windGust <= selectedAircraftData.maxWindSpeed ? 'Inside limit' : 'Over wind limit'}
                    tone={windGust <= selectedAircraftData.maxWindSpeed ? 'success' : 'error'}
                  />
                </Grid>
              </Grid>
            </Panel>

            <Panel title="Cost Estimate" icon={<GavelIcon />} action={<StatusPill label={formatCurrency(totalEstimatedCost)} tone="info" />}>
              <Grid container spacing={1.25}>
                <Grid size={{ xs: 6 }}>
                  <TextField
                    label="Aircraft"
                    type="number"
                    value={aircraftCost}
                    onChange={(event) => setAircraftCost(readNumber(event.target.value, 0))}
                    fullWidth
                    size="small"
                  />
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <TextField
                    label="Equipment"
                    type="number"
                    value={equipmentCost}
                    onChange={(event) => setEquipmentCost(readNumber(event.target.value, 0))}
                    fullWidth
                    size="small"
                  />
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <TextField
                    label="Personnel"
                    type="number"
                    value={personnelCost}
                    onChange={(event) => setPersonnelCost(readNumber(event.target.value, 0))}
                    fullWidth
                    size="small"
                  />
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <TextField
                    label="Travel"
                    type="number"
                    value={travelCost}
                    onChange={(event) => setTravelCost(readNumber(event.target.value, 0))}
                    fullWidth
                    size="small"
                  />
                </Grid>
              </Grid>
            </Panel>

            {flightOperationsUnlocked && (
              <Panel
              title="Flight Operations"
              icon={<FlightTakeoffIcon />}
              action={
                <StatusPill
                  label={selectedMission?.status || 'No mission'}
                  tone={selectedMission ? STATUS_TONE[selectedMission.status] : 'warning'}
                />
              }
            >
              <Stack spacing={1.5}>
                <Alert
                  severity={selectedMission?.status === 'Completed' ? 'success' : 'info'}
                  sx={{ borderRadius: '8px' }}
                >
                  {missionWorkflow.guidance}
                </Alert>

                <Stack spacing={0.75}>
                  <DetailRow
                    label="Flight Plan"
                    value={(
                      <StatusPill
                        label={selectedMission?.flightPlan ? 'Generated' : 'Not created'}
                        tone={selectedMission?.flightPlan ? 'success' : 'warning'}
                      />
                    )}
                  />
                  <DetailRow
                    label="Flight Authorization"
                    value={(
                      <StatusPill
                        label={selectedMission?.approvals.flyingAuthorization ? 'Recorded' : 'Not recorded'}
                        tone={selectedMission?.approvals.flyingAuthorization ? 'success' : 'warning'}
                      />
                    )}
                  />
                  <DetailRow
                    label="Execution Record"
                    value={(
                      <StatusPill
                        label={selectedMission?.flightExecution ? 'Captured' : 'Not started'}
                        tone={selectedMission?.flightExecution ? 'success' : 'info'}
                      />
                    )}
                  />
                </Stack>

                {selectedMission?.status === 'Approved' && (
                  <>
                <Grid container spacing={1.25}>
                  <Grid size={{ xs: 6 }}>
                    <TextField
                      label={missionType === 'spray' ? 'Height above crop (m)' : 'Altitude (m AGL)'}
                      type="number"
                      value={flightAltitude}
                      onChange={(event) => setFlightAltitude(Math.max(0, Math.min(readNumber(event.target.value, 0), missionMaxAltitude)))}
                      fullWidth
                      size="small"
                      slotProps={{ htmlInput: { min: 0, max: missionMaxAltitude } }}
                      helperText={`Maximum ${missionMaxAltitude} m AGL`}
                    />
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <TextField
                      label="Speed km/h"
                      type="number"
                      value={groundSpeed}
                      onChange={(event) => setGroundSpeed(readNumber(event.target.value, 0))}
                      fullWidth
                      size="small"
                    />
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <TextField
                      label={missionType === 'spray' ? 'Swath (m)' : 'Line spacing (m)'}
                      type="number"
                      value={lineSpacing}
                      onChange={(event) => setLineSpacing(readNumber(event.target.value, 0))}
                      fullWidth
                      size="small"
                    />
                  </Grid>
                  {missionType !== 'spray' && (
                    <>
                      <Grid size={{ xs: 6 }}>
                        <TextField
                          label="Side overlap %"
                          type="number"
                          value={overlapSide}
                          onChange={(event) => setOverlapSide(readNumber(event.target.value, 0))}
                          fullWidth
                          size="small"
                        />
                      </Grid>
                      <Grid size={{ xs: 12 }}>
                        <TextField
                          label="Forward overlap %"
                          type="number"
                          value={overlapForward}
                          onChange={(event) => setOverlapForward(readNumber(event.target.value, 0))}
                          fullWidth
                          size="small"
                        />
                      </Grid>
                    </>
                  )}
                </Grid>

                {selectedMission.flightPlan && !selectedMission.approvals.flyingAuthorization && (
                  <>
                    <Button
                      variant="outlined"
                      onClick={handleGenerateFlightPlan}
                      disabled={dataLoading || saving || !canGenerateFlightPlan}
                      sx={{ borderRadius: '8px' }}
                    >
                      Regenerate Flight Plan
                    </Button>

                    <TextField
                      label="Flight authorization comments"
                      value={flightAuthorizationComments}
                      onChange={(event) => setFlightAuthorizationComments(event.target.value)}
                      fullWidth
                      multiline
                      minRows={2}
                      size="small"
                    />
                  </>
                )}

                {selectedMission.approvals.flyingAuthorization && (
                  <Alert severity="success" sx={{ borderRadius: '8px' }}>
                    Flight authorization recorded. Use the action bar to start flying.
                  </Alert>
                )}
                  </>
                )}

                {flyingReadinessIssues.length > 0 && (
                  <Box sx={{ p: 1, borderRadius: '8px', bgcolor: alpha(theme.palette.warning.main, 0.08) }}>
                    <Typography sx={{ fontSize: '0.72rem', fontWeight: 900, color: 'warning.dark', mb: 0.5 }}>
                      Flight blockers
                    </Typography>
                    {flyingReadinessIssues.slice(0, 3).map((issue) => (
                      <Typography key={`${issue.field}-${issue.code}`} sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>
                        {issue.message}
                      </Typography>
                    ))}
                  </Box>
                )}

                {selectedMission?.status === 'Flying' && (
                  <>
                <Divider />

                <Grid container spacing={1.25}>
                  <Grid size={{ xs: 6 }}>
                    <TextField
                      label="Area completed ha"
                      type="number"
                      value={completionArea}
                      onChange={(event) => setCompletionArea(readNumber(event.target.value, 0))}
                      fullWidth
                      size="small"
                    />
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <TextField
                      label="Flight time min"
                      type="number"
                      value={completionFlightTime}
                      onChange={(event) => setCompletionFlightTime(readNumber(event.target.value, 0))}
                      fullWidth
                      size="small"
                    />
                  </Grid>
                  <Grid size={{ xs: 12 }}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Mission result</InputLabel>
                      <Select
                        value={completionStatus}
                        label="Mission result"
                        onChange={(event) => setCompletionStatus(event.target.value as FlightExecution['results']['missionStatus'])}
                      >
                        <MenuItem value="successful">Successful</MenuItem>
                        <MenuItem value="partially-successful">Partially successful</MenuItem>
                        <MenuItem value="aborted">Aborted</MenuItem>
                        <MenuItem value="failed">Failed</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid size={{ xs: 12 }}>
                    <TextField
                      label="Completion notes"
                      value={completionNotes}
                      onChange={(event) => setCompletionNotes(event.target.value)}
                      fullWidth
                      multiline
                      minRows={2}
                      size="small"
                    />
                  </Grid>
                </Grid>

                {completionReadinessIssues.length > 0 && selectedMission?.status === 'Flying' && (
                  <Box sx={{ p: 1, borderRadius: '8px', bgcolor: alpha(theme.palette.warning.main, 0.08) }}>
                    <Typography sx={{ fontSize: '0.72rem', fontWeight: 900, color: 'warning.dark', mb: 0.5 }}>
                      Completion blockers
                    </Typography>
                    {completionReadinessIssues.slice(0, 3).map((issue) => (
                      <Typography key={`${issue.field}-${issue.code}`} sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>
                        {issue.message}
                      </Typography>
                    ))}
                  </Box>
                )}

                  </>
                )}

                {selectedMission?.status === 'Completed' && selectedMission.flightExecution && (
                  <Box sx={{ p: 1.25, borderRadius: '8px', bgcolor: alpha(theme.palette.success.main, 0.06) }}>
                    <DetailRow label="Area completed" value={`${selectedMission.flightExecution.results.areaCompleted} ha`} />
                    <DetailRow label="Flight time" value={`${selectedMission.flightExecution.actualFlightData.totalFlightTime} min`} />
                    <DetailRow
                      label="Result"
                      value={selectedMission.flightExecution.results.missionStatus.replace('-', ' ')}
                    />
                  </Box>
                )}
              </Stack>
              </Panel>
            )}

            <Panel title="Safety & Compliance" icon={<SecurityIcon />}>
              <Stack spacing={1}>
                <DetailRow
                  label="CASA JSA Status"
                  value={(
                    <StatusPill
                      label={jsaRecord.status === 'in-progress'
                        ? 'In Progress'
                        : `${jsaRecord.status.charAt(0).toUpperCase()}${jsaRecord.status.slice(1)}`}
                      tone={jsaRecord.status === 'approved' ? 'success' : jsaRecord.status === 'rejected' ? 'error' : 'warning'}
                    />
                  )}
                />
                <DetailRow
                  label="Risk Assessment"
                  value={`${jsaRecord.hazardIdentification.length} hazard${jsaRecord.hazardIdentification.length === 1 ? '' : 's'} ${jsaRecord.status === 'approved' ? 'assessed' : 'to review'}`}
                />
                <DetailRow label="APVMA Compliance" value={<StatusPill label="Compliant" tone="success" />} />
                <DetailRow label="CASA Restrictions" value={<StatusPill label="None" tone="success" />} />
                <DetailRow label="Boundary" value={<StatusPill label={boundaryReady ? 'Ready' : 'Needs points'} tone={boundaryReady ? 'success' : 'warning'} />} />
                <DetailRow label="Environmental Clearance" value={<StatusPill label={vegetationClearanceLabel} tone={vegetationClearanceTone} />} />

                <Alert
                  ref={environmentalReviewRef}
                  severity={vegetationClearanceReady && !vegetationReviewRequired ? 'success' : 'warning'}
                  sx={{ borderRadius: '8px' }}
                >
                  {vegetationWarningMessage}
                </Alert>

                {canEditPlanning ? (
                  <Button
                    variant={jsaRecord.status === 'approved' ? 'outlined' : 'contained'}
                    startIcon={<SecurityIcon />}
                    onClick={() => setJsaDialogOpen(true)}
                    sx={{ borderRadius: '8px', fontWeight: 800 }}
                  >
                    {jsaRecord.status === 'approved' ? 'Edit CASA JSA & Risk' : 'Complete CASA JSA & Risk'}
                  </Button>
                ) : selectedMission?.status === 'Approved' ? (
                  <Alert severity="info" sx={{ borderRadius: '8px' }}>
                    Use Edit Mission Plan before changing the JSA or compliance details.
                  </Alert>
                ) : null}

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <Button
                    component="a"
                    href={`/compliance/vegetation${cleanMissionLotPlan ? `?lotPlan=${encodeURIComponent(cleanMissionLotPlan)}` : ''}`}
                    variant="outlined"
                    startIcon={<ForestIcon />}
                    sx={{ borderRadius: '8px', fontWeight: 800, flex: 1 }}
                  >
                    Open PMAV Check
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={() => {
                      loadSavedVegetationChecks().then(setSavedVegetationChecks);
                      showNotice('info', 'Vegetation check evidence refreshed.');
                    }}
                    sx={{ borderRadius: '8px', fontWeight: 800, flex: 1 }}
                  >
                    Refresh Checks
                  </Button>
                </Stack>

                {currentVegetationCheck && (
                  <Box sx={{ p: 1.25, borderRadius: '8px', bgcolor: alpha(theme.palette.primary.main, 0.04) }}>
                    <Typography sx={{ fontSize: '0.74rem', fontWeight: 900, color: 'primary.dark' }}>
                      {currentVegetationCheck.sourceLabel}
                    </Typography>
                    <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>
                      {currentVegetationCheck.lotPlan} - {vegetationCategorySummary} - checked {new Date(currentVegetationCheck.checkedAt).toLocaleString('en-AU')}
                    </Typography>
                  </Box>
                )}

                <FormControlLabel
                  control={
                    <Checkbox
                      checked={vegetationReviewAcknowledged}
                      onChange={(event) => setVegetationReviewAcknowledged(event.target.checked)}
                      size="small"
                    />
                  }
                  label="Environmental review acknowledged or PMAV not required for this mission"
                  sx={{
                    alignItems: 'flex-start',
                    '& .MuiFormControlLabel-label': {
                      fontSize: '0.78rem',
                      color: 'text.secondary',
                    },
                  }}
                />
              </Stack>
            </Panel>
          </Stack>
        </Grid>
      </Grid>

      <Card
        elevation={0}
        sx={{
          position: 'sticky',
          bottom: 0,
          zIndex: 2,
          mt: 2,
          borderRadius: '8px 8px 0 0',
          border: '1px solid rgba(20, 58, 26, 0.12)',
          bgcolor: 'rgba(243, 247, 243, 0.94)',
          backdropFilter: 'blur(10px)',
        }}
      >
        <CardContent sx={{ py: { xs: 1, sm: 1.5 }, '&:last-child': { pb: { xs: 1, sm: 1.5 } } }}>
          <Grid container spacing={1.5} alignItems="center">
            <Grid size={{ xs: 12, md: 4 }}>
              <Stack spacing={0.75}>
                <Stack direction="row" justifyContent="space-between" spacing={1}>
                  <Typography sx={{ fontSize: '0.78rem', fontWeight: 800 }}>
                    Step {missionWorkflow.activeStep + 1} of {MISSION_WORKFLOW_STEPS.length}: {MISSION_WORKFLOW_STEPS[missionWorkflow.activeStep].label}
                  </Typography>
                  <Typography sx={{ display: { xs: 'none', sm: 'block' }, fontSize: '0.78rem', fontWeight: 900 }}>
                    Planning checks {readinessPercent}% - {formatCurrency(totalEstimatedCost)}
                  </Typography>
                </Stack>
                <LinearProgress
                  variant="determinate"
                  value={readinessPercent}
                  sx={{
                    display: { xs: 'none', sm: 'block' },
                    height: 8,
                    borderRadius: 8,
                    bgcolor: alpha(theme.palette.primary.main, 0.1),
                    '& .MuiLinearProgress-bar': {
                      borderRadius: 8,
                      bgcolor: readinessPercent === 100 ? theme.palette.success.main : theme.palette.warning.main,
                    },
                  }}
                />
                <Typography sx={{ display: { xs: 'none', sm: 'block' }, fontSize: '0.7rem', color: 'text.secondary' }}>
                  {missionWorkflow.guidance}
                </Typography>
              </Stack>
            </Grid>
            <Grid size={{ xs: 12, md: 8 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} justifyContent="flex-end">
                {selectedMission?.status === 'Planning' && (
                  <Button
                    variant="outlined"
                    startIcon={<SaveIcon />}
                    onClick={handleSaveDraft}
                    disabled={dataLoading || saving}
                    sx={{ minHeight: 44, px: 4 }}
                  >
                    Update Mission Draft
                  </Button>
                )}
                {selectedMission?.status === 'Approved' && !selectedMission.approvals.flyingAuthorization && (
                  <Button
                    variant="outlined"
                    onClick={handleReturnToPlanning}
                    disabled={dataLoading || saving}
                    sx={{ minHeight: 44, px: 4 }}
                  >
                    Edit Mission Plan
                  </Button>
                )}
                <Button
                  variant="contained"
                  startIcon={missionWorkflow.action === 'save-draft' ? <SaveIcon /> : missionWorkflow.activeStep === 3 ? <FlightTakeoffIcon /> : <CheckCircleIcon />}
                  onClick={handlePrimaryWorkflowAction}
                  disabled={primaryWorkflowActionDisabled}
                  sx={{ minHeight: 44, px: 5, width: { xs: '100%', sm: 'auto' } }}
                >
                  {missionWorkflow.actionLabel}
                </Button>
              </Stack>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Delete mission?</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.86rem', color: 'text.secondary' }}>
            {selectedMission
              ? `${selectedMission.missionNumber} - ${selectedMission.missionName} will be permanently deleted.`
              : 'This mission will be permanently deleted.'}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            startIcon={<DeleteOutlineIcon />}
            onClick={handleDeleteSelectedMission}
            disabled={saving || !canDeleteSelectedMission}
          >
            Delete Mission
          </Button>
        </DialogActions>
      </Dialog>

      <MissionJsaDialog
        open={jsaDialogOpen}
        missionName={missionName}
        value={jsaRecord}
        onClose={() => setJsaDialogOpen(false)}
        onSave={(record) => {
          setJsaRecord(record);
          showNotice(
            record.status === 'approved' ? 'success' : 'info',
            record.status === 'approved'
              ? 'CASA JSA and risk assessment approved. The mission can now be authorized.'
              : 'CASA JSA draft updated. Save the mission draft to persist it.'
          );
        }}
      />

      <Snackbar
        open={notice.open}
        autoHideDuration={4200}
        onClose={() => setNotice((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert severity={notice.severity} variant="filled" sx={{ borderRadius: '8px' }}>
          {notice.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
