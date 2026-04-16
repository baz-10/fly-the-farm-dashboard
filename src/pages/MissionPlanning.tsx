import React, { useState, useCallback, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  Stepper,
  Step,
  StepLabel,
  Chip,
  Alert,
  Stack,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  useTheme,
  alpha,
} from '@mui/material';
import FlightTakeoffIcon from '@mui/icons-material/FlightTakeoff';
import MapIcon from '@mui/icons-material/Map';
import SecurityIcon from '@mui/icons-material/Security';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SaveIcon from '@mui/icons-material/Save';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import FieldBoundaryEditor from '../components/FieldBoundaryEditor';
import JSASystem from '../components/JSASystem';
import { LatLng, BoundaryFileRef } from '../types/fieldManagement';
import { MissionRecord, MissionStatus, MissionType, MissionAuditEntry, JSARecord, BoundaryFile, FlightPlan } from '../types/mission';
import { useMission } from '../contexts/MissionContext';
import { useAircraft } from '../contexts/AircraftContext';
import { IndustryType } from '../types/jsa';

const MISSION_STEPS = [
  { label: 'Mission Area', description: 'Define flight boundaries' },
  { label: 'Aircraft & Equipment', description: 'Select aircraft and kit' },
  { label: 'Safety Analysis', description: 'Complete JSA requirements' },
  { label: 'Flight Authorization', description: 'Final checks and approval' },
];

const MISSION_TYPES: { value: MissionType; label: string; description: string; industry: IndustryType }[] = [
  {
    value: 'spray',
    label: 'Crop Spraying',
    description: 'Chemical application for pest and weed control',
    industry: 'crop-spraying'
  },
  {
    value: 'survey',
    label: 'Crop Survey',
    description: 'Monitoring and assessment of crop health',
    industry: 'surveying'
  },
  {
    value: 'inspection',
    label: 'Infrastructure Inspection',
    description: 'Asset monitoring and damage assessment',
    industry: 'inspections'
  },
];

