import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
  Button,
  Alert,
  Stepper,
  Step,
  StepLabel,
  Paper,
  Divider,
  Chip,
  Grid,
  CircularProgress
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Assignment, Security, CheckCircle, Warning } from '@mui/icons-material';

import { JSASystemType, IndustryType, JSASystemRecord, RiskLevel } from '../types/jsa';
import { useUserLicense } from '../contexts/UserLicenseContext';
import JSAStandardTemplate from './JSAStandardTemplate';
import JSAComprehensiveBuilder from './JSAComprehensiveBuilder';
import JSAIndustrySpecific from './JSAIndustrySpecific';
import JSAErrorBoundary from './JSAErrorBoundary';
import { isValidJSASystemRecord, safelyTransformJSAData } from '../utils/typeGuards';
import { useJSAErrorHandler, ErrorState } from '../utils/errorHandling';
import { useMemoizedJSACalculation } from '../utils/performanceOptimization';

interface JSASystemProps {
  missionId: string;
  existingJSA?: JSASystemRecord | null;
  onJSAComplete: (jsa: JSASystemRecord) => void;
  onCancel: () => void;
}

const JSA_SYSTEM_TYPES = [
  {
    value: 'standard' as JSASystemType,
    label: 'Standard JSA',
    description: 'Pre-defined hazards with standard risk assessments and mitigations'
  },
  {
    value: 'comprehensive' as JSASystemType,
    label: 'Comprehensive JSA',
    description: 'Custom hazard analysis with unlimited hazards and detailed risk management'
  },
  {
    value: 'industry-specific' as JSASystemType,
    label: 'Industry-Specific JSA',
    description: 'Specialized templates for crop spraying, surveying, or inspection operations'
  }
];

const INDUSTRY_TYPES = [
  {
    value: 'crop-spraying' as IndustryType,
    label: 'Crop Spraying',
    description: 'Chemical application and agricultural spray operations'
  },
  {
    value: 'surveying' as IndustryType,
    label: 'Surveying & Mapping',
    description: 'Data collection, mapping, and survey operations'
  },
  {
    value: 'inspections' as IndustryType,
    label: 'Inspections',
    description: 'Infrastructure inspection and asset monitoring'
  }
];

const RISK_LEVEL_COLORS: Record<RiskLevel, string> = {
  low: '#4caf50',
  medium: '#ff9800',
  high: '#f44336',
  extreme: '#9c27b0'
};

