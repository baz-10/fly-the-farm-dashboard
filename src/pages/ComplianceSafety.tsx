import React, { useState, useEffect } from 'react';
import {
  Typography,
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Grid,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Checkbox,
  Paper,
  useTheme,
  alpha,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import SecurityIcon from '@mui/icons-material/Security';
import WarningIcon from '@mui/icons-material/Warning';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SaveIcon from '@mui/icons-material/Save';
import LinkIcon from '@mui/icons-material/Link';
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import EmergencyIcon from '@mui/icons-material/Emergency';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import { getJobs, getClientById, getPropertyById, getFieldById } from '../services/fieldManagementStore';

interface SafetyRecord {
  id: string;
  createdAt: string;
  state: string;
  jobId?: string;
  jobDetails?: {
    clientName: string;
    propertyName: string;
    fieldName: string;
    jobDate: string;
  };
  personalProtectiveEquipment: {
    respiratoryProtection: string;
    eyeProtection: string;
    skinProtection: string;
    footProtection: string;
    headProtection: string;
    handProtection: string;
    ppeInspected: boolean;
    ppeCompliant: boolean;
    decontaminationProcedures: boolean;
  };
  safetyProcedures: {
    safetyDataSheets: boolean;
    emergencyContactNumbers: boolean;
    spillResponsePlan: boolean;
    firstAidKit: boolean;
    eyewashStation: boolean;
    emergencyShower: boolean;
    fireExtinguisher: boolean;
    communicationDevice: boolean;
  };
  workplaceSafety: {
    riskAssessment: boolean;
    safeWorkMethod: boolean;
    weatherConditions: string;
    windSpeed: string;
    visibility: string;
    temperatureInversion: boolean;
    bufferZones: boolean;
    publicSafety: boolean;
  };
  medicalCompliance: {
    firstAidTraining: boolean;
    trainingExpiry: string;
    medicalCertificate: boolean;
    certificateExpiry: string;
    healthSurveillance: boolean;
    lastHealthCheck: string;
    medicationDeclaration: boolean;
  };
  stateCompliance: Record<string, any>;
  operatorNotes: string;
  signedOff?: {
    signedAt: string;
    signedBy: string;
    signature: string;
    ipAddress: string;
  };
  isLocked: boolean;
}

interface StateFormField {
  name: string;
  label: string;
  type: 'checkbox' | 'text' | 'number' | 'select' | 'date';
  required: boolean;
  options?: string[];
}

const AUSTRALIAN_STATES = [
  { code: 'NSW', name: 'New South Wales' },
  { code: 'VIC', name: 'Victoria' },
  { code: 'QLD', name: 'Queensland' },
  { code: 'SA', name: 'South Australia' },
  { code: 'WA', name: 'Western Australia' },
  { code: 'TAS', name: 'Tasmania' },
  { code: 'NT', name: 'Northern Territory' },
  { code: 'ACT', name: 'Australian Capital Territory' },
];

const STATE_SAFETY_REQUIREMENTS: Record<string, {
  authority: string;
  requirements: string[];
  forms: StateFormField[];
}> = {
  NSW: {
    authority: 'SafeWork NSW',
    requirements: [
      'Work Health and Safety Act 2011 compliance',
      'Chemical hazard risk assessments',
      'Personal protective equipment standards',
      'Emergency response procedures',
      'Worker health surveillance programs',
      'Incident reporting and investigation',
    ],
    forms: [
      { name: 'whs_act_nsw', label: 'WHS Act compliance verified', type: 'checkbox', required: true },
      { name: 'risk_assessments_nsw', label: 'Chemical hazard assessments completed', type: 'checkbox', required: true },
      { name: 'emergency_procedures_nsw', label: 'Emergency procedures documented', type: 'checkbox', required: true },
      { name: 'incident_reporting_nsw', label: 'Incident reporting system established', type: 'checkbox', required: true },
    ],
  },
  VIC: {
    authority: 'WorkSafe Victoria',
    requirements: [
      'Occupational Health and Safety Act 2004',
      'Dangerous Goods Act compliance',
      'PPE selection and maintenance standards',
      'Worker consultation requirements',
      'Health monitoring for chemical exposure',
      'Return to work procedures',
    ],
    forms: [
      { name: 'ohs_act_vic', label: 'OHS Act 2004 compliance', type: 'checkbox', required: true },
      { name: 'dangerous_goods_vic', label: 'Dangerous Goods Act compliance', type: 'checkbox', required: true },
      { name: 'worker_consultation_vic', label: 'Worker consultation completed', type: 'checkbox', required: true },
      { name: 'health_monitoring_vic', label: 'Health monitoring program active', type: 'checkbox', required: true },
    ],
  },
  QLD: {
    authority: 'Workplace Health and Safety Queensland',
    requirements: [
      'Work Health and Safety Act 2011 (Qld)',
      'Chemical workplace entry requirements',
      'Heat stress management protocols',
      'Remote and isolated work procedures',
      'First aid requirements for rural work',
      'Fatigue management for operators',
    ],
    forms: [
      { name: 'whs_qld', label: 'WHS Act Queensland compliance', type: 'checkbox', required: true },
      { name: 'heat_stress_qld', label: 'Heat stress protocols implemented', type: 'checkbox', required: true },
      { name: 'remote_work_qld', label: 'Remote work procedures established', type: 'checkbox', required: true },
      { name: 'fatigue_management_qld', label: 'Fatigue management plan active', type: 'checkbox', required: true },
    ],
  },
  SA: {
    authority: 'SafeWork SA',
    requirements: [
      'Work Health and Safety Act 2012 (SA)',
      'Hazardous substances workplace controls',
      'Emergency evacuation procedures',
      'Health and safety representative training',
      'Chemical exposure monitoring',
      'Medical surveillance programs',
    ],
    forms: [
      { name: 'whs_sa', label: 'WHS Act SA compliance', type: 'checkbox', required: true },
      { name: 'hazardous_substances_sa', label: 'Hazardous substances controls implemented', type: 'checkbox', required: true },
      { name: 'evacuation_procedures_sa', label: 'Emergency evacuation procedures documented', type: 'checkbox', required: true },
      { name: 'hsr_training_sa', label: 'HSR training completed (if applicable)', type: 'checkbox', required: false },
    ],
  },
  WA: {
    authority: 'WorkSafe Western Australia',
    requirements: [
      'Occupational Safety and Health Act 1984',
      'Mines Safety and Inspection Act (rural)',
      'Chemical handling and storage safety',
      'Heat illness prevention programs',
      'Remote area safety protocols',
      'Aviation ground safety requirements',
    ],
    forms: [
      { name: 'osh_act_wa', label: 'OSH Act 1984 compliance', type: 'checkbox', required: true },
      { name: 'heat_illness_wa', label: 'Heat illness prevention program', type: 'checkbox', required: true },
      { name: 'remote_safety_wa', label: 'Remote area safety protocols', type: 'checkbox', required: true },
      { name: 'aviation_ground_wa', label: 'Aviation ground safety compliance', type: 'checkbox', required: true },
    ],
  },
  TAS: {
    authority: 'WorkSafe Tasmania',
    requirements: [
      'Work Health and Safety Act 2012 (Tas)',
      'Agricultural chemical safety standards',
      'Cold weather working conditions',
      'Lone worker safety procedures',
      'Mental health and wellbeing support',
      'Emergency communication requirements',
    ],
    forms: [
      { name: 'whs_tas', label: 'WHS Act Tasmania compliance', type: 'checkbox', required: true },
      { name: 'agricultural_safety_tas', label: 'Agricultural safety standards met', type: 'checkbox', required: true },
      { name: 'lone_worker_tas', label: 'Lone worker procedures established', type: 'checkbox', required: true },
      { name: 'mental_health_tas', label: 'Mental health support available', type: 'checkbox', required: false },
    ],
  },
  NT: {
    authority: 'NT WorkSafe',
    requirements: [
      'Work Health and Safety Act (National Law)',
      'Extreme weather working conditions',
      'Remote area medical support',
      'Heat stress and dehydration protocols',
      'Wildlife and snake bite first aid',
      'Satellite communication requirements',
    ],
    forms: [
      { name: 'whs_nt', label: 'WHS National Law compliance', type: 'checkbox', required: true },
      { name: 'extreme_weather_nt', label: 'Extreme weather protocols', type: 'checkbox', required: true },
      { name: 'remote_medical_nt', label: 'Remote medical support arranged', type: 'checkbox', required: true },
      { name: 'wildlife_safety_nt', label: 'Wildlife safety training completed', type: 'checkbox', required: true },
    ],
  },
  ACT: {
    authority: 'ACT WorkSafe',
    requirements: [
      'Work Health and Safety Act 2011 (ACT)',
      'Urban area chemical application safety',
      'Public notification requirements',
      'School and hospital proximity protocols',
      'Environmental protection compliance',
      'Community safety measures',
    ],
    forms: [
      { name: 'whs_act', label: 'WHS Act ACT compliance', type: 'checkbox', required: true },
      { name: 'urban_safety_act', label: 'Urban application safety protocols', type: 'checkbox', required: true },
      { name: 'public_notification_act', label: 'Public notification completed', type: 'checkbox', required: true },
      { name: 'proximity_protocols_act', label: 'School/hospital proximity protocols followed', type: 'checkbox', required: true },
    ],
  },
};

export default function ComplianceSafety() {
  const theme = useTheme();
  const [selectedState, setSelectedState] = useState<string>('');
  const [ppeData, setPpeData] = useState({
    respiratoryProtection: '',
    eyeProtection: '',
    skinProtection: '',
    footProtection: '',
    headProtection: '',
    handProtection: '',
    ppeInspected: false,
    ppeCompliant: false,
    decontaminationProcedures: false,
  });
  const [proceduresData, setProceduresData] = useState({
    safetyDataSheets: false,
    emergencyContactNumbers: false,
    spillResponsePlan: false,
    firstAidKit: false,
    eyewashStation: false,
    emergencyShower: false,
    fireExtinguisher: false,
    communicationDevice: false,
  });
  const [workplaceData, setWorkplaceData] = useState({
    riskAssessment: false,
    safeWorkMethod: false,
    weatherConditions: '',
    windSpeed: '',
    visibility: '',
    temperatureInversion: false,
    bufferZones: false,
    publicSafety: false,
  });
  const [medicalData, setMedicalData] = useState({
    firstAidTraining: false,
    trainingExpiry: '',
    medicalCertificate: false,
    certificateExpiry: '',
    healthSurveillance: false,
    lastHealthCheck: '',
    medicationDeclaration: false,
  });
  const [stateData, setStateData] = useState<Record<string, any>>({});
  const [operatorNotes, setOperatorNotes] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [availableJobs, setAvailableJobs] = useState<any[]>([]);
  const [showSignOff, setShowSignOff] = useState(false);

  // Load available jobs on component mount
  useEffect(() => {
    const jobs = getJobs();
    const jobsWithDetails = jobs.map(job => {
      const client = getClientById(job.clientId);
      const property = getPropertyById(job.propertyId);
      const field = getFieldById(job.fieldId);

      return {
        ...job,
        clientName: client?.name || 'Unknown Client',
        propertyName: property?.name || 'Unknown Property',
        fieldName: field?.name || 'Unknown Field',
        displayName: `${new Date(job.dateSprayed).toLocaleDateString('en-AU')} - ${client?.name} - ${field?.name} - ${job.weedTarget}`,
      };
    });

    setAvailableJobs(jobsWithDetails);
  }, []);

  const handlePpeChange = (field: string, value: any) => {
    setPpeData(prev => ({ ...prev, [field]: value }));
  };

  const handleProceduresChange = (field: string, value: any) => {
    setProceduresData(prev => ({ ...prev, [field]: value }));
  };

  const handleWorkplaceChange = (field: string, value: any) => {
    setWorkplaceData(prev => ({ ...prev, [field]: value }));
  };

  const handleMedicalChange = (field: string, value: any) => {
    setMedicalData(prev => ({ ...prev, [field]: value }));
  };

  const handleStateDataChange = (field: string, value: any) => {
    setStateData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    const selectedJob = availableJobs.find(job => job.id === selectedJobId);

    const record: SafetyRecord = {
      id: `safety-${Date.now()}`,
      createdAt: new Date().toISOString(),
      state: selectedState,
      jobId: selectedJobId || undefined,
      jobDetails: selectedJob ? {
        clientName: selectedJob.clientName,
        propertyName: selectedJob.propertyName,
        fieldName: selectedJob.fieldName,
        jobDate: selectedJob.dateSprayed,
      } : undefined,
      personalProtectiveEquipment: ppeData,
      safetyProcedures: proceduresData,
      workplaceSafety: workplaceData,
      medicalCompliance: medicalData,
      stateCompliance: stateData,
      operatorNotes,
      isLocked: false,
    };

    // Save to localStorage (replace with proper backend integration)
    const existingRecords = JSON.parse(localStorage.getItem('safety-records') || '[]');
    existingRecords.push(record);
    localStorage.setItem('safety-records', JSON.stringify(existingRecords));

    setSaveMessage('Safety compliance record saved successfully');
    setTimeout(() => setSaveMessage(''), 3000);
  };

  const handleSignOff = (signature: string) => {
    if (!selectedJobId) {
      setSaveMessage('Please save the record first');
      setTimeout(() => setSaveMessage(''), 3000);
      return;
    }

    const existingRecords = JSON.parse(localStorage.getItem('safety-records') || '[]');
    const recordIndex = existingRecords.findIndex((r: any) => r.jobId === selectedJobId);

    if (recordIndex >= 0) {
      existingRecords[recordIndex].signedOff = {
        signedAt: new Date().toISOString(),
        signedBy: 'Current User', // Replace with actual user
        signature,
        ipAddress: 'xxx.xxx.xxx.xxx', // Replace with actual IP
      };
      existingRecords[recordIndex].isLocked = true;

      localStorage.setItem('safety-records', JSON.stringify(existingRecords));
      setSaveMessage('Safety compliance record signed off and locked');
      setTimeout(() => setSaveMessage(''), 3000);
      setShowSignOff(false);
    }
  };

  const stateRequirements = selectedState ? STATE_SAFETY_REQUIREMENTS[selectedState as keyof typeof STATE_SAFETY_REQUIREMENTS] : null;

  const cardStyle = {
    borderRadius: '16px',
    border: `1.5px solid ${alpha(theme.palette.primary.main, 0.1)}`,
    mb: 3,
  };

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <SecurityIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Typography variant="h4" sx={{ fontWeight: 800, color: 'primary.dark' }}>
            Safety & PPE Compliance
          </Typography>
        </Box>
        <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 800 }}>
          Ensure workplace health and safety compliance with personal protective equipment requirements and emergency procedures.
        </Typography>
      </Box>

      {/* Regulatory Disclaimer */}
      <Alert
        severity="warning"
        icon={<WarningIcon />}
        sx={{ mb: 4, borderRadius: '12px' }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
          Safety & PPE Compliance Notice
        </Typography>
        <Typography variant="body2">
          Workplace health and safety compliance is mandatory for all chemical application operations.
          Personal protective equipment must meet Australian Standards and be properly maintained.
          Emergency procedures must be established and all personnel trained.
        </Typography>
      </Alert>

      {/* Job Selection */}
      <Card elevation={0} sx={cardStyle}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
            <LinkIcon sx={{ color: 'primary.main', fontSize: 24 }} />
            <Typography variant="h5" sx={{ fontWeight: 700, color: 'primary.dark' }}>
              Link to Job
            </Typography>
            <Chip
              label="RECOMMENDED"
              size="small"
              color="info"
              variant="outlined"
              sx={{ fontWeight: 700 }}
            />
          </Box>

          <FormControl fullWidth>
            <InputLabel>Select Job (Optional)</InputLabel>
            <Select
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
              label="Select Job (Optional)"
            >
              <MenuItem value="">
                <em>No job selected - standalone safety record</em>
              </MenuItem>
              {availableJobs.map((job) => (
                <MenuItem key={job.id} value={job.id}>
                  {job.displayName}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {selectedJobId && (
            <Box sx={{ mt: 2, p: 2, bgcolor: alpha(theme.palette.success.main, 0.05), borderRadius: '8px' }}>
              <Typography variant="body2" sx={{ fontWeight: 600, color: 'success.dark' }}>
                ✓ Linked to Job: {availableJobs.find(j => j.id === selectedJobId)?.displayName}
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Personal Protective Equipment */}
      <Card elevation={0} sx={cardStyle}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
            <HealthAndSafetyIcon sx={{ color: 'primary.main', fontSize: 24 }} />
            <Typography variant="h5" sx={{ fontWeight: 700, color: 'primary.dark' }}>
              Personal Protective Equipment (PPE)
            </Typography>
            <Chip
              label="REQUIRED"
              size="small"
              color="error"
              variant="outlined"
              sx={{ fontWeight: 700 }}
            />
          </Box>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            PPE must comply with Australian Standards and chemical label requirements.
          </Typography>

          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 6 }}>
              <FormControl fullWidth required>
                <InputLabel>Respiratory Protection</InputLabel>
                <Select
                  value={ppeData.respiratoryProtection}
                  onChange={(e) => handlePpeChange('respiratoryProtection', e.target.value)}
                  label="Respiratory Protection"
                >
                  <MenuItem value="P1 Dust Mask">P1 Dust Mask</MenuItem>
                  <MenuItem value="P2 Respirator">P2 Respirator</MenuItem>
                  <MenuItem value="P3 Respirator">P3 Respirator</MenuItem>
                  <MenuItem value="Half-face Respirator">Half-face Respirator</MenuItem>
                  <MenuItem value="Full-face Respirator">Full-face Respirator</MenuItem>
                  <MenuItem value="PAPR">Powered Air Purifying Respirator (PAPR)</MenuItem>
                  <MenuItem value="SCBA">Self-Contained Breathing Apparatus</MenuItem>
                  <MenuItem value="Not Required">Not Required</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <FormControl fullWidth required>
                <InputLabel>Eye Protection</InputLabel>
                <Select
                  value={ppeData.eyeProtection}
                  onChange={(e) => handlePpeChange('eyeProtection', e.target.value)}
                  label="Eye Protection"
                >
                  <MenuItem value="Safety Glasses">Safety Glasses</MenuItem>
                  <MenuItem value="Goggles">Chemical Goggles</MenuItem>
                  <MenuItem value="Face Shield">Face Shield</MenuItem>
                  <MenuItem value="Full-face Respirator">Full-face Respirator</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <FormControl fullWidth required>
                <InputLabel>Skin Protection</InputLabel>
                <Select
                  value={ppeData.skinProtection}
                  onChange={(e) => handlePpeChange('skinProtection', e.target.value)}
                  label="Skin Protection"
                >
                  <MenuItem value="Cotton Coveralls">Cotton Coveralls</MenuItem>
                  <MenuItem value="Chemical Resistant Suit">Chemical Resistant Suit</MenuItem>
                  <MenuItem value="Tyvek Suit">Tyvek Disposable Suit</MenuItem>
                  <MenuItem value="PVC Suit">PVC Chemical Suit</MenuItem>
                  <MenuItem value="Long Sleeves + Pants">Long Sleeves + Long Pants</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <FormControl fullWidth required>
                <InputLabel>Hand Protection</InputLabel>
                <Select
                  value={ppeData.handProtection}
                  onChange={(e) => handlePpeChange('handProtection', e.target.value)}
                  label="Hand Protection"
                >
                  <MenuItem value="Nitrile Gloves">Nitrile Chemical Gloves</MenuItem>
                  <MenuItem value="Neoprene Gloves">Neoprene Gloves</MenuItem>
                  <MenuItem value="PVC Gloves">PVC Chemical Gloves</MenuItem>
                  <MenuItem value="Rubber Gloves">Natural Rubber Gloves</MenuItem>
                  <MenuItem value="Barrier Laminate">Barrier Laminate Gloves</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <FormControl fullWidth required>
                <InputLabel>Foot Protection</InputLabel>
                <Select
                  value={ppeData.footProtection}
                  onChange={(e) => handlePpeChange('footProtection', e.target.value)}
                  label="Foot Protection"
                >
                  <MenuItem value="Chemical Resistant Boots">Chemical Resistant Boots</MenuItem>
                  <MenuItem value="Rubber Boots">Rubber Boots</MenuItem>
                  <MenuItem value="PVC Boots">PVC Boots</MenuItem>
                  <MenuItem value="Safety Boots">Safety Boots</MenuItem>
                  <MenuItem value="Enclosed Footwear">Enclosed Footwear</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <FormControl fullWidth>
                <InputLabel>Head Protection</InputLabel>
                <Select
                  value={ppeData.headProtection}
                  onChange={(e) => handlePpeChange('headProtection', e.target.value)}
                  label="Head Protection"
                >
                  <MenuItem value="Hard Hat">Hard Hat</MenuItem>
                  <MenuItem value="Chemical Hood">Chemical Hood</MenuItem>
                  <MenuItem value="Cap/Hat">Wide-brim Hat</MenuItem>
                  <MenuItem value="Not Required">Not Required</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            {/* PPE Compliance Checkboxes */}
            <Grid size={{ xs: 12 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 2, mt: 2 }}>
                PPE Compliance Checklist
              </Typography>

              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                    <Checkbox
                      checked={ppeData.ppeInspected}
                      onChange={(e) => handlePpeChange('ppeInspected', e.target.checked)}
                      required
                    />
                    <Typography variant="body2">
                      All PPE inspected before use and in good condition
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                    <Checkbox
                      checked={ppeData.ppeCompliant}
                      onChange={(e) => handlePpeChange('ppeCompliant', e.target.checked)}
                      required
                    />
                    <Typography variant="body2">
                      PPE meets chemical label and SDS requirements
                    </Typography>
                  </Box>
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                    <Checkbox
                      checked={ppeData.decontaminationProcedures}
                      onChange={(e) => handlePpeChange('decontaminationProcedures', e.target.checked)}
                      required
                    />
                    <Typography variant="body2">
                      PPE decontamination procedures established and followed
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Safety Procedures & Emergency Equipment */}
      <Card elevation={0} sx={cardStyle}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
            <EmergencyIcon sx={{ color: 'primary.main', fontSize: 24 }} />
            <Typography variant="h5" sx={{ fontWeight: 700, color: 'primary.dark' }}>
              Emergency Procedures & Safety Equipment
            </Typography>
          </Box>

          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                Documentation & Procedures
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Checkbox
                    checked={proceduresData.safetyDataSheets}
                    onChange={(e) => handleProceduresChange('safetyDataSheets', e.target.checked)}
                    required
                  />
                  <Typography variant="body2">Safety Data Sheets (SDS) available and current</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Checkbox
                    checked={proceduresData.emergencyContactNumbers}
                    onChange={(e) => handleProceduresChange('emergencyContactNumbers', e.target.checked)}
                    required
                  />
                  <Typography variant="body2">Emergency contact numbers readily available</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Checkbox
                    checked={proceduresData.spillResponsePlan}
                    onChange={(e) => handleProceduresChange('spillResponsePlan', e.target.checked)}
                    required
                  />
                  <Typography variant="body2">Spill response plan documented and accessible</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Checkbox
                    checked={proceduresData.communicationDevice}
                    onChange={(e) => handleProceduresChange('communicationDevice', e.target.checked)}
                    required
                  />
                  <Typography variant="body2">Reliable communication device available</Typography>
                </Box>
              </Box>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                Emergency Equipment
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Checkbox
                    checked={proceduresData.firstAidKit}
                    onChange={(e) => handleProceduresChange('firstAidKit', e.target.checked)}
                    required
                  />
                  <Typography variant="body2">Appropriate first aid kit available</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Checkbox
                    checked={proceduresData.eyewashStation}
                    onChange={(e) => handleProceduresChange('eyewashStation', e.target.checked)}
                  />
                  <Typography variant="body2">Eyewash station or portable eyewash available</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Checkbox
                    checked={proceduresData.emergencyShower}
                    onChange={(e) => handleProceduresChange('emergencyShower', e.target.checked)}
                  />
                  <Typography variant="body2">Emergency shower or water supply available</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Checkbox
                    checked={proceduresData.fireExtinguisher}
                    onChange={(e) => handleProceduresChange('fireExtinguisher', e.target.checked)}
                  />
                  <Typography variant="body2">Appropriate fire extinguisher accessible</Typography>
                </Box>
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Workplace Safety Assessment */}
      <Card elevation={0} sx={cardStyle}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h5" sx={{ fontWeight: 700, color: 'primary.dark', mb: 3 }}>
            Workplace Safety Assessment
          </Typography>

          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <Checkbox
                  checked={workplaceData.riskAssessment}
                  onChange={(e) => handleWorkplaceChange('riskAssessment', e.target.checked)}
                  required
                />
                <Typography variant="body2">Site risk assessment completed</Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <Checkbox
                  checked={workplaceData.safeWorkMethod}
                  onChange={(e) => handleWorkplaceChange('safeWorkMethod', e.target.checked)}
                  required
                />
                <Typography variant="body2">Safe work method statement (SWMS) prepared</Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <Checkbox
                  checked={workplaceData.temperatureInversion}
                  onChange={(e) => handleWorkplaceChange('temperatureInversion', e.target.checked)}
                />
                <Typography variant="body2">Temperature inversion assessment completed</Typography>
              </Box>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <Checkbox
                  checked={workplaceData.bufferZones}
                  onChange={(e) => handleWorkplaceChange('bufferZones', e.target.checked)}
                  required
                />
                <Typography variant="body2">Buffer zones established and marked</Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <Checkbox
                  checked={workplaceData.publicSafety}
                  onChange={(e) => handleWorkplaceChange('publicSafety', e.target.checked)}
                  required
                />
                <Typography variant="body2">Public safety measures implemented</Typography>
              </Box>
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <FormControl fullWidth required>
                <InputLabel>Weather Conditions</InputLabel>
                <Select
                  value={workplaceData.weatherConditions}
                  onChange={(e) => handleWorkplaceChange('weatherConditions', e.target.value)}
                  label="Weather Conditions"
                >
                  <MenuItem value="Clear">Clear</MenuItem>
                  <MenuItem value="Partly Cloudy">Partly Cloudy</MenuItem>
                  <MenuItem value="Overcast">Overcast</MenuItem>
                  <MenuItem value="Light Rain">Light Rain</MenuItem>
                  <MenuItem value="Heavy Rain">Heavy Rain</MenuItem>
                  <MenuItem value="Windy">Windy</MenuItem>
                  <MenuItem value="Extreme Heat">Extreme Heat</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                fullWidth
                label="Wind Speed (km/h)"
                type="number"
                value={workplaceData.windSpeed}
                onChange={(e) => handleWorkplaceChange('windSpeed', e.target.value)}
                required
                helperText="Maximum wind speed during application"
                inputProps={{ min: 0, max: 50 }}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <FormControl fullWidth required>
                <InputLabel>Visibility</InputLabel>
                <Select
                  value={workplaceData.visibility}
                  onChange={(e) => handleWorkplaceChange('visibility', e.target.value)}
                  label="Visibility"
                >
                  <MenuItem value="Excellent">Excellent (&gt;10km)</MenuItem>
                  <MenuItem value="Good">Good (5-10km)</MenuItem>
                  <MenuItem value="Moderate">Moderate (1-5km)</MenuItem>
                  <MenuItem value="Poor">Poor (&lt;1km)</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Medical Compliance */}
      <Card elevation={0} sx={cardStyle}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
            <MedicalServicesIcon sx={{ color: 'primary.main', fontSize: 24 }} />
            <Typography variant="h5" sx={{ fontWeight: 700, color: 'primary.dark' }}>
              Medical & Health Compliance
            </Typography>
          </Box>

          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <Checkbox
                  checked={medicalData.firstAidTraining}
                  onChange={(e) => handleMedicalChange('firstAidTraining', e.target.checked)}
                  required
                />
                <Typography variant="body2">Current first aid training certification</Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <Checkbox
                  checked={medicalData.medicalCertificate}
                  onChange={(e) => handleMedicalChange('medicalCertificate', e.target.checked)}
                />
                <Typography variant="body2">Medical certificate for chemical exposure work</Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <Checkbox
                  checked={medicalData.healthSurveillance}
                  onChange={(e) => handleMedicalChange('healthSurveillance', e.target.checked)}
                />
                <Typography variant="body2">Health surveillance program participation</Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <Checkbox
                  checked={medicalData.medicationDeclaration}
                  onChange={(e) => handleMedicalChange('medicationDeclaration', e.target.checked)}
                  required
                />
                <Typography variant="body2">Medication declaration completed (if applicable)</Typography>
              </Box>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="First Aid Training Expiry"
                type="date"
                value={medicalData.trainingExpiry}
                onChange={(e) => handleMedicalChange('trainingExpiry', e.target.value)}
                sx={{ mb: 2 }}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                fullWidth
                label="Medical Certificate Expiry"
                type="date"
                value={medicalData.certificateExpiry}
                onChange={(e) => handleMedicalChange('certificateExpiry', e.target.value)}
                sx={{ mb: 2 }}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                fullWidth
                label="Last Health Check Date"
                type="date"
                value={medicalData.lastHealthCheck}
                onChange={(e) => handleMedicalChange('lastHealthCheck', e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* State-Specific Safety Compliance */}
      <Card elevation={0} sx={cardStyle}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
            <LocationOnIcon sx={{ color: 'primary.main', fontSize: 24 }} />
            <Typography variant="h5" sx={{ fontWeight: 700, color: 'primary.dark' }}>
              State Safety Compliance
            </Typography>
            <Chip
              label="REQUIRED"
              size="small"
              color="error"
              variant="outlined"
              sx={{ fontWeight: 700 }}
            />
          </Box>

          <Box sx={{ mb: 4 }}>
            <FormControl fullWidth required>
              <InputLabel>Select State/Territory</InputLabel>
              <Select
                value={selectedState}
                onChange={(e) => setSelectedState(e.target.value)}
                label="Select State/Territory"
              >
                {AUSTRALIAN_STATES.map((state) => (
                  <MenuItem key={state.code} value={state.code}>
                    {state.name} ({state.code})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          {stateRequirements && (
            <>
              <Paper sx={{ p: 3, mb: 3, bgcolor: alpha(theme.palette.info.main, 0.05), borderRadius: '12px' }}>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 2, color: 'info.dark' }}>
                  Safety Authority: {stateRequirements.authority}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 2 }}>
                  Key Safety Requirements for {AUSTRALIAN_STATES.find(s => s.code === selectedState)?.name}:
                </Typography>
                <List dense>
                  {stateRequirements.requirements.map((req, index) => (
                    <ListItem key={index} sx={{ pl: 0 }}>
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <SecurityIcon fontSize="small" color="info" />
                      </ListItemIcon>
                      <ListItemText primary={req} />
                    </ListItem>
                  ))}
                </List>
              </Paper>

              <Typography variant="h6" sx={{ fontWeight: 700, mb: 3 }}>
                State Safety Compliance Documentation
              </Typography>

              <Grid container spacing={3}>
                {stateRequirements.forms.map((form, index) => (
                  <Grid size={{ xs: 12, md: 6 }} key={index}>
                    {form.type === 'checkbox' && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Checkbox
                          checked={stateData[form.name] || false}
                          onChange={(e) => handleStateDataChange(form.name, e.target.checked)}
                          required={form.required}
                        />
                        <Typography variant="body2">
                          {form.label}
                          {form.required && <span style={{ color: theme.palette.error.main }}> *</span>}
                        </Typography>
                      </Box>
                    )}
                    {(form.type === 'text' || form.type === 'number') && (
                      <TextField
                        fullWidth
                        label={form.label}
                        type={form.type}
                        value={stateData[form.name] || ''}
                        onChange={(e) => handleStateDataChange(form.name, e.target.value)}
                        required={form.required}
                      />
                    )}
                    {form.type === 'date' && (
                      <TextField
                        fullWidth
                        label={form.label}
                        type="date"
                        value={stateData[form.name] || ''}
                        onChange={(e) => handleStateDataChange(form.name, e.target.value)}
                        required={form.required}
                        InputLabelProps={{ shrink: true }}
                      />
                    )}
                  </Grid>
                ))}
              </Grid>
            </>
          )}
        </CardContent>
      </Card>

      {/* Operator Notes */}
      <Card elevation={0} sx={cardStyle}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
            Additional Safety Notes
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={4}
            label="Notes"
            value={operatorNotes}
            onChange={(e) => setOperatorNotes(e.target.value)}
            placeholder="Additional safety considerations, incident reports, near misses, or special precautions..."
            helperText="Document safety observations, lessons learned, or special conditions"
          />
        </CardContent>
      </Card>

      {/* Save and Sign-off Buttons */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        {saveMessage && (
          <Alert
            severity="success"
            icon={<CheckCircleIcon />}
            sx={{ borderRadius: '8px' }}
          >
            {saveMessage}
          </Alert>
        )}
        <Button
          variant="outlined"
          startIcon={<SaveIcon />}
          onClick={handleSave}
          sx={{
            borderRadius: '12px',
            fontWeight: 700,
            px: 4,
            py: 1.5,
            fontSize: '1rem'
          }}
          size="large"
        >
          Save Draft
        </Button>
        <Button
          variant="contained"
          startIcon={<CheckCircleIcon />}
          onClick={() => setShowSignOff(true)}
          sx={{
            borderRadius: '12px',
            fontWeight: 700,
            px: 4,
            py: 1.5,
            fontSize: '1rem',
            bgcolor: 'success.main',
            '&:hover': {
              bgcolor: 'success.dark',
            },
          }}
          size="large"
        >
          Sign Off & Lock
        </Button>
      </Box>

      {/* Sign-off Dialog */}
      <SafetySignOffDialog
        open={showSignOff}
        onClose={() => setShowSignOff(false)}
        onSignOff={handleSignOff}
        recordData={{
          jobDetails: selectedJobId ? availableJobs.find(j => j.id === selectedJobId) : null,
          state: selectedState,
          personalProtectiveEquipment: ppeData,
          safetyProcedures: proceduresData,
          workplaceSafety: workplaceData,
          medicalCompliance: medicalData,
          operatorNotes,
        }}
      />
    </Box>
  );
}

