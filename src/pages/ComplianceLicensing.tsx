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
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn';
import WarningIcon from '@mui/icons-material/Warning';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SaveIcon from '@mui/icons-material/Save';
import LinkIcon from '@mui/icons-material/Link';
import FlightTakeoffIcon from '@mui/icons-material/FlightTakeoff';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import SchoolIcon from '@mui/icons-material/School';
import BadgeIcon from '@mui/icons-material/Badge';
import { getJobs, getClientById, getPropertyById, getFieldById } from '../services/fieldManagementStore';

interface LicensingRecord {
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
  droneOperatorLicenses: {
    rpaLicense: string;
    rpaLicenseExpiry: string;
    aerialApplicationEndorsement: string;
    endorsementExpiry: string;
    operatorAccreditation: string;
    accreditationExpiry: string;
    insurancePolicy: string;
    insuranceExpiry: string;
  };
  chemicalApplicationCertification: {
    applicatorLicense: string;
    licenseClass: string;
    licenseExpiry: string;
    restrictedChemicals: boolean;
    restrictedLicenseNumber: string;
    restrictedExpiry: string;
    continuingEducation: boolean;
    lastTrainingDate: string;
  };
  pilotTrainingRecords: {
    initialTraining: boolean;
    recurrentTraining: boolean;
    lastRecurrentDate: string;
    emergencyProcedures: boolean;
    safetyTraining: boolean;
    equipmentProficiency: boolean;
    flightHours: string;
    nightOperations: boolean;
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

const STATE_LICENSING_REQUIREMENTS: Record<string, {
  authority: string;
  requirements: string[];
  forms: StateFormField[];
}> = {
  NSW: {
    authority: 'NSW EPA & Transport for NSW',
    requirements: [
      'Chemical use notification number (ChemCert or equivalent)',
      'NSW aerial spraying operator license',
      'CASA RPA operator certificate with aerial work endorsement',
      'Private pesticide applicator license',
      'Restricted chemical permits (where required)',
      'Public liability insurance minimum $20 million',
    ],
    forms: [
      { name: 'chemcert_nsw', label: 'ChemCert certification number', type: 'text', required: true },
      { name: 'aerial_operator_nsw', label: 'NSW aerial spraying license number', type: 'text', required: true },
      { name: 'pesticide_license_nsw', label: 'Private pesticide applicator license', type: 'text', required: true },
      { name: 'insurance_nsw', label: 'Public liability insurance $20M+ confirmed', type: 'checkbox', required: true },
    ],
  },
  VIC: {
    authority: 'Agriculture Victoria & CASA',
    requirements: [
      'Agricultural chemical user permit (ACP)',
      'Commercial operator license for aerial application',
      'CASA commercial pilot license or RPA certificate',
      'Endorsement for agricultural aircraft operations',
      'Professional indemnity insurance',
      'Victorian WorkCover registration',
    ],
    forms: [
      { name: 'acp_vic', label: 'Agricultural Chemical Permit number', type: 'text', required: true },
      { name: 'commercial_operator_vic', label: 'Commercial operator license', type: 'text', required: true },
      { name: 'worksafe_vic', label: 'WorkCover registration number', type: 'text', required: true },
      { name: 'professional_indemnity', label: 'Professional indemnity insurance confirmed', type: 'checkbox', required: true },
    ],
  },
  QLD: {
    authority: 'Department of Agriculture and Fisheries Queensland',
    requirements: [
      'Chemical applicator license (Category 1A)',
      'Aerial application contractor license',
      'CASA aerial work approval',
      'Restricted chemical authorities where required',
      'Queensland transport dangerous goods license',
      'Minimum $10 million public liability insurance',
    ],
    forms: [
      { name: 'applicator_license_qld', label: 'Chemical applicator license (Cat 1A)', type: 'text', required: true },
      { name: 'aerial_contractor_qld', label: 'Aerial application contractor license', type: 'text', required: true },
      { name: 'dangerous_goods_qld', label: 'Dangerous goods transport license', type: 'text', required: true },
      { name: 'insurance_10m_qld', label: 'Public liability $10M+ confirmed', type: 'checkbox', required: true },
    ],
  },
  SA: {
    authority: 'PIRSA & SafeWork SA',
    requirements: [
      'Primary producer permit for own land use',
      'Commercial applicator license for hire services',
      'CASA aviation licensing compliance',
      'WorkSafe SA dangerous goods handling permit',
      'Professional development training completion',
      'Public liability insurance coverage',
    ],
    forms: [
      { name: 'primary_producer_sa', label: 'Primary producer permit number', type: 'text', required: false },
      { name: 'commercial_applicator_sa', label: 'Commercial applicator license', type: 'text', required: true },
      { name: 'dangerous_goods_sa', label: 'Dangerous goods handling permit', type: 'text', required: true },
      { name: 'professional_development', label: 'Professional development completed', type: 'checkbox', required: true },
    ],
  },
  WA: {
    authority: 'Department of Primary Industries WA',
    requirements: [
      'Pest management technician license',
      'Aerial spraying contractor registration',
      'CASA flight crew licensing',
      'Dangerous goods driver license (where required)',
      'Professional liability insurance',
      'Continuing education compliance (40 hours/3 years)',
    ],
    forms: [
      { name: 'pest_management_wa', label: 'Pest management technician license', type: 'text', required: true },
      { name: 'aerial_spraying_wa', label: 'Aerial spraying contractor registration', type: 'text', required: true },
      { name: 'continuing_ed_wa', label: 'Continuing education hours completed', type: 'number', required: true },
      { name: 'liability_insurance_wa', label: 'Professional liability insurance confirmed', type: 'checkbox', required: true },
    ],
  },
  TAS: {
    authority: 'Department of Primary Industries TAS',
    requirements: [
      'Crop protection permit',
      'Commercial pesticide applicator license',
      'Aviation industry compliance certification',
      'Environmental protection training',
      'Public liability insurance minimum $5 million',
      'Annual license renewal and training',
    ],
    forms: [
      { name: 'crop_protection_tas', label: 'Crop protection permit number', type: 'text', required: true },
      { name: 'pesticide_applicator_tas', label: 'Commercial pesticide applicator license', type: 'text', required: true },
      { name: 'aviation_compliance_tas', label: 'Aviation compliance certification', type: 'text', required: true },
      { name: 'annual_training_tas', label: 'Annual training completed', type: 'checkbox', required: true },
    ],
  },
  NT: {
    authority: 'Department of Industry, Tourism and Trade',
    requirements: [
      'Chemical user permit',
      'Commercial spray operator license',
      'Remote pilot license with commercial rating',
      'First aid certification current',
      'Public liability insurance',
      'Remote area operational approval',
    ],
    forms: [
      { name: 'chemical_user_nt', label: 'Chemical user permit number', type: 'text', required: true },
      { name: 'spray_operator_nt', label: 'Commercial spray operator license', type: 'text', required: true },
      { name: 'first_aid_nt', label: 'First aid certification current', type: 'checkbox', required: true },
      { name: 'remote_operations_nt', label: 'Remote area operational approval', type: 'text', required: false },
    ],
  },
  ACT: {
    authority: 'Environment, Planning and Sustainable Development',
    requirements: [
      'Pesticide control order compliance',
      'Urban area application permit',
      'CASA drone pilot certification',
      'ACT business registration',
      'Professional indemnity insurance',
      'Community notification protocols training',
    ],
    forms: [
      { name: 'pesticide_control_act', label: 'Pesticide control compliance verified', type: 'checkbox', required: true },
      { name: 'urban_permit_act', label: 'Urban application permit number', type: 'text', required: true },
      { name: 'business_registration_act', label: 'ACT business registration number', type: 'text', required: true },
      { name: 'community_protocols_act', label: 'Community notification training completed', type: 'checkbox', required: true },
    ],
  },
};

export default function ComplianceLicensing() {
  const theme = useTheme();
  const [selectedState, setSelectedState] = useState<string>('');
  const [droneData, setDroneData] = useState({
    rpaLicense: '',
    rpaLicenseExpiry: '',
    aerialApplicationEndorsement: '',
    endorsementExpiry: '',
    operatorAccreditation: '',
    accreditationExpiry: '',
    insurancePolicy: '',
    insuranceExpiry: '',
  });
  const [chemicalData, setChemicalData] = useState({
    applicatorLicense: '',
    licenseClass: '',
    licenseExpiry: '',
    restrictedChemicals: false,
    restrictedLicenseNumber: '',
    restrictedExpiry: '',
    continuingEducation: false,
    lastTrainingDate: '',
  });
  const [trainingData, setTrainingData] = useState({
    initialTraining: false,
    recurrentTraining: false,
    lastRecurrentDate: '',
    emergencyProcedures: false,
    safetyTraining: false,
    equipmentProficiency: false,
    flightHours: '',
    nightOperations: false,
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

  const handleDroneChange = (field: string, value: any) => {
    setDroneData(prev => ({ ...prev, [field]: value }));
  };

  const handleChemicalChange = (field: string, value: any) => {
    setChemicalData(prev => ({ ...prev, [field]: value }));
  };

  const handleTrainingChange = (field: string, value: any) => {
    setTrainingData(prev => ({ ...prev, [field]: value }));
  };

  const handleStateDataChange = (field: string, value: any) => {
    setStateData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    const selectedJob = availableJobs.find(job => job.id === selectedJobId);

    const record: LicensingRecord = {
      id: `licensing-${Date.now()}`,
      createdAt: new Date().toISOString(),
      state: selectedState,
      jobId: selectedJobId || undefined,
      jobDetails: selectedJob ? {
        clientName: selectedJob.clientName,
        propertyName: selectedJob.propertyName,
        fieldName: selectedJob.fieldName,
        jobDate: selectedJob.dateSprayed,
      } : undefined,
      droneOperatorLicenses: droneData,
      chemicalApplicationCertification: chemicalData,
      pilotTrainingRecords: trainingData,
      stateCompliance: stateData,
      operatorNotes,
      isLocked: false,
    };

    // Save to localStorage (replace with proper backend integration)
    const existingRecords = JSON.parse(localStorage.getItem('licensing-records') || '[]');
    existingRecords.push(record);
    localStorage.setItem('licensing-records', JSON.stringify(existingRecords));

    setSaveMessage('Licensing compliance record saved successfully');
    setTimeout(() => setSaveMessage(''), 3000);
  };

  const handleSignOff = (signature: string) => {
    if (!selectedJobId) {
      setSaveMessage('Please save the record first');
      setTimeout(() => setSaveMessage(''), 3000);
      return;
    }

    const existingRecords = JSON.parse(localStorage.getItem('licensing-records') || '[]');
    const recordIndex = existingRecords.findIndex((r: any) => r.jobId === selectedJobId);

    if (recordIndex >= 0) {
      existingRecords[recordIndex].signedOff = {
        signedAt: new Date().toISOString(),
        signedBy: 'Current User', // Replace with actual user
        signature,
        ipAddress: 'xxx.xxx.xxx.xxx', // Replace with actual IP
      };
      existingRecords[recordIndex].isLocked = true;

      localStorage.setItem('licensing-records', JSON.stringify(existingRecords));
      setSaveMessage('Licensing compliance record signed off and locked');
      setTimeout(() => setSaveMessage(''), 3000);
      setShowSignOff(false);
    }
  };

  const stateRequirements = selectedState ? STATE_LICENSING_REQUIREMENTS[selectedState as keyof typeof STATE_LICENSING_REQUIREMENTS] : null;

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
          <AssignmentTurnedInIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Typography variant="h4" sx={{ fontWeight: 800, color: 'primary.dark' }}>
            Operator Licensing & Certification
          </Typography>
        </Box>
        <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 800 }}>
          Maintain current licensing, certification, and training records for drone operators and chemical applicators.
        </Typography>
      </Box>

      {/* Regulatory Disclaimer */}
      <Alert
        severity="warning"
        icon={<WarningIcon />}
        sx={{ mb: 4, borderRadius: '12px' }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
          Licensing & Certification Notice
        </Typography>
        <Typography variant="body2">
          All drone operations and chemical applications require current licenses and certifications.
          Operating without valid credentials may result in significant penalties and legal consequences.
          Ensure all training and renewal requirements are met before operations.
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
                <em>No job selected - standalone licensing record</em>
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

      {/* Drone Operator Licenses */}
      <Card elevation={0} sx={cardStyle}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
            <FlightTakeoffIcon sx={{ color: 'primary.main', fontSize: 24 }} />
            <Typography variant="h5" sx={{ fontWeight: 700, color: 'primary.dark' }}>
              Drone Operator Licensing (CASA)
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
            Civil Aviation Safety Authority (CASA) requirements for remotely piloted aircraft operations.
          </Typography>

          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="RPA Operator Certificate (ReOC)"
                value={droneData.rpaLicense}
                onChange={(e) => handleDroneChange('rpaLicense', e.target.value)}
                required
                helperText="CASA ReOC number"
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="ReOC Expiry Date"
                type="date"
                value={droneData.rpaLicenseExpiry}
                onChange={(e) => handleDroneChange('rpaLicenseExpiry', e.target.value)}
                required
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Aerial Application Endorsement"
                value={droneData.aerialApplicationEndorsement}
                onChange={(e) => handleDroneChange('aerialApplicationEndorsement', e.target.value)}
                required
                helperText="Specific endorsement for aerial spraying"
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Endorsement Expiry Date"
                type="date"
                value={droneData.endorsementExpiry}
                onChange={(e) => handleDroneChange('endorsementExpiry', e.target.value)}
                required
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Operator Accreditation Number"
                value={droneData.operatorAccreditation}
                onChange={(e) => handleDroneChange('operatorAccreditation', e.target.value)}
                helperText="CASA accreditation for commercial operations"
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Accreditation Expiry Date"
                type="date"
                value={droneData.accreditationExpiry}
                onChange={(e) => handleDroneChange('accreditationExpiry', e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Aviation Insurance Policy Number"
                value={droneData.insurancePolicy}
                onChange={(e) => handleDroneChange('insurancePolicy', e.target.value)}
                required
                helperText="Public liability insurance policy"
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Insurance Expiry Date"
                type="date"
                value={droneData.insuranceExpiry}
                onChange={(e) => handleDroneChange('insuranceExpiry', e.target.value)}
                required
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Chemical Application Certification */}
      <Card elevation={0} sx={cardStyle}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
            <BadgeIcon sx={{ color: 'primary.main', fontSize: 24 }} />
            <Typography variant="h5" sx={{ fontWeight: 700, color: 'primary.dark' }}>
              Chemical Applicator Certification
            </Typography>
            <Chip
              label="REQUIRED"
              size="small"
              color="error"
              variant="outlined"
              sx={{ fontWeight: 700 }}
            />
          </Box>

          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Applicator License Number"
                value={chemicalData.applicatorLicense}
                onChange={(e) => handleChemicalChange('applicatorLicense', e.target.value)}
                required
                helperText="State chemical applicator license"
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <FormControl fullWidth required>
                <InputLabel>License Class</InputLabel>
                <Select
                  value={chemicalData.licenseClass}
                  onChange={(e) => handleChemicalChange('licenseClass', e.target.value)}
                  label="License Class"
                >
                  <MenuItem value="Category 1A">Category 1A - Aerial Application</MenuItem>
                  <MenuItem value="Category 1B">Category 1B - Ground Application</MenuItem>
                  <MenuItem value="Category 2">Category 2 - Limited Application</MenuItem>
                  <MenuItem value="Commercial">Commercial Applicator</MenuItem>
                  <MenuItem value="Private">Private Applicator</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="License Expiry Date"
                type="date"
                value={chemicalData.licenseExpiry}
                onChange={(e) => handleChemicalChange('licenseExpiry', e.target.value)}
                required
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 2 }}>
                <Checkbox
                  checked={chemicalData.restrictedChemicals}
                  onChange={(e) => handleChemicalChange('restrictedChemicals', e.target.checked)}
                />
                <Typography variant="body2">
                  Authorized to use restricted use chemicals
                </Typography>
              </Box>
            </Grid>

            {chemicalData.restrictedChemicals && (
              <>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth
                    label="Restricted Chemical License Number"
                    value={chemicalData.restrictedLicenseNumber}
                    onChange={(e) => handleChemicalChange('restrictedLicenseNumber', e.target.value)}
                    required
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth
                    label="Restricted License Expiry"
                    type="date"
                    value={chemicalData.restrictedExpiry}
                    onChange={(e) => handleChemicalChange('restrictedExpiry', e.target.value)}
                    required
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
              </>
            )}

            <Grid size={{ xs: 12, md: 6 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Checkbox
                  checked={chemicalData.continuingEducation}
                  onChange={(e) => handleChemicalChange('continuingEducation', e.target.checked)}
                  required
                />
                <Typography variant="body2">
                  Continuing education requirements up to date
                </Typography>
              </Box>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Last Training Date"
                type="date"
                value={chemicalData.lastTrainingDate}
                onChange={(e) => handleChemicalChange('lastTrainingDate', e.target.value)}
                helperText="Most recent training or certification update"
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Pilot Training Records */}
      <Card elevation={0} sx={cardStyle}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
            <SchoolIcon sx={{ color: 'primary.main', fontSize: 24 }} />
            <Typography variant="h5" sx={{ fontWeight: 700, color: 'primary.dark' }}>
              Pilot Training & Proficiency Records
            </Typography>
          </Box>

          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <Checkbox
                  checked={trainingData.initialTraining}
                  onChange={(e) => handleTrainingChange('initialTraining', e.target.checked)}
                  required
                />
                <Typography variant="body2">Initial pilot training completed</Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <Checkbox
                  checked={trainingData.recurrentTraining}
                  onChange={(e) => handleTrainingChange('recurrentTraining', e.target.checked)}
                  required
                />
                <Typography variant="body2">Recurrent training current (annual)</Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <Checkbox
                  checked={trainingData.emergencyProcedures}
                  onChange={(e) => handleTrainingChange('emergencyProcedures', e.target.checked)}
                  required
                />
                <Typography variant="body2">Emergency procedures training</Typography>
              </Box>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <Checkbox
                  checked={trainingData.safetyTraining}
                  onChange={(e) => handleTrainingChange('safetyTraining', e.target.checked)}
                  required
                />
                <Typography variant="body2">Safety management system training</Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <Checkbox
                  checked={trainingData.equipmentProficiency}
                  onChange={(e) => handleTrainingChange('equipmentProficiency', e.target.checked)}
                  required
                />
                <Typography variant="body2">Equipment proficiency demonstrated</Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <Checkbox
                  checked={trainingData.nightOperations}
                  onChange={(e) => handleTrainingChange('nightOperations', e.target.checked)}
                />
                <Typography variant="body2">Night operations endorsed (if applicable)</Typography>
              </Box>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Last Recurrent Training Date"
                type="date"
                value={trainingData.lastRecurrentDate}
                onChange={(e) => handleTrainingChange('lastRecurrentDate', e.target.value)}
                required
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Total Flight Hours"
                type="number"
                value={trainingData.flightHours}
                onChange={(e) => handleTrainingChange('flightHours', e.target.value)}
                helperText="Cumulative RPA flight hours"
                inputProps={{ min: 0 }}
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* State-Specific Licensing Compliance */}
      <Card elevation={0} sx={cardStyle}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
            <LocationOnIcon sx={{ color: 'primary.main', fontSize: 24 }} />
            <Typography variant="h5" sx={{ fontWeight: 700, color: 'primary.dark' }}>
              State Licensing Compliance
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
                  Licensing Authority: {stateRequirements.authority}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 2 }}>
                  Key Licensing Requirements for {AUSTRALIAN_STATES.find(s => s.code === selectedState)?.name}:
                </Typography>
                <List dense>
                  {stateRequirements.requirements.map((req, index) => (
                    <ListItem key={index} sx={{ pl: 0 }}>
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <AssignmentTurnedInIcon fontSize="small" color="info" />
                      </ListItemIcon>
                      <ListItemText primary={req} />
                    </ListItem>
                  ))}
                </List>
              </Paper>

