import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  TextField,
  Button,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Alert,
  Divider,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  LinearProgress,
  Tab,
  Tabs
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  Edit,
  Save,
  Cancel,
  ExpandMore,
  Warning,
  Security,
  CheckCircle,
  Person,
  Assignment,
  Emergency,
  Add,
  Delete,
  Agriculture,
  Map,
  Engineering,
  Science,
  Visibility,
  Build
} from '@mui/icons-material';

import {
  JSASystemRecord,
  JSAHazard,
  IndustryType,
  LikelihoodLevel,
  ConsequenceLevel,
  RiskLevel,
  calculateRiskLevel,
  requiresCRPApproval,
  getRiskColor,
  JSATemplateFactory
} from '../types/jsa';
import { isValidJSASystemRecord } from '../utils/typeGuards';
import { useJSAErrorHandler, ErrorState } from '../utils/errorHandling';
import {
  sanitizePersonName,
  sanitizeLicenseNumber,
  sanitizeContactDetails,
  sanitizeHazardDescription
} from '../utils/inputSanitization';
import { useMemoizedJSACalculation } from '../utils/performanceOptimization';

interface JSAIndustrySpecificProps {
  jsa: JSASystemRecord;
  industryType: IndustryType;
  onUpdate: (jsa: JSASystemRecord) => void;
  onComplete: (jsa: JSASystemRecord) => void;
  onCancel: () => void;
}

const LIKELIHOOD_OPTIONS: { value: LikelihoodLevel; label: string; description: string }[] = [
  { value: 'low', label: 'Low', description: 'Unlikely to occur during normal operations' },
  { value: 'medium', label: 'Medium', description: 'May occur during operations' },
  { value: 'high', label: 'High', description: 'Likely to occur during operations' }
];

const CONSEQUENCE_OPTIONS: { value: ConsequenceLevel; label: string; description: string }[] = [
  { value: 'minor', label: 'Minor', description: 'Minor injury, small financial loss' },
  { value: 'moderate', label: 'Moderate', description: 'Moderate injury, significant financial loss' },
  { value: 'major', label: 'Major', description: 'Major injury, large financial loss' },
  { value: 'catastrophic', label: 'Catastrophic', description: 'Fatality, extreme financial loss' }
];

