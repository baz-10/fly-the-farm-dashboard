import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Checkbox,
  Chip,
  Divider,
  Alert,
  Paper,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Stack,
} from '@mui/material';
import {
  FlightTakeoff as FlightIcon,
  LocationOn as LocationIcon,
  CloudQueue as WeatherIcon,
  Engineering as MaintenanceIcon,
  Security as SafetyIcon,
  Assignment as ChecklistIcon,
  Warning as WarningIcon,
  CheckCircle as CheckIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  ExpandMore as ExpandMoreIcon,
  Save as SaveIcon,
  Print as PrintIcon,
} from '@mui/icons-material';
import { useUserLicense } from '../contexts/UserLicenseContext';

// CASA Flight Log Data Structures
interface AircraftDetails {
  registration: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  mtow: number;
  lastMaintenance: string;
  nextMaintenanceDue: string;
  insurancePolicyNumber: string;
  insuranceExpiry: string;
}

interface RemotePilotLicense {
  licenseNumber: string;
  pilotName: string;
  licenseType: 'RePL' | 'RPC' | 'Other';
  expiryDate: string;
  endorsements: string[];
  medicalCertificate?: string;
  medicalExpiry?: string;
}

interface FlightAuthorization {
  type: 'Standard' | 'BVLOS' | 'Night' | 'Populous' | 'Controlled Airspace' | 'Other';
  authorizationNumber?: string;
  validFrom: string;
  validTo: string;
  conditions: string[];
  airspaceClass?: string;
  atcApproval?: boolean;
}

interface WeatherConditions {
  windSpeed: number;
  windDirection: number;
  visibility: number;
  cloudCeiling: number;
  temperature: number;
  precipitation: 'None' | 'Light Rain' | 'Heavy Rain' | 'Snow' | 'Hail';
  suitable: boolean;
  metar?: string;
}

interface PreFlightCheck {
  item: string;
  status: 'Pass' | 'Fail' | 'N/A';
  notes?: string;
}

interface FlightOperation {
  flightNumber: string;
  takeoffTime: string;
  landingTime: string;
  flightDuration: number;
  maxAltitude: number;
  flightPath: string;
  purpose: string;
  batteriesUsed: string[];
  fuelUsed?: number;
  anomalies: string[];
  emergencyProcedures?: string[];
}

interface PostFlightInspection {
  item: string;
  condition: 'Good' | 'Fair' | 'Poor' | 'Defective';
  actionRequired?: string;
  dueDate?: string;
}

interface RiskAssessment {
  hazard: string;
  likelihood: 'Low' | 'Medium' | 'High';
  consequence: 'Minor' | 'Moderate' | 'Major' | 'Catastrophic';
  riskLevel: 'Low' | 'Medium' | 'High' | 'Extreme';
  mitigation: string;
}

interface CASAFlightLog {
  logId: string;
  date: string;
  location: {
    siteName: string;
    coordinates: string;
    elevation: number;
    nearbyAirfields: string[];
  };
  aircraft: AircraftDetails;
  remotePilot: RemotePilotLicense;
  observer?: {
    name: string;
    qualifications: string;
    contactNumber: string;
  };
  authorizations: FlightAuthorization[];
  weather: WeatherConditions;
  preFlightChecks: PreFlightCheck[];
  flightOperations: FlightOperation[];
  postFlightInspection: PostFlightInspection[];
  riskAssessment: RiskAssessment[];
  compliance: {
    mosCompliance: boolean;
    part101Compliance: boolean;
    part102Compliance: boolean;
    excludedCategoryCompliance: boolean;
    certifiedCategoryCompliance: boolean;
  };
  signatures: {
    remotePilotSignature?: string;
    observerSignature?: string;
    operatorSignature?: string;
    signedAt?: string;
    locked?: boolean;
  };
  attachments: string[];
  notes: string;
  createdAt: string;
  lastModified: string;
}