export default function MissionPlanning() {
  const theme = useTheme();
  const { createMission, updateMission } = useMission();
  const { aircraft, equipmentKits } = useAircraft();

  // Mission Planning State
  const [activeStep, setActiveStep] = useState(0);
  const [missionType, setMissionType] = useState<MissionType | ''>('');
  const [selectedAircraft, setSelectedAircraft] = useState('');
  const [selectedKit, setSelectedKit] = useState('');
  const [missionName, setMissionName] = useState('');
  const [clientName, setClientName] = useState('');

  // Boundary State
  const [boundaryCoords, setBoundaryCoords] = useState<LatLng[]>([]);
  const [missionArea, setMissionArea] = useState(0);
  const [boundaryFile, setBoundaryFile] = useState<BoundaryFileRef | null>(null);

  // JSA State
  const [jsaCompleted, setJSACompleted] = useState(false);
  const [jsaId, setJSAId] = useState<string | null>(null);

  // Local mission state
  const [localMission, setLocalMission] = useState<MissionRecord | null>(null);

  // Error and validation state
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Initialize new mission
  useEffect(() => {
    if (!localMission) {
      const missionId = `mission_${Date.now()}`;
      const emptyJSA: JSARecord = {
        id: `jsa_${Date.now()}`,
        missionId: missionId,
        jsaType: 'custom',
        status: 'pending',
        jsaNumber: '',
        completedBy: '',
        hazardAnalysis: [],
        mitigationMeasures: [],
        approvalRequired: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setLocalMission({
        id: missionId,
        missionNumber: `M-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`,
        status: 'Planning' as MissionStatus,
        missionName: '',
        missionType: 'spray' as MissionType,
        priority: 'medium',
        description: '',
        clientId: '',
        location: {
          name: '',
          address: '',
          coordinates: {
            latitude: -27.5,
            longitude: 133.0,
          },
          elevation: 0,
        },
        scheduledDate: new Date().toISOString(),
        estimatedDuration: 60,
        weatherRequirements: {
          maxWindSpeed: 15,
          minVisibility: 5000,
          maxPrecipitationChance: 20,
          allowedCloudCover: 80,
        },
        aircraftConfiguration: {
          aircraftId: '',
          configurationId: '',
          estimatedFlightTime: 0,
          maxPayloadWeight: 0,
        },
        jsaRecord: emptyJSA,
        boundaryFiles: [],
        approvals: {
          crpApproval: {
            status: 'pending',
            approvedBy: '',
            approvedAt: '',
            digitalSignature: '',
            comments: '',
          },
          operationalApproval: {
            status: 'pending',
            approvedBy: '',
            approvedAt: '',
            digitalSignature: '',
            comments: '',
          },
        },
        financialEstimate: {
          aircraftCost: 0,
          equipmentCost: 0,
          personnelCost: 0,
          travelCost: 0,
          totalEstimatedCost: 0,
        },
        complianceChecks: {
          casaNotification: false,
          airspaceApproval: false,
          localPermits: false,
          environmentalClearance: false,
          insuranceCoverage: false,
        },
        auditTrail: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'current_user', // Would come from auth context
        lastModifiedBy: 'current_user',
      });
    }
  }, [localMission]);

  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {};

    switch (step) {
      case 0: // Mission Area
        if (!missionName.trim()) newErrors.missionName = 'Mission name is required';
        if (!missionType) newErrors.missionType = 'Mission type is required';
        if (boundaryCoords.length < 3) newErrors.boundary = 'Mission area must have at least 3 boundary points';
        break;
      case 1: // Aircraft & Equipment
        if (!selectedAircraft) newErrors.aircraft = 'Aircraft selection is required';
        if (!selectedKit) newErrors.kit = 'Equipment kit selection is required';
        break;
      case 2: // Safety Analysis
        if (!jsaCompleted) newErrors.jsa = 'JSA must be completed and approved';
        break;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(activeStep)) {
      setActiveStep((prev) => prev + 1);

      // Update mission data
      if (localMission && missionType) {
        const updatedMission = {
          ...localMission,
          missionName: missionName,
          missionType: missionType as MissionType,
          aircraftConfiguration: {
            ...localMission.aircraftConfiguration,
            aircraftId: selectedAircraft,
            configurationId: selectedKit,
          },
          clientId: clientName,
          updatedAt: new Date().toISOString(),
          lastModifiedBy: 'current_user',
        };
        setLocalMission(updatedMission);
      }
    }
  };

  const handleBack = () => {
    setActiveStep((prev) => prev - 1);
  };

  const handleAreaChange = useCallback((hectares: number) => {
    setMissionArea(hectares);
  }, []);

  const handleBoundaryFileUpload = useCallback((file: BoundaryFileRef | null) => {
    setBoundaryFile(file);
  }, []);

  const handleJSAComplete = useCallback((jsa: any) => {
    setJSACompleted(true);
    setJSAId(jsa.id);

    // Update local mission with JSA data
    if (localMission) {
      setLocalMission({
        ...localMission,
        jsaRecord: {
          ...localMission.jsaRecord,
          id: jsa.id,
          status: 'completed',
          completedDate: new Date().toISOString(),
        },
        updatedAt: new Date().toISOString(),
      });
    }
  }, [localMission]);

  const handleStartMission = async () => {
    if (localMission && validateStep(2) && missionType) {
      const finalMission = {
        ...localMission,
        status: 'Approved' as MissionStatus,
        missionName: missionName,
        missionType: missionType as MissionType,
        aircraftConfiguration: {
          ...localMission.aircraftConfiguration,
          aircraftId: selectedAircraft,
          configurationId: selectedKit,
        },
        updatedAt: new Date().toISOString(),
        lastModifiedBy: 'current_user',
      };

      try {
        const { id: createdMissionId, ...missionData } = finalMission;
        const newMissionId = await createMission(missionData);

        // Navigate to mission execution or show success message
        alert(`Mission "${missionName}" is ready for flight! Mission ID: ${finalMission.missionNumber}`);
      } catch (error) {
        console.error('Failed to create mission:', error);
        alert('Failed to create mission. Please try again.');
      }
    }
  };

  const selectedMissionType = MISSION_TYPES.find(t => t.value === missionType);
  const selectedAircraftData = aircraft.find(a => a.id === selectedAircraft);
  const selectedKitData = equipmentKits.find(k => k.id === selectedKit);

  return (
    <Box sx={{ p: 3, maxWidth: 1400, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <FlightTakeoffIcon sx={{ fontSize: 40, color: 'primary.main' }} />
          <Box>
            <Typography variant="h3" sx={{ fontWeight: 800, color: 'primary.dark' }}>
              Mission Planning
            </Typography>
            <Typography variant="h6" color="text.secondary" sx={{ fontWeight: 400 }}>
              Plan and authorize drone missions with complete compliance
            </Typography>
          </Box>
        </Box>
      </Box>

      <Grid container spacing={3}>
        {/* Progress Stepper */}
        <Grid size={{ xs: 12 }}>
          <Card sx={{ mb: 3 }}>
            <CardContent sx={{ p: 3 }}>
              <Stepper activeStep={activeStep} alternativeLabel>
                {MISSION_STEPS.map((step, index) => (
                  <Step key={step.label}>
                    <StepLabel
                      StepIconProps={{
                        sx: {
                          '&.Mui-completed': { color: 'success.main' },
                          '&.Mui-active': { color: 'primary.main' },
                        },
                      }}
                    >
                      <Typography variant="subtitle2" fontWeight={600}>
                        {step.label}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {step.description}
                      </Typography>
                    </StepLabel>
                  </Step>
                ))}
              </Stepper>
            </CardContent>
          </Card>
        </Grid>

        {/* Step Content */}
        <Grid size={{ xs: 12, lg: 8 }}>
          {/* Step 0: Mission Area */}
          {activeStep === 0 && (
            <Card>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <MapIcon /> Define Mission Area
                </Typography>

                <Grid container spacing={3} sx={{ mb: 3 }}>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <TextField
                      label="Mission Name"
                      value={missionName}
                      onChange={(e) => setMissionName(e.target.value)}
                      error={!!errors.missionName}
                      helperText={errors.missionName}
                      fullWidth
                      required
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <TextField
                      label="Client Name"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      fullWidth
                    />
                  </Grid>
                  <Grid size={{ xs: 12 }}>
                    <FormControl fullWidth error={!!errors.missionType} required>
                      <InputLabel>Mission Type</InputLabel>
                      <Select
                        value={missionType}
                        onChange={(e) => setMissionType(e.target.value)}
                        label="Mission Type"
                      >
                        {MISSION_TYPES.map((type) => (
                          <MenuItem key={type.value} value={type.value}>
                            <Box>
                              <Typography variant="body1">{type.label}</Typography>
                              <Typography variant="caption" color="text.secondary">
                                {type.description}
                              </Typography>
                            </Box>
                          </MenuItem>
                        ))}
                      </Select>
                      {errors.missionType && (
                        <Typography variant="caption" color="error" sx={{ mt: 0.5 }}>
                          {errors.missionType}
                        </Typography>
                      )}
                    </FormControl>
                  </Grid>
                </Grid>

                <Divider sx={{ my: 3 }} />

                <Typography variant="h6" gutterBottom>
                  Mission Boundary
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Upload KML/KMZ/SHP files or draw the mission area directly on the map
                </Typography>

                {errors.boundary && (
                  <Alert severity="error" sx={{ mb: 2 }}>
                    {errors.boundary}
                  </Alert>
                )}

                <FieldBoundaryEditor
                  coords={boundaryCoords}
                  onCoordsChange={setBoundaryCoords}
                  onAreaChange={handleAreaChange}
                  onBoundaryFile={handleBoundaryFileUpload}
                  mapHeight={400}
                />
              </CardContent>
            </Card>
          )}

          {/* Step 1: Aircraft & Equipment */}
          {activeStep === 1 && (
            <Card>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <FlightTakeoffIcon /> Aircraft & Equipment
                </Typography>

                <Grid container spacing={3}>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <FormControl fullWidth error={!!errors.aircraft} required>
                      <InputLabel>Select Aircraft</InputLabel>
                      <Select
                        value={selectedAircraft}
                        onChange={(e) => setSelectedAircraft(e.target.value)}
                        label="Select Aircraft"
                      >
                        {aircraft.map((ac) => (
                          <MenuItem key={ac.id} value={ac.id}>
                            <Box>
                              <Typography variant="body1">
                                {ac.registration} - {ac.model}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {ac.model} • Max Load: {ac.operationalLimits.maxPayloadWeight}kg
                              </Typography>
                            </Box>
                          </MenuItem>
                        ))}
                      </Select>
                      {errors.aircraft && (
                        <Typography variant="caption" color="error" sx={{ mt: 0.5 }}>
                          {errors.aircraft}
                        </Typography>
                      )}
                    </FormControl>
                  </Grid>

                  <Grid size={{ xs: 12, md: 6 }}>
                    <FormControl fullWidth error={!!errors.kit} required>
                      <InputLabel>Equipment Kit</InputLabel>
                      <Select
                        value={selectedKit}
                        onChange={(e) => setSelectedKit(e.target.value)}
                        label="Equipment Kit"
                      >
                        {equipmentKits.map((kit) => (
                          <MenuItem key={kit.id} value={kit.id}>
                            <Box>
                              <Typography variant="body1">{kit.name}</Typography>
                              <Typography variant="caption" color="text.secondary">
                                {kit.type} • {kit.description}
                              </Typography>
                            </Box>
                          </MenuItem>
                        ))}
                      </Select>
                      {errors.kit && (
                        <Typography variant="caption" color="error" sx={{ mt: 0.5 }}>
                          {errors.kit}
                        </Typography>
                      )}
                    </FormControl>
                  </Grid>
                </Grid>

                {selectedAircraftData && selectedKitData && (
                  <Box sx={{ mt: 3, p: 2, bgcolor: alpha(theme.palette.primary.main, 0.05), borderRadius: 2 }}>
                    <Typography variant="h6" gutterBottom>Mission Configuration Summary</Typography>
                    <Stack direction="row" spacing={2} flexWrap="wrap">
                      <Chip
                        label={`Aircraft: ${selectedAircraftData.registration}`}
                        color="primary"
                        variant="outlined"
                      />
                      <Chip
                        label={`Kit: ${selectedKitData.name}`}
                        color="primary"
                        variant="outlined"
                      />
                      <Chip
                        label={`Area: ${missionArea.toFixed(1)} ha`}
                        color="secondary"
                        variant="outlined"
                      />
                      {selectedMissionType && (
                        <Chip
                          label={`Type: ${selectedMissionType.label}`}
                          color="info"
                          variant="outlined"
                        />
                      )}
                    </Stack>
                  </Box>
                )}
              </CardContent>
            </Card>
          )}

          {/* Step 2: Safety Analysis */}
          {activeStep === 2 && (
            <Card>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <SecurityIcon /> Safety Analysis & JSA
                </Typography>

                {errors.jsa && (
                  <Alert severity="error" sx={{ mb: 2 }}>
                    {errors.jsa}
                  </Alert>
                )}

                {jsaCompleted && (
                  <Alert severity="success" sx={{ mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <CheckCircleIcon />
                      JSA completed and approved! JSA ID: {jsaId}
                    </Box>
                  </Alert>
                )}

                <JSASystem
                  missionId={localMission?.id || ''}
                  existingJSA={null}
                  onJSAComplete={handleJSAComplete}
                  onCancel={() => setActiveStep(1)}
                  industryType={selectedMissionType?.industry}
                />
              </CardContent>
            </Card>
          )}

          {/* Step 3: Final Authorization */}
          {activeStep === 3 && (
            <Card>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CheckCircleIcon /> Mission Ready for Flight
                </Typography>

                <Alert severity="success" sx={{ mb: 3 }}>
                  All mission planning requirements have been completed successfully!
                </Alert>

                <Box sx={{ p: 3, bgcolor: alpha(theme.palette.success.main, 0.05), borderRadius: 2, mb: 3 }}>
                  <Typography variant="h6" gutterBottom>Mission Summary</Typography>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Typography variant="body2" color="text.secondary">Mission Name</Typography>
                      <Typography variant="body1" fontWeight={600}>{missionName}</Typography>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Typography variant="body2" color="text.secondary">Mission Type</Typography>
                      <Typography variant="body1" fontWeight={600}>{selectedMissionType?.label}</Typography>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Typography variant="body2" color="text.secondary">Mission Area</Typography>
                      <Typography variant="body1" fontWeight={600}>{missionArea.toFixed(1)} hectares</Typography>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Typography variant="body2" color="text.secondary">Aircraft</Typography>
                      <Typography variant="body1" fontWeight={600}>{selectedAircraftData?.registration}</Typography>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Typography variant="body2" color="text.secondary">Equipment</Typography>
                      <Typography variant="body1" fontWeight={600}>{selectedKitData?.name}</Typography>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Typography variant="body2" color="text.secondary">JSA Status</Typography>
                      <Typography variant="body1" fontWeight={600} color="success.main">
                        ✓ Completed & Approved
                      </Typography>
                    </Grid>
                  </Grid>
                </Box>

                <Button
                  variant="contained"
                  size="large"
                  startIcon={<PlayArrowIcon />}
                  onClick={handleStartMission}
                  sx={{ fontWeight: 700, py: 1.5 }}
                >
                  Authorize Mission for Flight
                </Button>
              </CardContent>
            </Card>
          )}
        </Grid>

        {/* Sidebar */}
        <Grid size={{ xs: 12, lg: 4 }}>
          <Stack spacing={2}>
            {/* Progress Card */}
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Mission Progress</Typography>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    Step {activeStep + 1} of {MISSION_STEPS.length}
                  </Typography>
                  <Box sx={{
                    width: '100%',
                    height: 8,
                    bgcolor: 'grey.200',
                    borderRadius: 4,
                    mt: 1,
                    overflow: 'hidden'
                  }}>
                    <Box sx={{
                      width: `${((activeStep + 1) / MISSION_STEPS.length) * 100}%`,
                      height: '100%',
                      bgcolor: 'primary.main',
                      borderRadius: 4,
                      transition: 'width 0.3s ease'
                    }} />
                  </Box>
                </Box>
                {missionArea > 0 && (
                  <Chip
                    label={`${missionArea.toFixed(1)} ha planned`}
                    color="primary"
                    size="small"
                    sx={{ mr: 1, mb: 1 }}
                  />
                )}
                {jsaCompleted && (
                  <Chip
                    label="JSA Approved"
                    color="success"
                    size="small"
                    sx={{ mr: 1, mb: 1 }}
                  />
                )}
              </CardContent>
            </Card>

            {/* Navigation */}
            <Card>
              <CardContent>
                <Stack direction="row" spacing={1}>
                  <Button
                    variant="outlined"
                    onClick={handleBack}
                    disabled={activeStep === 0}
                    sx={{ flex: 1 }}
                  >
                    Back
                  </Button>
                  {activeStep < MISSION_STEPS.length - 1 ? (
                    <Button
                      variant="contained"
                      onClick={handleNext}
                      sx={{ flex: 1 }}
                    >
                      Next
                    </Button>
                  ) : (
                    <Button
                      variant="contained"
                      startIcon={<SaveIcon />}
                      onClick={handleStartMission}
                      sx={{ flex: 1 }}
                    >
                      Complete
                    </Button>
                  )}
                </Stack>
              </CardContent>
            </Card>
          </Stack>
        </Grid>
      </Grid>
    </Box>
  );
}