              <Typography variant="h6" sx={{ fontWeight: 700, mb: 3 }}>
                State Licensing Documentation
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
                        inputProps={form.type === 'number' ? { min: 0 } : undefined}
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
                    {form.type === 'select' && (
                      <FormControl fullWidth required={form.required}>
                        <InputLabel>{form.label}</InputLabel>
                        <Select
                          value={stateData[form.name] || ''}
                          onChange={(e) => handleStateDataChange(form.name, e.target.value)}
                          label={form.label}
                        >
                          {form.options?.map((option) => (
                            <MenuItem key={option} value={option}>
                              {option}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
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
            Additional Licensing Notes
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={4}
            label="Notes"
            value={operatorNotes}
            onChange={(e) => setOperatorNotes(e.target.value)}
            placeholder="Additional licensing information, renewal dates, training schedules, or certification requirements..."
            helperText="Document licensing updates, training plans, or special certifications"
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
      <LicensingSignOffDialog
        open={showSignOff}
        onClose={() => setShowSignOff(false)}
        onSignOff={handleSignOff}
        recordData={{
          jobDetails: selectedJobId ? availableJobs.find(j => j.id === selectedJobId) : null,
          state: selectedState,
          droneOperatorLicenses: droneData,
          chemicalApplicationCertification: chemicalData,
          pilotTrainingRecords: trainingData,
          operatorNotes,
        }}
      />
    </Box>
  );
}

// Sign-off Dialog Component
interface LicensingSignOffDialogProps {
  open: boolean;
  onClose: () => void;
  onSignOff: (signature: string) => void;
  recordData: any;
}

function LicensingSignOffDialog({ open, onClose, onSignOff, recordData }: LicensingSignOffDialogProps) {
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
          Licensing Compliance Sign-off
        </Box>
      </DialogTitle>
      <DialogContent sx={{ p: 4 }}>
        <Alert severity="warning" sx={{ mb: 3, borderRadius: '8px' }}>
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
            Final Licensing Sign-off Warning
          </Typography>
          <Typography variant="body2">
            Once signed off, this licensing compliance record will be permanently locked and cannot be modified.
            Ensure all licenses and certifications are current and valid before proceeding.
          </Typography>
        </Alert>

        {/* Record Summary */}
        <Paper sx={{ p: 3, mb: 3, bgcolor: 'grey.50', borderRadius: '8px' }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
            Licensing Record Summary
          </Typography>

          <Grid container spacing={2}>
            <Grid size={{ xs: 6 }}>
              <Typography variant="body2">
                <strong>State:</strong> {recordData.state || 'Not selected'}
              </Typography>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <Typography variant="body2">
                <strong>RPA License:</strong> {recordData.droneOperatorLicenses.rpaLicense || 'Not specified'}
              </Typography>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <Typography variant="body2">
                <strong>Applicator License:</strong> {recordData.chemicalApplicationCertification.applicatorLicense || 'Not specified'}
              </Typography>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <Typography variant="body2">
                <strong>Training Current:</strong> {recordData.pilotTrainingRecords.recurrentTraining ? 'Yes' : 'No'}
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
            helperText="This serves as your digital signature for this licensing compliance record"
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
            I certify that all licensing and certification information is current and accurate, and that all regulatory
            requirements have been met. I understand this record may be used for compliance audits and regulatory verification.
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