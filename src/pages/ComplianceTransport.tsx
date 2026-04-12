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
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import WarningIcon from '@mui/icons-material/Warning';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SaveIcon from '@mui/icons-material/Save';
import LinkIcon from '@mui/icons-material/Link';
import ArticleIcon from '@mui/icons-material/Article';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import { getJobs, getClientById, getPropertyById, getFieldById } from '../services/fieldManagementStore';

interface TransportRecord {
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
  federalCompliance: {
    dangerousGoodsClass: string;
    unNumber: string;
    packagingGroup: string;
    transportCategory: string;
    vehicleType: string;
    driverLicense: string;
    emergencyResponse: string;
    loadingDocuments: boolean;
    segregationCompliance: boolean;
    securityPlan: boolean;
  };
  storageCompliance: {
    storageType: string;
    temperatureControl: boolean;
    ventilationAdequate: boolean;
    spillContainment: boolean;
    fireProtection: string;
    unauthorizedAccess: boolean;
    inventoryTracking: boolean;
    inspectionFrequency: string;
    wasteDisposal: string;
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

const STATE_TRANSPORT_REQUIREMENTS: Record<string, {
  authority: string;
  requirements: string[];
  forms: StateFormField[];
}> = {
  NSW: {
    authority: 'Transport for NSW & SafeWork NSW',
    requirements: [
      'Dangerous goods transport license',
      'Vehicle registration for dangerous goods',
      'Driver dangerous goods license',
      'Load restraint compliance',
      'Route approval for restricted areas',
      'Emergency response documentation',
    ],
    forms: [
      { name: 'transport_license', label: 'Dangerous goods transport license number', type: 'text', required: true },
      { name: 'vehicle_registration', label: 'Vehicle dangerous goods registration', type: 'text', required: true },
      { name: 'route_approved', label: 'Route approved for dangerous goods transport', type: 'checkbox', required: true },
      { name: 'emergency_kit', label: 'Emergency response kit on board', type: 'checkbox', required: true },
    ],
  },
  VIC: {
    authority: 'VicRoads & WorkSafe Victoria',
    requirements: [
      'Dangerous goods transport permit',
      'Commercial vehicle operation license',
      'Chain of responsibility compliance',
      'Vehicle safety standards',
      'Driver competency certification',
      'Load manifest documentation',
    ],
    forms: [
      { name: 'transport_permit', label: 'Transport permit number', type: 'text', required: true },
      { name: 'chain_responsibility', label: 'Chain of responsibility documented', type: 'checkbox', required: true },
      { name: 'safety_standards', label: 'Vehicle meets safety standards', type: 'checkbox', required: true },
    ],
  },
  QLD: {
    authority: 'Department of Transport and Main Roads Queensland',
    requirements: [
      'Dangerous goods driver license',
      'Load restraint certification',
      'Vehicle modification approval',
      'Security sensitive dangerous goods clearance',
      'Marine transport compliance (if applicable)',
      'Fatigue management plan',
    ],
    forms: [
      { name: 'driver_license_qld', label: 'Dangerous goods driver license number', type: 'text', required: true },
      { name: 'security_clearance', label: 'Security clearance number (if required)', type: 'text', required: false },
      { name: 'fatigue_plan', label: 'Fatigue management plan implemented', type: 'checkbox', required: true },
    ],
  },
  SA: {
    authority: 'Department for Infrastructure and Transport SA',
    requirements: [
      'Dangerous goods transport authorization',
      'Vehicle compliance certificate',
      'Driver training certification',
      'Emergency procedure plan',
      'Insurance coverage verification',
      'Load documentation compliance',
    ],
    forms: [
      { name: 'transport_auth', label: 'Transport authorization number', type: 'text', required: true },
      { name: 'insurance_verified', label: 'Insurance coverage verified', type: 'checkbox', required: true },
      { name: 'emergency_procedures', label: 'Emergency procedures documented', type: 'checkbox', required: true },
    ],
  },
  WA: {
    authority: 'Department of Transport Western Australia',
    requirements: [
      'Dangerous goods vehicle license',
      'Driver dangerous goods endorsement',
      'Security plan compliance',
      'Vehicle inspection certificate',
      'Emergency response plan',
      'Communication equipment check',
    ],
    forms: [
      { name: 'vehicle_license_wa', label: 'Vehicle license number', type: 'text', required: true },
      { name: 'security_plan_wa', label: 'Security plan approved', type: 'checkbox', required: true },
      { name: 'communication_check', label: 'Communication equipment tested', type: 'checkbox', required: true },
    ],
  },
  TAS: {
    authority: 'Department of State Growth Tasmania',
    requirements: [
      'Transport operator accreditation',
      'Vehicle compliance inspection',
      'Driver competency assessment',
      'Environmental protection measures',
      'Community safety protocols',
      'Documentation management system',
    ],
    forms: [
      { name: 'operator_accreditation', label: 'Transport operator accreditation number', type: 'text', required: true },
      { name: 'environmental_measures', label: 'Environmental protection measures in place', type: 'checkbox', required: true },
    ],
  },
  NT: {
    authority: 'Department of Infrastructure, Planning and Logistics',
    requirements: [
      'Commercial vehicle registration',
      'Dangerous goods endorsement',
      'Remote area transport protocol',
      'Aboriginal land transit permits',
      'Emergency communication plan',
      'Water and fuel management',
    ],
    forms: [
      { name: 'remote_protocol', label: 'Remote area transport protocol followed', type: 'checkbox', required: true },
      { name: 'aboriginal_permits', label: 'Aboriginal land transit permits (if required)', type: 'text', required: false },
      { name: 'emergency_comms', label: 'Emergency communication plan active', type: 'checkbox', required: true },
    ],
  },
  ACT: {
    authority: 'Transport Canberra and City Services',
    requirements: [
      'ACT dangerous goods transport permit',
      'Vehicle safety compliance',
      'Driver certification verification',
      'Urban transport protocols',
      'Environmental impact assessment',
      'Community notification requirements',
    ],
    forms: [
      { name: 'transport_permit_act', label: 'ACT transport permit number', type: 'text', required: true },
      { name: 'urban_protocols', label: 'Urban transport protocols followed', type: 'checkbox', required: true },
      { name: 'community_notified', label: 'Community notification completed (if required)', type: 'checkbox', required: false },
    ],
  },
};

export default function ComplianceTransport() {
  const theme = useTheme();
  const [selectedState, setSelectedState] = useState<string>('');
  const [federalData, setFederalData] = useState({
    dangerousGoodsClass: '',
    unNumber: '',
    packagingGroup: '',
    transportCategory: '',
    vehicleType: '',
    driverLicense: '',
    emergencyResponse: '',
    loadingDocuments: false,
    segregationCompliance: false,
    securityPlan: false,
  });
  const [storageData, setStorageData] = useState({
    storageType: '',
    temperatureControl: false,
    ventilationAdequate: false,
    spillContainment: false,
    fireProtection: '',
    unauthorizedAccess: false,
    inventoryTracking: false,
    inspectionFrequency: '',
    wasteDisposal: '',
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

  const handleFederalChange = (field: string, value: any) => {
    setFederalData(prev => ({ ...prev, [field]: value }));
  };

  const handleStorageChange = (field: string, value: any) => {
    setStorageData(prev => ({ ...prev, [field]: value }));
  };

  const handleStateDataChange = (field: string, value: any) => {
    setStateData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    const selectedJob = availableJobs.find(job => job.id === selectedJobId);

    const record: TransportRecord = {
      id: `transport-${Date.now()}`,
      createdAt: new Date().toISOString(),
      state: selectedState,
      jobId: selectedJobId || undefined,
      jobDetails: selectedJob ? {
        clientName: selectedJob.clientName,
        propertyName: selectedJob.propertyName,
        fieldName: selectedJob.fieldName,
        jobDate: selectedJob.dateSprayed,
      } : undefined,
      federalCompliance: federalData,
      storageCompliance: storageData,
      stateCompliance: stateData,
      operatorNotes,
      isLocked: false,
    };

    // Save to localStorage (replace with proper backend integration)
    const existingRecords = JSON.parse(localStorage.getItem('transport-records') || '[]');
    existingRecords.push(record);
    localStorage.setItem('transport-records', JSON.stringify(existingRecords));

    setSaveMessage('Transport compliance record saved successfully');
    setTimeout(() => setSaveMessage(''), 3000);
  };

  const handleSignOff = (signature: string) => {
    if (!selectedJobId) {
      setSaveMessage('Please save the record first');
      setTimeout(() => setSaveMessage(''), 3000);
      return;
    }

    const existingRecords = JSON.parse(localStorage.getItem('transport-records') || '[]');
    const recordIndex = existingRecords.findIndex((r: any) => r.jobId === selectedJobId);

    if (recordIndex >= 0) {
      existingRecords[recordIndex].signedOff = {
        signedAt: new Date().toISOString(),
        signedBy: 'Current User', // Replace with actual user
        signature,
        ipAddress: 'xxx.xxx.xxx.xxx', // Replace with actual IP
      };
      existingRecords[recordIndex].isLocked = true;

      localStorage.setItem('transport-records', JSON.stringify(existingRecords));
      setSaveMessage('Transport compliance record signed off and locked');
      setTimeout(() => setSaveMessage(''), 3000);
      setShowSignOff(false);
    }
  };

  const stateRequirements = selectedState ? STATE_TRANSPORT_REQUIREMENTS[selectedState as keyof typeof STATE_TRANSPORT_REQUIREMENTS] : null;

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
          <LocalShippingIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Typography variant="h4" sx={{ fontWeight: 800, color: 'primary.dark' }}>
            Chemical Transport & Storage Compliance
          </Typography>
        </Box>
        <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 800 }}>
          Ensure compliance with dangerous goods transport regulations and chemical storage requirements for agricultural operations.
        </Typography>
      </Box>

      {/* Regulatory Disclaimer */}
      <Alert
        severity="warning"
        icon={<WarningIcon />}
        sx={{ mb: 4, borderRadius: '12px' }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
          Transport & Storage Compliance Notice
        </Typography>
        <Typography variant="body2">
          Transport of dangerous goods requires specific licensing, training, and vehicle compliance.
          Storage facilities must meet safety, environmental, and security standards.
          Always verify current requirements with relevant authorities.
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
                <em>No job selected - standalone transport record</em>
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

      {/* Federal Transport Compliance */}
      <Card elevation={0} sx={cardStyle}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
            <LocalShippingIcon sx={{ color: 'primary.main', fontSize: 24 }} />
            <Typography variant="h5" sx={{ fontWeight: 700, color: 'primary.dark' }}>
              Federal Transport Compliance (ADG Code)
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
            Australian Dangerous Goods Code requirements for transport of agricultural chemicals.
          </Typography>

          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 6 }}>
              <FormControl fullWidth required>
                <InputLabel>Dangerous Goods Class</InputLabel>
                <Select
                  value={federalData.dangerousGoodsClass}
                  onChange={(e) => handleFederalChange('dangerousGoodsClass', e.target.value)}
                  label="Dangerous Goods Class"
                >
                  <MenuItem value="Class 3">Class 3 - Flammable Liquids</MenuItem>
                  <MenuItem value="Class 6.1">Class 6.1 - Toxic Substances</MenuItem>
                  <MenuItem value="Class 8">Class 8 - Corrosive Substances</MenuItem>
                  <MenuItem value="Class 9">Class 9 - Miscellaneous Dangerous Goods</MenuItem>
                  <MenuItem value="Non-DG">Non-Dangerous Goods</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="UN Number"
                value={federalData.unNumber}
                onChange={(e) => handleFederalChange('unNumber', e.target.value)}
                helperText="UN identification number for the chemical"
                placeholder="e.g., UN3082"
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <FormControl fullWidth>
                <InputLabel>Packaging Group</InputLabel>
                <Select
                  value={federalData.packagingGroup}
                  onChange={(e) => handleFederalChange('packagingGroup', e.target.value)}
                  label="Packaging Group"
                >
                  <MenuItem value="I">Group I - Great Danger</MenuItem>
                  <MenuItem value="II">Group II - Medium Danger</MenuItem>
                  <MenuItem value="III">Group III - Minor Danger</MenuItem>
                  <MenuItem value="N/A">Not Applicable</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <FormControl fullWidth required>
                <InputLabel>Transport Category</InputLabel>
                <Select
                  value={federalData.transportCategory}
                  onChange={(e) => handleFederalChange('transportCategory', e.target.value)}
                  label="Transport Category"
                >
                  <MenuItem value="Category 1">Category 1 - Unlimited</MenuItem>
                  <MenuItem value="Category 2">Category 2 - Limited</MenuItem>
                  <MenuItem value="Category 3">Category 3 - Very Limited</MenuItem>
                  <MenuItem value="Category 4">Category 4 - Prohibited</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Vehicle Type/Registration"
                value={federalData.vehicleType}
                onChange={(e) => handleFederalChange('vehicleType', e.target.value)}
                required
                helperText="Vehicle registration and type"
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Driver License Number"
                value={federalData.driverLicense}
                onChange={(e) => handleFederalChange('driverLicense', e.target.value)}
                required
                helperText="Dangerous goods driver license"
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                multiline
                rows={2}
                label="Emergency Response Information"
                value={federalData.emergencyResponse}
                onChange={(e) => handleFederalChange('emergencyResponse', e.target.value)}
                required
                helperText="Emergency procedures and contact information"
              />
            </Grid>

            {/* Compliance Checkboxes */}
            <Grid size={{ xs: 12 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 2, mt: 2 }}>
                Federal Compliance Checklist
              </Typography>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Checkbox
                    checked={federalData.loadingDocuments}
                    onChange={(e) => handleFederalChange('loadingDocuments', e.target.checked)}
                    required
                  />
                  <Typography variant="body2">
                    Loading documents and dangerous goods declarations completed and available
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Checkbox
                    checked={federalData.segregationCompliance}
                    onChange={(e) => handleFederalChange('segregationCompliance', e.target.checked)}
                    required
                  />
                  <Typography variant="body2">
                    Segregation and separation requirements followed as per ADG Code
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Checkbox
                    checked={federalData.securityPlan}
                    onChange={(e) => handleFederalChange('securityPlan', e.target.checked)}
                    required
                  />
                  <Typography variant="body2">
                    Security plan implemented and vehicle security measures in place
                  </Typography>
                </Box>
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Storage Compliance */}
      <Card elevation={0} sx={cardStyle}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
            <ArticleIcon sx={{ color: 'primary.main', fontSize: 24 }} />
            <Typography variant="h5" sx={{ fontWeight: 700, color: 'primary.dark' }}>
              Chemical Storage Compliance
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
              <FormControl fullWidth required>
                <InputLabel>Storage Facility Type</InputLabel>
                <Select
                  value={storageData.storageType}
                  onChange={(e) => handleStorageChange('storageType', e.target.value)}
                  label="Storage Facility Type"
                >
                  <MenuItem value="purpose-built">Purpose-built Chemical Store</MenuItem>
                  <MenuItem value="converted-building">Converted Building</MenuItem>
                  <MenuItem value="shipping-container">Shipping Container</MenuItem>
                  <MenuItem value="shed">Farm Shed</MenuItem>
                  <MenuItem value="warehouse">Commercial Warehouse</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <FormControl fullWidth required>
                <InputLabel>Fire Protection System</InputLabel>
                <Select
                  value={storageData.fireProtection}
                  onChange={(e) => handleStorageChange('fireProtection', e.target.value)}
                  label="Fire Protection System"
                >
                  <MenuItem value="sprinkler">Automatic Sprinkler System</MenuItem>
                  <MenuItem value="foam">Foam Suppression System</MenuItem>
                  <MenuItem value="extinguishers">Portable Fire Extinguishers</MenuItem>
                  <MenuItem value="none">No Fire Protection</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <FormControl fullWidth required>
                <InputLabel>Inspection Frequency</InputLabel>
                <Select
                  value={storageData.inspectionFrequency}
                  onChange={(e) => handleStorageChange('inspectionFrequency', e.target.value)}
                  label="Inspection Frequency"
                >
                  <MenuItem value="daily">Daily</MenuItem>
                  <MenuItem value="weekly">Weekly</MenuItem>
                  <MenuItem value="monthly">Monthly</MenuItem>
                  <MenuItem value="quarterly">Quarterly</MenuItem>
                  <MenuItem value="annually">Annually</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <FormControl fullWidth required>
                <InputLabel>Waste Disposal Method</InputLabel>
                <Select
                  value={storageData.wasteDisposal}
                  onChange={(e) => handleStorageChange('wasteDisposal', e.target.value)}
                  label="Waste Disposal Method"
                >
                  <MenuItem value="licensed-facility">Licensed Waste Facility</MenuItem>
                  <MenuItem value="drumMuster">drumMUSTER Program</MenuItem>
                  <MenuItem value="return-supplier">Return to Supplier</MenuItem>
                  <MenuItem value="on-site">On-site Treatment</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            {/* Storage Compliance Checkboxes */}
            <Grid size={{ xs: 12 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 2, mt: 2 }}>
                Storage Compliance Checklist
              </Typography>

              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                    <Checkbox
                      checked={storageData.temperatureControl}
                      onChange={(e) => handleStorageChange('temperatureControl', e.target.checked)}
                    />
                    <Typography variant="body2">
                      Temperature control maintained within label requirements
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                    <Checkbox
                      checked={storageData.ventilationAdequate}
                      onChange={(e) => handleStorageChange('ventilationAdequate', e.target.checked)}
                    />
                    <Typography variant="body2">
                      Adequate ventilation system in place and functioning
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                    <Checkbox
                      checked={storageData.spillContainment}
                      onChange={(e) => handleStorageChange('spillContainment', e.target.checked)}
                    />
                    <Typography variant="body2">
                      Spill containment system adequate for stored volumes
                    </Typography>
                  </Box>
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                    <Checkbox
                      checked={storageData.unauthorizedAccess}
                      onChange={(e) => handleStorageChange('unauthorizedAccess', e.target.checked)}
                    />
                    <Typography variant="body2">
                      Unauthorized access prevention measures in place
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                    <Checkbox
                      checked={storageData.inventoryTracking}
                      onChange={(e) => handleStorageChange('inventoryTracking', e.target.checked)}
                    />
                    <Typography variant="body2">
                      Chemical inventory tracking system maintained
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* State-Specific Compliance */}
      <Card elevation={0} sx={cardStyle}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
            <LocationOnIcon sx={{ color: 'primary.main', fontSize: 24 }} />
            <Typography variant="h5" sx={{ fontWeight: 700, color: 'primary.dark' }}>
              State Transport Compliance
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
                  Regulatory Authority: {stateRequirements.authority}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 2 }}>
                  Key Requirements for {AUSTRALIAN_STATES.find(s => s.code === selectedState)?.name}:
                </Typography>
                <List dense>
                  {stateRequirements.requirements.map((req, index) => (
                    <ListItem key={index} sx={{ pl: 0 }}>
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <LocalShippingIcon fontSize="small" color="info" />
                      </ListItemIcon>
                      <ListItemText primary={req} />
                    </ListItem>
                  ))}
                </List>
              </Paper>

              <Typography variant="h6" sx={{ fontWeight: 700, mb: 3 }}>
                State Compliance Documentation
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
            Additional Transport & Storage Notes
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={4}
            label="Notes"
            value={operatorNotes}
            onChange={(e) => setOperatorNotes(e.target.value)}
            placeholder="Additional compliance notes, route information, storage conditions, or special handling requirements..."
            helperText="Document any special circumstances, route considerations, or storage conditions"
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

      {/* Sign-off Dialog (reusing same component logic as chemical compliance) */}
      <TransportSignOffDialog
        open={showSignOff}
        onClose={() => setShowSignOff(false)}
        onSignOff={handleSignOff}
        recordData={{
          jobDetails: selectedJobId ? availableJobs.find(j => j.id === selectedJobId) : null,
          state: selectedState,
          federalCompliance: federalData,
          storageCompliance: storageData,
          stateCompliance: stateData,
          operatorNotes,
        }}
      />
    </Box>
  );
}

