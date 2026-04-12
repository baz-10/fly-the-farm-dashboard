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
import DocumentScannerIcon from '@mui/icons-material/DocumentScanner';
import WarningIcon from '@mui/icons-material/Warning';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SaveIcon from '@mui/icons-material/Save';
import LinkIcon from '@mui/icons-material/Link';
import FolderIcon from '@mui/icons-material/Folder';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import ArchiveIcon from '@mui/icons-material/Archive';
import GavelIcon from '@mui/icons-material/Gavel';
import { getJobs, getClientById, getPropertyById, getFieldById } from '../services/fieldManagementStore';

interface DocumentationRecord {
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
  recordKeeping: {
    applicationRecords: boolean;
    chemicalInventory: boolean;
    purchaseRecords: boolean;
    disposalRecords: boolean;
    calibrationRecords: boolean;
    maintenanceRecords: boolean;
    trainingRecords: boolean;
    incidentReports: boolean;
  };
  auditPreparation: {
    documentationSystem: string;
    backupProcedures: boolean;
    accessControls: boolean;
    auditTrail: boolean;
    retentionSchedule: string;
    complianceChecklist: boolean;
    regulatoryContacts: boolean;
    legalSupport: boolean;
  };
  dataManagement: {
    storageMethod: string;
    cloudBackup: boolean;
    encryptionUsed: boolean;
    accessLogging: boolean;
    dataRetention: string;
    privacyCompliance: boolean;
    sharePointAccess: boolean;
    version_control: boolean;
  };
  complianceReporting: {
    quarterlyReports: boolean;
    annualReports: boolean;
    incidentReporting: boolean;
    regulatorySubmissions: boolean;
    internalAudits: boolean;
    externalAudits: boolean;
    corrective_actions: boolean;
    management_review: boolean;
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

const STATE_DOCUMENTATION_REQUIREMENTS: Record<string, {
  authority: string;
  requirements: string[];
  forms: StateFormField[];
}> = {
  NSW: {
    authority: 'NSW EPA & Primary Industries',
    requirements: [
      'Chemical use notification records (annual)',
      'POEO Act documentation requirements',
      'Spray diary maintenance (3 years minimum)',
      'Chemical purchase and disposal records',
      'Training and competency records',
      'Environmental incident reporting',
    ],
    forms: [
      { name: 'chemical_notifications_nsw', label: 'Chemical use notifications submitted', type: 'checkbox', required: true },
      { name: 'spray_diary_nsw', label: 'Spray diary records maintained (3+ years)', type: 'checkbox', required: true },
      { name: 'purchase_records_nsw', label: 'Chemical purchase records retained', type: 'checkbox', required: true },
      { name: 'incident_reports_nsw', label: 'Environmental incident reporting current', type: 'checkbox', required: true },
    ],
  },
  VIC: {
    authority: 'Agriculture Victoria & EPA Victoria',
    requirements: [
      'Agricultural chemical user permit records',
      'Chemical application documentation',
      'Equipment calibration certificates',
      'Worker training and competency records',
      'Chemical inventory and disposal records',
      'Compliance audit documentation',
    ],
    forms: [
      { name: 'acp_records_vic', label: 'ACP permit documentation current', type: 'checkbox', required: true },
      { name: 'application_docs_vic', label: 'Application records properly documented', type: 'checkbox', required: true },
      { name: 'calibration_certs_vic', label: 'Equipment calibration certificates current', type: 'checkbox', required: true },
      { name: 'compliance_audits_vic', label: 'Compliance audit records maintained', type: 'checkbox', required: true },
    ],
  },
  QLD: {
    authority: 'Department of Agriculture Queensland',
    requirements: [
      'Chemical applicator license documentation',
      'Restricted chemical authority records',
      'Application site records and maps',
      'Chemical storage and transport records',
      'Training and continuing education records',
      'Environmental protection compliance',
    ],
    forms: [
      { name: 'license_docs_qld', label: 'Applicator license documentation current', type: 'checkbox', required: true },
      { name: 'restricted_authority_qld', label: 'Restricted chemical authority records', type: 'checkbox', required: false },
      { name: 'site_records_qld', label: 'Application site records and maps maintained', type: 'checkbox', required: true },
      { name: 'continuing_ed_qld', label: 'Continuing education records current', type: 'checkbox', required: true },
    ],
  },
  SA: {
    authority: 'PIRSA & EPA South Australia',
    requirements: [
      'Commercial applicator documentation',
      'Chemical control order compliance records',
      'Native vegetation clearance records',
      'Water protection zone documentation',
      'Professional development records',
      'Insurance and liability documentation',
    ],
    forms: [
      { name: 'commercial_docs_sa', label: 'Commercial applicator documentation', type: 'checkbox', required: true },
      { name: 'control_order_sa', label: 'Chemical control order compliance', type: 'checkbox', required: true },
      { name: 'vegetation_clearance_sa', label: 'Vegetation clearance records (if applicable)', type: 'checkbox', required: false },
      { name: 'water_protection_sa', label: 'Water protection zone documentation', type: 'checkbox', required: true },
    ],
  },
  WA: {
    authority: 'DPIRD Western Australia',
    requirements: [
      'Pest management technician records',
      'Chemical use pattern documentation',
      'Continuing education compliance (40 hrs/3 years)',
      'Chemical disposal and container records',
      'Insurance and bond documentation',
      'Regulatory correspondence records',
    ],
    forms: [
      { name: 'technician_records_wa', label: 'Pest management technician records current', type: 'checkbox', required: true },
      { name: 'use_patterns_wa', label: 'Chemical use pattern documentation', type: 'checkbox', required: true },
      { name: 'continuing_ed_wa', label: 'Continuing education compliance (40 hrs/3 years)', type: 'checkbox', required: true },
      { name: 'disposal_records_wa', label: 'Chemical disposal records maintained', type: 'checkbox', required: true },
    ],
  },
  TAS: {
    authority: 'Department of Primary Industries TAS',
    requirements: [
      'Crop protection permit documentation',
      'Commercial applicator records',
      'Environmental assessment records',
      'Training and competency documentation',
      'Chemical usage and disposal records',
      'Compliance monitoring reports',
    ],
    forms: [
      { name: 'crop_protection_tas', label: 'Crop protection permit records', type: 'checkbox', required: true },
      { name: 'applicator_records_tas', label: 'Commercial applicator documentation', type: 'checkbox', required: true },
      { name: 'environmental_assessment_tas', label: 'Environmental assessment records', type: 'checkbox', required: true },
      { name: 'monitoring_reports_tas', label: 'Compliance monitoring reports', type: 'checkbox', required: true },
    ],
  },
  NT: {
    authority: 'Department of Industry NT',
    requirements: [
      'Chemical user permit documentation',
      'Remote area application records',
      'Cultural heritage consultation records',
      'Environmental protection compliance',
      'Training and competency records',
      'Emergency response documentation',
    ],
    forms: [
      { name: 'user_permit_nt', label: 'Chemical user permit documentation', type: 'checkbox', required: true },
      { name: 'remote_records_nt', label: 'Remote area application records', type: 'checkbox', required: true },
      { name: 'cultural_heritage_nt', label: 'Cultural heritage consultation records', type: 'checkbox', required: false },
      { name: 'emergency_docs_nt', label: 'Emergency response documentation', type: 'checkbox', required: true },
    ],
  },
  ACT: {
    authority: 'EPSDD Australian Capital Territory',
    requirements: [
      'Urban pesticide use documentation',
      'Community notification records',
      'Environmental impact assessments',
      'Business registration documentation',
      'Public liability insurance records',
      'Regulatory compliance monitoring',
    ],
    forms: [
      { name: 'urban_pesticide_act', label: 'Urban pesticide use documentation', type: 'checkbox', required: true },
      { name: 'community_notification_act', label: 'Community notification records', type: 'checkbox', required: true },
      { name: 'impact_assessments_act', label: 'Environmental impact assessments', type: 'checkbox', required: true },
      { name: 'business_registration_act', label: 'Business registration documentation', type: 'checkbox', required: true },
    ],
  },
};

export default function ComplianceDocumentation() {
  const theme = useTheme();
  const [selectedState, setSelectedState] = useState<string>('');
  const [recordKeepingData, setRecordKeepingData] = useState({
    applicationRecords: false,
    chemicalInventory: false,
    purchaseRecords: false,
    disposalRecords: false,
    calibrationRecords: false,
    maintenanceRecords: false,
    trainingRecords: false,
    incidentReports: false,
  });
  const [auditData, setAuditData] = useState({
    documentationSystem: '',
    backupProcedures: false,
    accessControls: false,
    auditTrail: false,
    retentionSchedule: '',
    complianceChecklist: false,
    regulatoryContacts: false,
    legalSupport: false,
  });
  const [dataData, setDataData] = useState({
    storageMethod: '',
    cloudBackup: false,
    encryptionUsed: false,
    accessLogging: false,
    dataRetention: '',
    privacyCompliance: false,
    sharePointAccess: false,
    version_control: false,
  });
  const [reportingData, setReportingData] = useState({
    quarterlyReports: false,
    annualReports: false,
    incidentReporting: false,
    regulatorySubmissions: false,
    internalAudits: false,
    externalAudits: false,
    corrective_actions: false,
    management_review: false,
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

  const handleRecordKeepingChange = (field: string, value: any) => {
    setRecordKeepingData(prev => ({ ...prev, [field]: value }));
  };

  const handleAuditChange = (field: string, value: any) => {
    setAuditData(prev => ({ ...prev, [field]: value }));
  };

  const handleDataChange = (field: string, value: any) => {
    setDataData(prev => ({ ...prev, [field]: value }));
  };

  const handleReportingChange = (field: string, value: any) => {
    setReportingData(prev => ({ ...prev, [field]: value }));
  };

  const handleStateDataChange = (field: string, value: any) => {
    setStateData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    const selectedJob = availableJobs.find(job => job.id === selectedJobId);

    const record: DocumentationRecord = {
      id: `documentation-${Date.now()}`,
      createdAt: new Date().toISOString(),
      state: selectedState,
      jobId: selectedJobId || undefined,
      jobDetails: selectedJob ? {
        clientName: selectedJob.clientName,
        propertyName: selectedJob.propertyName,
        fieldName: selectedJob.fieldName,
        jobDate: selectedJob.dateSprayed,
      } : undefined,
      recordKeeping: recordKeepingData,
      auditPreparation: auditData,
      dataManagement: dataData,
      complianceReporting: reportingData,
      stateCompliance: stateData,
      operatorNotes,
      isLocked: false,
    };

    // Save to localStorage (replace with proper backend integration)
    const existingRecords = JSON.parse(localStorage.getItem('documentation-records') || '[]');
    existingRecords.push(record);
    localStorage.setItem('documentation-records', JSON.stringify(existingRecords));

    setSaveMessage('Documentation compliance record saved successfully');
    setTimeout(() => setSaveMessage(''), 3000);
  };

  const handleSignOff = (signature: string) => {
    if (!selectedJobId) {
      setSaveMessage('Please save the record first');
      setTimeout(() => setSaveMessage(''), 3000);
      return;
    }

    const existingRecords = JSON.parse(localStorage.getItem('documentation-records') || '[]');
    const recordIndex = existingRecords.findIndex((r: any) => r.jobId === selectedJobId);

    if (recordIndex >= 0) {
      existingRecords[recordIndex].signedOff = {
        signedAt: new Date().toISOString(),
        signedBy: 'Current User', // Replace with actual user
        signature,
        ipAddress: 'xxx.xxx.xxx.xxx', // Replace with actual IP
      };
      existingRecords[recordIndex].isLocked = true;

      localStorage.setItem('documentation-records', JSON.stringify(existingRecords));
      setSaveMessage('Documentation compliance record signed off and locked');
      setTimeout(() => setSaveMessage(''), 3000);
      setShowSignOff(false);
    }
  };

  const stateRequirements = selectedState ? STATE_DOCUMENTATION_REQUIREMENTS[selectedState as keyof typeof STATE_DOCUMENTATION_REQUIREMENTS] : null;

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
          <DocumentScannerIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Typography variant="h4" sx={{ fontWeight: 800, color: 'primary.dark' }}>
            Documentation & Audit Trail Management
          </Typography>
        </Box>
        <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 800 }}>
          Comprehensive documentation management and audit trail preparation for regulatory compliance and business continuity.
        </Typography>
      </Box>

      {/* Regulatory Disclaimer */}
      <Alert
        severity="info"
        icon={<DocumentScannerIcon />}
        sx={{ mb: 4, borderRadius: '12px' }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
          Documentation Management Notice
        </Typography>
        <Typography variant="body2">
          Proper documentation and record keeping are essential for regulatory compliance, audit preparation,
          and business protection. Maintain organized, accessible, and defensible records according to
          retention requirements and industry best practices.
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
                <em>No job selected - standalone documentation record</em>
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

      {/* Record Keeping Requirements */}
      <Card elevation={0} sx={cardStyle}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
            <FolderIcon sx={{ color: 'primary.main', fontSize: 24 }} />
            <Typography variant="h5" sx={{ fontWeight: 700, color: 'primary.dark' }}>
              Essential Record Keeping
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
            Mandatory records that must be maintained for regulatory compliance and audit purposes.
          </Typography>

          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                Application & Chemical Records
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Checkbox
                    checked={recordKeepingData.applicationRecords}
                    onChange={(e) => handleRecordKeepingChange('applicationRecords', e.target.checked)}
                    required
                  />
                  <Typography variant="body2">Application records and spray diaries</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Checkbox
                    checked={recordKeepingData.chemicalInventory}
                    onChange={(e) => handleRecordKeepingChange('chemicalInventory', e.target.checked)}
                    required
                  />
                  <Typography variant="body2">Chemical inventory and stock records</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Checkbox
                    checked={recordKeepingData.purchaseRecords}
                    onChange={(e) => handleRecordKeepingChange('purchaseRecords', e.target.checked)}
                    required
                  />
                  <Typography variant="body2">Chemical purchase receipts and invoices</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Checkbox
                    checked={recordKeepingData.disposalRecords}
                    onChange={(e) => handleRecordKeepingChange('disposalRecords', e.target.checked)}
                    required
                  />
                  <Typography variant="body2">Chemical disposal and container records</Typography>
                </Box>
              </Box>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                Equipment & Training Records
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Checkbox
                    checked={recordKeepingData.calibrationRecords}
                    onChange={(e) => handleRecordKeepingChange('calibrationRecords', e.target.checked)}
                    required
                  />
                  <Typography variant="body2">Equipment calibration certificates</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Checkbox
                    checked={recordKeepingData.maintenanceRecords}
                    onChange={(e) => handleRecordKeepingChange('maintenanceRecords', e.target.checked)}
                    required
                  />
                  <Typography variant="body2">Equipment maintenance and service records</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Checkbox
                    checked={recordKeepingData.trainingRecords}
                    onChange={(e) => handleRecordKeepingChange('trainingRecords', e.target.checked)}
                    required
                  />
                  <Typography variant="body2">Staff training and certification records</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Checkbox
                    checked={recordKeepingData.incidentReports}
                    onChange={(e) => handleRecordKeepingChange('incidentReports', e.target.checked)}
                    required
                  />
                  <Typography variant="body2">Incident and near-miss reports</Typography>
                </Box>
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Audit Preparation */}
      <Card elevation={0} sx={cardStyle}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
            <GavelIcon sx={{ color: 'primary.main', fontSize: 24 }} />
            <Typography variant="h5" sx={{ fontWeight: 700, color: 'primary.dark' }}>
              Audit Preparation & Compliance Systems
            </Typography>
          </Box>

          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 6 }}>
              <FormControl fullWidth required>
                <InputLabel>Documentation System</InputLabel>
                <Select
                  value={auditData.documentationSystem}
                  onChange={(e) => handleAuditChange('documentationSystem', e.target.value)}
                  label="Documentation System"
                >
                  <MenuItem value="paper-based">Paper-Based Filing</MenuItem>
                  <MenuItem value="digital-files">Digital File System</MenuItem>
                  <MenuItem value="cloud-storage">Cloud Storage Platform</MenuItem>
                  <MenuItem value="document-management">Document Management System</MenuItem>
                  <MenuItem value="erp-integrated">ERP Integrated System</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <FormControl fullWidth required>
                <InputLabel>Record Retention Schedule</InputLabel>
                <Select
                  value={auditData.retentionSchedule}
                  onChange={(e) => handleAuditChange('retentionSchedule', e.target.value)}
                  label="Record Retention Schedule"
                >
                  <MenuItem value="3-years">3 Years (Minimum)</MenuItem>
                  <MenuItem value="5-years">5 Years</MenuItem>
                  <MenuItem value="7-years">7 Years</MenuItem>
                  <MenuItem value="10-years">10 Years</MenuItem>
                  <MenuItem value="permanent">Permanent Retention</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                System Security & Access
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Checkbox
                    checked={auditData.backupProcedures}
                    onChange={(e) => handleAuditChange('backupProcedures', e.target.checked)}
                    required
                  />
                  <Typography variant="body2">Regular backup procedures implemented</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Checkbox
                    checked={auditData.accessControls}
                    onChange={(e) => handleAuditChange('accessControls', e.target.checked)}
                    required
                  />
                  <Typography variant="body2">Access controls and user permissions managed</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Checkbox
                    checked={auditData.auditTrail}
                    onChange={(e) => handleAuditChange('auditTrail', e.target.checked)}
                    required
                  />
                  <Typography variant="body2">Complete audit trail maintained</Typography>
                </Box>
              </Box>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                Compliance Support
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Checkbox
                    checked={auditData.complianceChecklist}
                    onChange={(e) => handleAuditChange('complianceChecklist', e.target.checked)}
                    required
                  />
                  <Typography variant="body2">Compliance checklist maintained and current</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Checkbox
                    checked={auditData.regulatoryContacts}
                    onChange={(e) => handleAuditChange('regulatoryContacts', e.target.checked)}
                    required
                  />
                  <Typography variant="body2">Regulatory contact database maintained</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Checkbox
                    checked={auditData.legalSupport}
                    onChange={(e) => handleAuditChange('legalSupport', e.target.checked)}
                  />
                  <Typography variant="body2">Legal support arrangements in place</Typography>
                </Box>
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Data Management & Security */}
      <Card elevation={0} sx={cardStyle}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
            <ArchiveIcon sx={{ color: 'primary.main', fontSize: 24 }} />
            <Typography variant="h5" sx={{ fontWeight: 700, color: 'primary.dark' }}>
              Data Management & Security
            </Typography>
          </Box>

          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 6 }}>
              <FormControl fullWidth required>
                <InputLabel>Primary Storage Method</InputLabel>
                <Select
                  value={dataData.storageMethod}
                  onChange={(e) => handleDataChange('storageMethod', e.target.value)}
                  label="Primary Storage Method"
                >
                  <MenuItem value="local-servers">Local Servers</MenuItem>
                  <MenuItem value="cloud-storage">Cloud Storage (AWS/Azure)</MenuItem>
                  <MenuItem value="hybrid-system">Hybrid Cloud/Local</MenuItem>
                  <MenuItem value="managed-service">Managed Service Provider</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <FormControl fullWidth required>
                <InputLabel>Data Retention Policy</InputLabel>
                <Select
                  value={dataData.dataRetention}
                  onChange={(e) => handleDataChange('dataRetention', e.target.value)}
                  label="Data Retention Policy"
                >
                  <MenuItem value="regulatory-minimum">Regulatory Minimum (3 years)</MenuItem>
                  <MenuItem value="extended-5">Extended 5 Years</MenuItem>
                  <MenuItem value="extended-7">Extended 7 Years</MenuItem>
                  <MenuItem value="extended-10">Extended 10 Years</MenuItem>
                  <MenuItem value="business-decision">Based on Business Needs</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                Data Security & Backup
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Checkbox
                    checked={dataData.cloudBackup}
                    onChange={(e) => handleDataChange('cloudBackup', e.target.checked)}
                    required
                  />
                  <Typography variant="body2">Automated cloud backup system</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Checkbox
                    checked={dataData.encryptionUsed}
                    onChange={(e) => handleDataChange('encryptionUsed', e.target.checked)}
                    required
                  />
                  <Typography variant="body2">Data encryption at rest and in transit</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Checkbox
                    checked={dataData.accessLogging}
                    onChange={(e) => handleDataChange('accessLogging', e.target.checked)}
                    required
                  />
                  <Typography variant="body2">Access logging and monitoring</Typography>
                </Box>
              </Box>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                System Integration & Compliance
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Checkbox
                    checked={dataData.privacyCompliance}
                    onChange={(e) => handleDataChange('privacyCompliance', e.target.checked)}
                    required
                  />
                  <Typography variant="body2">Privacy Act compliance implemented</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Checkbox
                    checked={dataData.sharePointAccess}
                    onChange={(e) => handleDataChange('sharePointAccess', e.target.checked)}
                  />
                  <Typography variant="body2">SharePoint or collaboration platform</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Checkbox
                    checked={dataData.version_control}
                    onChange={(e) => handleDataChange('version_control', e.target.checked)}
                    required
                  />
                  <Typography variant="body2">Document version control system</Typography>
                </Box>
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Compliance Reporting */}
      <Card elevation={0} sx={cardStyle}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h5" sx={{ fontWeight: 700, color: 'primary.dark', mb: 3 }}>
            Compliance Reporting & Review
          </Typography>

          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                Regular Reporting
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Checkbox
                    checked={reportingData.quarterlyReports}
                    onChange={(e) => handleReportingChange('quarterlyReports', e.target.checked)}
                  />
                  <Typography variant="body2">Quarterly compliance reports prepared</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Checkbox
                    checked={reportingData.annualReports}
                    onChange={(e) => handleReportingChange('annualReports', e.target.checked)}
                    required
                  />
                  <Typography variant="body2">Annual compliance summary completed</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Checkbox
                    checked={reportingData.incidentReporting}
                    onChange={(e) => handleReportingChange('incidentReporting', e.target.checked)}
                    required
                  />
                  <Typography variant="body2">Incident reporting procedures active</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Checkbox
                    checked={reportingData.regulatorySubmissions}
                    onChange={(e) => handleReportingChange('regulatorySubmissions', e.target.checked)}
                    required
                  />
                  <Typography variant="body2">Required regulatory submissions current</Typography>
                </Box>
              </Box>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                Audits & Reviews
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Checkbox
                    checked={reportingData.internalAudits}
                    onChange={(e) => handleReportingChange('internalAudits', e.target.checked)}
                    required
                  />
                  <Typography variant="body2">Internal compliance audits conducted</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Checkbox
                    checked={reportingData.externalAudits}
                    onChange={(e) => handleReportingChange('externalAudits', e.target.checked)}
                  />
                  <Typography variant="body2">External audit preparation completed</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Checkbox
                    checked={reportingData.corrective_actions}
                    onChange={(e) => handleReportingChange('corrective_actions', e.target.checked)}
                    required
                  />
                  <Typography variant="body2">Corrective action tracking system active</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Checkbox
                    checked={reportingData.management_review}
                    onChange={(e) => handleReportingChange('management_review', e.target.checked)}
                    required
                  />
                  <Typography variant="body2">Management review process implemented</Typography>
                </Box>
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* State-Specific Documentation Requirements */}
      <Card elevation={0} sx={cardStyle}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
            <LocationOnIcon sx={{ color: 'primary.main', fontSize: 24 }} />
            <Typography variant="h5" sx={{ fontWeight: 700, color: 'primary.dark' }}>
              State Documentation Requirements
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
                  Documentation Authority: {stateRequirements.authority}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 2 }}>
                  Key Documentation Requirements for {AUSTRALIAN_STATES.find(s => s.code === selectedState)?.name}:
                </Typography>
                <List dense>
                  {stateRequirements.requirements.map((req, index) => (
                    <ListItem key={index} sx={{ pl: 0 }}>
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <DocumentScannerIcon fontSize="small" color="info" />
                      </ListItemIcon>
                      <ListItemText primary={req} />
                    </ListItem>
                  ))}
                </List>
              </Paper>

              <Typography variant="h6" sx={{ fontWeight: 700, mb: 3 }}>
                State Documentation Compliance
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
            Additional Documentation Notes
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={4}
            label="Notes"
            value={operatorNotes}
            onChange={(e) => setOperatorNotes(e.target.value)}
            placeholder="Documentation system details, audit findings, system improvements, or compliance challenges..."
            helperText="Document system capabilities, audit results, or areas for improvement"
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
      <DocumentationSignOffDialog
        open={showSignOff}
        onClose={() => setShowSignOff(false)}
        onSignOff={handleSignOff}
        recordData={{
          jobDetails: selectedJobId ? availableJobs.find(j => j.id === selectedJobId) : null,
          state: selectedState,
          recordKeeping: recordKeepingData,
          auditPreparation: auditData,
          dataManagement: dataData,
          complianceReporting: reportingData,
          operatorNotes,
        }}
      />
    </Box>
  );
}

