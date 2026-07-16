import React from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Divider,
  FormControl,
  FormControlLabel,
  Grid,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  TextField,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import AirplanemodeActiveIcon from '@mui/icons-material/AirplanemodeActive';
import AddIcon from '@mui/icons-material/Add';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloudQueueIcon from '@mui/icons-material/CloudQueue';
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
import { useAircraft } from '../contexts/AircraftContext';
import { useMission } from '../contexts/MissionContext';
import { getLatestVegetationCheckForLotPlan, getSavedVegetationChecks, loadSavedVegetationChecks } from '../services/pmavCheckStore';
import {
  getVegetationCategorySummary,
  hasVegetationReviewCategories,
  sanitizeLotPlan,
} from '../services/pmavService';
import { toClosedGeoJsonRing } from '../utils/boundaryImport';
import { calculateMissionMixVolumes } from '../utils/missionMix';
import { LatLng, BoundaryFileRef } from '../types/fieldManagement';
import { SavedVegetationCheck } from '../types/pmav';
import {
  BoundaryFile,
  FlightExecution,
  FlightPlan,
  JSARecord,
  MissionPlanningChemical,
  MissionPlanningState,
  MissionPriority,
  MissionRecord,
  MissionStatus,
  MissionType,
} from '../types/mission';

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