// Sign-off Dialog Component
interface TransportSignOffDialogProps {
  open: boolean;
  onClose: () => void;
  onSignOff: (signature: string) => void;
  recordData: any;
}

function TransportSignOffDialog({ open, onClose, onSignOff, recordData }: TransportSignOffDialogProps) {
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
          Transport Compliance Sign-off
        </Box>
      </DialogTitle>
      <DialogContent sx={{ p: 4 }}>
        <Alert severity="warning" sx={{ mb: 3, borderRadius: '8px' }}>
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
            Final Sign-off Warning
          </Typography>
          <Typography variant="body2">
            Once signed off, this transport compliance record will be permanently locked and cannot be modified.
            Please review all information carefully before proceeding.
          </Typography>
        </Alert>

        {/* Record Summary */}
        <Paper sx={{ p: 3, mb: 3, bgcolor: 'grey.50', borderRadius: '8px' }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
            Record Summary
          </Typography>

          <Grid container spacing={2}>
            <Grid size={{ xs: 6 }}>
              <Typography variant="body2">
                <strong>State:</strong> {recordData.state || 'Not selected'}
              </Typography>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <Typography variant="body2">
                <strong>DG Class:</strong> {recordData.federalCompliance.dangerousGoodsClass || 'Not specified'}
              </Typography>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <Typography variant="body2">
                <strong>Vehicle:</strong> {recordData.federalCompliance.vehicleType || 'Not specified'}
              </Typography>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <Typography variant="body2">
                <strong>Storage Type:</strong> {recordData.storageCompliance.storageType || 'Not specified'}
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
            helperText="This serves as your digital signature for this transport compliance record"
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
            I certify that all transport and storage information is accurate and that all dangerous goods transport
            and chemical storage requirements have been met. I understand this record may be used for regulatory audits.
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