// CASA Standard Pre-Flight Checklist Items
const CASA_PREFLIGHT_CHECKLIST: PreFlightCheck[] = [
  { item: 'Aircraft registration markings visible and legible', status: 'Pass' },
  { item: 'Propellers/rotors secure and undamaged', status: 'Pass' },
  { item: 'Landing gear condition', status: 'Pass' },
  { item: 'Battery charge level adequate', status: 'Pass' },
  { item: 'Control surfaces movement check', status: 'Pass' },
  { item: 'Gimbal/camera mounting secure', status: 'Pass' },
  { item: 'GPS signal acquisition', status: 'Pass' },
  { item: 'Compass calibration current', status: 'Pass' },
  { item: 'Emergency procedures briefed', status: 'Pass' },
  { item: 'Airspace clearances obtained', status: 'Pass' },
  { item: 'Weather conditions suitable', status: 'Pass' },
  { item: 'NOTAM/airspace restrictions checked', status: 'Pass' },
  { item: 'Insurance current and valid', status: 'Pass' },
  { item: 'Risk assessment completed', status: 'Pass' },
  { item: 'Emergency contact numbers available', status: 'Pass' },
];

// CASA Post-Flight Inspection Items
const CASA_POSTFLIGHT_INSPECTION: PostFlightInspection[] = [
  { item: 'Airframe structural integrity', condition: 'Good' },
  { item: 'Propellers/rotors condition', condition: 'Good' },
  { item: 'Landing gear condition', condition: 'Good' },
  { item: 'Battery condition and charge cycles', condition: 'Good' },
  { item: 'Gimbal/camera condition', condition: 'Good' },
  { item: 'Control surface operation', condition: 'Good' },
  { item: 'Communication systems', condition: 'Good' },
  { item: 'Navigation systems', condition: 'Good' },
  { item: 'Emergency systems', condition: 'Good' },
  { item: 'General cleanliness and storage', condition: 'Good' },
];

const STORAGE_KEY = 'ftf_casa_flight_logs';