const INDUSTRY_INFO = {
  'crop-spraying': {
    name: 'Crop Spraying',
    icon: <Agriculture />,
    description: 'Specialized safety analysis for agricultural chemical application operations',
    color: '#4caf50',
    specificConsiderations: [
      'Chemical handling and exposure risks',
      'Drift prevention and buffer zones',
      'Environmental protection requirements',
      'Payload and aircraft performance impacts',
      'Tank contamination prevention'
    ]
  },
  'surveying': {
    name: 'Surveying & Mapping',
    icon: <Map />,
    description: 'Specialized safety analysis for data collection and mapping operations',
    color: '#2196f3',
    specificConsiderations: [
      'Privacy and data protection requirements',
      'Equipment calibration and accuracy',
      'Data security and storage protocols',
      'Weather impact on survey quality',
      'Restricted area compliance'
    ]
  },
  'inspections': {
    name: 'Inspections',
    icon: <Engineering />,
    description: 'Specialized safety analysis for infrastructure inspection operations',
    color: '#ff9800',
    specificConsiderations: [
      'Infrastructure stability and hazards',
      'Electrical system safety requirements',
      'Confined space operation protocols',
      'Emergency access and evacuation plans',
      'Thermal imaging equipment considerations'
    ]
  }
};

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`industry-tabpanel-${index}`}
      aria-labelledby={`industry-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

export default function JSAIndustrySpecific({ jsa, industryType, onUpdate, onComplete, onCancel }: JSAIndustrySpecificProps) {
  const theme = useTheme();
  const errorHandler = useJSAErrorHandler();

  const [currentJSA, setCurrentJSA] = useState<JSASystemRecord>(jsa);
  const [editingHazard, setEditingHazard] = useState<JSAHazard | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [errorState, setErrorState] = useState<ErrorState>(errorHandler.clearErrorState());
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [currentTab, setCurrentTab] = useState(0);

  const industryInfo = INDUSTRY_INFO[industryType];

  // Initialize with industry-specific hazards if empty
  useEffect(() => {
    if (currentJSA.hazards.length === 0) {
      const industryHazards = JSATemplateFactory.createIndustryTemplate(industryType);
      updateJSA({
        ...currentJSA,
        hazards: industryHazards,
        status: 'in-progress'
      });
    }
  }, [industryType]);

  // Update JSA and recalculate overall risk
  const updateJSA = useCallback((updatedJSA: JSASystemRecord) => {
    // Calculate overall risk
    const hazards = updatedJSA.hazards;
    const riskLevels = hazards.map(h => h.riskLevel);
    const highestRisk = riskLevels.includes('extreme') ? 'extreme' :
                       riskLevels.includes('high') ? 'high' :
                       riskLevels.includes('medium') ? 'medium' : 'low';

    const overallRisk = {
      highestRiskLevel: highestRisk as RiskLevel,
      totalHazards: hazards.length,
      highRiskHazards: hazards.filter(h => h.riskLevel === 'high').length,
      extremeRiskHazards: hazards.filter(h => h.riskLevel === 'extreme').length,
      requiresCRPApproval: requiresCRPApproval(highestRisk as RiskLevel)
    };

    const finalJSA = {
      ...updatedJSA,
      overallRisk,
      updatedAt: new Date().toISOString()
    };

    setCurrentJSA(finalJSA);
    onUpdate(finalJSA);
  }, [onUpdate]);

  // Update hazard risk calculation
  const updateHazardRisk = useCallback((hazard: JSAHazard, likelihood: LikelihoodLevel, consequence: ConsequenceLevel): JSAHazard => {
    const riskLevel = calculateRiskLevel(likelihood, consequence);
    return {
      ...hazard,
      likelihood,
      consequence,
      riskLevel,
      residualRisk: riskLevel === 'extreme' ? 'high' : riskLevel === 'high' ? 'medium' : 'low'
    };
  }, []);

  // Handle hazard editing
  const handleEditHazard = (hazard: JSAHazard) => {
    setEditingHazard({ ...hazard });
    setEditDialogOpen(true);
  };

  // Save hazard changes
  const handleSaveHazard = () => {
    if (!editingHazard) return;

    const updatedHazards = currentJSA.hazards.map(h =>
      h.id === editingHazard.id ? editingHazard : h
    );

    updateJSA({
      ...currentJSA,
      hazards: updatedHazards
    });

    setEditDialogOpen(false);
    setEditingHazard(null);
  };

  // Update hazard field
  const updateHazardField = (field: keyof JSAHazard, value: any) => {
    if (!editingHazard) return;

    let updatedHazard = { ...editingHazard, [field]: value };

    // Recalculate risk if likelihood or consequence changed
    if (field === 'likelihood' || field === 'consequence') {
      updatedHazard = updateHazardRisk(
        updatedHazard,
        updatedHazard.likelihood,
        updatedHazard.consequence
      );
    }

    setEditingHazard(updatedHazard);
  };

  // Add/remove/update mitigations
  const addMitigation = () => {
    if (!editingHazard) return;
    setEditingHazard({
      ...editingHazard,
      mitigations: [...editingHazard.mitigations, '']
    });
  };

  const removeMitigation = (index: number) => {
    if (!editingHazard) return;
    const newMitigations = editingHazard.mitigations.filter((_, i) => i !== index);
    setEditingHazard({
      ...editingHazard,
      mitigations: newMitigations
    });
  };

  const updateMitigation = (index: number, value: string) => {
    if (!editingHazard) return;
    const newMitigations = [...editingHazard.mitigations];
    newMitigations[index] = value;
    setEditingHazard({
      ...editingHazard,
      mitigations: newMitigations
    });
  };

  // Update responsible person
  const updateResponsiblePerson = (field: string, value: string) => {
    updateJSA({
      ...currentJSA,
      responsiblePerson: {
        ...currentJSA.responsiblePerson,
        [field]: value
      }
    });
  };

  // Update emergency contacts
  const updateEmergencyContact = (field: string, value: string) => {
    updateJSA({
      ...currentJSA,
      emergencyContacts: {
        ...currentJSA.emergencyContacts,
        primary: {
          ...currentJSA.emergencyContacts.primary,
          [field]: value
        }
      }
    });
  };

  // Validate JSA completeness
  const validateJSA = useCallback((): string[] => {
    const errors: string[] = [];

    // Check responsible person info
    if (!currentJSA.responsiblePerson.name) errors.push('Responsible person name is required');
    if (!currentJSA.responsiblePerson.licenseNumber) errors.push('License number is required');

    // Check emergency contacts
    if (!currentJSA.emergencyContacts.primary.name) errors.push('Primary emergency contact name is required');
    if (!currentJSA.emergencyContacts.primary.phone) errors.push('Primary emergency contact phone is required');

    // Check hazards have mitigations
    currentJSA.hazards.forEach(hazard => {
      if (hazard.mitigations.length === 0 || hazard.mitigations.some(m => !m.trim())) {
        errors.push(`Hazard "${hazard.title}" requires at least one mitigation strategy`);
      }
    });

    // Check high-risk hazards have CRP approval
    const highRiskHazards = currentJSA.hazards.filter(h => h.riskLevel === 'high' || h.riskLevel === 'extreme');
    if (highRiskHazards.length > 0 && !currentJSA.signatures.crp) {
      errors.push('High/Extreme risk hazards require CRP review and approval');
    }

    // Industry-specific validations
    switch (industryType) {
      case 'crop-spraying':
        if (!currentJSA.hazards.some(h => h.category === 'chemical')) {
          errors.push('Chemical-related hazards must be addressed for crop spraying operations');
        }
        break;
      case 'surveying':
        if (!currentJSA.hazards.some(h => h.category === 'privacy')) {
          errors.push('Privacy and data protection hazards must be addressed for surveying operations');
        }
        break;
      case 'inspections':
        if (!currentJSA.hazards.some(h => h.category === 'infrastructure' || h.category === 'electrical')) {
          errors.push('Infrastructure or electrical hazards must be addressed for inspection operations');
        }
        break;
    }

    return errors;
  }, [currentJSA, industryType]);

  // Complete JSA
  const handleCompleteJSA = () => {
    const errors = validateJSA();
    setValidationErrors(errors);

    if (errors.length === 0) {
      const completedJSA = {
        ...currentJSA,
        status: currentJSA.overallRisk.requiresCRPApproval ? 'completed' : 'approved',
        completedDate: new Date().toISOString(),
        signatures: {
          ...currentJSA.signatures,
          pilot: {
            ...currentJSA.signatures.pilot,
            signedAt: new Date().toISOString(),
            signature: 'Digital signature applied'
          }
        }
      } as JSASystemRecord;

      onComplete(completedJSA);
    }
  };

  // Get risk chip color
  const getRiskChipColor = (risk: RiskLevel) => {
    switch (risk) {
      case 'low': return 'success';
      case 'medium': return 'warning';
      case 'high': return 'error';
      case 'extreme': return 'secondary';
      default: return 'default';
    }
  };

  // Get hazards by category for display
  const getHazardsByCategory = () => {
    const categories = Array.from(new Set(currentJSA.hazards.map(h => h.category)));
    return categories.map(category => ({
      category,
      hazards: currentJSA.hazards.filter(h => h.category === category)
    }));
  };

  return (
    <Box sx={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Header with Industry Info */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container alignItems="center" spacing={2}>
            <Grid sx={{ flexGrow: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Box sx={{ mr: 2, color: industryInfo.color }}>
                  {industryInfo.icon}
                </Box>
                <Box>
                  <Typography variant="h5" gutterBottom>
                    {industryInfo.name} JSA - {currentJSA.jsaNumber}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {industryInfo.description}
                  </Typography>
                </Box>
              </Box>
            </Grid>
            <Grid>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Chip
                  label={currentJSA.status.toUpperCase()}
                  color={currentJSA.status === 'approved' ? 'success' : 'warning'}
                />
                <Chip
                  label={`Overall Risk: ${currentJSA.overallRisk.highestRiskLevel.toUpperCase()}`}
                  color={getRiskChipColor(currentJSA.overallRisk.highestRiskLevel)}
                />
              </Box>
            </Grid>
          </Grid>

          {/* Industry-Specific Considerations */}
          <Paper sx={{ p: 2, bgcolor: `${industryInfo.color}10`, border: `1px solid ${industryInfo.color}30` }}>
            <Typography variant="h6" gutterBottom color={industryInfo.color}>
              Industry-Specific Safety Considerations
            </Typography>
            <Grid container spacing={1}>
              {industryInfo.specificConsiderations.map((consideration, index) => (
                <Grid size={{ xs: 12, md: 6 }} key={index}>
                  <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center' }}>
                    <CheckCircle sx={{ fontSize: 16, mr: 1, color: industryInfo.color }} />
                    {consideration}
                  </Typography>
                </Grid>
              ))}
            </Grid>
          </Paper>

          {/* Progress Indicator */}
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Completion Progress
            </Typography>
            <LinearProgress
              variant="determinate"
              value={(currentJSA.hazards.filter(h => h.mitigations.length > 0).length / currentJSA.hazards.length) * 100}
              sx={{ height: 8, borderRadius: 4, bgcolor: `${industryInfo.color}20` }}
            />
          </Box>
        </CardContent>
      </Card>

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <Alert severity="error" sx={{ mb: 3 }}>
          <Typography variant="body2" fontWeight="bold">Please address the following issues:</Typography>
          <ul style={{ marginTop: 8, marginBottom: 0 }}>
            {validationErrors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        </Alert>
      )}

      {/* CRP Approval Required Warning */}
      {currentJSA.overallRisk.requiresCRPApproval && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          <Typography variant="body2" fontWeight="bold">CRP Approval Required</Typography>
          This JSA contains high or extreme risk hazards that require Chief Remote Pilot review and approval before mission execution.
        </Alert>
      )}

      {/* Tabs for different sections */}
      <Card sx={{ mb: 3 }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs
            value={currentTab}
            onChange={(e, newValue) => setCurrentTab(newValue)}
            aria-label="JSA sections"
          >
            <Tab label="Personnel & Contacts" icon={<Person />} />
            <Tab label="Safety Analysis" icon={<Security />} />
            <Tab label="Review & Complete" icon={<CheckCircle />} />
          </Tabs>
        </Box>

        {/* Personnel & Contacts Tab */}
        <TabPanel value={currentTab} index={0}>
          <Grid container spacing={3}>
            <Grid size={{ xs: 12 }}>
              <Typography variant="h6" gutterBottom>Responsible Person Information</Typography>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    label="Name"
                    value={currentJSA.responsiblePerson.name}
                    onChange={(e) => {
                      const sanitizedName = sanitizePersonName(e.target.value);
                      updateResponsiblePerson('name', sanitizedName);
                    }}
                    fullWidth
                    required
                    error={!!fieldErrors['responsiblePerson.name']}
                    helperText={fieldErrors['responsiblePerson.name'] || 'Required for regulatory compliance'}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    label="License Number"
                    value={currentJSA.responsiblePerson.licenseNumber}
                    onChange={(e) => {
                      const sanitizedLicense = sanitizeLicenseNumber(e.target.value);
                      updateResponsiblePerson('licenseNumber', sanitizedLicense);
                    }}
                    fullWidth
                    required
                    error={!!fieldErrors['responsiblePerson.licenseNumber']}
                    helperText={fieldErrors['responsiblePerson.licenseNumber'] || 'Aviation license required'}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    label="Company"
                    value={currentJSA.responsiblePerson.company}
                    onChange={(e) => updateResponsiblePerson('company', e.target.value)}
                    fullWidth
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    label="Contact Details"
                    value={currentJSA.responsiblePerson.contactDetails}
                    onChange={(e) => updateResponsiblePerson('contactDetails', e.target.value)}
                    fullWidth
                  />
                </Grid>
              </Grid>
            </Grid>

            <Grid size={{ xs: 12 }}>
              <Divider sx={{ my: 2 }} />
              <Typography variant="h6" gutterBottom>Emergency Contacts</Typography>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField
                    label="Primary Contact Name"
                    value={currentJSA.emergencyContacts.primary.name}
                    onChange={(e) => {
                      const sanitizedName = sanitizePersonName(e.target.value);
                      updateEmergencyContact('name', sanitizedName);
                    }}
                    fullWidth
                    required
                    error={!!fieldErrors['emergencyContacts.primary.name']}
                    helperText={fieldErrors['emergencyContacts.primary.name'] || 'Emergency contact required'}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField
                    label="Relationship"
                    value={currentJSA.emergencyContacts.primary.relationship}
                    onChange={(e) => updateEmergencyContact('relationship', e.target.value)}
                    fullWidth
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField
                    label="Phone Number"
                    value={currentJSA.emergencyContacts.primary.phone}
                    onChange={(e) => {
                      const sanitizedPhone = sanitizeContactDetails(e.target.value);
                      updateEmergencyContact('phone', sanitizedPhone);
                    }}
                    fullWidth
                    required
                    error={!!fieldErrors['emergencyContacts.primary.phone']}
                    helperText={fieldErrors['emergencyContacts.primary.phone'] || 'Emergency contact phone required'}
                  />
                </Grid>
              </Grid>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                Emergency Services: {currentJSA.emergencyContacts.emergencyServices.join(', ')}
              </Typography>
            </Grid>
          </Grid>
        </TabPanel>

        {/* Safety Analysis Tab */}
        <TabPanel value={currentTab} index={1}>
          <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
            <Security sx={{ mr: 1 }} />
            {industryInfo.name} Safety Analysis
          </Typography>

          {getHazardsByCategory().map(({ category, hazards }) => (
            <Accordion key={category} sx={{ mb: 2 }}>
              <AccordionSummary expandIcon={<ExpandMore />}>
                <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                  <Typography variant="subtitle1" sx={{ textTransform: 'capitalize' }}>
                    {category.replace('-', ' ')} Hazards ({hazards.length})
                  </Typography>
                  <Box sx={{ ml: 'auto', mr: 2 }}>
                    {hazards.some(h => h.riskLevel === 'extreme') && (
                      <Chip label="EXTREME" size="small" color="secondary" />
                    )}
                    {hazards.some(h => h.riskLevel === 'high') && !hazards.some(h => h.riskLevel === 'extreme') && (
                      <Chip label="HIGH" size="small" color="error" />
                    )}
                  </Box>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Hazard</TableCell>
                        <TableCell align="center">Risk Level</TableCell>
                        <TableCell align="center">Mitigations</TableCell>
                        <TableCell align="center">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {hazards.map((hazard) => (
                        <TableRow key={hazard.id}>
                          <TableCell>
                            <Typography variant="body2" fontWeight="bold">{hazard.title}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {hazard.description}
                            </Typography>
                          </TableCell>
                          <TableCell align="center">
                            <Chip
                              label={hazard.riskLevel.toUpperCase()}
                              size="small"
                              color={getRiskChipColor(hazard.riskLevel)}
                              sx={{ fontWeight: 'bold' }}
                            />
                          </TableCell>
                          <TableCell align="center">
                            <Typography variant="body2">
                              {hazard.mitigations.filter(m => m.trim()).length} strategies
                            </Typography>
                          </TableCell>
                          <TableCell align="center">
                            <IconButton
                              size="small"
                              onClick={() => handleEditHazard(hazard)}
                              color="primary"
                            >
                              <Edit />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </AccordionDetails>
            </Accordion>
          ))}
        </TabPanel>

        {/* Review & Complete Tab */}
        <TabPanel value={currentTab} index={2}>
          <Typography variant="h6" gutterBottom>JSA Review Summary</Typography>

          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="subtitle1" gutterBottom>Risk Assessment Summary</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2">Total Hazards:</Typography>
                    <Typography variant="body2" fontWeight="bold">
                      {currentJSA.overallRisk.totalHazards}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2">High Risk Hazards:</Typography>
                    <Typography variant="body2" fontWeight="bold" color="error.main">
                      {currentJSA.overallRisk.highRiskHazards}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2">Extreme Risk Hazards:</Typography>
                    <Typography variant="body2" fontWeight="bold" color="secondary.main">
                      {currentJSA.overallRisk.extremeRiskHazards}
                    </Typography>
                  </Box>
                  <Divider />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2">Overall Risk Level:</Typography>
                    <Chip
                      label={currentJSA.overallRisk.highestRiskLevel.toUpperCase()}
                      size="small"
                      color={getRiskChipColor(currentJSA.overallRisk.highestRiskLevel)}
                    />
                  </Box>
                </Box>
              </Paper>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="subtitle1" gutterBottom>Approval Requirements</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <CheckCircle sx={{ mr: 1, color: 'success.main' }} />
                    <Typography variant="body2">Pilot signature required</Typography>
                  </Box>
                  {currentJSA.overallRisk.requiresCRPApproval ? (
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <Warning sx={{ mr: 1, color: 'warning.main' }} />
                      <Typography variant="body2">CRP approval required</Typography>
                    </Box>
                  ) : (
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <CheckCircle sx={{ mr: 1, color: 'success.main' }} />
                      <Typography variant="body2">No additional approvals required</Typography>
                    </Box>
                  )}
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <CheckCircle sx={{ mr: 1, color: 'success.main' }} />
                    <Typography variant="body2">Emergency contacts verified</Typography>
                  </Box>
                </Box>
              </Paper>
            </Grid>

            <Grid size={{ xs: 12 }}>
              {validationErrors.length === 0 ? (
                <Alert severity="success">
                  JSA is complete and ready for submission. All required fields have been completed and safety analysis is comprehensive.
                </Alert>
              ) : (
                <Alert severity="error">
                  Please complete all required fields and address validation errors before submitting.
                </Alert>
              )}
            </Grid>
          </Grid>
        </TabPanel>
      </Card>

      {/* Navigation and Action Buttons */}
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Button
              variant="outlined"
              onClick={onCancel}
              startIcon={<Cancel />}
            >
              Back to Selection
            </Button>

            <Box sx={{ display: 'flex', gap: 2 }}>
              {currentTab > 0 && (
                <Button
                  variant="outlined"
                  onClick={() => setCurrentTab(currentTab - 1)}
                >
                  Previous
                </Button>
              )}

              {currentTab < 2 ? (
                <Button
                  variant="contained"
                  onClick={() => setCurrentTab(currentTab + 1)}
                >
                  Next
                </Button>
              ) : (
                <>
                  <Button
                    variant="outlined"
                    onClick={() => updateJSA({ ...currentJSA, status: 'draft' })}
                    startIcon={<Save />}
                  >
                    Save Draft
                  </Button>

                  <Button
                    variant="contained"
                    onClick={handleCompleteJSA}
                    startIcon={<CheckCircle />}
                    disabled={validationErrors.length > 0}
                  >
                    Complete JSA
                  </Button>
                </>
              )}
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Hazard Edit Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          Edit Hazard: {editingHazard?.title}
        </DialogTitle>
        <DialogContent>
          {editingHazard && (
            <Box sx={{ pt: 1 }}>
              <Grid container spacing={3}>
                <Grid size={{ xs: 12 }}>
                  <TextField
                    label="Description"
                    value={editingHazard.description}
                    onChange={(e) => {
                      const sanitizedDescription = sanitizeHazardDescription(e.target.value);
                      updateHazardField('description', sanitizedDescription);
                    }}
                    multiline
                    rows={3}
                    fullWidth
                    error={!!fieldErrors.description}
                    helperText={fieldErrors.description || 'Detailed description required for safety compliance'}
                  />
                </Grid>

                <Grid size={{ xs: 12, md: 6 }}>
                  <FormControl fullWidth>
                    <InputLabel>Likelihood</InputLabel>
                    <Select
                      value={editingHazard.likelihood}
                      onChange={(e) => updateHazardField('likelihood', e.target.value)}
                      label="Likelihood"
                    >
                      {LIKELIHOOD_OPTIONS.map((option) => (
                        <MenuItem key={option.value} value={option.value}>
                          <Box>
                            <Typography variant="body2">{option.label}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {option.description}
                            </Typography>
                          </Box>
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                <Grid size={{ xs: 12, md: 6 }}>
                  <FormControl fullWidth>
                    <InputLabel>Consequence</InputLabel>
                    <Select
                      value={editingHazard.consequence}
                      onChange={(e) => updateHazardField('consequence', e.target.value)}
                      label="Consequence"
                    >
                      {CONSEQUENCE_OPTIONS.map((option) => (
                        <MenuItem key={option.value} value={option.value}>
                          <Box>
                            <Typography variant="body2">{option.label}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {option.description}
                            </Typography>
                          </Box>
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                <Grid size={{ xs: 12 }}>
                  <Paper sx={{ p: 2, bgcolor: theme.palette.surface?.glass || '#f5f5f5' }}>
                    <Typography variant="body2" gutterBottom>
                      Risk Level:
                      <Chip
                        label={editingHazard.riskLevel.toUpperCase()}
                        color={getRiskChipColor(editingHazard.riskLevel)}
                        size="small"
                        sx={{ ml: 1, fontWeight: 'bold' }}
                      />
                    </Typography>
                    {requiresCRPApproval(editingHazard.riskLevel) && (
                      <Typography variant="caption" color="warning.main">
                        ⚠️ This risk level requires CRP approval
                      </Typography>
                    )}
                  </Paper>
                </Grid>

                <Grid size={{ xs: 12 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h6">Mitigation Strategies</Typography>
                    <Button
                      startIcon={<Add />}
                      onClick={addMitigation}
                      size="small"
                    >
                      Add Mitigation
                    </Button>
                  </Box>

                  {editingHazard.mitigations.map((mitigation, index) => (
                    <Box key={index} sx={{ display: 'flex', gap: 1, mb: 2 }}>
                      <TextField
                        value={mitigation}
                        onChange={(e) => updateMitigation(index, e.target.value)}
                        placeholder="Enter mitigation strategy..."
                        fullWidth
                        size="small"
                        multiline
                      />
                      <IconButton
                        onClick={() => removeMitigation(index)}
                        color="error"
                        size="small"
                      >
                        <Delete />
                      </IconButton>
                    </Box>
                  ))}
                </Grid>
              </Grid>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveHazard} variant="contained">Save Changes</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}