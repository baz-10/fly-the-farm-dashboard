import React, { useState, useEffect } from 'react';
import {
  Typography,
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Stack,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Grid,
  Divider,
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
  IconButton,
  Tooltip,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import GavelIcon from '@mui/icons-material/Gavel';
import AssignmentIcon from '@mui/icons-material/Assignment';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import SaveIcon from '@mui/icons-material/Save';
import WarningIcon from '@mui/icons-material/Warning';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ArticleIcon from '@mui/icons-material/Article';
import LinkIcon from '@mui/icons-material/Link';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import ScienceIcon from '@mui/icons-material/Science';
import WaterDropIcon from '@mui/icons-material/WaterDrop';
import { getJobs, getClientById, getPropertyById, getFieldById } from '../services/fieldManagementStore';
import { useUserLicense, StateLicenses } from '../contexts/UserLicenseContext';

interface ChemicalProduct {
  id: string;
  productName: string;
  activeIngredient: string;
  apvmaNumber: string;
  labelFollowed: boolean;
  applicationRate: string;
  witholdingPeriod: string;
  concentration: string;
  compatibilityVerified: boolean;
  notes: string;
}

interface TankMixDetails {
  totalVolume: string;
  waterSource: string;
  mixingOrder: string;
  compatibilityTest: boolean;
  phLevel: string;
  waterQuality: string;
  agitationTime: string;
  finalWitholdingPeriod: string;
}

interface ComplianceRecord {
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
  chemicals: ChemicalProduct[];
  tankMixDetails: TankMixDetails;
  applicationDetails: {
    cropTreated: string;
    areaHectares: number;
    applicationDate: string;
    weatherConditions: string;
    applicatorName: string;
    applicatorLicense: string;
    equipmentUsed: string;
    calibrationDate: string;
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
  type: 'checkbox' | 'text' | 'number' | 'select';
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

const STATE_REQUIREMENTS: Record<string, {
  authority: string;
  requirements: string[];
  forms: StateFormField[];
}> = {
  NSW: {
    authority: 'NSW EPA, DPI NSW & SafeWork NSW',
    requirements: [
      'Protection of Environment Operations Act (POEO) compliance',
      'Chemical notification requirements (ChemCert)',
      'Spray diary maintenance (minimum 3 years)',
      'Native vegetation clearing compliance',
      'Waterway buffer zone compliance (minimum 20m)',
      'Professional pesticide applicator permit',
      'Chemical transport dangerous goods license',
      'Public liability insurance ($20M minimum)',
    ],
    forms: [
      { name: 'chemcert_nsw', label: 'ChemCert notification submitted', type: 'checkbox', required: true },
      { name: 'poeo_permit', label: 'POEO Act permit/exemption number', type: 'text', required: true },
      { name: 'applicator_permit_nsw', label: 'Professional applicator permit number', type: 'text', required: true },
      { name: 'spray_diary_nsw', label: 'Spray diary records maintained (3+ years)', type: 'checkbox', required: true },
      { name: 'buffer_zones_nsw', label: '20m buffer zones from waterways maintained', type: 'checkbox', required: true },
      { name: 'insurance_nsw', label: 'Public liability insurance $20M+ confirmed', type: 'checkbox', required: true },
    ],
  },
  VIC: {
    authority: 'Agriculture Victoria, EPA Victoria & WorkSafe Victoria',
    requirements: [
      'Agricultural Chemical User Permit (ACP) - Category 7a',
      'Commercial operator license for aerial application',
      'Environment Protection Act compliance',
      'Flora and Fauna Guarantee Act compliance',
      'Equipment calibration certificates (annual)',
      'Chemical application record keeping',
      'WorkSafe notification for commercial operations',
      'Professional indemnity insurance',
    ],
    forms: [
      { name: 'acp_permit_vic', label: 'ACP Category 7a permit number', type: 'text', required: true },
      { name: 'commercial_license_vic', label: 'Commercial operator license number', type: 'text', required: true },
      { name: 'equipment_calibration_vic', label: 'Annual equipment calibration current', type: 'checkbox', required: true },
      { name: 'epa_compliance_vic', label: 'EPA Victoria compliance verified', type: 'checkbox', required: true },
      { name: 'ffg_compliance_vic', label: 'Flora & Fauna Guarantee Act compliance', type: 'checkbox', required: true },
      { name: 'worksafe_notification_vic', label: 'WorkSafe commercial operation notification', type: 'checkbox', required: true },
    ],
  },
  QLD: {
    authority: 'Department of Agriculture & Fisheries QLD & Queensland EPA',
    requirements: [
      'Chemical applicator license (Category 1A - Aerial)',
      'Aerial application contractor license',
      'Restricted chemical authority (where applicable)',
      'Vegetation Management Act compliance',
      'Reef protection legislation compliance',
      'Queensland transport dangerous goods license',
      'Chemical application site records',
      'Continuing education requirements (20 hours/5 years)',
    ],
    forms: [
      { name: 'applicator_license_qld', label: 'Category 1A aerial applicator license', type: 'text', required: true },
      { name: 'contractor_license_qld', label: 'Aerial application contractor license', type: 'text', required: true },
      { name: 'restricted_authority_qld', label: 'Restricted chemical authority (if applicable)', type: 'text', required: false },
      { name: 'vegetation_compliance_qld', label: 'Vegetation Management Act compliance', type: 'checkbox', required: true },
      { name: 'reef_protection_qld', label: 'Reef protection measures implemented', type: 'checkbox', required: true },
      { name: 'continuing_education_qld', label: 'Continuing education current (20hrs/5yrs)', type: 'checkbox', required: true },
    ],
  },
  SA: {
    authority: 'PIRSA, EPA SA & SafeWork SA',
    requirements: [
      'Primary producer permit (own land) OR Commercial applicator license',
      'Chemical control order compliance',
      'Native Vegetation Act compliance',
      'River Murray Act compliance (if applicable)',
      'Natural Resources Management Act compliance',
      'Landscape SA regional consultation',
      'Professional development training completion',
      'Public liability insurance coverage',
    ],
    forms: [
      { name: 'producer_permit_sa', label: 'Primary producer permit OR Commercial license', type: 'text', required: true },
      { name: 'control_order_sa', label: 'Chemical control order compliance verified', type: 'checkbox', required: true },
      { name: 'native_vegetation_sa', label: 'Native Vegetation Act compliance', type: 'checkbox', required: true },
      { name: 'river_murray_sa', label: 'River Murray Act compliance (if applicable)', type: 'checkbox', required: false },
      { name: 'landscape_consultation_sa', label: 'Landscape SA consultation completed', type: 'checkbox', required: true },
      { name: 'professional_development_sa', label: 'Professional development training current', type: 'checkbox', required: true },
    ],
  },
  WA: {
    authority: 'DPIRD WA & Department of Water & Environmental Regulation',
    requirements: [
      'Pest management technician license',
      'Aerial spraying contractor registration',
      'Chemical use pattern documentation',
      'Rights in Water and Irrigation Act compliance',
      'Environmental Protection Act compliance',
      'Continuing education compliance (40 hours/3 years)',
      'Chemical disposal container records (drumMUSTER)',
      'Professional liability insurance',
    ],
    forms: [
      { name: 'technician_license_wa', label: 'Pest management technician license number', type: 'text', required: true },
      { name: 'contractor_registration_wa', label: 'Aerial spraying contractor registration', type: 'text', required: true },
      { name: 'use_pattern_wa', label: 'Chemical use pattern documentation complete', type: 'checkbox', required: true },
      { name: 'water_rights_wa', label: 'Water rights compliance verified', type: 'checkbox', required: true },
      { name: 'continuing_education_wa', label: 'Continuing education current (40hrs/3yrs)', type: 'checkbox', required: true },
      { name: 'drummuster_wa', label: 'drumMUSTER disposal records maintained', type: 'checkbox', required: true },
    ],
  },
  TAS: {
    authority: 'Department of Primary Industries TAS & EPA Tasmania',
    requirements: [
      'Crop protection permit',
      'Commercial pesticide applicator license',
      'Threatened Species Protection Act compliance',
      'Environmental Management & Pollution Control Act compliance',
      'Water Management Act compliance',
      'Annual license renewal and training',
      'Tasmanian Devil protection measures',
      'World Heritage Area protocols (if applicable)',
    ],
    forms: [
      { name: 'crop_protection_tas', label: 'Crop protection permit number', type: 'text', required: true },
      { name: 'applicator_license_tas', label: 'Commercial pesticide applicator license', type: 'text', required: true },
      { name: 'threatened_species_tas', label: 'Threatened Species Protection Act compliance', type: 'checkbox', required: true },
      { name: 'empca_compliance_tas', label: 'EMPCA compliance verified', type: 'checkbox', required: true },
      { name: 'water_management_tas', label: 'Water Management Act compliance', type: 'checkbox', required: true },
      { name: 'devil_protection_tas', label: 'Tasmanian Devil habitat protection considered', type: 'checkbox', required: true },
    ],
  },
  NT: {
    authority: 'Department of Industry, Tourism & Trade NT',
    requirements: [
      'Chemical user permit',
      'Commercial spray operator license',
      'Environment Protection Authority Act compliance',
      'Territory Parks & Wildlife Conservation Act compliance',
      'Water Act compliance',
      'Aboriginal Land Rights Act considerations',
      'Sacred site clearances (where required)',
      'Remote area operational protocols',
    ],
    forms: [
      { name: 'chemical_permit_nt', label: 'Chemical user permit number', type: 'text', required: true },
      { name: 'operator_license_nt', label: 'Commercial spray operator license', type: 'text', required: true },
      { name: 'epa_compliance_nt', label: 'EPA Act compliance verified', type: 'checkbox', required: true },
      { name: 'parks_wildlife_nt', label: 'Parks & Wildlife Act compliance', type: 'checkbox', required: true },
      { name: 'water_compliance_nt', label: 'Water Act compliance verified', type: 'checkbox', required: true },
      { name: 'sacred_sites_nt', label: 'Sacred site clearances obtained (if required)', type: 'text', required: false },
    ],
  },
  ACT: {
    authority: 'Environment, Planning & Sustainable Development Directorate',
    requirements: [
      'Pesticide control order compliance',
      'Urban area application permit',
      'Environment Protection Act compliance',
      'Nature Conservation Act compliance',
      'Tree Protection Act compliance',
      'ACT business registration',
      'Community notification protocols',
      'Murrumbidgee River corridor protection',
    ],
    forms: [
      { name: 'pesticide_control_act', label: 'Pesticide control order compliance verified', type: 'checkbox', required: true },
      { name: 'urban_permit_act', label: 'Urban area application permit number', type: 'text', required: true },
      { name: 'environment_protection_act', label: 'Environment Protection Act compliance', type: 'checkbox', required: true },
      { name: 'nature_conservation_act', label: 'Nature Conservation Act compliance', type: 'checkbox', required: true },
      { name: 'tree_protection_act', label: 'Tree Protection Act compliance', type: 'checkbox', required: true },
      { name: 'business_registration_act', label: 'ACT business registration number', type: 'text', required: true },
      { name: 'community_notification_act', label: 'Community notification completed', type: 'checkbox', required: true },
    ],
  },
};

export default function ComplianceChemical() {
  const theme = useTheme();
  const { getAutoPopulateData } = useUserLicense();
  const [selectedState, setSelectedState] = useState<string>('');
  const [chemicals, setChemicals] = useState<ChemicalProduct[]>([
    {
      id: '1',
      productName: '',
      activeIngredient: '',
      apvmaNumber: '',
      labelFollowed: false,
      applicationRate: '',
      witholdingPeriod: '',
      concentration: '',
      compatibilityVerified: false,
      notes: '',
    }
  ]);
  const [tankMixData, setTankMixData] = useState<TankMixDetails>({
    totalVolume: '',
    waterSource: '',
    mixingOrder: '',
    compatibilityTest: false,
    phLevel: '',
    waterQuality: '',
    agitationTime: '',
    finalWitholdingPeriod: '',
  });
  const [applicationData, setApplicationData] = useState({
    cropTreated: '',
    areaHectares: 0,
    applicationDate: '',
    weatherConditions: '',
    applicatorName: '',
    applicatorLicense: '',
    equipmentUsed: '',
    calibrationDate: '',
  });
  const [stateData, setStateData] = useState<Record<string, any>>({});
  const [operatorNotes, setOperatorNotes] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [availableJobs, setAvailableJobs] = useState<any[]>([]);
  const [showSignOff, setShowSignOff] = useState(false);
  const [autoPopulateMessage, setAutoPopulateMessage] = useState('');

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

  // Chemical management functions
  const addChemical = () => {
    const newChemical: ChemicalProduct = {
      id: Date.now().toString(),
      productName: '',
      activeIngredient: '',
      apvmaNumber: '',
      labelFollowed: false,
      applicationRate: '',
      witholdingPeriod: '',
      concentration: '',
      compatibilityVerified: false,
      notes: '',
    };
    setChemicals(prev => [...prev, newChemical]);
  };

  const removeChemical = (id: string) => {
    if (chemicals.length > 1) {
      setChemicals(prev => prev.filter(chem => chem.id !== id));
    }
  };

  const updateChemical = (id: string, field: keyof ChemicalProduct, value: any) => {
    setChemicals(prev => prev.map(chem =>
      chem.id === id ? { ...chem, [field]: value } : chem
    ));
  };

  const handleTankMixChange = (field: keyof TankMixDetails, value: any) => {
    setTankMixData(prev => ({ ...prev, [field]: value }));
  };

  const handleApplicationChange = (field: string, value: any) => {
    setApplicationData(prev => ({ ...prev, [field]: value }));
  };

  const handleStateDataChange = (field: string, value: any) => {
    setStateData(prev => ({ ...prev, [field]: value }));
  };

  // Handle state selection with auto-population
  const handleStateChange = (state: string) => {
    setSelectedState(state);

    // Auto-populate from saved license settings
    if (state) {
      const autoPopulateData = getAutoPopulateData(state as keyof StateLicenses);
      if (autoPopulateData && Object.keys(autoPopulateData).length > 0) {
        // Update state compliance data
        setStateData(autoPopulateData);

        // Update applicator name if available
        if (autoPopulateData.applicatorName) {
          setApplicationData(prev => ({
            ...prev,
            applicatorName: autoPopulateData.applicatorName,
          }));
        }

        // Show auto-population message
        setAutoPopulateMessage(`License information auto-populated for ${AUSTRALIAN_STATES.find(s => s.code === state)?.name}`);
        setTimeout(() => setAutoPopulateMessage(''), 4000);
      }
    }
  };

  // Calculate final withholding period (longest period of all chemicals)
  const calculateFinalWitholdingPeriod = () => {
    const periods = chemicals
      .filter(chem => chem.witholdingPeriod)
      .map(chem => parseInt(chem.witholdingPeriod) || 0);
    return periods.length > 0 ? Math.max(...periods).toString() : '';
  };

  // Update final withholding period when chemicals change
  useEffect(() => {
    const finalPeriod = calculateFinalWitholdingPeriod();
    if (finalPeriod !== tankMixData.finalWitholdingPeriod) {
      setTankMixData(prev => ({ ...prev, finalWitholdingPeriod: finalPeriod }));
    }
  }, [chemicals]);

  const handleSave = () => {
    const selectedJob = availableJobs.find(job => job.id === selectedJobId);

    const record: ComplianceRecord = {
      id: `compliance-${Date.now()}`,
      createdAt: new Date().toISOString(),
      state: selectedState,
      jobId: selectedJobId || undefined,
      jobDetails: selectedJob ? {
        clientName: selectedJob.clientName,
        propertyName: selectedJob.propertyName,
        fieldName: selectedJob.fieldName,
        jobDate: selectedJob.dateSprayed,
      } : undefined,
      chemicals: chemicals,
      tankMixDetails: tankMixData,
      applicationDetails: applicationData,
      stateCompliance: stateData,
      operatorNotes,
      isLocked: false,
    };

    // Save to localStorage (replace with proper backend integration)
    const existingRecords = JSON.parse(localStorage.getItem('compliance-records') || '[]');
    existingRecords.push(record);
    localStorage.setItem('compliance-records', JSON.stringify(existingRecords));

    setSaveMessage('Multi-chemical compliance record saved successfully');
    setTimeout(() => setSaveMessage(''), 3000);
  };

  const handleSignOff = (signature: string) => {
    if (!chemicals.length || chemicals.some(c => !c.productName || !c.apvmaNumber)) {
      setSaveMessage('Please complete all chemical information first');
      setTimeout(() => setSaveMessage(''), 3000);
      return;
    }

    const existingRecords = JSON.parse(localStorage.getItem('compliance-records') || '[]');
    const recordIndex = existingRecords.findIndex((r: any) => r.jobId === selectedJobId);

    if (recordIndex >= 0) {
      existingRecords[recordIndex].signedOff = {
        signedAt: new Date().toISOString(),
        signedBy: 'Current User',
        signature,
        ipAddress: 'xxx.xxx.xxx.xxx',
      };
      existingRecords[recordIndex].isLocked = true;

      localStorage.setItem('compliance-records', JSON.stringify(existingRecords));
      setSaveMessage('Multi-chemical compliance record signed off and locked');
      setTimeout(() => setSaveMessage(''), 3000);
      setShowSignOff(false);
    }
  };

  const stateRequirements = selectedState ? STATE_REQUIREMENTS[selectedState as keyof typeof STATE_REQUIREMENTS] : null;

  const cardStyle = {
    borderRadius: '16px',
    border: `1.5px solid ${alpha(theme.palette.primary.main, 0.1)}`,
    mb: 3,
  };

  return (
    <Box sx={{ p: 3, maxWidth: 1400, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <ScienceIcon sx={{ fontSize: 40, color: 'primary.main' }} />
          <Box>
            <Typography variant="h3" sx={{ fontWeight: 800, color: 'primary.dark', fontSize: { xs: '1.8rem', md: '2.2rem' } }}>
              Multi-Chemical Compliance & Recording
            </Typography>
            <Typography variant="h6" color="text.secondary" sx={{ fontWeight: 400, mt: 1 }}>
              Tank Mix & Complex Brew Compliance Management
            </Typography>
          </Box>
        </Box>
        <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 900, lineHeight: 1.6 }}>
          Comprehensive compliance management for multi-chemical applications including tank mixes, complex brews,
          and combination treatments. Manage APVMA requirements for each chemical while ensuring compatibility and regulatory compliance.
        </Typography>
      </Box>

      {/* Compliance Notice */}
      <Alert
        severity="info"
        icon={<GavelIcon />}
        sx={{ mb: 4, borderRadius: '12px' }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
          Multi-Chemical Compliance Notice
        </Typography>
        <Typography variant="body2">
          Tank mix applications require individual APVMA compliance for each chemical, compatibility verification,
          and adherence to the longest withholding period. Ensure all chemicals are compatible and approved for tank mixing.
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
                <em>No job selected - standalone compliance record</em>
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

      {/* Chemical Products Management */}
      <Card elevation={0} sx={cardStyle}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <ScienceIcon sx={{ color: 'primary.main', fontSize: 24 }} />
              <Typography variant="h5" sx={{ fontWeight: 700, color: 'primary.dark' }}>
                Chemical Products ({chemicals.length})
              </Typography>
              <Chip
                label="REQUIRED"
                size="small"
                color="error"
                variant="outlined"
                sx={{ fontWeight: 700 }}
              />
            </Box>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={addChemical}
              sx={{ borderRadius: '10px', fontWeight: 600 }}
            >
              Add Chemical
            </Button>
          </Box>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Add all chemicals used in this application. Each chemical requires individual APVMA compliance.
          </Typography>

          <Stack spacing={3}>
            {chemicals.map((chemical, index) => (
              <Paper
                key={chemical.id}
                elevation={2}
                sx={{
                  p: 3,
                  borderRadius: '12px',
                  border: `1px solid ${alpha(theme.palette.primary.main, 0.1)}`,
                  position: 'relative',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: 'primary.dark' }}>
                    Chemical #{index + 1}
                  </Typography>
                  {chemicals.length > 1 && (
                    <Tooltip title="Remove this chemical">
                      <IconButton
                        onClick={() => removeChemical(chemical.id)}
                        color="error"
                        size="small"
                        sx={{ bgcolor: alpha(theme.palette.error.main, 0.1) }}
                      >
                        <RemoveIcon />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>

                <Grid container spacing={3}>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <TextField
                      fullWidth
                      label="Product Name"
                      value={chemical.productName}
                      onChange={(e) => updateChemical(chemical.id, 'productName', e.target.value)}
                      required
                      placeholder="e.g., Roundup PowerMAX"
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <TextField
                      fullWidth
                      label="Active Ingredient"
                      value={chemical.activeIngredient}
                      onChange={(e) => updateChemical(chemical.id, 'activeIngredient', e.target.value)}
                      required
                      placeholder="e.g., Glyphosate"
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <TextField
                      fullWidth
                      label="APVMA Number"
                      value={chemical.apvmaNumber}
                      onChange={(e) => updateChemical(chemical.id, 'apvmaNumber', e.target.value)}
                      required
                      placeholder="e.g., APVMA 12345"
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <TextField
                      fullWidth
                      label="Application Rate"
                      value={chemical.applicationRate}
                      onChange={(e) => updateChemical(chemical.id, 'applicationRate', e.target.value)}
                      required
                      placeholder="e.g., 2L/ha"
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <TextField
                      fullWidth
                      label="Concentration"
                      value={chemical.concentration}
                      onChange={(e) => updateChemical(chemical.id, 'concentration', e.target.value)}
                      placeholder="e.g., 360g/L"
                      helperText="Active ingredient concentration"
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <TextField
                      fullWidth
                      label="Withholding Period (days)"
                      type="number"
                      value={chemical.witholdingPeriod}
                      onChange={(e) => updateChemical(chemical.id, 'witholdingPeriod', e.target.value)}
                      required
                      inputProps={{ min: 0 }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <TextField
                      fullWidth
                      label="Chemical Notes"
                      value={chemical.notes}
                      onChange={(e) => updateChemical(chemical.id, 'notes', e.target.value)}
                      placeholder="Special handling, mixing notes..."
                    />
                  </Grid>

                  {/* Chemical Compliance Checks */}
                  <Grid size={{ xs: 12 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, mb: 2 }}>
                      Compliance Verification
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Checkbox
                          checked={chemical.labelFollowed}
                          onChange={(e) => updateChemical(chemical.id, 'labelFollowed', e.target.checked)}
                          required
                        />
                        <Typography variant="body2">
                          Product label directions followed and rate within approved limits
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Checkbox
                          checked={chemical.compatibilityVerified}
                          onChange={(e) => updateChemical(chemical.id, 'compatibilityVerified', e.target.checked)}
                          required={chemicals.length > 1}
                        />
                        <Typography variant="body2">
                          Tank mix compatibility verified {chemicals.length > 1 ? '(Required for tank mixes)' : '(Optional for single chemical)'}
                        </Typography>
                      </Box>
                    </Box>
                  </Grid>
                </Grid>
              </Paper>
            ))}
          </Stack>
        </CardContent>
      </Card>

      {/* Tank Mix Details */}
      {chemicals.length > 1 && (
        <Card elevation={0} sx={cardStyle}>
          <CardContent sx={{ p: 4 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
              <WaterDropIcon sx={{ color: 'primary.main', fontSize: 24 }} />
              <Typography variant="h5" sx={{ fontWeight: 700, color: 'primary.dark' }}>
                Tank Mix Details
              </Typography>
              <Chip
                label="REQUIRED FOR MIXES"
                size="small"
                color="warning"
                variant="outlined"
                sx={{ fontWeight: 700 }}
              />
            </Box>

            <Alert severity="warning" sx={{ mb: 3, borderRadius: '8px' }}>
              <Typography variant="body2">
                <strong>Critical:</strong> Final withholding period is automatically calculated as the longest period among all chemicals:
                <strong> {tankMixData.finalWitholdingPeriod || 0} days</strong>
              </Typography>
            </Alert>

            <Grid container spacing={3}>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  fullWidth
                  label="Total Tank Volume"
                  value={tankMixData.totalVolume}
                  onChange={(e) => handleTankMixChange('totalVolume', e.target.value)}
                  required
                  placeholder="e.g., 1000L"
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  fullWidth
                  label="Water Source"
                  value={tankMixData.waterSource}
                  onChange={(e) => handleTankMixChange('waterSource', e.target.value)}
                  required
                  placeholder="e.g., Bore, Town Water, Dam"
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  fullWidth
                  label="pH Level"
                  type="number"
                  value={tankMixData.phLevel}
                  onChange={(e) => handleTankMixChange('phLevel', e.target.value)}
                  placeholder="e.g., 6.5"
                  inputProps={{ min: 0, max: 14, step: 0.1 }}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  fullWidth
                  label="Agitation Time (minutes)"
                  type="number"
                  value={tankMixData.agitationTime}
                  onChange={(e) => handleTankMixChange('agitationTime', e.target.value)}
                  placeholder="e.g., 15"
                  inputProps={{ min: 0 }}
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <TextField
                  fullWidth
                  label="Mixing Order & Sequence"
                  multiline
                  rows={2}
                  value={tankMixData.mixingOrder}
                  onChange={(e) => handleTankMixChange('mixingOrder', e.target.value)}
                  required
                  placeholder="Detail the order chemicals were added to the tank (e.g., 1. Water, 2. Chemical A, 3. Chemical B...)"
                />
              </Grid>

              <Grid size={{ xs: 12 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Checkbox
                    checked={tankMixData.compatibilityTest}
                    onChange={(e) => handleTankMixChange('compatibilityTest', e.target.checked)}
                    required
                  />
                  <Typography variant="body2">
                    Small batch compatibility test conducted before full tank mixing
                  </Typography>
                </Box>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* Application Details */}
      <Card elevation={0} sx={cardStyle}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
            <AssignmentIcon sx={{ color: 'primary.main', fontSize: 24 }} />
            <Typography variant="h5" sx={{ fontWeight: 700, color: 'primary.dark' }}>
              Application Details
            </Typography>
          </Box>

          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Crop Treated"
                value={applicationData.cropTreated}
                onChange={(e) => handleApplicationChange('cropTreated', e.target.value)}
                required
                placeholder="e.g., Wheat, Pasture"
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Area Treated (hectares)"
                type="number"
                value={applicationData.areaHectares}
                onChange={(e) => handleApplicationChange('areaHectares', parseFloat(e.target.value) || 0)}
                required
                inputProps={{ min: 0, step: 0.1 }}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Application Date"
                type="date"
                value={applicationData.applicationDate}
                onChange={(e) => handleApplicationChange('applicationDate', e.target.value)}
                required
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Weather Conditions"
                value={applicationData.weatherConditions}
                onChange={(e) => handleApplicationChange('weatherConditions', e.target.value)}
                required
                placeholder="Wind, temperature, humidity conditions"
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Applicator Name"
                value={applicationData.applicatorName}
                onChange={(e) => handleApplicationChange('applicatorName', e.target.value)}
                required
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Applicator License Number"
                value={applicationData.applicatorLicense}
                onChange={(e) => handleApplicationChange('applicatorLicense', e.target.value)}
                required
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Equipment Used"
                value={applicationData.equipmentUsed}
                onChange={(e) => handleApplicationChange('equipmentUsed', e.target.value)}
                placeholder="Drone model, nozzle type"
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Equipment Calibration Date"
                type="date"
                value={applicationData.calibrationDate}
                onChange={(e) => handleApplicationChange('calibrationDate', e.target.value)}
                InputLabelProps={{ shrink: true }}
                helperText="Last calibration date"
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* State Compliance */}
      <Card elevation={0} sx={cardStyle}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
            <LocationOnIcon sx={{ color: 'primary.main', fontSize: 24 }} />
            <Typography variant="h5" sx={{ fontWeight: 700, color: 'primary.dark' }}>
              State-Specific Compliance
            </Typography>
            <Chip
              label="REQUIRED"
              size="small"
              color="error"
              variant="outlined"
              sx={{ fontWeight: 700 }}
            />
          </Box>

          <FormControl fullWidth required sx={{ mb: 3 }}>
            <InputLabel>Select State/Territory</InputLabel>
            <Select
              value={selectedState}
              onChange={(e) => handleStateChange(e.target.value)}
              label="Select State/Territory"
            >
              {AUSTRALIAN_STATES.map((state) => (
                <MenuItem key={state.code} value={state.code}>
                  {state.name} ({state.code})
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {autoPopulateMessage && (
            <Alert
              severity="success"
              icon={<CheckCircleIcon />}
              sx={{ mt: 2, borderRadius: '8px' }}
            >
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {autoPopulateMessage}
              </Typography>
              <Typography variant="body2">
                License numbers and certifications loaded from your settings. You can modify any fields as needed.
              </Typography>
            </Alert>
          )}

          {stateRequirements && (
            <Box>
              <Paper sx={{ p: 3, mb: 3, bgcolor: alpha(theme.palette.info.main, 0.05) }}>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 2, color: 'info.dark' }}>
                  Regulatory Authority: {stateRequirements.authority}
                </Typography>
                <List dense>
                  {stateRequirements.requirements.map((req, index) => (
                    <ListItem key={index} sx={{ pl: 0 }}>
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <ArticleIcon fontSize="small" color="info" />
                      </ListItemIcon>
                      <ListItemText primary={req} />
                    </ListItem>
                  ))}
                </List>
              </Paper>

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
                    {form.type === 'text' && (
                      <TextField
                        fullWidth
                        label={form.label}
                        value={stateData[form.name] || ''}
                        onChange={(e) => handleStateDataChange(form.name, e.target.value)}
                        required={form.required}
                      />
                    )}
                  </Grid>
                ))}
              </Grid>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Operator Notes */}
      <Card elevation={0} sx={cardStyle}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
            Additional Notes & Observations
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={4}
            label="Operator Notes"
            value={operatorNotes}
            onChange={(e) => setOperatorNotes(e.target.value)}
            placeholder="Additional observations, tank mix performance, application notes, weather conditions, or any other relevant information..."
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

      {/* Multi-Chemical Sign-off Dialog */}
      <MultiChemicalSignOffDialog
        open={showSignOff}
        onClose={() => setShowSignOff(false)}
        onSignOff={handleSignOff}
        chemicals={chemicals}
        tankMixData={tankMixData}
        applicationData={applicationData}
        selectedState={selectedState}
        jobDetails={selectedJobId ? availableJobs.find(j => j.id === selectedJobId) : null}
      />
    </Box>
  );
}

// Multi-Chemical Sign-off Dialog Component
interface MultiChemicalSignOffDialogProps {
  open: boolean;
  onClose: () => void;
  onSignOff: (signature: string) => void;
  chemicals: ChemicalProduct[];
  tankMixData: TankMixDetails;
  applicationData: any;
  selectedState: string;
  jobDetails: any;
}

function MultiChemicalSignOffDialog({
  open,
  onClose,
  onSignOff,
  chemicals,
  tankMixData,
  applicationData,
  selectedState,
  jobDetails
}: MultiChemicalSignOffDialogProps) {
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

  const finalWitholdingPeriod = Math.max(...chemicals.map(c => parseInt(c.witholdingPeriod) || 0));

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, borderBottom: '1px solid #e0e0e0' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <CheckCircleIcon color="success" />
          Multi-Chemical Compliance Sign-off
        </Box>
      </DialogTitle>
      <DialogContent sx={{ p: 4 }}>
        <Alert severity="warning" sx={{ mb: 3, borderRadius: '8px' }}>
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
            Final Sign-off Warning
          </Typography>
          <Typography variant="body2">
            Once signed off, this multi-chemical compliance record will be permanently locked and cannot be modified.
            Please review all chemical information, tank mix details, and compliance requirements carefully.
          </Typography>
        </Alert>

        {/* Record Summary */}
        <Paper sx={{ p: 3, mb: 3, bgcolor: 'grey.50', borderRadius: '8px' }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
            Multi-Chemical Record Summary
          </Typography>

          <Grid container spacing={2}>
            <Grid size={{ xs: 6 }}>
              <Typography variant="body2">
                <strong>Chemicals:</strong> {chemicals.length} products
              </Typography>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <Typography variant="body2">
                <strong>Application Type:</strong> {chemicals.length > 1 ? 'Tank Mix' : 'Single Chemical'}
              </Typography>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <Typography variant="body2">
                <strong>Final Withholding:</strong> {finalWitholdingPeriod} days
              </Typography>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <Typography variant="body2">
                <strong>Area Treated:</strong> {applicationData.areaHectares} hectares
              </Typography>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <Typography variant="body2">
                <strong>State:</strong> {selectedState}
              </Typography>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <Typography variant="body2">
                <strong>Job Link:</strong> {jobDetails ? 'Yes' : 'Standalone'}
              </Typography>
            </Grid>
          </Grid>

          <Divider sx={{ my: 2 }} />

          <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
            Chemical Products:
          </Typography>
          <Stack spacing={1}>
            {chemicals.map((chem, index) => (
              <Typography key={chem.id} variant="body2" color="text.secondary">
                {index + 1}. {chem.productName} ({chem.activeIngredient}) - {chem.applicationRate}
              </Typography>
            ))}
          </Stack>
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
            helperText="This serves as your digital signature for this multi-chemical compliance record"
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
            I certify that all chemical information is accurate, all products have valid APVMA registration,
            tank mix compatibility has been verified (where applicable), and all application details are correct.
            I understand this record may be used for regulatory audits and legal purposes.
            All chemicals were applied according to label directions and applicable regulations.
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