export default function ComplianceFlight() {
  const { getAutoPopulateData } = useUserLicense();
  const [flightLog, setFlightLog] = useState<CASAFlightLog>({
    logId: `FL-${Date.now()}`,
    date: new Date().toISOString().split('T')[0],
    location: {
      siteName: '',
      coordinates: '',
      elevation: 0,
      nearbyAirfields: [],
    },
    aircraft: {
      registration: '',
      manufacturer: '',
      model: '',
      serialNumber: '',
      mtow: 0,
      lastMaintenance: '',
      nextMaintenanceDue: '',
      insurancePolicyNumber: '',
      insuranceExpiry: '',
    },
    remotePilot: {
      licenseNumber: '',
      pilotName: '',
      licenseType: 'RePL',
      expiryDate: '',
      endorsements: [],
    },
    authorizations: [],
    weather: {
      windSpeed: 0,
      windDirection: 0,
      visibility: 10,
      cloudCeiling: 1000,
      temperature: 20,
      precipitation: 'None',
      suitable: true,
    },
    preFlightChecks: [...CASA_PREFLIGHT_CHECKLIST],
    flightOperations: [],
    postFlightInspection: [...CASA_POSTFLIGHT_INSPECTION],
    riskAssessment: [],
    compliance: {
      mosCompliance: false,
      part101Compliance: false,
      part102Compliance: false,
      excludedCategoryCompliance: false,
      certifiedCategoryCompliance: false,
    },
    signatures: {},
    attachments: [],
    notes: '',
    createdAt: new Date().toISOString(),
    lastModified: new Date().toISOString(),
  });

  const [savedLogs, setSavedLogs] = useState<CASAFlightLog[]>([]);
  const [showSavedLogs, setShowSavedLogs] = useState(false);
  const [selectedLog, setSelectedLog] = useState<string | null>(null);

  // Auto-populate from user license data
  useEffect(() => {
    const autoData = getAutoPopulateData('NSW'); // Use NSW as primary state
    if (autoData.applicatorName) {
      setFlightLog(prev => ({
        ...prev,
        remotePilot: {
          ...prev.remotePilot,
          pilotName: autoData.applicatorName,
        },
      }));
    }
    if (autoData.companyName) {
      // Could populate operator company details
    }
  }, [getAutoPopulateData]);

  // Load saved logs
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      setSavedLogs(saved);
    } catch (error) {
      console.error('Error loading saved flight logs:', error);
    }
  }, []);

  const saveFlightLog = () => {
    const updatedLog = {
      ...flightLog,
      lastModified: new Date().toISOString(),
    };

    const existingIndex = savedLogs.findIndex(log => log.logId === flightLog.logId);
    let updatedLogs;

    if (existingIndex >= 0) {
      updatedLogs = [...savedLogs];
      updatedLogs[existingIndex] = updatedLog;
    } else {
      updatedLogs = [...savedLogs, updatedLog];
    }

    setSavedLogs(updatedLogs);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedLogs));
    setFlightLog(updatedLog);
  };

  const loadFlightLog = (logId: string) => {
    const log = savedLogs.find(l => l.logId === logId);
    if (log) {
      setFlightLog(log);
      setSelectedLog(logId);
      setShowSavedLogs(false);
    }
  };

  const addFlightOperation = () => {
    const newOperation: FlightOperation = {
      flightNumber: `${flightLog.logId}-${flightLog.flightOperations.length + 1}`,
      takeoffTime: '',
      landingTime: '',
      flightDuration: 0,
      maxAltitude: 0,
      flightPath: '',
      purpose: '',
      batteriesUsed: [],
      anomalies: [],
    };

    setFlightLog(prev => ({
      ...prev,
      flightOperations: [...prev.flightOperations, newOperation],
    }));
  };

  const addRiskAssessment = () => {
    const newRisk: RiskAssessment = {
      hazard: '',
      likelihood: 'Low',
      consequence: 'Minor',
      riskLevel: 'Low',
      mitigation: '',
    };

    setFlightLog(prev => ({
      ...prev,
      riskAssessment: [...prev.riskAssessment, newRisk],
    }));
  };

  const addAuthorization = () => {
    const newAuth: FlightAuthorization = {
      type: 'Standard',
      validFrom: new Date().toISOString().split('T')[0],
      validTo: new Date().toISOString().split('T')[0],
      conditions: [],
    };

    setFlightLog(prev => ({
      ...prev,
      authorizations: [...prev.authorizations, newAuth],
    }));
  };

  const calculateRiskLevel = (likelihood: string, consequence: string): string => {
    const matrix: Record<string, Record<string, string>> = {
      'Low': { 'Minor': 'Low', 'Moderate': 'Low', 'Major': 'Medium', 'Catastrophic': 'High' },
      'Medium': { 'Minor': 'Low', 'Moderate': 'Medium', 'Major': 'High', 'Catastrophic': 'Extreme' },
      'High': { 'Minor': 'Medium', 'Moderate': 'High', 'Major': 'Extreme', 'Catastrophic': 'Extreme' },
    };
    return matrix[likelihood]?.[consequence] || 'Low';
  };

  const isFlightLogComplete = (): boolean => {
    return !!(
      flightLog.aircraft.registration &&
      flightLog.remotePilot.licenseNumber &&
      flightLog.remotePilot.pilotName &&
      flightLog.location.siteName &&
      flightLog.weather.suitable &&
      flightLog.preFlightChecks.every(check => check.status !== 'Fail') &&
      flightLog.flightOperations.length > 0
    );
  };

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <FlightIcon /> CASA Flight Log Compliance
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Comprehensive flight logging system meeting CASA and MOS requirements
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            onClick={() => setShowSavedLogs(true)}
            startIcon={<ChecklistIcon />}
          >
            View Saved Logs
          </Button>
          <Button
            variant="contained"
            onClick={saveFlightLog}
            startIcon={<SaveIcon />}
            disabled={flightLog.signatures.locked}
          >
            Save Flight Log
          </Button>
        </Box>
      </Box>

      {!isFlightLogComplete() && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          <Typography variant="body2">
            Flight log is incomplete. Please ensure all mandatory fields are completed before flight operations.
          </Typography>
        </Alert>
      )}

      {/* Aircraft Details */}
      <Accordion defaultExpanded sx={{ mb: 2 }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <FlightIcon /> Aircraft Details
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Aircraft Registration *"
                value={flightLog.aircraft.registration}
                onChange={(e) => setFlightLog(prev => ({
                  ...prev,
                  aircraft: { ...prev.aircraft, registration: e.target.value }
                }))}
                required
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Manufacturer"
                value={flightLog.aircraft.manufacturer}
                onChange={(e) => setFlightLog(prev => ({
                  ...prev,
                  aircraft: { ...prev.aircraft, manufacturer: e.target.value }
                }))}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Model"
                value={flightLog.aircraft.model}
                onChange={(e) => setFlightLog(prev => ({
                  ...prev,
                  aircraft: { ...prev.aircraft, model: e.target.value }
                }))}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Serial Number"
                value={flightLog.aircraft.serialNumber}
                onChange={(e) => setFlightLog(prev => ({
                  ...prev,
                  aircraft: { ...prev.aircraft, serialNumber: e.target.value }
                }))}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                fullWidth
                label="MTOW (kg)"
                type="number"
                value={flightLog.aircraft.mtow || ''}
                onChange={(e) => setFlightLog(prev => ({
                  ...prev,
                  aircraft: { ...prev.aircraft, mtow: parseFloat(e.target.value) || 0 }
                }))}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                fullWidth
                label="Last Maintenance"
                type="date"
                value={flightLog.aircraft.lastMaintenance}
                onChange={(e) => setFlightLog(prev => ({
                  ...prev,
                  aircraft: { ...prev.aircraft, lastMaintenance: e.target.value }
                }))}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                fullWidth
                label="Next Maintenance Due"
                type="date"
                value={flightLog.aircraft.nextMaintenanceDue}
                onChange={(e) => setFlightLog(prev => ({
                  ...prev,
                  aircraft: { ...prev.aircraft, nextMaintenanceDue: e.target.value }
                }))}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Insurance Policy Number"
                value={flightLog.aircraft.insurancePolicyNumber}
                onChange={(e) => setFlightLog(prev => ({
                  ...prev,
                  aircraft: { ...prev.aircraft, insurancePolicyNumber: e.target.value }
                }))}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Insurance Expiry"
                type="date"
                value={flightLog.aircraft.insuranceExpiry}
                onChange={(e) => setFlightLog(prev => ({
                  ...prev,
                  aircraft: { ...prev.aircraft, insuranceExpiry: e.target.value }
                }))}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
          </Grid>
        </AccordionDetails>
      </Accordion>

      {/* Remote Pilot License Details */}
      <Accordion sx={{ mb: 2 }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SafetyIcon /> Remote Pilot License
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Pilot Name *"
                value={flightLog.remotePilot.pilotName}
                onChange={(e) => setFlightLog(prev => ({
                  ...prev,
                  remotePilot: { ...prev.remotePilot, pilotName: e.target.value }
                }))}
                required
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="License Number *"
                value={flightLog.remotePilot.licenseNumber}
                onChange={(e) => setFlightLog(prev => ({
                  ...prev,
                  remotePilot: { ...prev.remotePilot, licenseNumber: e.target.value }
                }))}
                required
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <FormControl fullWidth>
                <InputLabel>License Type *</InputLabel>
                <Select
                  value={flightLog.remotePilot.licenseType}
                  onChange={(e) => setFlightLog(prev => ({
                    ...prev,
                    remotePilot: { ...prev.remotePilot, licenseType: e.target.value as any }
                  }))}
                >
                  <MenuItem value="RePL">Remote Pilot License (RePL)</MenuItem>
                  <MenuItem value="RPC">Remote Pilot Certificate (RPC)</MenuItem>
                  <MenuItem value="Other">Other</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                fullWidth
                label="License Expiry *"
                type="date"
                value={flightLog.remotePilot.expiryDate}
                onChange={(e) => setFlightLog(prev => ({
                  ...prev,
                  remotePilot: { ...prev.remotePilot, expiryDate: e.target.value }
                }))}
                InputLabelProps={{ shrink: true }}
                required
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                fullWidth
                label="Medical Certificate"
                value={flightLog.remotePilot.medicalCertificate || ''}
                onChange={(e) => setFlightLog(prev => ({
                  ...prev,
                  remotePilot: { ...prev.remotePilot, medicalCertificate: e.target.value }
                }))}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Endorsements (comma separated)"
                value={flightLog.remotePilot.endorsements.join(', ')}
                onChange={(e) => setFlightLog(prev => ({
                  ...prev,
                  remotePilot: { ...prev.remotePilot, endorsements: e.target.value.split(',').map(s => s.trim()).filter(s => s) }
                }))}
                placeholder="BVLOS, Night Operations, Controlled Airspace, etc."
              />
            </Grid>
          </Grid>
        </AccordionDetails>
      </Accordion>

      {/* Flight Location & Weather */}
      <Accordion sx={{ mb: 2 }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <LocationIcon /> Location & Weather
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 8 }}>
              <TextField
                fullWidth
                label="Site Name *"
                value={flightLog.location.siteName}
                onChange={(e) => setFlightLog(prev => ({
                  ...prev,
                  location: { ...prev.location, siteName: e.target.value }
                }))}
                required
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                fullWidth
                label="Elevation (ft AGL)"
                type="number"
                value={flightLog.location.elevation || ''}
                onChange={(e) => setFlightLog(prev => ({
                  ...prev,
                  location: { ...prev.location, elevation: parseFloat(e.target.value) || 0 }
                }))}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Coordinates (Lat, Long)"
                value={flightLog.location.coordinates}
                onChange={(e) => setFlightLog(prev => ({
                  ...prev,
                  location: { ...prev.location, coordinates: e.target.value }
                }))}
                placeholder="-33.8688, 151.2093"
              />
            </Grid>

            <Grid size={{ xs: 12 }}>
              <Typography variant="subtitle2" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <WeatherIcon /> Weather Conditions
              </Typography>
            </Grid>

            <Grid size={{ xs: 12, md: 3 }}>
              <TextField
                fullWidth
                label="Wind Speed (kts)"
                type="number"
                value={flightLog.weather.windSpeed || ''}
                onChange={(e) => setFlightLog(prev => ({
                  ...prev,
                  weather: { ...prev.weather, windSpeed: parseFloat(e.target.value) || 0 }
                }))}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <TextField
                fullWidth
                label="Wind Direction (°)"
                type="number"
                value={flightLog.weather.windDirection || ''}
                onChange={(e) => setFlightLog(prev => ({
                  ...prev,
                  weather: { ...prev.weather, windDirection: parseFloat(e.target.value) || 0 }
                }))}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <TextField
                fullWidth
                label="Visibility (km)"
                type="number"
                value={flightLog.weather.visibility || ''}
                onChange={(e) => setFlightLog(prev => ({
                  ...prev,
                  weather: { ...prev.weather, visibility: parseFloat(e.target.value) || 0 }
                }))}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <TextField
                fullWidth
                label="Temperature (°C)"
                type="number"
                value={flightLog.weather.temperature || ''}
                onChange={(e) => setFlightLog(prev => ({
                  ...prev,
                  weather: { ...prev.weather, temperature: parseFloat(e.target.value) || 0 }
                }))}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <FormControl fullWidth>
                <InputLabel>Precipitation</InputLabel>
                <Select
                  value={flightLog.weather.precipitation}
                  onChange={(e) => setFlightLog(prev => ({
                    ...prev,
                    weather: { ...prev.weather, precipitation: e.target.value as any }
                  }))}
                >
                  <MenuItem value="None">None</MenuItem>
                  <MenuItem value="Light Rain">Light Rain</MenuItem>
                  <MenuItem value="Heavy Rain">Heavy Rain</MenuItem>
                  <MenuItem value="Snow">Snow</MenuItem>
                  <MenuItem value="Hail">Hail</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={flightLog.weather.suitable}
                    onChange={(e) => setFlightLog(prev => ({
                      ...prev,
                      weather: { ...prev.weather, suitable: e.target.checked }
                    }))}
                  />
                }
                label="Weather conditions suitable for flight"
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="METAR (if available)"
                value={flightLog.weather.metar || ''}
                onChange={(e) => setFlightLog(prev => ({
                  ...prev,
                  weather: { ...prev.weather, metar: e.target.value }
                }))}
                placeholder="YSSY 121200Z 23015KT 9999 FEW020 SCT040 19/16 Q1015"
              />
            </Grid>
          </Grid>
        </AccordionDetails>
      </Accordion>

      {/* Flight Authorizations */}
      <Accordion sx={{ mb: 2 }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SafetyIcon /> Flight Authorizations
            <Chip size="small" label={flightLog.authorizations.length} />
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Box sx={{ mb: 2 }}>
            <Button
              variant="outlined"
              onClick={addAuthorization}
              startIcon={<AddIcon />}
              disabled={flightLog.signatures.locked}
            >
              Add Authorization
            </Button>
          </Box>

          {flightLog.authorizations.map((auth, index) => (
            <Paper key={index} sx={{ p: 2, mb: 2 }}>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <FormControl fullWidth>
                    <InputLabel>Authorization Type</InputLabel>
                    <Select
                      value={auth.type}
                      onChange={(e) => {
                        const updatedAuths = [...flightLog.authorizations];
                        updatedAuths[index] = { ...auth, type: e.target.value as any };
                        setFlightLog(prev => ({ ...prev, authorizations: updatedAuths }));
                      }}
                    >
                      <MenuItem value="Standard">Standard Operations</MenuItem>
                      <MenuItem value="BVLOS">BVLOS Operations</MenuItem>
                      <MenuItem value="Night">Night Operations</MenuItem>
                      <MenuItem value="Populous">Operations over Populous Areas</MenuItem>
                      <MenuItem value="Controlled Airspace">Controlled Airspace</MenuItem>
                      <MenuItem value="Other">Other</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth
                    label="Authorization Number"
                    value={auth.authorizationNumber || ''}
                    onChange={(e) => {
                      const updatedAuths = [...flightLog.authorizations];
                      updatedAuths[index] = { ...auth, authorizationNumber: e.target.value };
                      setFlightLog(prev => ({ ...prev, authorizations: updatedAuths }));
                    }}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField
                    fullWidth
                    label="Valid From"
                    type="date"
                    value={auth.validFrom}
                    onChange={(e) => {
                      const updatedAuths = [...flightLog.authorizations];
                      updatedAuths[index] = { ...auth, validFrom: e.target.value };
                      setFlightLog(prev => ({ ...prev, authorizations: updatedAuths }));
                    }}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField
                    fullWidth
                    label="Valid To"
                    type="date"
                    value={auth.validTo}
                    onChange={(e) => {
                      const updatedAuths = [...flightLog.authorizations];
                      updatedAuths[index] = { ...auth, validTo: e.target.value };
                      setFlightLog(prev => ({ ...prev, authorizations: updatedAuths }));
                    }}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <IconButton
                    onClick={() => {
                      const updatedAuths = flightLog.authorizations.filter((_, i) => i !== index);
                      setFlightLog(prev => ({ ...prev, authorizations: updatedAuths }));
                    }}
                    disabled={flightLog.signatures.locked}
                    color="error"
                  >
                    <DeleteIcon />
                  </IconButton>
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <TextField
                    fullWidth
                    label="Conditions"
                    value={auth.conditions.join('\n')}
                    onChange={(e) => {
                      const updatedAuths = [...flightLog.authorizations];
                      updatedAuths[index] = { ...auth, conditions: e.target.value.split('\n').filter(s => s.trim()) };
                      setFlightLog(prev => ({ ...prev, authorizations: updatedAuths }));
                    }}
                    multiline
                    rows={3}
                    placeholder="Enter each condition on a new line"
                  />
                </Grid>
              </Grid>
            </Paper>
          ))}
        </AccordionDetails>
      </Accordion>

      {/* CASA Compliance Checklist */}
      <Accordion sx={{ mb: 2 }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ChecklistIcon /> CASA Compliance Checklist
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={flightLog.compliance.part101Compliance}
                    onChange={(e) => setFlightLog(prev => ({
                      ...prev,
                      compliance: { ...prev.compliance, part101Compliance: e.target.checked }
                    }))}
                    disabled={flightLog.signatures.locked}
                  />
                }
                label="Part 101 (Unmanned aircraft and rockets) compliance confirmed"
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={flightLog.compliance.part102Compliance}
                    onChange={(e) => setFlightLog(prev => ({
                      ...prev,
                      compliance: { ...prev.compliance, part102Compliance: e.target.checked }
                    }))}
                    disabled={flightLog.signatures.locked}
                  />
                }
                label="Part 102 (Unmanned aircraft operator's certificate) compliance confirmed"
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={flightLog.compliance.mosCompliance}
                    onChange={(e) => setFlightLog(prev => ({
                      ...prev,
                      compliance: { ...prev.compliance, mosCompliance: e.target.checked }
                    }))}
                    disabled={flightLog.signatures.locked}
                  />
                }
                label="Manual of Standards (MOS) compliance confirmed"
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={flightLog.compliance.excludedCategoryCompliance}
                    onChange={(e) => setFlightLog(prev => ({
                      ...prev,
                      compliance: { ...prev.compliance, excludedCategoryCompliance: e.target.checked }
                    }))}
                    disabled={flightLog.signatures.locked}
                  />
                }
                label="Excluded category RPA compliance (if applicable)"
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={flightLog.compliance.certifiedCategoryCompliance}
                    onChange={(e) => setFlightLog(prev => ({
                      ...prev,
                      compliance: { ...prev.compliance, certifiedCategoryCompliance: e.target.checked }
                    }))}
                    disabled={flightLog.signatures.locked}
                  />
                }
                label="Certified category RPA compliance (if applicable)"
              />
            </Grid>
          </Grid>
        </AccordionDetails>
      </Accordion>

      {/* Notes and Additional Information */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Flight Log Notes
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={4}
            value={flightLog.notes}
            onChange={(e) => setFlightLog(prev => ({ ...prev, notes: e.target.value }))}
            placeholder="Additional notes, observations, or remarks for this flight log..."
            disabled={flightLog.signatures.locked}
          />
        </CardContent>
      </Card>

      {/* Digital Signatures */}
      {flightLog.signatures.locked ? (
        <Alert severity="success" sx={{ mb: 3 }}>
          <Typography variant="body2">
            This flight log has been digitally signed and locked. No further modifications are permitted.
            Signed by: {flightLog.signatures.remotePilotSignature} on {new Date(flightLog.signatures.signedAt!).toLocaleString()}
          </Typography>
        </Alert>
      ) : (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Digital Sign-Off
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Digital signature will lock this flight log and prevent further modifications.
            </Typography>
            <Grid container spacing={3}>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  fullWidth
                  label="Remote Pilot Digital Signature"
                  value={flightLog.signatures.remotePilotSignature || ''}
                  onChange={(e) => setFlightLog(prev => ({
                    ...prev,
                    signatures: { ...prev.signatures, remotePilotSignature: e.target.value }
                  }))}
                  placeholder="Type your full name to digitally sign"
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Button
                  variant="contained"
                  color="primary"
                  onClick={() => {
                    if (flightLog.signatures.remotePilotSignature && isFlightLogComplete()) {
                      setFlightLog(prev => ({
                        ...prev,
                        signatures: {
                          ...prev.signatures,
                          signedAt: new Date().toISOString(),
                          locked: true,
                        }
                      }));
                      saveFlightLog();
                    }
                  }}
                  disabled={!flightLog.signatures.remotePilotSignature || !isFlightLogComplete()}
                  fullWidth
                >
                  Sign & Lock Flight Log
                </Button>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* Saved Flight Logs Dialog */}
      <Dialog
        open={showSavedLogs}
        onClose={() => setShowSavedLogs(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Saved Flight Logs</DialogTitle>
        <DialogContent>
          <List>
            {savedLogs.length === 0 ? (
              <Typography color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
                No saved flight logs found.
              </Typography>
            ) : (
              savedLogs.map((log) => (
                <ListItem
                  key={log.logId}
                  disablePadding
                  sx={{ border: 1, borderColor: 'divider', borderRadius: 1, mb: 1 }}
                >
                  <ListItemButton onClick={() => loadFlightLog(log.logId)}>
                    <ListItemIcon>
                      {log.signatures.locked ? <CheckIcon color="success" /> : <WarningIcon color="warning" />}
                    </ListItemIcon>
                    <ListItemText
                      primary={`${log.logId} - ${log.location.siteName || 'Unnamed Site'}`}
                      secondary={`${log.date} | ${log.remotePilot.pilotName} | ${log.flightOperations.length} flight(s)`}
                    />
                    <Chip
                      size="small"
                      label={log.signatures.locked ? 'Signed' : 'Draft'}
                      color={log.signatures.locked ? 'success' : 'warning'}
                    />
                  </ListItemButton>
                </ListItem>
              ))
            )}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowSavedLogs(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}