export default function JSASystem({ missionId, existingJSA, onJSAComplete, onCancel }: JSASystemProps) {
  const theme = useTheme();
  const { licenseProfile } = useUserLicense();
  const errorHandler = useJSAErrorHandler();

  const [systemType, setSystemType] = useState<JSASystemType | ''>('');
  const [industryType, setIndustryType] = useState<IndustryType | ''>('');
  const [currentJSA, setCurrentJSA] = useState<JSASystemRecord | null>(existingJSA || null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorState, setErrorState] = useState<ErrorState>(errorHandler.clearErrorState());
  const [activeStep, setActiveStep] = useState(0);

  // Safely validate and initialize existing JSA
  useEffect(() => {
    if (existingJSA) {
      // Validate existing JSA data with type guards instead of unsafe assertions
      const validatedJSA = safelyTransformJSAData(
        existingJSA,
        isValidJSASystemRecord,
        null,
        'Invalid existing JSA structure provided'
      );

      if (validatedJSA) {
        setSystemType(validatedJSA.systemType);
        setIndustryType(validatedJSA.industryType || '');
        setCurrentJSA(validatedJSA);
        setActiveStep(1); // Skip selection step
        errorHandler.handleSuccess('Existing JSA loaded successfully', setErrorState);
      } else {
        errorHandler.handleCriticalError(
          'Invalid JSA data structure detected',
          setErrorState,
          'The existing JSA does not meet safety system requirements'
        );
      }
    }
  }, [existingJSA, errorHandler]);

  // Handle system type selection with validation
  const handleSystemTypeChange = (event: SelectChangeEvent<JSASystemType>) => {
    const selectedType = event.target.value as JSASystemType;
    setSystemType(selectedType);
    setIndustryType(''); // Reset industry type when system type changes
    setErrorState(errorHandler.clearErrorState());
  };

  // Handle industry type selection with validation
  const handleIndustryTypeChange = (event: SelectChangeEvent<IndustryType>) => {
    setIndustryType(event.target.value as IndustryType);
    setErrorState(errorHandler.clearErrorState());
  };

  // Create new JSA record
  const createJSARecord = useCallback((): JSASystemRecord | null => {
    if (!systemType) return null;

    const jsaNumber = `JSA-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

    return {
      id: `jsa_${Date.now()}`,
      missionId,
      systemType: systemType as JSASystemType,
      industryType: systemType === 'industry-specific' ? industryType as IndustryType : undefined,
      status: 'draft',
      jsaNumber,
      title: `${JSA_SYSTEM_TYPES.find(t => t.value === systemType)?.label} - ${jsaNumber}`,
      completedBy: licenseProfile?.userId || '',
      responsiblePerson: {
        name: licenseProfile?.generalInfo.applicatorName || '',
        licenseNumber: licenseProfile?.generalInfo.primaryLicenseNumber || '',
        company: licenseProfile?.generalInfo.companyName || '',
        contactDetails: '' // This could be expanded with phone/email from license
      },
      hazards: [],
      overallRisk: {
        highestRiskLevel: 'low',
        totalHazards: 0,
        highRiskHazards: 0,
        extremeRiskHazards: 0,
        requiresCRPApproval: false
      },
      signatures: {
        pilot: {
          userId: licenseProfile?.userId || '',
          name: licenseProfile?.generalInfo.applicatorName || '',
          signature: '',
          signedAt: ''
        }
      },
      emergencyContacts: {
        primary: {
          name: '',
          relationship: '',
          phone: ''
        },
        emergencyServices: ['000', 'CASA Emergency: 131 450']
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }, [systemType, industryType, missionId, licenseProfile]);

  // Proceed to JSA creation/editing with enhanced validation
  const handleProceedToJSA = () => {
    if (!systemType) {
      errorHandler.handleRequiredFieldError(
        'systemType',
        'JSA System Type',
        setErrorState
      );
      return;
    }

    if (systemType === 'industry-specific' && !industryType) {
      errorHandler.handleRequiredFieldError(
        'industryType',
        'Industry Type',
        setErrorState
      );
      return;
    }

    setIsLoading(true);

    try {
      if (!currentJSA) {
        const newJSA = createJSARecord();

        if (!newJSA) {
          throw new Error('Please select a JSA system type before proceeding');
        }

        // Validate the created JSA structure
        if (!isValidJSASystemRecord(newJSA)) {
          throw new Error('Failed to create valid JSA structure');
        }

        setCurrentJSA(newJSA);
      }
      setActiveStep(1);
      errorHandler.handleSuccess('JSA initialized successfully', setErrorState);
    } catch (err) {
      errorHandler.handleCriticalError(
        'Failed to initialize JSA system',
        setErrorState,
        err instanceof Error ? err.message : 'Unknown initialization error'
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Handle JSA updates from child components with validation
  const handleJSAUpdate = useCallback((updatedJSA: JSASystemRecord) => {
    // Validate updated JSA structure
    const validatedJSA = safelyTransformJSAData(
      updatedJSA,
      isValidJSASystemRecord,
      currentJSA,
      'Invalid JSA update received'
    );

    if (validatedJSA) {
      setCurrentJSA(validatedJSA);
    } else {
      errorHandler.handleCriticalError(
        'Invalid JSA update detected',
        setErrorState,
        'JSA update failed validation checks'
      );
    }
  }, [currentJSA, errorHandler]);

  // Handle JSA completion with final validation
  const handleJSACompletion = useCallback((completedJSA: JSASystemRecord) => {
    // Final validation before completion
    const validation = errorHandler.validateCompleteJSA(completedJSA, setErrorState);

    if (validation.isValid) {
      const validatedJSA = safelyTransformJSAData(
        completedJSA,
        isValidJSASystemRecord,
        null,
        'Invalid completed JSA structure'
      );

      if (validatedJSA) {
        onJSAComplete(validatedJSA);
        errorHandler.handleSuccess('JSA completed successfully', setErrorState);
      } else {
        errorHandler.handleCriticalError(
          'JSA completion validation failed',
          setErrorState
        );
      }
    }
  }, [onJSAComplete, errorHandler]);

  // Go back to selection
  const handleBackToSelection = () => {
    setActiveStep(0);
    if (!existingJSA) {
      setCurrentJSA(null);
    }
  };

  // Render appropriate JSA component based on system type
  const renderJSAComponent = () => {
    if (!currentJSA) return null;

    const commonProps = {
      jsa: currentJSA,
      onUpdate: handleJSAUpdate,
      onComplete: handleJSACompletion,
      onCancel: handleBackToSelection
    };

    switch (systemType) {
      case 'standard':
        return <JSAStandardTemplate {...commonProps} />;

      case 'comprehensive':
        return <JSAComprehensiveBuilder {...commonProps} />;

      case 'industry-specific':
        return (
          <JSAIndustrySpecific
            {...commonProps}
            industryType={industryType as IndustryType}
          />
        );

      default:
        return null;
    }
  };

  // Get risk level chip color
  const getRiskChipColor = (risk: RiskLevel) => {
    switch (risk) {
      case 'low':
        return 'success';
      case 'medium':
        return 'warning';
      case 'high':
        return 'error';
      case 'extreme':
        return 'secondary';
      default:
        return 'default';
    }
  };

  // Memoize performance-critical calculations
  const fallbackJSA: JSASystemRecord = {
    id: 'fallback',
    missionId: '',
    systemType: 'standard' as JSASystemType,
    status: 'draft',
    jsaNumber: '',
    title: '',
    completedBy: '',
    hazards: [],
    responsiblePerson: { name: '', licenseNumber: '', company: '', contactDetails: '' },
    emergencyContacts: { primary: { name: '', relationship: '', phone: '' }, emergencyServices: [] },
    signatures: { pilot: { userId: '', name: '', signature: '', signedAt: '' } },
    overallRisk: { highestRiskLevel: 'low' as RiskLevel, totalHazards: 0, highRiskHazards: 0, extremeRiskHazards: 0, requiresCRPApproval: false },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const performanceMetrics = useMemoizedJSACalculation(currentJSA || fallbackJSA);

  const jsaContent = (
    <Box sx={{ maxWidth: 1200, margin: '0 auto', p: 3 }}>
      {/* Header */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <Security sx={{ mr: 2, color: theme.palette.primary.main }} />
            <Typography variant="h4" component="h1">
              Job Safety Analysis System
            </Typography>
          </Box>

          <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
            Create and manage comprehensive safety analysis for mission operations. Select the appropriate JSA type based on your operation requirements.
          </Typography>

          {/* Progress Stepper */}
          <Stepper activeStep={activeStep} sx={{ mt: 3 }}>
            <Step>
              <StepLabel>Select JSA Type</StepLabel>
            </Step>
            <Step>
              <StepLabel>Complete Safety Analysis</StepLabel>
            </Step>
            <Step>
              <StepLabel>Review & Approve</StepLabel>
            </Step>
          </Stepper>
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
          {errorState.code && (
            <Typography variant="caption" display="block" color="text.secondary">
              Error Code: {errorState.code}
            </Typography>
          )}
        </Alert>
      )}

      {/* Selection Phase */}
      {activeStep === 0 && (
        <Card>
          <CardContent>
            <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
              <Assignment sx={{ mr: 1 }} />
              JSA Type Selection
            </Typography>

            <Grid container spacing={3}>
              {/* System Type Selection */}
              <Grid size={{ xs: 12, md: 6 }}>
                <FormControl fullWidth>
                  <InputLabel>JSA System Type</InputLabel>
                  <Select
                    value={systemType}
                    onChange={handleSystemTypeChange}
                    label="JSA System Type"
                  >
                    {JSA_SYSTEM_TYPES.map((type) => (
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
                </FormControl>
              </Grid>

              {/* Industry Type Selection (only for industry-specific) */}
              {systemType === 'industry-specific' && (
                <Grid size={{ xs: 12, md: 6 }}>
                  <FormControl fullWidth>
                    <InputLabel>Industry Type</InputLabel>
                    <Select
                      value={industryType}
                      onChange={handleIndustryTypeChange}
                      label="Industry Type"
                    >
                      {INDUSTRY_TYPES.map((type) => (
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
                  </FormControl>
                </Grid>
              )}
            </Grid>

            {/* Selection Details */}
            {systemType && (
              <Paper sx={{ mt: 3, p: 2, bgcolor: theme.palette.surface?.glass || '#f5f5f5' }}>
                <Typography variant="h6" gutterBottom>
                  Selected Configuration
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                  <Chip
                    label={JSA_SYSTEM_TYPES.find(t => t.value === systemType)?.label}
                    color="primary"
                    variant="filled"
                  />
                  {systemType === 'industry-specific' && industryType && (
                    <Chip
                      label={INDUSTRY_TYPES.find(t => t.value === industryType)?.label}
                      color="secondary"
                      variant="outlined"
                    />
                  )}
                </Box>

                <Typography variant="body2" color="text.secondary">
                  {JSA_SYSTEM_TYPES.find(t => t.value === systemType)?.description}
                  {systemType === 'industry-specific' && industryType && (
                    <span> - {INDUSTRY_TYPES.find(t => t.value === industryType)?.description}</span>
                  )}
                </Typography>
              </Paper>
            )}

            {/* Responsible Person Info */}
            {licenseProfile && (
              <Paper sx={{ mt: 3, p: 2 }}>
                <Typography variant="h6" gutterBottom>
                  Responsible Person (Auto-populated from License)
                </Typography>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Typography variant="body2" color="text.secondary">Name</Typography>
                    <Typography variant="body1">{licenseProfile.generalInfo.applicatorName}</Typography>
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Typography variant="body2" color="text.secondary">License Number</Typography>
                    <Typography variant="body1">{licenseProfile.generalInfo.primaryLicenseNumber || 'Not specified'}</Typography>
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Typography variant="body2" color="text.secondary">Company</Typography>
                    <Typography variant="body1">{licenseProfile.generalInfo.companyName || 'Not specified'}</Typography>
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Typography variant="body2" color="text.secondary">Insurance Policy</Typography>
                    <Typography variant="body1">{licenseProfile.generalInfo.insurancePolicyNumber || 'Not specified'}</Typography>
                  </Grid>
                </Grid>
              </Paper>
            )}

            {/* Action Buttons */}
            <Box sx={{ mt: 4, display: 'flex', justifyContent: 'space-between' }}>
              <Button
                variant="outlined"
                onClick={onCancel}
              >
                Cancel
              </Button>

              <Button
                variant="contained"
                onClick={handleProceedToJSA}
                disabled={!systemType || (systemType === 'industry-specific' && !industryType) || isLoading}
                startIcon={isLoading ? <CircularProgress size={20} /> : <CheckCircle />}
              >
                {isLoading ? 'Creating JSA...' : existingJSA ? 'Edit JSA' : 'Create JSA'}
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* JSA Creation/Editing Phase */}
      {activeStep === 1 && currentJSA && renderJSAComponent()}

      {/* Existing JSA Summary (if editing) */}
      {existingJSA && activeStep === 0 && (
        <Card sx={{ mt: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
              <Warning sx={{ mr: 1, color: 'warning.main' }} />
              Existing JSA Found
            </Typography>

            <Grid container spacing={2} sx={{ mb: 2 }}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="body2" color="text.secondary">JSA Number</Typography>
                <Typography variant="body1">{existingJSA.jsaNumber}</Typography>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="body2" color="text.secondary">Status</Typography>
                <Chip
                  label={existingJSA.status.toUpperCase()}
                  size="small"
                  color={existingJSA.status === 'approved' ? 'success' : 'warning'}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="body2" color="text.secondary">Overall Risk</Typography>
                <Chip
                  label={existingJSA.overallRisk.highestRiskLevel.toUpperCase()}
                  size="small"
                  color={getRiskChipColor(existingJSA.overallRisk.highestRiskLevel)}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="body2" color="text.secondary">Total Hazards</Typography>
                <Typography variant="body1">{existingJSA.hazards.length}</Typography>
              </Grid>
            </Grid>

            <Divider sx={{ my: 2 }} />

            <Typography variant="body2" color="text.secondary">
              You can edit this existing JSA or create a new one by changing the selection above.
            </Typography>
          </CardContent>
        </Card>
      )}
    </Box>
  );

  // Wrap in error boundary for production safety
  return (
    <JSAErrorBoundary>
      {jsaContent}
    </JSAErrorBoundary>
  );
}