const PLANNER_STEPS = [
  { label: 'Area', detail: 'Define boundaries' },
  { label: 'Aircraft', detail: 'Select equipment' },
  { label: 'Safety', detail: 'Complete CASA JSA' },
  { label: 'Authorize', detail: 'Final checks' },
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

function reopenApprovedJSA(jsa: JSARecord): JSARecord {
  if (jsa.status !== 'approved') return jsa;

  return {
    ...jsa,
    status: 'in-progress',
    reviewedBy: undefined,
    completedDate: undefined,
    reviewedDate: undefined,
    signOffs: {
      pilot: { userId: 'current_user', signature: '', signedAt: '' },
    },
    updatedAt: new Date().toISOString(),
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
  const theme = useTheme();
  const [searchParams] = useSearchParams();
  const requestedMissionId = searchParams.get('mission') || '';
  const requestedSection = searchParams.get('section') || '';
  const loadedMissionLinkRef = React.useRef('');
  const {
    missions,
    isLoading: missionDataLoading,
    error: missionDataError,
    createMission,
    createAuthorizedMission,
    updateMission,
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
    validateConfiguration,
  } = useAircraft();
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
  const [selectedConfiguration, setSelectedConfiguration] = React.useState(DEMO_CONFIG.id);
  const [boundaryCoords, setBoundaryCoords] = React.useState<LatLng[]>([]);
  const [boundaryPolygons, setBoundaryPolygons] = React.useState<LatLng[][]>([]);
  const [missionArea, setMissionArea] = React.useState(0);
  const [boundaryFile, setBoundaryFile] = React.useState<BoundaryFileRef | null>(null);
  const [jsaRecord, setJsaRecord] = React.useState<JSARecord>(() => createMissionJSA('draft'));
  const [jsaDialogOpen, setJsaDialogOpen] = React.useState(false);
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

  const realConfigurationOptions = configurations.map((config) => {
    const kit = equipmentKits.find((item) => item.id === config.kitId);
    return {
      id: config.id,
      name: config.configurationName,
      kitName: kit?.name || 'Equipment kit',
      tankCapacity: kit?.specifications.weight ? `${kit.specifications.weight} kg kit` : '40 L',
      swathWidth: config.performance.sprayRate ? `${config.performance.sprayRate.swathWidth} m` : '9 m',
      aircraftId: config.aircraftId,
    };
  });
  const configurationOptions = realConfigurationOptions.length > 0
    ? [
        ...realConfigurationOptions,
        ...(realConfigurationOptions.some((item) => item.id === selectedConfiguration) ? [] : [DEMO_CONFIG]),
      ]
    : [DEMO_CONFIG];

  React.useEffect(() => {
    if (aircraft.length > 0 && !aircraft.some((item) => item.id === selectedAircraft)) {
      setSelectedAircraft(aircraft[0].id);
    }
  }, [aircraft, selectedAircraft]);

  React.useEffect(() => {
    const compatible = configurations.filter((config) => config.aircraftId === selectedAircraft);
    if (compatible.length > 0 && !compatible.some((config) => config.id === selectedConfiguration)) {
      setSelectedConfiguration(compatible[0].id);
    }
  }, [configurations, selectedAircraft, selectedConfiguration]);

  const selectedAircraftData = aircraftOptions.find((item) => item.id === selectedAircraft) || DEMO_AIRCRAFT;
  const selectedConfigurationData = configurationOptions.find((item) => item.id === selectedConfiguration) || DEMO_CONFIG;
  const selectedMissionType = MISSION_TYPES.find((item) => item.value === missionType);
  const actualAircraft = aircraft.find((item) => item.id === selectedAircraft);
  const actualConfiguration = configurations.find((item) => item.id === selectedConfiguration);
  const selectedEquipmentKit = actualConfiguration
    ? equipmentKits.find((item) => item.id === actualConfiguration.kitId)
    : undefined;
  const selectedMission = missions.find((mission) => mission.id === selectedMissionId);
  const canPersistMission = !!actualAircraft && !!actualConfiguration;
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
  const canEditPlanning = !selectedMission || !['Flying', 'Completed', 'Locked'].includes(selectedMission.status);
  const canAuthorizePlanning = !selectedMission || ['Planning', 'Approved'].includes(selectedMission.status);
  const canGenerateFlightPlan = !!selectedMission && ['Planning', 'Approved', 'Flying'].includes(selectedMission.status);
  const canAuthorizeForFlight = !!selectedMission && selectedMission.status === 'Approved' && !!selectedMission.flightPlan;
  const canStartFlight = !!selectedMission && selectedMission.status === 'Approved' && !!selectedMission.flightPlan && !!selectedMission.approvals.flyingAuthorization;
  const canRecordCompletion = !!selectedMission && selectedMission.status === 'Flying';
  const canCompleteMission = !!selectedMission && selectedMission.status === 'Flying' && !!selectedMission.flightExecution;
  const flightWorkflowGuidance = !selectedMission
    ? 'Next: save the mission draft.'
    : selectedMission.status === 'Planning'
      ? 'Next: complete the CASA JSA and environmental review, then authorize the mission.'
      : selectedMission.status === 'Approved' && !selectedMission.flightPlan
        ? 'Next: generate the flight plan.'
        : selectedMission.status === 'Approved' && !selectedMission.approvals.flyingAuthorization
          ? 'Next: authorize the flight.'
          : selectedMission.status === 'Approved'
            ? 'Next: start the mission flying.'
            : selectedMission.status === 'Flying' && !selectedMission.flightExecution
              ? 'Next: enter the actual area and flight time, then record completion.'
              : selectedMission.status === 'Flying'
                ? 'Next: review the execution record, then mark the mission completed.'
                : selectedMission.status === 'Completed'
                  ? 'Mission completed. The execution record is saved.'
                  : 'This mission is locked and cannot be changed.';
  const chemicalRows = chemicals.map((chemical) => ({
    ...chemical,
    totalRequired: roundOne(chemical.ratePerHa * missionArea),
  }));
  const missionMixVolumes = calculateMissionMixVolumes(missionArea, applicationRate, chemicals);
  const totalEstimatedCost = aircraftCost + equipmentCost + personnelCost + travelCost + chemicalCost;
  const sortedMissions = [...missions].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
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
    && actualConfiguration
    && selectedEquipmentKit
    && actualConfiguration.aircraftId === actualAircraft.id
    && actualConfiguration.weightAndBalance.withinLimits
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
    { ready: jsaRecord.status === 'approved', message: 'Complete and approve the CASA JSA and risk assessment.' },
    { ready: vegetationClearanceReady, message: 'Complete or acknowledge the environmental clearance review.' },
  ];
  const authorizationBlockers = authorizationChecks.filter((check) => !check.ready).map((check) => check.message);
  const readinessPercent = Math.round((authorizationChecks.filter((check) => check.ready).length / authorizationChecks.length) * 100);
  const missionAuthorizationActionLabel = !canAuthorizePlanning
    ? `Mission ${selectedMission?.status}`
    : jsaRecord.status !== 'approved'
      ? 'Complete CASA JSA First'
      : !vegetationClearanceReady
        ? 'Complete Environmental Review'
        : selectedMission?.status === 'Approved' ? 'Re-authorize Mission' : 'Authorize Mission';
  const plannerStepComplete = [
    boundaryReady,
    aircraftPlanningReady && configurationPlanningReady,
    jsaRecord.status === 'approved',
    authorizationBlockers.length === 0,
  ];

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
    chemicals: chemicalRows,
  });

  const buildMissionPayload = (targetMissionId?: string): MissionPayload => {
    const missionId = targetMissionId || `mission_${Date.now()}`;

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
      aircraftConfiguration: {
        aircraftId: selectedAircraft,
        configurationId: selectedConfiguration,
        estimatedFlightTime: estimatedDuration,
        maxPayloadWeight: selectedAircraftData.maxPayloadWeight,
      },
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
    setSelectedConfiguration(configurationId);

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
    const nextConfiguration = configurations.find((config) => config.aircraftId === nextAircraft)?.id || configurations[0]?.id || DEMO_CONFIG.id;

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
    setSelectedConfiguration(nextConfiguration);
    setBoundaryCoords([]);
    setBoundaryPolygons([]);
    setMissionArea(0);
    setBoundaryFile(null);
    setJsaRecord(createMissionJSA('draft'));
    setJsaDialogOpen(false);
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
    setSelectedConfiguration(mission.aircraftConfiguration.configurationId);
    const loadedBoundaryCoords = planning?.boundaryCoords?.length ? planning.boundaryCoords : [];
    setBoundaryCoords(loadedBoundaryCoords);
    setBoundaryPolygons(
      planning?.boundaryPolygons?.length
        ? planning.boundaryPolygons
        : loadedBoundaryCoords.length ? [loadedBoundaryCoords] : [],
    );
    setMissionArea(missionAreaHa);
    setBoundaryFile(null);
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

    if (!boundaryReady) {
      showNotice('warning', 'Add a valid mission boundary before generating a flight plan.');
      return;
    }

    setSaving(true);
    try {
      if (selectedMission.status === 'Planning') {
        const planningUpdates = { ...buildMissionPayload(selectedMission.id) } as Partial<MissionRecord>;
        delete planningUpdates.missionNumber;
        delete planningUpdates.status;
        await updateMission(selectedMission.id, planningUpdates);
      }
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
          <StatusPill label={`${readinessPercent}% Ready`} tone={readinessPercent === 100 ? 'success' : 'warning'} />
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
            {PLANNER_STEPS.map((step, index) => {
              const complete = plannerStepComplete[index];
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
                        bgcolor: complete ? 'primary.main' : alpha(theme.palette.primary.main, 0.16),
                        color: complete ? 'white' : 'primary.dark',
                        fontSize: '0.78rem',
                        fontWeight: 900,
                      }}
                    >
                      {index + 1}
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontSize: '0.82rem', fontWeight: 900 }}>{step.label}</Typography>
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
                <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={resetPlanner}>
                  New Mission
                </Button>
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

                <Divider />

                {sortedMissions.length === 0 ? (
                  <Typography sx={{ fontSize: '0.76rem', color: 'text.secondary' }}>
                    No missions saved yet.
                  </Typography>
                ) : (
                  sortedMissions.slice(0, 5).map((mission) => (
                    <Button
                      key={mission.id}
                      onClick={() => loadMissionIntoPlanner(mission)}
                      variant={mission.id === selectedMissionId ? 'contained' : 'outlined'}
                      color={mission.id === selectedMissionId ? 'primary' : 'inherit'}
                      sx={{
                        justifyContent: 'space-between',
                        textTransform: 'none',
                        borderRadius: '8px',
                        px: 1.25,
                        py: 1,
                        minHeight: 54,
                      }}
                    >
                      <Box sx={{ textAlign: 'left', minWidth: 0, pr: 1 }}>
                        <Typography sx={{ fontSize: '0.76rem', fontWeight: 900 }} noWrap>
                          {mission.missionName}
                        </Typography>
                        <Typography sx={{ fontSize: '0.66rem', opacity: 0.72 }} noWrap>
                          {mission.missionNumber} - {new Date(mission.updatedAt).toLocaleDateString('en-AU')}
                        </Typography>
                      </Box>
                      <StatusPill label={mission.status} tone={STATUS_TONE[mission.status]} />
                    </Button>
                  ))
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
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      label="Duration min"
                      type="number"
                      value={estimatedDuration}
                      onChange={(event) => setEstimatedDuration(readNumber(event.target.value, 0))}
                      fullWidth
                      size="small"
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
                <FormControl fullWidth size="small">
                  <InputLabel>Aircraft</InputLabel>
                  <Select
                    value={selectedAircraft}
                    label="Aircraft"
                    onChange={(event) => {
                      setSelectedAircraft(event.target.value);
                      setJsaRecord(reopenApprovedJSA);
                    }}
                  >
                    {aircraftOptions.map((item) => (
                      <MenuItem key={item.id} value={item.id}>
                        {item.registration} - {item.model}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl fullWidth size="small">
                  <InputLabel>Equipment Kit</InputLabel>
                  <Select
                    value={selectedConfiguration}
                    label="Equipment Kit"
                    onChange={(event) => {
                      setSelectedConfiguration(event.target.value);
                      setJsaRecord(reopenApprovedJSA);
                    }}
                  >
                    {configurationOptions
                      .filter((item) => !('aircraftId' in item) || item.aircraftId === selectedAircraft)
                      .map((item) => (
                        <MenuItem key={item.id} value={item.id}>
                          {item.name}
                        </MenuItem>
                      ))}
                  </Select>
                </FormControl>
                <Divider />
                <DetailRow label="Spray System" value={selectedConfigurationData.kitName} />
                <DetailRow label="Tank Capacity" value={selectedConfigurationData.tankCapacity} />
                <DetailRow label="Swath Width" value={selectedConfigurationData.swathWidth} />
                <DetailRow label="Payload Limit" value={`${selectedAircraftData.maxPayloadWeight} kg`} />
              </Stack>
            </Panel>

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

            <Panel
              title="Flight Readiness"
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
                  {flightWorkflowGuidance}
                </Alert>

                <Stack spacing={0.75}>
                  <DetailRow
                    label="Flight Plan"
                    value={<StatusPill label={selectedMission?.flightPlan ? 'Generated' : 'Missing'} tone={selectedMission?.flightPlan ? 'success' : 'warning'} />}
                  />
                  <DetailRow
                    label="Flight Authorization"
                    value={<StatusPill label={selectedMission?.approvals.flyingAuthorization ? 'Recorded' : 'Required'} tone={selectedMission?.approvals.flyingAuthorization ? 'success' : 'warning'} />}
                  />
                  <DetailRow
                    label="Execution Record"
                    value={<StatusPill label={selectedMission?.flightExecution ? 'Captured' : 'Not captured'} tone={selectedMission?.flightExecution ? 'success' : 'warning'} />}
                  />
                </Stack>

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

                <Button
                  variant="outlined"
                  onClick={handleGenerateFlightPlan}
                  disabled={dataLoading || saving || !canGenerateFlightPlan}
                  sx={{ borderRadius: '8px' }}
                >
                  {selectedMission?.flightPlan ? 'Regenerate Flight Plan' : 'Generate Flight Plan'}
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

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <Button
                    variant="outlined"
                    onClick={handleAuthorizeForFlight}
                    disabled={dataLoading || saving || !canAuthorizeForFlight}
                    sx={{ flex: 1, borderRadius: '8px' }}
                  >
                    Authorize Flight
                  </Button>
                  <Button
                    variant="contained"
                    onClick={handleStartFlying}
                    disabled={dataLoading || saving || !canStartFlight}
                    sx={{ flex: 1, borderRadius: '8px' }}
                  >
                    Start Flying
                  </Button>
                </Stack>

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

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <Button
                    variant="outlined"
                    onClick={handleRecordCompletion}
                    disabled={dataLoading || saving || !canRecordCompletion}
                    sx={{ flex: 1, borderRadius: '8px' }}
                  >
                    Record Completion
                  </Button>
                  <Button
                    variant="contained"
                    onClick={handleCompleteMission}
                    disabled={dataLoading || saving || !canCompleteMission}
                    sx={{ flex: 1, borderRadius: '8px' }}
                  >
                    Mark Completed
                  </Button>
                </Stack>
              </Stack>
            </Panel>

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

                <Alert severity={vegetationClearanceReady && !vegetationReviewRequired ? 'success' : 'warning'} sx={{ borderRadius: '8px' }}>
                  {vegetationWarningMessage}
                </Alert>

                <Button
                  variant={jsaRecord.status === 'approved' ? 'outlined' : 'contained'}
                  startIcon={<SecurityIcon />}
                  onClick={() => setJsaDialogOpen(true)}
                  disabled={!canEditPlanning}
                  sx={{ borderRadius: '8px', fontWeight: 800 }}
                >
                  {jsaRecord.status === 'approved' ? 'Edit CASA JSA & Risk' : 'Complete CASA JSA & Risk'}
                </Button>

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
        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Grid container spacing={1.5} alignItems="center">
            <Grid size={{ xs: 12, md: 4 }}>
              <Stack spacing={0.75}>
                <Stack direction="row" justifyContent="space-between">
                  <Typography sx={{ fontSize: '0.78rem', fontWeight: 800 }}>
                    {selectedMission ? `${selectedMission.missionNumber} readiness` : 'Mission readiness'}
                  </Typography>
                  <Typography sx={{ fontSize: '0.78rem', fontWeight: 900 }}>
                    {readinessPercent}% - {formatCurrency(totalEstimatedCost)}
                  </Typography>
                </Stack>
                <LinearProgress
                  variant="determinate"
                  value={readinessPercent}
                  sx={{
                    height: 8,
                    borderRadius: 8,
                    bgcolor: alpha(theme.palette.primary.main, 0.1),
                    '& .MuiLinearProgress-bar': {
                      borderRadius: 8,
                      bgcolor: readinessPercent === 100 ? theme.palette.success.main : theme.palette.warning.main,
                    },
                  }}
                />
                {authorizationBlockers.length > 0 && (
                  <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>
                    Next: {authorizationBlockers[0]}
                  </Typography>
                )}
              </Stack>
            </Grid>
            <Grid size={{ xs: 12, md: 8 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} justifyContent="flex-end">
                <Button
                  variant="outlined"
                  startIcon={<SaveIcon />}
                  onClick={handleSaveDraft}
                  disabled={dataLoading || saving || !canEditPlanning}
                  sx={{ minHeight: 44, px: 4 }}
                >
                  {canEditPlanning ? selectedMission ? 'Update Plan' : 'Save Draft' : `Plan ${selectedMission?.status}`}
                </Button>
                <Button
                  variant="contained"
                  startIcon={<CheckCircleIcon />}
                  onClick={handleAuthorizeMission}
                  disabled={dataLoading || saving || !canAuthorizePlanning}
                  sx={{ minHeight: 44, px: 5 }}
                >
                  {missionAuthorizationActionLabel}
                </Button>
              </Stack>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

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