// Sign-off Dialog Component
interface SafetySignOffDialogProps {
  open: boolean;
  onClose: () => void;
  onSignOff: (signature: string) => void;
  recordData: any;
}

function SafetySignOffDialog({ open, onClose, onSignOff, recordData }: SafetySignOffDialogProps) {
  const [signature, setSignature] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);

  const handleSignOff = () => {
    if (!signature.trim() || !agreeTerms) {
      return;
    }
    onSignOff(signature);
    setSignature('');
    setAgreeTerms(false);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, borderBottom: '1px solid #e0e0e0' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <CheckCircleIcon color="success" />
          Safety Compliance Sign-off
        </Box>
      </DialogTitle>
      <DialogContent sx={{ p: 4 }}>
        <Alert severity="warning" sx={{ mb: 3, borderRadius: '8px' }}>
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
            Final Safety Sign-off Warning
          </Typography>
          <Typography variant="body2">
            Once signed off, this safety compliance record will be permanently locked and cannot be modified.
            Ensure all safety measures are in place and all PPE requirements met before proceeding.
          </Typography>
        </Alert>

        {/* Record Summary */}
        <Paper sx={{ p: 3, mb: 3, bgcolor: 'grey.50', borderRadius: '8px' }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
            Safety Record Summary
          </Typography>

          <Grid container spacing={2}>
            <Grid size={{ xs: 6 }}>
              <Typography variant="body2">
                <strong>State:</strong> {recordData.state || 'Not selected'}
              </Typography>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <Typography variant="body2">
                <strong>PPE Compliant:</strong> {recordData.personalProtectiveEquipment.ppeCompliant ? 'Yes' : 'No'}
              </Typography>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <Typography variant="body2">
                <strong>Risk Assessment:</strong> {recordData.workplaceSafety.riskAssessment ? 'Complete' : 'Incomplete'}
              </Typography>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <Typography variant="body2">
                <strong>First Aid Training:</strong> {recordData.medicalCompliance.firstAidTraining ? 'Current' : 'Required'}
              </Typography>
            </Grid>
          </Grid>
        </Paper>

        {/* Digital Signature */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="body1" sx={{ fontWeight: 600, mb: 2 }}>
            Digital Signature
          </Typography>
          <TextField
            fullWidth
            label="Type your full name to sign"
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            placeholder="e.g., John Smith"
            required
            helperText="This serves as your digital signature for this safety compliance record"
          />
        </Box>

        {/* Terms Agreement */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
          <Checkbox
            checked={agreeTerms}
            onChange={(e) => setAgreeTerms(e.target.checked)}
            required
          />
          <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
            I certify that all safety requirements have been met, all PPE is compliant and in good condition,
            and all emergency procedures are in place. I understand this record may be used for safety audits
            and compliance verification.
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 3, borderTop: '1px solid #e0e0e0' }}>
        <Button onClick={onClose} size="large">
          Cancel
        </Button>
        <Button
          onClick={handleSignOff}
          variant="contained"
          color="success"
          disabled={!signature.trim() || !agreeTerms}
          size="large"
          sx={{ fontWeight: 700 }}
        >
          Sign Off & Lock Record
        </Button>
      </DialogActions>
    </Dialog>
  );
}