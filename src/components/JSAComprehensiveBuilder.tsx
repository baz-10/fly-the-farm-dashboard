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
  Fab,
  Tooltip
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
  DragHandle
} from '@mui/icons-material';

import {
  JSASystemRecord,
  JSAHazard,
  LikelihoodLevel,
  ConsequenceLevel,
  RiskLevel,
  calculateRiskLevel,
  requiresCRPApproval,
  getRiskColor
} from '../types/jsa';
import { isValidJSAHazard, isValidJSASystemRecord } from '../utils/typeGuards';
import { useJSAErrorHandler, ErrorState } from '../utils/errorHandling';
import {
  sanitizeTextInput,
  sanitizeHazardTitle,
  sanitizeHazardDescription,
  sanitizeMitigation
} from '../utils/inputSanitization';
import { useDebouncedValidation, useMemoizedJSACalculation } from '../utils/performanceOptimization';

interface JSAComprehensiveBuilderProps {
  jsa: JSASystemRecord;
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

const HAZARD_CATEGORIES = [
  { value: 'weather', label: 'Weather', icon: '🌤️' },
  { value: 'obstacles', label: 'Obstacles', icon: '🏗️' },
  { value: 'wildlife', label: 'Wildlife', icon: '🦅' },
  { value: 'mechanical', label: 'Mechanical', icon: '⚙️' },
  { value: 'human-factors', label: 'Human Factors', icon: '👤' },
  { value: 'airspace', label: 'Airspace', icon: '✈️' },
  { value: 'ground-personnel', label: 'Ground Personnel', icon: '👥' },
  { value: 'battery', label: 'Battery/Power', icon: '🔋' },
  { value: 'chemical', label: 'Chemical', icon: '🧪' },
  { value: 'privacy', label: 'Privacy/Data', icon: '🔒' },
  { value: 'infrastructure', label: 'Infrastructure', icon: '🏢' },
  { value: 'electrical', label: 'Electrical', icon: '⚡' },
  { value: 'thermal', label: 'Thermal', icon: '🌡️' },
  { value: 'custom', label: 'Custom', icon: '📝' }
];

export default function JSAComprehensiveBuilder({ jsa, onUpdate, onComplete, onCancel }: JSAComprehensiveBuilderProps) {
  const theme = useTheme();
  const errorHandler = useJSAErrorHandler();

  const [currentJSA, setCurrentJSA] = useState<JSASystemRecord>(jsa);
  const [editingHazard, setEditingHazard] = useState<JSAHazard | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [newHazardDialogOpen, setNewHazardDialogOpen] = useState(false);
  const [errorState, setErrorState] = useState<ErrorState>(errorHandler.clearErrorState());
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

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

    const finalJSA: JSASystemRecord = {
      ...updatedJSA,
      overallRisk,
      status: 'in-progress' as const,
      updatedAt: new Date().toISOString()
    };

    setCurrentJSA(finalJSA);
    onUpdate(finalJSA);
  }, [onUpdate]);

  // Create new hazard
  const createNewHazard = (): JSAHazard => ({
    id: `hazard_${Date.now()}`,
    category: 'custom',
    title: '',
    description: '',
    likelihood: 'low',
    consequence: 'minor',
    riskLevel: 'low',
    mitigations: [''],
    residualRisk: 'low',
    isPreDefined: false
  });

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

  // Handle new hazard creation
  const handleCreateNewHazard = () => {
    const newHazard = createNewHazard();
    setEditingHazard(newHazard);
    setNewHazardDialogOpen(true);
  };

  // Handle hazard editing
  const handleEditHazard = (hazard: JSAHazard) => {
    setEditingHazard({ ...hazard });
    setEditDialogOpen(true);
  };

  // Handle hazard deletion with proper confirmation
  const handleDeleteHazard = (hazardId: string) => {
    const hazard = currentJSA.hazards.find(h => h.id === hazardId);
    if (!hazard) {
      errorHandler.handleValidationError(
        'hazardId',
        'Hazard not found for deletion',
        setErrorState
      );
      return;
    }

    // Use proper state management instead of window.confirm
    const confirmDelete = () => {
      const updatedHazards = currentJSA.hazards.filter(h => h.id !== hazardId);
      updateJSA({
        ...currentJSA,
        hazards: updatedHazards
      });
      errorHandler.handleSuccess(
        `Hazard "${hazard.title}" deleted successfully`,
        setErrorState
      );
    };

    // For now, use confirm but in production this should be a proper dialog
    if (window.confirm(`Are you sure you want to delete the hazard "${hazard.title}"? This action cannot be undone.`)) {
      confirmDelete();
    }
  };

  // Save hazard changes with enhanced validation and sanitization
  const handleSaveHazard = () => {
    if (!editingHazard) return;

    // Clear previous errors
    setFieldErrors({});

    // Sanitize inputs
    const sanitizedHazard = {
      ...editingHazard,
      title: sanitizeHazardTitle(editingHazard.title),
      description: sanitizeHazardDescription(editingHazard.description),
      mitigations: editingHazard.mitigations.map(sanitizeMitigation)
    };

    // Validate sanitized hazard
    const validation = errorHandler.validateHazard(sanitizedHazard, setErrorState, setFieldErrors);

    if (!validation.isValid) {
      return; // Validation errors are already handled by errorHandler
    }

    // Additional business logic validation
    const validMitigations = sanitizedHazard.mitigations.filter(m => m.trim().length > 0);
    if (validMitigations.length === 0) {
      errorHandler.handleValidationError(
        'mitigations',
        'At least one mitigation strategy is required for aviation safety',
        setErrorState,
        setFieldErrors
      );
      return;
    }

    // Validate hazard structure before saving
    if (!isValidJSAHazard(sanitizedHazard)) {
      errorHandler.handleCriticalError(
        'Invalid hazard structure detected',
        setErrorState,
        'Hazard data does not meet safety system requirements'
      );
      return;
    }

    try {
      if (newHazardDialogOpen) {
        // Adding new hazard
        const updatedJSA = {
          ...currentJSA,
          hazards: [...currentJSA.hazards, sanitizedHazard]
        };

        if (!isValidJSASystemRecord(updatedJSA)) {
          throw new Error('Updated JSA structure is invalid');
        }

        updateJSA(updatedJSA);
        setNewHazardDialogOpen(false);
        errorHandler.handleSuccess('New hazard added successfully', setErrorState);
      } else {
        // Editing existing hazard
        const updatedHazards = currentJSA.hazards.map(h =>
          h.id === sanitizedHazard.id ? sanitizedHazard : h
        );

        const updatedJSA = {
          ...currentJSA,
          hazards: updatedHazards
        };

        if (!isValidJSASystemRecord(updatedJSA)) {
          throw new Error('Updated JSA structure is invalid');
        }

        updateJSA(updatedJSA);
        setEditDialogOpen(false);
        errorHandler.handleSuccess('Hazard updated successfully', setErrorState);
      }

      setEditingHazard(null);
      setFieldErrors({});
    } catch (error) {
      errorHandler.handleSaveError(error as Error, setErrorState);
    }
  };

  // Update hazard field with input sanitization
  const updateHazardField = (field: keyof JSAHazard, value: any) => {
    if (!editingHazard) return;

    // Sanitize input based on field type
    let sanitizedValue = value;
    if (typeof value === 'string') {
      switch (field) {
        case 'title':
          sanitizedValue = sanitizeHazardTitle(value);
          break;
        case 'description':
          sanitizedValue = sanitizeHazardDescription(value);
          break;
        default:
          sanitizedValue = sanitizeTextInput(value);
      }
    }

    let updatedHazard = { ...editingHazard, [field]: sanitizedValue };

    // Recalculate risk if likelihood or consequence changed
    if (field === 'likelihood' || field === 'consequence') {
      updatedHazard = updateHazardRisk(
        updatedHazard,
        updatedHazard.likelihood,
        updatedHazard.consequence
      );
    }

    setEditingHazard(updatedHazard);

    // Clear field errors when user starts typing
    if (fieldErrors[field]) {
      setFieldErrors(prev => ({ ...prev, [field]: '' }));
    }
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

    const sanitizedValue = sanitizeMitigation(value);
    const newMitigations = [...editingHazard.mitigations];
    newMitigations[index] = sanitizedValue;

    setEditingHazard({
      ...editingHazard,
      mitigations: newMitigations
    });

    // Clear mitigation field errors
    if (fieldErrors.mitigations) {
      setFieldErrors(prev => ({ ...prev, mitigations: '' }));
    }
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

    // Check minimum hazards
    if (currentJSA.hazards.length === 0) errors.push('At least one hazard must be identified');

    // Check hazards have required fields
    currentJSA.hazards.forEach((hazard, index) => {
      if (!hazard.title.trim()) errors.push(`Hazard ${index + 1} requires a title`);
      if (!hazard.description.trim()) errors.push(`Hazard ${index + 1} requires a description`);
      if (hazard.mitigations.filter(m => m.trim()).length === 0) {
        errors.push(`Hazard "${hazard.title}" requires at least one mitigation strategy`);
      }
    });

    // Check high-risk hazards have CRP approval
    const highRiskHazards = currentJSA.hazards.filter(h => h.riskLevel === 'high' || h.riskLevel === 'extreme');
    if (highRiskHazards.length > 0 && !currentJSA.signatures.crp) {
      errors.push('High/Extreme risk hazards require CRP review and approval');
    }

    return errors;
  }, [currentJSA]);

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

  // Debounced validation for performance
  const debouncedValidation = useDebouncedValidation((jsa: JSASystemRecord) => {
    const validation = errorHandler.validateCompleteJSA(jsa, setErrorState);
    setValidationErrors(validation.errors.map(e => e.message));
  });

  // Performance optimization: memoize JSA calculations
  const jsaMetrics = useMemoizedJSACalculation(currentJSA);

  const closeDialog = () => {
    setEditDialogOpen(false);
    setNewHazardDialogOpen(false);
    setEditingHazard(null);
    setFieldErrors({});
  };

  return (
    <Box sx={{ maxWidth: 1200, margin: '0 auto', position: 'relative' }}>
      {/* Header with Status */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Box>
              <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                <Assignment sx={{ mr: 1 }} />
                Comprehensive JSA Builder - {currentJSA.jsaNumber}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Custom hazard analysis with unlimited hazards and detailed risk management
              </Typography>
            </Box>
            <Box>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Chip
                  label={currentJSA.status.toUpperCase()}
                  color={currentJSA.status === 'approved' ? 'success' : 'warning'}
                />
                <Chip
                  label={`Overall Risk: ${currentJSA.overallRisk.highestRiskLevel.toUpperCase()}`}
                  color={getRiskChipColor(currentJSA.overallRisk.highestRiskLevel)}
                />
                <Chip
                  label={`${currentJSA.hazards.length} Hazards`}
                  variant="outlined"
                />
              </Box>
            </Box>
          </Box>

          {/* Progress Indicator */}
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Completion Progress
            </Typography>
            <LinearProgress
              variant="determinate"
              value={currentJSA.hazards.length === 0 ? 0 :
                    (currentJSA.hazards.filter(h =>
                      h.title.trim() && h.description.trim() && h.mitigations.filter(m => m.trim()).length > 0
                    ).length / currentJSA.hazards.length) * 100}
              sx={{ height: 8, borderRadius: 4 }}
            />
          </Box>
        </CardContent>
      </Card>

      {/* Enhanced Error Display */}
      {errorState.hasError && (
        <Alert severity={errorState.severity} sx={{ mb: 3 }}>
          <Typography variant="body2" fontWeight="bold" gutterBottom>
            {errorState.severity === 'error' ? 'Safety System Error' :
             errorState.severity === 'warning' ? 'Safety Warning' :
             'System Notification'}
          </Typography>
          <Typography variant="body2">
            {errorState.message}
          </Typography>
          {errorState.details && (
            <Typography variant="caption" display="block" sx={{ mt: 1 }}>
              Details: {errorState.details}
            </Typography>
          )}
        </Alert>
      )}

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <Alert severity="error" sx={{ mb: 3 }}>
          <Typography variant="body2" fontWeight="bold">Safety Validation Issues:</Typography>
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

      {/* Responsible Person */}
      <Accordion sx={{ mb: 2 }}>
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Person sx={{ mr: 1 }} />
            <Typography variant="h6">Responsible Person</Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                label="Name"
                value={currentJSA.responsiblePerson.name}
                onChange={(e) => updateResponsiblePerson('name', e.target.value)}
                fullWidth
                required
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                label="License Number"
                value={currentJSA.responsiblePerson.licenseNumber}
                onChange={(e) => updateResponsiblePerson('licenseNumber', e.target.value)}
                fullWidth
                required
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
        </AccordionDetails>
      </Accordion>

      {/* Emergency Contacts */}
      <Accordion sx={{ mb: 2 }}>
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Emergency sx={{ mr: 1 }} />
            <Typography variant="h6">Emergency Contacts</Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                label="Primary Contact Name"
                value={currentJSA.emergencyContacts.primary.name}
                onChange={(e) => updateEmergencyContact('name', e.target.value)}
                fullWidth
                required
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
                onChange={(e) => updateEmergencyContact('phone', e.target.value)}
                fullWidth
                required
              />
            </Grid>
          </Grid>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Emergency Services: {currentJSA.emergencyContacts.emergencyServices.join(', ')}
          </Typography>
        </AccordionDetails>
      </Accordion>

      {/* Comprehensive Hazard Analysis */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center' }}>
              <Security sx={{ mr: 1 }} />
              Comprehensive Hazard Analysis
            </Typography>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={handleCreateNewHazard}
            >
              Add New Hazard
            </Button>
          </Box>

          {currentJSA.hazards.length === 0 ? (
            <Paper sx={{ p: 4, textAlign: 'center', bgcolor: theme.palette.surface?.glass || '#f5f5f5' }}>
              <Security sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
              <Typography variant="h6" color="text.secondary" gutterBottom>
                No Hazards Identified Yet
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Start building your comprehensive safety analysis by identifying potential hazards and their mitigations.
              </Typography>
              <Button
                variant="contained"
                startIcon={<Add />}
                onClick={handleCreateNewHazard}
              >
                Add First Hazard
              </Button>
            </Paper>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Hazard</TableCell>
                    <TableCell align="center">Category</TableCell>
                    <TableCell align="center">Likelihood</TableCell>
                    <TableCell align="center">Consequence</TableCell>
                    <TableCell align="center">Risk Level</TableCell>
                    <TableCell align="center">Mitigations</TableCell>
                    <TableCell align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {currentJSA.hazards.map((hazard) => (
                    <TableRow key={hazard.id}>
                      <TableCell>
                        <Typography variant="body2" fontWeight="bold">{hazard.title || 'Untitled Hazard'}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {hazard.description || 'No description provided'}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ marginRight: 4 }}>
                            {HAZARD_CATEGORIES.find(c => c.value === hazard.category)?.icon}
                          </span>
                          <Typography variant="caption">
                            {HAZARD_CATEGORIES.find(c => c.value === hazard.category)?.label}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={hazard.likelihood.toUpperCase()}
                          size="small"
                          color={hazard.likelihood === 'high' ? 'error' : hazard.likelihood === 'medium' ? 'warning' : 'success'}
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={hazard.consequence.toUpperCase()}
                          size="small"
                          color={hazard.consequence === 'catastrophic' || hazard.consequence === 'major' ? 'error' :
                                 hazard.consequence === 'moderate' ? 'warning' : 'success'}
                        />
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
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                          <IconButton
                            size="small"
                            onClick={() => handleEditHazard(hazard)}
                            color="primary"
                          >
                            <Edit />
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={() => handleDeleteHazard(hazard.id)}
                            color="error"
                          >
                            <Delete />
                          </IconButton>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      {/* Action Buttons */}
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
                disabled={validationErrors.length > 0 || currentJSA.hazards.length === 0}
              >
                Complete JSA
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Floating Action Button */}
      <Tooltip title="Add New Hazard">
        <Fab
          color="primary"
          onClick={handleCreateNewHazard}
          sx={{
            position: 'fixed',
            bottom: 32,
            right: 32,
            zIndex: 1000
          }}
        >
          <Add />
        </Fab>
      </Tooltip>

      {/* Hazard Edit Dialog */}
      <Dialog
        open={editDialogOpen || newHazardDialogOpen}
        onClose={closeDialog}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {newHazardDialogOpen ? 'Create New Hazard' : `Edit Hazard: ${editingHazard?.title}`}
        </DialogTitle>
        <DialogContent>
          {editingHazard && (
            <Box sx={{ pt: 1 }}>
              <Grid container spacing={3}>
                <Grid size={{ xs: 12 }}>
                  <TextField
                    label="Hazard Title"
                    value={editingHazard.title}
                    onChange={(e) => updateHazardField('title', e.target.value)}
                    fullWidth
                    required
                    placeholder="e.g., Equipment malfunction during flight"
                    error={!!fieldErrors.title}
                    helperText={fieldErrors.title || 'Provide a clear, descriptive hazard title'}
                  />
                </Grid>

                <Grid size={{ xs: 12, md: 6 }}>
                  <FormControl fullWidth>
                    <InputLabel>Hazard Category</InputLabel>
                    <Select
                      value={editingHazard.category}
                      onChange={(e) => updateHazardField('category', e.target.value)}
                      label="Hazard Category"
                    >
                      {HAZARD_CATEGORIES.map((category) => (
                        <MenuItem key={category.value} value={category.value}>
                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <span style={{ marginRight: 8 }}>{category.icon}</span>
                            {category.label}
                          </Box>
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                <Grid size={{ xs: 12, md: 6 }}>
                  {/* Spacer */}
                </Grid>

                <Grid size={{ xs: 12 }}>
                  <TextField
                    label="Detailed Description"
                    value={editingHazard.description}
                    onChange={(e) => updateHazardField('description', e.target.value)}
                    multiline
                    rows={4}
                    fullWidth
                    required
                    placeholder="Provide a detailed description of this hazard, including when and where it might occur..."
                    error={!!fieldErrors.description}
                    helperText={fieldErrors.description || 'Detailed description required for regulatory compliance'}
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

                  {fieldErrors.mitigations && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                      {fieldErrors.mitigations}
                    </Alert>
                  )}

                  {editingHazard.mitigations.length === 0 && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontStyle: 'italic' }}>
                      No mitigation strategies defined. Add at least one to proceed.
                    </Typography>
                  )}

                  {editingHazard.mitigations.map((mitigation, index) => (
                    <Box key={index} sx={{ display: 'flex', gap: 1, mb: 2 }}>
                      <TextField
                        value={mitigation}
                        onChange={(e) => updateMitigation(index, e.target.value)}
                        placeholder="Enter mitigation strategy..."
                        fullWidth
                        multiline
                        rows={2}
                        size="small"
                      />
                      <IconButton
                        onClick={() => removeMitigation(index)}
                        color="error"
                        size="small"
                        sx={{ alignSelf: 'flex-start' }}
                      >
                        <Delete />
                      </IconButton>
                    </Box>
                  ))}

                  {editingHazard.mitigations.length === 0 && (
                    <Button
                      variant="outlined"
                      startIcon={<Add />}
                      onClick={addMitigation}
                      fullWidth
                      sx={{ mb: 2 }}
                    >
                      Add First Mitigation Strategy
                    </Button>
                  )}
                </Grid>
              </Grid>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>Cancel</Button>
          <Button
            onClick={handleSaveHazard}
            variant="contained"
            disabled={!editingHazard?.title.trim() || !editingHazard?.description.trim() ||
                     editingHazard?.mitigations.filter(m => m.trim()).length === 0}
          >
            {newHazardDialogOpen ? 'Create Hazard' : 'Save Changes'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}