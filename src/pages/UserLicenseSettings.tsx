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
  Grid,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  useTheme,
  alpha,
  Checkbox,
  FormControlLabel,
  Stack,
  Paper,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import BadgeIcon from '@mui/icons-material/Badge';
import SaveIcon from '@mui/icons-material/Save';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import { useUserLicense, StateLicenses } from '../contexts/UserLicenseContext';
import { useAuth } from '../contexts/AuthContext';

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

const STATE_LICENSE_FIELDS: Record<keyof StateLicenses, Array<{
  key: string;
  label: string;
  type: 'text' | 'checkbox' | 'date';
  required: boolean;
  description?: string;
}>> = {
  NSW: [
    { key: 'poeo_permit', label: 'POEO Act Permit Number', type: 'text', required: true },
    { key: 'applicator_permit_nsw', label: 'Professional Applicator Permit', type: 'text', required: true },
    { key: 'chemcert_nsw', label: 'ChemCert Notification Active', type: 'checkbox', required: false },
    { key: 'spray_diary_nsw', label: 'Spray Diary System Active', type: 'checkbox', required: false },
    { key: 'buffer_zones_nsw', label: 'Buffer Zone Compliance Trained', type: 'checkbox', required: false },
    { key: 'insurance_nsw', label: 'Public Liability $20M+ Active', type: 'checkbox', required: false },
  ],
  VIC: [
    { key: 'acp_permit_vic', label: 'ACP Category 7a Permit Number', type: 'text', required: true },
    { key: 'commercial_license_vic', label: 'Commercial Operator License', type: 'text', required: true },
    { key: 'equipment_calibration_vic', label: 'Annual Calibration Current', type: 'checkbox', required: false },
    { key: 'epa_compliance_vic', label: 'EPA Victoria Compliance', type: 'checkbox', required: false },
    { key: 'ffg_compliance_vic', label: 'Flora & Fauna Guarantee Training', type: 'checkbox', required: false },
    { key: 'worksafe_notification_vic', label: 'WorkSafe Notification Active', type: 'checkbox', required: false },
  ],
  QLD: [
    { key: 'applicator_license_qld', label: 'Category 1A Aerial Applicator License', type: 'text', required: true },
    { key: 'contractor_license_qld', label: 'Aerial Application Contractor License', type: 'text', required: true },
    { key: 'restricted_authority_qld', label: 'Restricted Chemical Authority', type: 'text', required: false, description: 'If applicable' },
    { key: 'vegetation_compliance_qld', label: 'Vegetation Management Training', type: 'checkbox', required: false },
    { key: 'reef_protection_qld', label: 'Reef Protection Training', type: 'checkbox', required: false },
    { key: 'continuing_education_qld', label: 'Continuing Education Current (20hrs/5yrs)', type: 'checkbox', required: false },
  ],
  SA: [
    { key: 'producer_permit_sa', label: 'Primary Producer/Commercial License', type: 'text', required: true },
    { key: 'control_order_sa', label: 'Chemical Control Order Training', type: 'checkbox', required: false },
    { key: 'native_vegetation_sa', label: 'Native Vegetation Act Training', type: 'checkbox', required: false },
    { key: 'river_murray_sa', label: 'River Murray Act Training', type: 'checkbox', required: false, description: 'If applicable' },
    { key: 'landscape_consultation_sa', label: 'Landscape SA Consultation', type: 'checkbox', required: false },
    { key: 'professional_development_sa', label: 'Professional Development Current', type: 'checkbox', required: false },
  ],
  WA: [
    { key: 'technician_license_wa', label: 'Pest Management Technician License', type: 'text', required: true },
    { key: 'contractor_registration_wa', label: 'Aerial Spraying Contractor Registration', type: 'text', required: true },
    { key: 'use_pattern_wa', label: 'Use Pattern Documentation', type: 'checkbox', required: false },
    { key: 'water_rights_wa', label: 'Water Rights Compliance', type: 'checkbox', required: false },
    { key: 'continuing_education_wa', label: 'Continuing Education Current (40hrs/3yrs)', type: 'checkbox', required: false },
    { key: 'drummuster_wa', label: 'drumMUSTER System Active', type: 'checkbox', required: false },
  ],
  TAS: [
    { key: 'crop_protection_tas', label: 'Crop Protection Permit Number', type: 'text', required: true },
    { key: 'applicator_license_tas', label: 'Commercial Pesticide Applicator License', type: 'text', required: true },
    { key: 'threatened_species_tas', label: 'Threatened Species Training', type: 'checkbox', required: false },
    { key: 'empca_compliance_tas', label: 'EMPCA Compliance Training', type: 'checkbox', required: false },
    { key: 'water_management_tas', label: 'Water Management Training', type: 'checkbox', required: false },
    { key: 'devil_protection_tas', label: 'Tasmanian Devil Habitat Training', type: 'checkbox', required: false },
  ],
  NT: [
    { key: 'chemical_permit_nt', label: 'Chemical User Permit Number', type: 'text', required: true },
    { key: 'operator_license_nt', label: 'Commercial Spray Operator License', type: 'text', required: true },
    { key: 'epa_compliance_nt', label: 'EPA Act Compliance Training', type: 'checkbox', required: false },
    { key: 'parks_wildlife_nt', label: 'Parks & Wildlife Training', type: 'checkbox', required: false },
    { key: 'water_compliance_nt', label: 'Water Act Compliance', type: 'checkbox', required: false },
    { key: 'sacred_sites_nt', label: 'Sacred Site Clearance Numbers', type: 'text', required: false, description: 'If required' },
  ],
  ACT: [
    { key: 'urban_permit_act', label: 'Urban Area Application Permit', type: 'text', required: true },
    { key: 'business_registration_act', label: 'ACT Business Registration Number', type: 'text', required: true },
    { key: 'pesticide_control_act', label: 'Pesticide Control Training', type: 'checkbox', required: false },
    { key: 'environment_protection_act', label: 'Environment Protection Training', type: 'checkbox', required: false },
    { key: 'nature_conservation_act', label: 'Nature Conservation Training', type: 'checkbox', required: false },
    { key: 'tree_protection_act', label: 'Tree Protection Training', type: 'checkbox', required: false },
    { key: 'community_notification_act', label: 'Community Notification Protocols', type: 'checkbox', required: false },
  ],
};

