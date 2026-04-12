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
  RadioGroup,
  FormControlLabel,
  Radio,
} from '@mui/material';
import ShieldIcon from '@mui/icons-material/Shield';
import WarningIcon from '@mui/icons-material/Warning';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SaveIcon from '@mui/icons-material/Save';
import LinkIcon from '@mui/icons-material/Link';
import WaterIcon from '@mui/icons-material/Water';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import NatureIcon from '@mui/icons-material/Nature';
import { getJobs, getClientById, getPropertyById, getFieldById } from '../services/fieldManagementStore';

interface EnvironmentalRecord {
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
  waterwayProtection: {
    nearWaterway: boolean;
    waterwayType: string;
    bufferZoneDistance: string;
    bufferZoneMaintained: boolean;
    spillContainment: boolean;
    emergencyResponse: string;
  };
  sensitiveAreas: {
    environmentallyImportant: boolean;
    areaType: string[];
    specialPermits: boolean;
    permitNumbers: string;
    consultationCompleted: boolean;
    mitigationMeasures: string;
  };
  biodiversityProtection: {
    threatenedSpecies: boolean;
    speciesList: string;
    breedingSeasons: boolean;
    habitatProtection: boolean;
    monitoringRequired: boolean;
    reportingCompleted: boolean;
  };
  impactAssessment: {
    riskLevel: string;
    assessmentMethod: string;
    potentialImpacts: string[];
    mitigationStrategies: string;
    monitoringPlan: string;
    reviewFrequency: string;
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

const STATE_ENVIRONMENTAL_REQUIREMENTS: Record<string, {
  authority: string;
  requirements: string[];
  forms: StateFormField[];
}> = {
  NSW: {
    authority: 'NSW EPA & Department of Planning and Environment',
    requirements: [
      'Protection of Environment Operations Act compliance',
      'Biodiversity Conservation Act requirements',
      'Water Management Act obligations',
      'Sensitive ecological area restrictions',
      'Threatened species impact assessment',
      'Waterway buffer zone compliance (minimum 20m)',
    ],
    forms: [
      { name: 'poeo_compliance', label: 'POEO Act compliance verified', type: 'checkbox', required: true },
      { name: 'biodiversity_assessment', label: 'Biodiversity assessment completed', type: 'checkbox', required: true },
      { name: 'water_license', label: 'Water access license number (if required)', type: 'text', required: false },
      { name: 'buffer_zones', label: 'Minimum 20m buffer zones maintained', type: 'checkbox', required: true },
    ],
  },
  VIC: {
    authority: 'EPA Victoria & Department of Environment',
    requirements: [
      'Environment Protection Act compliance',
      'Flora and Fauna Guarantee Act obligations',
      'Catchment and Land Protection Act requirements',
      'Ramsar wetland protection protocols',
      'Marine and coastal environment protection',
      'Aboriginal cultural heritage considerations',
    ],
    forms: [
      { name: 'epa_vic_compliance', label: 'EPA Victoria compliance confirmed', type: 'checkbox', required: true },
      { name: 'ffg_assessment', label: 'Flora and Fauna assessment completed', type: 'checkbox', required: true },
      { name: 'ramsar_protection', label: 'Ramsar wetland protocols followed (if applicable)', type: 'checkbox', required: false },
      { name: 'cultural_heritage', label: 'Aboriginal cultural heritage considered', type: 'checkbox', required: true },
    ],
  },
  QLD: {
    authority: 'Department of Environment and Science Queensland',
    requirements: [
      'Environmental Protection Act compliance',
      'Nature Conservation Act obligations',
      'Vegetation Management Act requirements',
      'Reef protection legislation compliance',
      'Wetland mapping and protection requirements',
      'Koala habitat protection measures',
    ],
    forms: [
      { name: 'ep_act_qld', label: 'Environmental Protection Act compliance', type: 'checkbox', required: true },
      { name: 'reef_protection', label: 'Reef protection measures implemented', type: 'checkbox', required: true },
      { name: 'vegetation_clearing', label: 'Vegetation clearing permits (if required)', type: 'text', required: false },
      { name: 'koala_habitat', label: 'Koala habitat protection considered', type: 'checkbox', required: true },
    ],
  },
  SA: {
    authority: 'SA EPA & Department for Environment and Water',
    requirements: [
      'Environment Protection Act compliance',
      'Native Vegetation Act obligations',
      'River Murray Act requirements',
      'Landscape SA regional compliance',
      'Native title and heritage protection',
      'Aquatic ecosystem protection',
    ],
    forms: [
      { name: 'sa_epa_compliance', label: 'SA EPA compliance verified', type: 'checkbox', required: true },
      { name: 'native_veg_act', label: 'Native Vegetation Act compliance', type: 'checkbox', required: true },
      { name: 'river_murray', label: 'River Murray protection measures (if applicable)', type: 'checkbox', required: false },
      { name: 'landscape_sa', label: 'Regional Landscape SA consultation completed', type: 'checkbox', required: true },
    ],
  },
  WA: {
    authority: 'Department of Water and Environmental Regulation',
    requirements: [
      'Environmental Protection Act compliance',
      'Biodiversity Conservation Act obligations',
      'Rights in Water and Irrigation Act requirements',
      'Aboriginal Heritage Act considerations',
      'Swan and Canning Rivers protection',
      'Threatened ecological community protection',
    ],
    forms: [
      { name: 'dwer_compliance', label: 'DWER compliance verified', type: 'checkbox', required: true },
      { name: 'biodiversity_wa', label: 'Biodiversity Conservation Act compliance', type: 'checkbox', required: true },
      { name: 'water_rights_wa', label: 'Water rights compliance verified', type: 'checkbox', required: true },
      { name: 'aboriginal_heritage_wa', label: 'Aboriginal heritage protection considered', type: 'checkbox', required: true },
    ],
  },
  TAS: {
    authority: 'EPA Tasmania & Department of Primary Industries',
    requirements: [
      'Environmental Management and Pollution Control Act',
      'Threatened Species Protection Act obligations',
      'Nature Conservation Act requirements',
      'Water Management Act compliance',
      'Tasmanian Devil protection measures',
      'World Heritage Area considerations',
    ],
    forms: [
      { name: 'empca_compliance', label: 'EMPCA compliance verified', type: 'checkbox', required: true },
      { name: 'threatened_species_tas', label: 'Threatened species assessment completed', type: 'checkbox', required: true },
      { name: 'devil_protection', label: 'Tasmanian Devil habitat protection considered', type: 'checkbox', required: true },
      { name: 'world_heritage', label: 'World Heritage Area protocols followed (if applicable)', type: 'checkbox', required: false },
    ],
  },
  NT: {
    authority: 'NT EPA & Department of Environment',
    requirements: [
      'Environment Protection Authority Act compliance',
      'Territory Parks and Wildlife Conservation Act',
      'Water Act obligations',
      'Aboriginal Land Rights Act considerations',
      'Sacred site protection requirements',
      'Unique Territory ecosystem protection',
    ],
    forms: [
      { name: 'nt_epa_compliance', label: 'NT EPA compliance verified', type: 'checkbox', required: true },
      { name: 'parks_wildlife', label: 'Parks and Wildlife Act compliance', type: 'checkbox', required: true },
      { name: 'sacred_sites', label: 'Sacred site clearances obtained (if required)', type: 'text', required: false },
      { name: 'ecosystem_protection', label: 'Territory ecosystem protection measures', type: 'checkbox', required: true },
    ],
  },
  ACT: {
    authority: 'Environment, Planning and Sustainable Development',
    requirements: [
      'Environment Protection Act compliance',
      'Nature Conservation Act obligations',
      'Tree Protection Act requirements',
      'Water Resources Act compliance',
      'Urban environmental protection standards',
      'Murrumbidgee River corridor protection',
    ],
    forms: [
      { name: 'act_env_protection', label: 'ACT Environment Protection compliance', type: 'checkbox', required: true },
      { name: 'nature_conservation_act', label: 'Nature Conservation Act compliance', type: 'checkbox', required: true },
      { name: 'tree_protection', label: 'Tree protection requirements met', type: 'checkbox', required: true },
      { name: 'murrumbidgee', label: 'Murrumbidgee corridor protection (if applicable)', type: 'checkbox', required: false },
    ],
  },
};

export default function ComplianceEnvironmental() {
  const theme = useTheme();
  const [selectedState, setSelectedState] = useState<string>('');
  const [waterwayData, setWaterwayData] = useState({
    nearWaterway: false,
    waterwayType: '',
    bufferZoneDistance: '',
    bufferZoneMaintained: false,
    spillContainment: false,
    emergencyResponse: '',
  });
  const [sensitiveData, setSensitiveData] = useState({
    environmentallyImportant: false,
    areaType: [] as string[],
    specialPermits: false,
    permitNumbers: '',
    consultationCompleted: false,
    mitigationMeasures: '',
  });
  const [biodiversityData, setBiodiversityData] = useState({
    threatenedSpecies: false,
    speciesList: '',
    breedingSeasons: false,
    habitatProtection: false,
    monitoringRequired: false,
    reportingCompleted: false,
  });
  const [impactData, setImpactData] = useState({
    riskLevel: '',
    assessmentMethod: '',
    potentialImpacts: [] as string[],
    mitigationStrategies: '',
    monitoringPlan: '',
    reviewFrequency: '',
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

  const handleWaterwayChange = (field: string, value: any) => {
    setWaterwayData(prev => ({ ...prev, [field]: value }));
  };

  const handleSensitiveChange = (field: string, value: any) => {
    setSensitiveData(prev => ({ ...prev, [field]: value }));
  };

  const handleBiodiversityChange = (field: string, value: any) => {
    setBiodiversityData(prev => ({ ...prev, [field]: value }));
  };

  const handleImpactChange = (field: string, value: any) => {
    setImpactData(prev => ({ ...prev, [field]: value }));
  };

  const handleStateDataChange = (field: string, value: any) => {
    setStateData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    const selectedJob = availableJobs.find(job => job.id === selectedJobId);

    const record: EnvironmentalRecord = {
      id: `environmental-${Date.now()}`,
      createdAt: new Date().toISOString(),
      state: selectedState,
      jobId: selectedJobId || undefined,
      jobDetails: selectedJob ? {
        clientName: selectedJob.clientName,
        propertyName: selectedJob.propertyName,
        fieldName: selectedJob.fieldName,
        jobDate: selectedJob.dateSprayed,
      } : undefined,
      waterwayProtection: waterwayData,
      sensitiveAreas: sensitiveData,
      biodiversityProtection: biodiversityData,
      impactAssessment: impactData,
      stateCompliance: stateData,
      operatorNotes,
      isLocked: false,
    };

    // Save to localStorage (replace with proper backend integration)
    const existingRecords = JSON.parse(localStorage.getItem('environmental-records') || '[]');
    existingRecords.push(record);
    localStorage.setItem('environmental-records', JSON.stringify(existingRecords));

    setSaveMessage('Environmental compliance record saved successfully');
    setTimeout(() => setSaveMessage(''), 3000);
  };

  const handleSignOff = (signature: string) => {
    if (!selectedJobId) {
      setSaveMessage('Please save the record first');
      setTimeout(() => setSaveMessage(''), 3000);
      return;
    }

    const existingRecords = JSON.parse(localStorage.getItem('environmental-records') || '[]');
    const recordIndex = existingRecords.findIndex((r: any) => r.jobId === selectedJobId);

    if (recordIndex >= 0) {
      existingRecords[recordIndex].signedOff = {
        signedAt: new Date().toISOString(),
        signedBy: 'Current User', // Replace with actual user
        signature,
        ipAddress: 'xxx.xxx.xxx.xxx', // Replace with actual IP
      };
      existingRecords[recordIndex].isLocked = true;

      localStorage.setItem('environmental-records', JSON.stringify(existingRecords));
      setSaveMessage('Environmental compliance record signed off and locked');
      setTimeout(() => setSaveMessage(''), 3000);
      setShowSignOff(false);
    }
  };

  const stateRequirements = selectedState ? STATE_ENVIRONMENTAL_REQUIREMENTS[selectedState as keyof typeof STATE_ENVIRONMENTAL_REQUIREMENTS] : null;

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
          <ShieldIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Typography variant="h4" sx={{ fontWeight: 800, color: 'primary.dark' }}>
            Environmental Protection Compliance
          </Typography>
        </Box>
        <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 800 }}>
          Ensure environmental protection through waterway buffer zones, sensitive area management, and biodiversity conservation for agricultural operations.
        </Typography>
      </Box>

      {/* Regulatory Disclaimer */}
      <Alert
        severity="warning"
        icon={<WarningIcon />}
        sx={{ mb: 4, borderRadius: '12px' }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
          Environmental Protection Notice
        </Typography>
        <Typography variant="body2">
          Environmental compliance requires strict adherence to buffer zones, sensitive area protections, and biodiversity conservation measures.
          Violations can result in significant penalties and environmental damage. Always verify current requirements with environmental authorities.
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
                <em>No job selected - standalone environmental record</em>
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

      {/* Waterway Protection */}
      <Card elevation={0} sx={cardStyle}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
            <WaterIcon sx={{ color: 'primary.main', fontSize: 24 }} />
            <Typography variant="h5" sx={{ fontWeight: 700, color: 'primary.dark' }}>
              Waterway Protection & Buffer Zones
            </Typography>
            <Chip
              label="CRITICAL"
              size="small"
              color="error"
              variant="outlined"
              sx={{ fontWeight: 700 }}
            />
          </Box>

          <Grid container spacing={3}>
            <Grid size={{ xs: 12 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <Checkbox
                  checked={waterwayData.nearWaterway}
                  onChange={(e) => handleWaterwayChange('nearWaterway', e.target.checked)}
                />
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  Application area is within 100m of a waterway, dam, bore, or water source
                </Typography>
              </Box>
            </Grid>

            {waterwayData.nearWaterway && (
              <>
                <Grid size={{ xs: 12, md: 6 }}>
                  <FormControl fullWidth required>
                    <InputLabel>Waterway Type</InputLabel>
                    <Select
                      value={waterwayData.waterwayType}
                      onChange={(e) => handleWaterwayChange('waterwayType', e.target.value)}
                      label="Waterway Type"
                    >
                      <MenuItem value="river">River</MenuItem>
                      <MenuItem value="creek">Creek/Stream</MenuItem>
                      <MenuItem value="dam">Dam/Reservoir</MenuItem>
                      <MenuItem value="bore">Bore/Well</MenuItem>
                      <MenuItem value="wetland">Wetland</MenuItem>
                      <MenuItem value="drainage">Drainage Channel</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <FormControl fullWidth required>
                    <InputLabel>Buffer Zone Distance</InputLabel>
                    <Select
                      value={waterwayData.bufferZoneDistance}
                      onChange={(e) => handleWaterwayChange('bufferZoneDistance', e.target.value)}
                      label="Buffer Zone Distance"
                    >
                      <MenuItem value="5m">5 metres</MenuItem>
                      <MenuItem value="10m">10 metres</MenuItem>
                      <MenuItem value="15m">15 metres</MenuItem>
                      <MenuItem value="20m">20 metres</MenuItem>
                      <MenuItem value="30m">30 metres</MenuItem>
                      <MenuItem value="50m">50 metres</MenuItem>
                      <MenuItem value="100m">100 metres</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Checkbox
                      checked={waterwayData.bufferZoneMaintained}
                      onChange={(e) => handleWaterwayChange('bufferZoneMaintained', e.target.checked)}
                      required
                    />
                    <Typography variant="body2">
                      Buffer zone maintained - no application within specified distance
                    </Typography>
                  </Box>
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Checkbox
                      checked={waterwayData.spillContainment}
                      onChange={(e) => handleWaterwayChange('spillContainment', e.target.checked)}
                      required
                    />
                    <Typography variant="body2">
                      Spill containment measures in place to protect waterway
                    </Typography>
                  </Box>
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <TextField
                    fullWidth
                    multiline
                    rows={2}
                    label="Emergency Response Plan for Waterway Contamination"
                    value={waterwayData.emergencyResponse}
                    onChange={(e) => handleWaterwayChange('emergencyResponse', e.target.value)}
                    required
                    placeholder="Describe emergency procedures, contact numbers, and containment strategies..."
                  />
                </Grid>
              </>
            )}
          </Grid>
        </CardContent>
      </Card>

      {/* Sensitive Areas */}
      <Card elevation={0} sx={cardStyle}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
            <LocationOnIcon sx={{ color: 'primary.main', fontSize: 24 }} />
            <Typography variant="h5" sx={{ fontWeight: 700, color: 'primary.dark' }}>
              Sensitive & Protected Areas
            </Typography>
          </Box>

          <Grid container spacing={3}>
            <Grid size={{ xs: 12 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <Checkbox
                  checked={sensitiveData.environmentallyImportant}
                  onChange={(e) => handleSensitiveChange('environmentallyImportant', e.target.checked)}
                />
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  Application area is within or near an environmentally sensitive or protected area
                </Typography>
              </Box>
            </Grid>

            {sensitiveData.environmentallyImportant && (
              <>
                <Grid size={{ xs: 12 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, mb: 2 }}>
                    Protected Area Types (select all that apply):
                  </Typography>
                  {[
                    'National Park',
                    'State Forest',
                    'Nature Reserve',
                    'Ramsar Wetland',
                    'World Heritage Area',
                    'Marine Protected Area',
                    'Aboriginal Cultural Site',
                    'Threatened Ecological Community',
                    'Critical Habitat',
                  ].map((type) => (
                    <Box key={type} sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                      <Checkbox
                        checked={sensitiveData.areaType.includes(type)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            handleSensitiveChange('areaType', [...sensitiveData.areaType, type]);
                          } else {
                            handleSensitiveChange('areaType', sensitiveData.areaType.filter(t => t !== type));
                          }
                        }}
                      />
                      <Typography variant="body2">{type}</Typography>
                    </Box>
                  ))}
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Checkbox
                      checked={sensitiveData.specialPermits}
                      onChange={(e) => handleSensitiveChange('specialPermits', e.target.checked)}
                    />
                    <Typography variant="body2">Special permits or approvals obtained</Typography>
                  </Box>
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth
                    label="Permit Numbers (if applicable)"
                    value={sensitiveData.permitNumbers}
                    onChange={(e) => handleSensitiveChange('permitNumbers', e.target.value)}
                    helperText="List all relevant permit and approval numbers"
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Checkbox
                      checked={sensitiveData.consultationCompleted}
                      onChange={(e) => handleSensitiveChange('consultationCompleted', e.target.checked)}
                      required
                    />
                    <Typography variant="body2">
                      Consultation with relevant authorities completed
                    </Typography>
                  </Box>
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <TextField
                    fullWidth
                    multiline
                    rows={3}
                    label="Mitigation Measures for Sensitive Areas"
                    value={sensitiveData.mitigationMeasures}
                    onChange={(e) => handleSensitiveChange('mitigationMeasures', e.target.value)}
                    required
                    placeholder="Describe specific measures to protect sensitive areas during application..."
                  />
                </Grid>
              </>
            )}
          </Grid>
        </CardContent>
      </Card>

      {/* Biodiversity Protection */}
      <Card elevation={0} sx={cardStyle}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
            <NatureIcon sx={{ color: 'primary.main', fontSize: 24 }} />
            <Typography variant="h5" sx={{ fontWeight: 700, color: 'primary.dark' }}>
              Biodiversity Conservation
            </Typography>
          </Box>

          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <Checkbox
                  checked={biodiversityData.threatenedSpecies}
                  onChange={(e) => handleBiodiversityChange('threatenedSpecies', e.target.checked)}
                />
                <Typography variant="body2">
                  Threatened or endangered species present in application area
                </Typography>
              </Box>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <Checkbox
                  checked={biodiversityData.breedingSeasons}
                  onChange={(e) => handleBiodiversityChange('breedingSeasons', e.target.checked)}
                />
                <Typography variant="body2">
                  Breeding seasons and critical periods considered
                </Typography>
              </Box>
            </Grid>

            {biodiversityData.threatenedSpecies && (
              <Grid size={{ xs: 12 }}>
                <TextField
                  fullWidth
                  multiline
                  rows={2}
                  label="List of Threatened Species"
                  value={biodiversityData.speciesList}
                  onChange={(e) => handleBiodiversityChange('speciesList', e.target.value)}
                  required
                  helperText="List all threatened species present and their conservation status"
                />
              </Grid>
            )}

            <Grid size={{ xs: 12, md: 6 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Checkbox
                  checked={biodiversityData.habitatProtection}
                  onChange={(e) => handleBiodiversityChange('habitatProtection', e.target.checked)}
                />
                <Typography variant="body2">Critical habitat protection measures in place</Typography>
              </Box>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Checkbox
                  checked={biodiversityData.monitoringRequired}
                  onChange={(e) => handleBiodiversityChange('monitoringRequired', e.target.checked)}
                />
                <Typography variant="body2">Post-application monitoring plan implemented</Typography>
              </Box>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Checkbox
                  checked={biodiversityData.reportingCompleted}
                  onChange={(e) => handleBiodiversityChange('reportingCompleted', e.target.checked)}
                />
                <Typography variant="body2">Required biodiversity reporting completed</Typography>
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Environmental Impact Assessment */}
      <Card elevation={0} sx={cardStyle}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h5" sx={{ fontWeight: 700, color: 'primary.dark', mb: 3 }}>
            Environmental Impact Assessment
          </Typography>

          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 4 }}>
              <FormControl fullWidth required>
                <InputLabel>Environmental Risk Level</InputLabel>
                <Select
                  value={impactData.riskLevel}
                  onChange={(e) => handleImpactChange('riskLevel', e.target.value)}
                  label="Environmental Risk Level"
                >
                  <MenuItem value="low">Low Risk</MenuItem>
                  <MenuItem value="medium">Medium Risk</MenuItem>
                  <MenuItem value="high">High Risk</MenuItem>
                  <MenuItem value="extreme">Extreme Risk</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <FormControl fullWidth required>
                <InputLabel>Assessment Method</InputLabel>
                <Select
                  value={impactData.assessmentMethod}
                  onChange={(e) => handleImpactChange('assessmentMethod', e.target.value)}
                  label="Assessment Method"
                >
                  <MenuItem value="desktop">Desktop Assessment</MenuItem>
                  <MenuItem value="field-survey">Field Survey</MenuItem>
                  <MenuItem value="professional-assessment">Professional Assessment</MenuItem>
                  <MenuItem value="regulatory-consultation">Regulatory Consultation</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <FormControl fullWidth required>
                <InputLabel>Review Frequency</InputLabel>
                <Select
                  value={impactData.reviewFrequency}
                  onChange={(e) => handleImpactChange('reviewFrequency', e.target.value)}
                  label="Review Frequency"
                >
                  <MenuItem value="annually">Annually</MenuItem>
                  <MenuItem value="biannually">Every 6 months</MenuItem>
                  <MenuItem value="quarterly">Quarterly</MenuItem>
                  <MenuItem value="monthly">Monthly</MenuItem>
                  <MenuItem value="as-needed">As needed</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid size={{ xs: 12 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 2 }}>
                Potential Environmental Impacts (select all that apply):
              </Typography>
              {[
                'Water contamination',
                'Soil degradation',
                'Air quality impact',
                'Wildlife habitat disruption',
                'Vegetation damage',
                'Aquatic ecosystem impact',
                'Pollinator population effects',
                'Food chain bioaccumulation',
              ].map((impact) => (
                <Box key={impact} sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                  <Checkbox
                    checked={impactData.potentialImpacts.includes(impact)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        handleImpactChange('potentialImpacts', [...impactData.potentialImpacts, impact]);
                      } else {
                        handleImpactChange('potentialImpacts', impactData.potentialImpacts.filter(i => i !== impact));
                      }
                    }}
                  />
                  <Typography variant="body2">{impact}</Typography>
                </Box>
              ))}
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                multiline
                rows={4}
                label="Mitigation Strategies"
                value={impactData.mitigationStrategies}
                onChange={(e) => handleImpactChange('mitigationStrategies', e.target.value)}
                required
                placeholder="Describe strategies to minimize environmental impact..."
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                multiline
                rows={4}
                label="Monitoring Plan"
                value={impactData.monitoringPlan}
                onChange={(e) => handleImpactChange('monitoringPlan', e.target.value)}
                required
                placeholder="Describe post-application monitoring procedures..."
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* State-Specific Environmental Compliance */}
      <Card elevation={0} sx={cardStyle}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
            <LocationOnIcon sx={{ color: 'primary.main', fontSize: 24 }} />
            <Typography variant="h5" sx={{ fontWeight: 700, color: 'primary.dark' }}>
              State Environmental Compliance
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
                  Environmental Authority: {stateRequirements.authority}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 2 }}>
                  Key Environmental Requirements for {AUSTRALIAN_STATES.find(s => s.code === selectedState)?.name}:
                </Typography>
                <List dense>
                  {stateRequirements.requirements.map((req, index) => (
                    <ListItem key={index} sx={{ pl: 0 }}>
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <ShieldIcon fontSize="small" color="info" />
                      </ListItemIcon>
                      <ListItemText primary={req} />
                    </ListItem>
                  ))}
                </List>
              </Paper>

              <Typography variant="h6" sx={{ fontWeight: 700, mb: 3 }}>
                State Environmental Compliance Documentation
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
            </>
          )}
        </CardContent>
      </Card>

      {/* Operator Notes */}
      <Card elevation={0} sx={cardStyle}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
            Additional Environmental Notes
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={4}
            label="Notes"
            value={operatorNotes}
            onChange={(e) => setOperatorNotes(e.target.value)}
            placeholder="Additional environmental considerations, monitoring observations, or special circumstances..."
            helperText="Document any specific environmental conditions, seasonal considerations, or post-application observations"
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
      <EnvironmentalSignOffDialog
        open={showSignOff}
        onClose={() => setShowSignOff(false)}
        onSignOff={handleSignOff}
        recordData={{
          jobDetails: selectedJobId ? availableJobs.find(j => j.id === selectedJobId) : null,
          state: selectedState,
          waterwayProtection: waterwayData,
          sensitiveAreas: sensitiveData,
          biodiversityProtection: biodiversityData,
          impactAssessment: impactData,
          operatorNotes,
        }}
      />
    </Box>
  );
}