// Sign-off Dialog Component
interface DocumentationSignOffDialogProps {
  open: boolean;
  onClose: () => void;
  onSignOff: (signature: string) => void;
  recordData: any;
}

function DocumentationSignOffDialog({ open, onClose, onSignOff, recordData }: DocumentationSignOffDialogProps) {
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
          Documentation Compliance Sign-off
        </Box>
      </DialogTitle>
      <DialogContent sx={{ p: 4 }}>
        <Alert severity="warning" sx={{ mb: 3, borderRadius: '8px' }}>
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
            Final Documentation Sign-off Warning
          </Typography>
          <Typography variant="body2">
            Once signed off, this documentation compliance record will be permanently locked and cannot be modified.
            Ensure all documentation systems are properly implemented and maintained before proceeding.
          </Typography>
        </Alert>

        {/* Record Summary */}
        <Paper sx={{ p: 3, mb: 3, bgcolor: 'grey.50', borderRadius: '8px' }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
            Documentation Record Summary
          </Typography>

          <Grid container spacing={2}>
            <Grid size={{ xs: 6 }}>
              <Typography variant="body2">
                <strong>State:</strong> {recordData.state || 'Not selected'}
              </Typography>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <Typography variant="body2">
                <strong>Documentation System:</strong> {recordData.auditPreparation.documentationSystem || 'Not specified'}
              </Typography>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <Typography variant="body2">
                <strong>Storage Method:</strong> {recordData.dataManagement.storageMethod || 'Not specified'}
              </Typography>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <Typography variant="body2">
                <strong>Backup System:</strong> {recordData.dataManagement.cloudBackup ? 'Active' : 'Not configured'}
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
            helperText="This serves as your digital signature for this documentation compliance record"
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
            I certify that all documentation systems are properly implemented, records are maintained according to
            requirements, and audit trail systems are functioning correctly. I understand this record may be used
            for compliance audits and regulatory verification.
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