export default function UserLicenseSettings() {
  const theme = useTheme();
  const { user } = useAuth();
  const {
    licenseProfile,
    isLoading,
    updateGeneralInfo,
    updateStateLicense,
    saveLicenseProfile,
  } = useUserLicense();

  const [saveMessage, setSaveMessage] = useState('');
  const [expandedPanel, setExpandedPanel] = useState<string | false>('general');

  const handleSave = async () => {
    try {
      await saveLicenseProfile();
      setSaveMessage('License settings saved successfully!');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (error) {
      setSaveMessage('Error saving license settings. Please try again.');
      setTimeout(() => setSaveMessage(''), 3000);
    }
  };

  const handleAccordionChange = (panel: string) => (
    event: React.SyntheticEvent,
    isExpanded: boolean
  ) => {
    setExpandedPanel(isExpanded ? panel : false);
  };

  const getCompletionStatus = (state: keyof StateLicenses) => {
    if (!licenseProfile) return { completed: 0, total: 0 };

    const fields = STATE_LICENSE_FIELDS[state];
    const stateData = licenseProfile.stateLicenses[state];
    const requiredFields = fields.filter(f => f.required);
    const completed = requiredFields.filter(f => {
      const value = stateData[f.key as keyof typeof stateData];
      return value && value !== '';
    }).length;

    return { completed, total: requiredFields.length };
  };

  if (isLoading) {
    return (
      <Box sx={{ p: 3, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Typography>Loading license settings...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <BadgeIcon sx={{ fontSize: 40, color: 'primary.main' }} />
          <Box>
            <Typography variant="h3" sx={{ fontWeight: 800, color: 'primary.dark', fontSize: { xs: '1.8rem', md: '2.2rem' } }}>
              License & Permit Settings
            </Typography>
            <Typography variant="h6" color="text.secondary" sx={{ fontWeight: 400, mt: 1 }}>
              Manage your licenses across all Australian states
            </Typography>
          </Box>
        </Box>
        <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 900, lineHeight: 1.6 }}>
          Store your license numbers and permits here to automatically populate compliance records.
          This saves time and ensures accuracy when creating multi-state compliance documentation.
        </Typography>
      </Box>

      {/* Auto-Population Notice */}
      <Alert
        severity="info"
        icon={<CheckCircleIcon />}
        sx={{ mb: 4, borderRadius: '12px' }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
          Auto-Population Feature
        </Typography>
        <Typography variant="body2">
          License numbers and certifications saved here will automatically populate when creating compliance records.
          Update your information once and it applies to all future records.
        </Typography>
      </Alert>

      {/* General Applicator Information */}
      <Accordion
        expanded={expandedPanel === 'general'}
        onChange={handleAccordionChange('general')}
        sx={{ mb: 2, borderRadius: '12px !important', border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}` }}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
            <BadgeIcon sx={{ color: 'primary.main' }} />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              General Applicator Information
            </Typography>
            <Chip
              label="RECOMMENDED"
              size="small"
              color="info"
              variant="outlined"
              sx={{ ml: 'auto' }}
            />
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Applicator Name"
                value={licenseProfile?.generalInfo.applicatorName || ''}
                onChange={(e) => updateGeneralInfo({ applicatorName: e.target.value })}
                helperText="Your full name as it appears on licenses"
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Primary License Number"
                value={licenseProfile?.generalInfo.primaryLicenseNumber || ''}
                onChange={(e) => updateGeneralInfo({ primaryLicenseNumber: e.target.value })}
                helperText="Your main professional applicator license"
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Company Name"
                value={licenseProfile?.generalInfo.companyName || ''}
                onChange={(e) => updateGeneralInfo({ companyName: e.target.value })}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="ABN"
                value={licenseProfile?.generalInfo.abn || ''}
                onChange={(e) => updateGeneralInfo({ abn: e.target.value })}
                placeholder="11 222 333 444"
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Public Liability Insurance Policy"
                value={licenseProfile?.generalInfo.insurancePolicyNumber || ''}
                onChange={(e) => updateGeneralInfo({ insurancePolicyNumber: e.target.value })}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Insurance Expiry Date"
                type="date"
                value={licenseProfile?.generalInfo.insuranceExpiryDate || ''}
                onChange={(e) => updateGeneralInfo({ insuranceExpiryDate: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
          </Grid>
        </AccordionDetails>
      </Accordion>

      {/* State-Specific Licenses */}
      {AUSTRALIAN_STATES.map((state) => {
        const stateKey = state.code as keyof StateLicenses;
        const { completed, total } = getCompletionStatus(stateKey);
        const isComplete = completed === total && total > 0;

        return (
          <Accordion
            key={state.code}
            expanded={expandedPanel === state.code}
            onChange={handleAccordionChange(state.code)}
            sx={{ mb: 2, borderRadius: '12px !important', border: `1px solid ${alpha(theme.palette.primary.main, 0.1)}` }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
                <LocationOnIcon sx={{ color: 'primary.main' }} />
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  {state.name} ({state.code})
                </Typography>
                <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
                  {total > 0 && (
                    <Chip
                      label={`${completed}/${total} Required`}
                      size="small"
                      color={isComplete ? 'success' : 'warning'}
                      variant="outlined"
                    />
                  )}
                  {isComplete && (
                    <Chip
                      label="COMPLETE"
                      size="small"
                      color="success"
                      variant="filled"
                    />
                  )}
                </Box>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={3}>
                {STATE_LICENSE_FIELDS[stateKey].map((field) => (
                  <Grid size={{ xs: 12, md: field.type === 'checkbox' ? 12 : 6 }} key={field.key}>
                    {field.type === 'checkbox' ? (
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={Boolean(licenseProfile?.stateLicenses[stateKey][field.key as keyof typeof licenseProfile.stateLicenses[typeof stateKey]])}
                            onChange={(e) => updateStateLicense(stateKey, field.key, e.target.checked)}
                          />
                        }
                        label={
                          <Box>
                            <Typography variant="body2">
                              {field.label}
                              {field.required && <span style={{ color: theme.palette.error.main }}> *</span>}
                            </Typography>
                            {field.description && (
                              <Typography variant="caption" color="text.secondary">
                                {field.description}
                              </Typography>
                            )}
                          </Box>
                        }
                      />
                    ) : (
                      <TextField
                        fullWidth
                        label={field.label}
                        type={field.type}
                        required={field.required}
                        value={licenseProfile?.stateLicenses[stateKey][field.key as keyof typeof licenseProfile.stateLicenses[typeof stateKey]] || ''}
                        onChange={(e) => updateStateLicense(stateKey, field.key, e.target.value)}
                        helperText={field.description}
                        InputLabelProps={field.type === 'date' ? { shrink: true } : undefined}
                      />
                    )}
                  </Grid>
                ))}
              </Grid>
            </AccordionDetails>
          </Accordion>
        );
      })}

      {/* Save Button & Status */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, alignItems: 'center', mt: 4 }}>
        {saveMessage && (
          <Alert
            severity={saveMessage.includes('Error') ? 'error' : 'success'}
            icon={saveMessage.includes('Error') ? <WarningIcon /> : <CheckCircleIcon />}
            sx={{ borderRadius: '8px' }}
          >
            {saveMessage}
          </Alert>
        )}
        <Button
          variant="contained"
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
          Save License Settings
        </Button>
      </Box>

      {/* Last Updated Info */}
      {licenseProfile?.lastUpdated && (
        <Box sx={{ mt: 3, textAlign: 'center' }}>
          <Typography variant="caption" color="text.secondary">
            Last updated: {new Date(licenseProfile.lastUpdated).toLocaleDateString('en-AU', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </Typography>
        </Box>
      )}
    </Box>
  );
}