// Sign-off Dialog Component
interface EnvironmentalSignOffDialogProps {
  open: boolean;
  onClose: () => void;
  onSignOff: (signature: string) => void;
  recordData: any;
}

function EnvironmentalSignOffDialog({ open, onClose, onSignOff, recordData }: EnvironmentalSignOffDialogProps) {
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
          Environmental Compliance Sign-off
        </Box>
      </DialogTitle>
      <DialogContent sx={{ p: 4 }}>
        <Alert severity="warning" sx={{ mb: 3, borderRadius: '8px' }}>
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
            Final Environmental Sign-off Warning
          </Typography>
          <Typography variant="body2">
            Once signed off, this environmental compliance record will be permanently locked and cannot be modified.
            Ensure all environmental protection measures are in place before proceeding.
          </Typography>
        </Alert>

        {/* Record Summary */}
        <Paper sx={{ p: 3, mb: 3, bgcolor: 'grey.50', borderRadius: '8px' }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
            Environmental Record Summary
          </Typography>

          <Grid container spacing={2}>
            <Grid size={{ xs: 6 }}>
              <Typography variant="body2">
                <strong>State:</strong> {recordData.state || 'Not selected'}
              </Typography>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <Typography variant="body2">
                <strong>Waterway Protection:</strong> {recordData.waterwayProtection.nearWaterway ? 'Active' : 'Not required'}
              </Typography>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <Typography variant="body2">
                <strong>Sensitive Areas:</strong> {recordData.sensitiveAreas.environmentallyImportant ? 'Protected' : 'None identified'}
              </Typography>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <Typography variant="body2">
                <strong>Risk Level:</strong> {recordData.impactAssessment.riskLevel || 'Not assessed'}
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
            helperText="This serves as your digital signature for this environmental compliance record"
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
            I certify that all environmental protection measures are in place and all regulatory requirements have been met.
            I understand this record may be used for environmental audits and regulatory compliance verification.
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