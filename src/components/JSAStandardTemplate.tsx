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
  LinearProgress
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
  Delete
} from '@mui/icons-material';

import {
  JSASystemRecord,
  JSAHazard,
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
  sanitizeTextInput
} from '../utils/inputSanitization';
import { useMemoizedJSACalculation } from '../utils/performanceOptimization';

interface JSAStandardTemplateProps {
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

export default function JSAStandardTemplate({ jsa, onUpdate, onComplete, onCancel }: JSAStandardTemplateProps) {
  const theme = useTheme();
  const errorHandler = useJSAErrorHandler();

  const [currentJSA, setCurrentJSA] = useState<JSASystemRecord>(jsa);
  const [editingHazard, setEditingHazard] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedHazard, setSelectedHazard] = useState<JSAHazard | null>(null);
  const [emergencyContactDialogOpen, setEmergencyContactDialogOpen] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [errorState, setErrorState] = useState<ErrorState>(errorHandler.clearErrorState());
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Initialize with standard template hazards if empty
  useEffect(() => {
    if (currentJSA.hazards.length === 0) {
      const template = JSATemplateFactory.createStandardTemplate();
      const standardHazards = Object.values(template.predefinedHazards);
      updateJSA({
        ...currentJSA,
        hazards: standardHazards,
        status: 'in-progress'
      });
    }
  }, []);

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
    setSelectedHazard({ ...hazard });
    setEditDialogOpen(true);
  };

  // Save hazard changes
  const handleSaveHazard = () => {
    if (!selectedHazard) return;

    const updatedHazards = currentJSA.hazards.map(h =>
      h.id === selectedHazard.id ? selectedHazard : h
    );

    updateJSA({
      ...currentJSA,
      hazards: updatedHazards
    });

    setEditDialogOpen(false);
    setSelectedHazard(null);
  };

  // Update hazard field
  const updateHazardField = (field: keyof JSAHazard, value: any) => {
    if (!selectedHazard) return;

    let updatedHazard = { ...selectedHazard, [field]: value };

    // Recalculate risk if likelihood or consequence changed
    if (field === 'likelihood' || field === 'consequence') {
      updatedHazard = updateHazardRisk(
        updatedHazard,
        updatedHazard.likelihood,
        updatedHazard.consequence
      );
    }

    setSelectedHazard(updatedHazard);
  };

  // Add/remove mitigation
  const addMitigation = () => {
    if (!selectedHazard) return;
    setSelectedHazard({
      ...selectedHazard,
      mitigations: [...selectedHazard.mitigations, '']
    });
  };

  const removeMitigation = (index: number) => {
    if (!selectedHazard) return;
    const newMitigations = selectedHazard.mitigations.filter((_, i) => i !== index);
    setSelectedHazard({
      ...selectedHazard,
      mitigations: newMitigations
    });
  };

  const updateMitigation = (index: number, value: string) => {
    if (!selectedHazard) return;
    const newMitigations = [...selectedHazard.mitigations];
    newMitigations[index] = value;
    setSelectedHazard({
      ...selectedHazard,
      mitigations: newMitigations
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

    // Check high-risk hazards have additional requirements
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

  return (
    <Box sx={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Header with Status */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container alignItems="center" spacing={2}>
            <Grid sx={{ flexGrow: 1 }}>
              <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                <Assignment sx={{ mr: 1 }} />
                Standard JSA Template - {currentJSA.jsaNumber}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Pre-defined hazards with standard risk assessments and mitigation strategies
              </Typography>
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

          {/* Progress Indicator */}
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Completion Progress
            </Typography>
            <LinearProgress
              variant="determinate"
              value={(currentJSA.hazards.filter(h => h.mitigations.length > 0).length / currentJSA.hazards.length) * 100}
              sx={{ height: 8, borderRadius: 4 }}
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
                onChange={(e) => {
                  const sanitizedName = sanitizePersonName(e.target.value);
                  updateJSA({
                    ...currentJSA,
                    responsiblePerson: { ...currentJSA.responsiblePerson, name: sanitizedName }
                  });
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
                  updateJSA({
                    ...currentJSA,
                    responsiblePerson: { ...currentJSA.responsiblePerson, licenseNumber: sanitizedLicense }
                  });
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
                onChange={(e) => updateJSA({
                  ...currentJSA,
                  responsiblePerson: { ...currentJSA.responsiblePerson, company: e.target.value }
                })}
                fullWidth
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                label="Contact Details"
                value={currentJSA.responsiblePerson.contactDetails}
                onChange={(e) => {
                  const sanitizedContact = sanitizeContactDetails(e.target.value);
                  updateJSA({
                    ...currentJSA,
                    responsiblePerson: { ...currentJSA.responsiblePerson, contactDetails: sanitizedContact }
                  });
                }}
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
                onChange={(e) => {
                  const sanitizedName = sanitizePersonName(e.target.value);
                  updateEmergencyContact('name', sanitizedName);
                }}
                fullWidth
                required
                error={!!fieldErrors['emergencyContacts.primary.name']}
                helperText={fieldErrors['emergencyContacts.primary.name'] || 'Emergency contact required for safety compliance'}
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
        </AccordionDetails>
      </Accordion>

      {/* Hazard Analysis */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
            <Security sx={{ mr: 1 }} />
            Standard Hazard Analysis
          </Typography>

          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Hazard</TableCell>
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
                      <Typography variant="body2" fontWeight="bold">{hazard.title}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {hazard.description}
                      </Typography>
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
                        {hazard.mitigations.length} strategies
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
                disabled={validationErrors.length > 0}
              >
                Complete JSA
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Hazard Edit Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          Edit Hazard: {selectedHazard?.title}
        </DialogTitle>
        <DialogContent>
          {selectedHazard && (
            <Box sx={{ pt: 1 }}>
              <Grid container spacing={3}>
                <Grid size={{ xs: 12 }}>
                  <TextField
                    label="Description"
                    value={selectedHazard.description}
                    onChange={(e) => updateHazardField('description', e.target.value)}
                    multiline
                    rows={3}
                    fullWidth
                  />
                </Grid>

                <Grid size={{ xs: 12, md: 6 }}>
                  <FormControl fullWidth>
                    <InputLabel>Likelihood</InputLabel>
                    <Select
                      value={selectedHazard.likelihood}
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
                      value={selectedHazard.consequence}
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
                        label={selectedHazard.riskLevel.toUpperCase()}
                        color={getRiskChipColor(selectedHazard.riskLevel)}
                        size="small"
                        sx={{ ml: 1, fontWeight: 'bold' }}
                      />
                    </Typography>
                    {requiresCRPApproval(selectedHazard.riskLevel) && (
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

                  {selectedHazard.mitigations.map((mitigation, index) => (
                    <Box key={index} sx={{ display: 'flex', gap: 1, mb: 2 }}>
                      <TextField
                        value={mitigation}
                        onChange={(e) => updateMitigation(index, e.target.value)}
                        placeholder="Enter mitigation strategy..."
                        fullWidth
                        size="small"
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