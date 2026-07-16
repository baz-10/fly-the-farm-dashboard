import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  TextField,
  Button,
  Grid,
  Typography,
  MenuItem,
  Paper,
  Alert,
  FormControl,
  InputLabel,
  Select,
  SelectChangeEvent,
} from '@mui/material';
// import { DatePicker } from '@mui/x-date-pickers/DatePicker';
// import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
// import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { useAircraft } from '../contexts/AircraftContext';
import { Aircraft, AircraftStatus } from '../types/aircraft';
import { addMonthsToDateInput } from '../utils/aircraftMaintenance';
// import { enAU } from 'date-fns/locale';

interface AircraftFormProps {
  aircraftId: string | null;
  onSave: () => void;
  onCancel: () => void;
}

interface FormData {
  registration: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  activationDate: string;
  mtow: string;
  maxAltitude: string;
  maxWindSpeed: string;
  status: AircraftStatus;

  // Maintenance dates
  lastInspection: string;
  nextInspectionDue: string;
  lastMajorService: string;
  nextMajorServiceDue: string;
  totalFlightHours: string;
  hoursSinceLastService: string;

  // Insurance
  policyNumber: string;
  provider: string;
  expiryDate: string;
  coverageAmount: string;
  hullValue: string;

  // Operational limits
  minOperatingTemp: string;
  maxOperatingTemp: string;
  maxPayloadWeight: string;
  batteryCycles: string;
  maxFlightTime: string;
  serviceRange: string;
  minimumCrewSize: string;

  // Compliance
  casaCompliant: boolean;
  lastCasaInspection: string;
  nextCasaInspectionDue: string;
}

const initialFormData: FormData = {
  registration: '',
  manufacturer: '',
  model: '',
  serialNumber: '',
  activationDate: new Date().toISOString().slice(0, 10),
  mtow: '',
  maxAltitude: '',
  maxWindSpeed: '',
  status: 'operational',
  lastInspection: '',
  nextInspectionDue: '',
  lastMajorService: '',
  nextMajorServiceDue: '',
  totalFlightHours: '0',
  hoursSinceLastService: '0',
  policyNumber: '',
  provider: '',
  expiryDate: '',
  coverageAmount: '',
  hullValue: '',
  minOperatingTemp: '',
  maxOperatingTemp: '',
  maxPayloadWeight: '',
  batteryCycles: '',
  maxFlightTime: '',
  serviceRange: '',
  minimumCrewSize: '1',
  casaCompliant: true,
  lastCasaInspection: '',
  nextCasaInspectionDue: '',
};

interface FormErrors {
  [key: string]: string;
}

export default function AircraftForm({ aircraftId, onSave, onCancel }: AircraftFormProps) {
  const { createAircraft, updateAircraft, getAircraftById, error } = useAircraft();
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Load aircraft data if editing
  useEffect(() => {
    if (aircraftId) {
      const aircraft = getAircraftById(aircraftId);
      if (aircraft) {
        setFormData({
          registration: aircraft.registration,
          manufacturer: aircraft.manufacturer,
          model: aircraft.model,
          serialNumber: aircraft.serialNumber,
          activationDate: (aircraft.activationDate || aircraft.createdAt).split('T')[0],
          mtow: aircraft.mtow.toString(),
          maxAltitude: aircraft.maxAltitude.toString(),
          maxWindSpeed: aircraft.maxWindSpeed.toString(),
          status: aircraft.status,
          lastInspection: aircraft.maintenanceDates.lastInspection.split('T')[0],
          nextInspectionDue: aircraft.maintenanceDates.nextInspectionDue.split('T')[0],
          lastMajorService: aircraft.maintenanceDates.lastMajorService.split('T')[0],
          nextMajorServiceDue: aircraft.maintenanceDates.nextMajorServiceDue.split('T')[0],
          totalFlightHours: aircraft.maintenanceDates.totalFlightHours.toString(),
          hoursSinceLastService: aircraft.maintenanceDates.hoursSinceLastService.toString(),
          policyNumber: aircraft.insurance.policyNumber,
          provider: aircraft.insurance.provider,
          expiryDate: aircraft.insurance.expiryDate.split('T')[0],
          coverageAmount: aircraft.insurance.coverageAmount.toString(),
          hullValue: aircraft.insurance.hullValue.toString(),
          minOperatingTemp: aircraft.operationalLimits.minOperatingTemp.toString(),
          maxOperatingTemp: aircraft.operationalLimits.maxOperatingTemp.toString(),
          maxPayloadWeight: aircraft.operationalLimits.maxPayloadWeight.toString(),
          batteryCycles: String(aircraft.operationalLimits.batteryCycles ?? ''),
          maxFlightTime: aircraft.operationalLimits.maxFlightTime.toString(),
          serviceRange: aircraft.operationalLimits.serviceRange.toString(),
          minimumCrewSize: aircraft.operationalLimits.minimumCrewSize.toString(),
          casaCompliant: aircraft.documentation.complianceChecks.casaCompliant,
          lastCasaInspection: aircraft.documentation.complianceChecks.lastCasaInspection.split('T')[0],
          nextCasaInspectionDue: aircraft.documentation.complianceChecks.nextCasaInspectionDue.split('T')[0],
        });
      }
    }
  }, [aircraftId, getAircraftById]);

  const validateForm = useCallback((): boolean => {
    const newErrors: FormErrors = {};

    // Required fields
    if (!formData.registration.trim()) {
      newErrors.registration = 'Registration is required';
    } else if (!/^[A-Z0-9-]+$/.test(formData.registration.trim().toUpperCase())) {
      newErrors.registration = 'Registration must contain only uppercase letters, numbers, and hyphens';
    }

    if (!formData.manufacturer.trim()) {
      newErrors.manufacturer = 'Manufacturer is required';
    }

    if (!formData.model.trim()) {
      newErrors.model = 'Model is required';
    }

    if (!formData.serialNumber.trim()) {
      newErrors.serialNumber = 'Serial number is required';
    }

    if (!formData.activationDate) {
      newErrors.activationDate = 'Activation date is required';
    }

    // Numeric validations
    const mtow = parseFloat(formData.mtow);
    if (!formData.mtow || isNaN(mtow) || mtow <= 0) {
      newErrors.mtow = 'MTOW must be a positive number';
    } else if (mtow > 150) {
      newErrors.mtow = 'MTOW seems too high for a drone (max 150kg)';
    }

    const maxAltitude = parseFloat(formData.maxAltitude);
    if (!formData.maxAltitude || isNaN(maxAltitude) || maxAltitude <= 0) {
      newErrors.maxAltitude = 'Max altitude must be a positive number';
    } else if (maxAltitude > 120) {
      newErrors.maxAltitude = 'Max altitude cannot exceed 120m AGL';
    }

    const maxWindSpeed = parseFloat(formData.maxWindSpeed);
    if (!formData.maxWindSpeed || isNaN(maxWindSpeed) || maxWindSpeed <= 0) {
      newErrors.maxWindSpeed = 'Max wind speed must be a positive number';
    }

    // Insurance validations
    if (!formData.policyNumber.trim()) {
      newErrors.policyNumber = 'Policy number is required';
    }

    if (!formData.provider.trim()) {
      newErrors.provider = 'Insurance provider is required';
    }

    if (!formData.expiryDate) {
      newErrors.expiryDate = 'Insurance expiry date is required';
    } else if (new Date(formData.expiryDate) < new Date()) {
      newErrors.expiryDate = 'Insurance has expired';
    }

    const coverageAmount = parseFloat(formData.coverageAmount);
    if (!formData.coverageAmount || isNaN(coverageAmount) || coverageAmount <= 0) {
      newErrors.coverageAmount = 'Coverage amount must be a positive number';
    }

    const hullValue = parseFloat(formData.hullValue);
    if (!formData.hullValue || isNaN(hullValue) || hullValue <= 0) {
      newErrors.hullValue = 'Hull value must be a positive number';
    }

    // Maintenance date validations
    if (!formData.lastInspection) {
      newErrors.lastInspection = 'Last inspection date is required';
    }

    if (!formData.nextInspectionDue) {
      newErrors.nextInspectionDue = 'Next inspection due date is required';
    } else if (new Date(formData.nextInspectionDue) < new Date()) {
      newErrors.nextInspectionDue = 'Inspection is overdue';
    }

    if (!formData.lastMajorService) {
      newErrors.lastMajorService = 'Last major service date is required';
    }

    if (!formData.nextMajorServiceDue) {
      newErrors.nextMajorServiceDue = 'Next major service due date is required';
    }

    // Operational limits validations
    const minTemp = parseFloat(formData.minOperatingTemp);
    const maxTemp = parseFloat(formData.maxOperatingTemp);

    if (formData.minOperatingTemp && !isNaN(minTemp) && formData.maxOperatingTemp && !isNaN(maxTemp)) {
      if (minTemp >= maxTemp) {
        newErrors.maxOperatingTemp = 'Max temperature must be higher than minimum temperature';
      }
    }

    const maxPayload = parseFloat(formData.maxPayloadWeight);
    if (!formData.maxPayloadWeight || isNaN(maxPayload) || maxPayload <= 0) {
      newErrors.maxPayloadWeight = 'Max payload weight must be a positive number';
    } else if (maxPayload > mtow) {
      newErrors.maxPayloadWeight = 'Max payload cannot exceed MTOW';
    }

    const batteryCycles = parseFloat(formData.batteryCycles);
    if (!formData.batteryCycles || isNaN(batteryCycles) || batteryCycles <= 0) {
      newErrors.batteryCycles = 'Battery cycles must be a positive number';
    }

    const maxFlightTime = parseFloat(formData.maxFlightTime);
    if (!formData.maxFlightTime || isNaN(maxFlightTime) || maxFlightTime <= 0) {
      newErrors.maxFlightTime = 'Max flight time must be a positive number';
    }

    const serviceRange = parseFloat(formData.serviceRange);
    if (!formData.serviceRange || isNaN(serviceRange) || serviceRange <= 0) {
      newErrors.serviceRange = 'Service range must be a positive number';
    }

    const crewSize = parseInt(formData.minimumCrewSize);
    if (!formData.minimumCrewSize || isNaN(crewSize) || crewSize < 1) {
      newErrors.minimumCrewSize = 'Minimum crew size must be at least 1';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  const handleInputChange = (field: keyof FormData) => (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | SelectChangeEvent
  ) => {
    const value = field === 'registration'
      ? event.target.value.toUpperCase()
      : event.target.value;
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));

    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: '',
      }));
    }
  };

  const handleDateChange = (field: keyof FormData) => (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = event.target.value;
    setFormData(prev => {
      const next = { ...prev, [field]: value };
      if (field === 'lastInspection') next.nextInspectionDue = addMonthsToDateInput(value, 3);
      if (field === 'lastMajorService') next.nextMajorServiceDue = addMonthsToDateInput(value, 6);
      return next;
    });

    // Clear error when date is changed
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: '',
      }));
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitError('');

    if (!validateForm()) {
      setSubmitError('Some required aircraft details are missing or invalid. Review the highlighted fields before saving.');
      return;
    }

    setSaving(true);

    try {
      const aircraftData: Omit<Aircraft, 'id' | 'createdAt' | 'updatedAt'> = {
        registration: formData.registration.trim().toUpperCase(),
        manufacturer: formData.manufacturer.trim(),
        model: formData.model.trim(),
        serialNumber: formData.serialNumber.trim(),
        activationDate: new Date(formData.activationDate).toISOString(),
        mtow: parseFloat(formData.mtow),
        maxAltitude: parseFloat(formData.maxAltitude),
        maxWindSpeed: parseFloat(formData.maxWindSpeed),
        status: formData.status,
        assignedKits: [],
        maintenanceDates: {
          lastInspection: new Date(formData.lastInspection).toISOString(),
          nextInspectionDue: new Date(formData.nextInspectionDue).toISOString(),
          lastMajorService: new Date(formData.lastMajorService).toISOString(),
          nextMajorServiceDue: new Date(formData.nextMajorServiceDue).toISOString(),
          totalFlightHours: parseFloat(formData.totalFlightHours),
          hoursSinceLastService: parseFloat(formData.hoursSinceLastService),
        },
        insurance: {
          policyNumber: formData.policyNumber.trim(),
          provider: formData.provider.trim(),
          expiryDate: new Date(formData.expiryDate).toISOString(),
          coverageAmount: parseFloat(formData.coverageAmount),
          hullValue: parseFloat(formData.hullValue),
        },
        operationalLimits: {
          minOperatingTemp: parseFloat(formData.minOperatingTemp) || -20,
          maxOperatingTemp: parseFloat(formData.maxOperatingTemp) || 50,
          maxPayloadWeight: parseFloat(formData.maxPayloadWeight),
          batteryCycles: parseFloat(formData.batteryCycles),
          maxFlightTime: parseFloat(formData.maxFlightTime),
          serviceRange: parseFloat(formData.serviceRange),
          minimumCrewSize: parseInt(formData.minimumCrewSize),
        },
        documentation: {
          manuals: [],
          certificates: [],
          logbooks: [],
          complianceChecks: {
            casaCompliant: formData.casaCompliant,
            lastCasaInspection: formData.lastCasaInspection ? new Date(formData.lastCasaInspection).toISOString() : new Date().toISOString(),
            nextCasaInspectionDue: formData.nextCasaInspectionDue ? new Date(formData.nextCasaInspectionDue).toISOString() : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          },
        },
      };

      if (aircraftId) {
        await updateAircraft(aircraftId, aircraftData);
      } else {
        const createdAircraftId = await createAircraft(aircraftData);
        if (!createdAircraftId) {
          throw new Error('The aircraft record could not be created. Review the highlighted details and try again.');
        }
      }

      onSave();
    } catch (error) {
      console.error('Failed to save aircraft:', error);
      setSubmitError(error instanceof Error ? error.message : 'The aircraft record could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
      <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
        {submitError && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {submitError}
          </Alert>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {/* Basic Information */}
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
            Basic Information
          </Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Registration *"
                value={formData.registration}
                onChange={handleInputChange('registration')}
                error={!!errors.registration}
                helperText={errors.registration || 'e.g., VH-ABC123'}
                inputProps={{
                  style: { textTransform: 'uppercase' },
                  'aria-describedby': errors.registration ? 'registration-error' : 'registration-help'
                }}
                aria-invalid={!!errors.registration}
                FormHelperTextProps={{
                  id: errors.registration ? 'registration-error' : 'registration-help'
                }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Serial Number *"
                value={formData.serialNumber}
                onChange={handleInputChange('serialNumber')}
                error={!!errors.serialNumber}
                helperText={errors.serialNumber}
                inputProps={{
                  'aria-describedby': errors.serialNumber ? 'serialNumber-error' : undefined
                }}
                aria-invalid={!!errors.serialNumber}
                FormHelperTextProps={{
                  id: errors.serialNumber ? 'serialNumber-error' : undefined
                }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Activation Date *"
                type="date"
                value={formData.activationDate}
                onChange={handleDateChange('activationDate')}
                error={!!errors.activationDate}
                helperText={errors.activationDate}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Manufacturer *"
                value={formData.manufacturer}
                onChange={handleInputChange('manufacturer')}
                error={!!errors.manufacturer}
                helperText={errors.manufacturer}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Model *"
                value={formData.model}
                onChange={handleInputChange('model')}
                error={!!errors.model}
                helperText={errors.model}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                fullWidth
                label="MTOW (kg) *"
                type="number"
                value={formData.mtow}
                onChange={handleInputChange('mtow')}
                error={!!errors.mtow}
                helperText={errors.mtow}
                inputProps={{
                  min: 0,
                  step: 0.1,
                  'aria-describedby': errors.mtow ? 'mtow-error' : undefined
                }}
                aria-invalid={!!errors.mtow}
                FormHelperTextProps={{
                  id: errors.mtow ? 'mtow-error' : undefined
                }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                fullWidth
                label="Max Altitude (m AGL) *"
                type="number"
                value={formData.maxAltitude}
                onChange={handleInputChange('maxAltitude')}
                error={!!errors.maxAltitude}
                helperText={errors.maxAltitude || 'Maximum 120m AGL'}
                inputProps={{ min: 0, max: 120 }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                fullWidth
                label="Max Wind Speed (km/h) *"
                type="number"
                value={formData.maxWindSpeed}
                onChange={handleInputChange('maxWindSpeed')}
                error={!!errors.maxWindSpeed}
                helperText={errors.maxWindSpeed}
                inputProps={{ min: 0 }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select
                  value={formData.status}
                  onChange={handleInputChange('status')}
                  label="Status"
                >
                  <MenuItem value="operational">Operational</MenuItem>
                  <MenuItem value="maintenance">Maintenance</MenuItem>
                  <MenuItem value="inspection">Inspection</MenuItem>
                  <MenuItem value="retired">Retired</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </Paper>

        {/* Operational Limits */}
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
            Operational Limits
          </Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Min Operating Temperature (°C)"
                type="number"
                value={formData.minOperatingTemp}
                onChange={handleInputChange('minOperatingTemp')}
                error={!!errors.minOperatingTemp}
                helperText={errors.minOperatingTemp}
                inputProps={{ step: 1 }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Max Operating Temperature (°C)"
                type="number"
                value={formData.maxOperatingTemp}
                onChange={handleInputChange('maxOperatingTemp')}
                error={!!errors.maxOperatingTemp}
                helperText={errors.maxOperatingTemp}
                inputProps={{ step: 1 }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Max Payload Weight (kg) *"
                type="number"
                value={formData.maxPayloadWeight}
                onChange={handleInputChange('maxPayloadWeight')}
                error={!!errors.maxPayloadWeight}
                helperText={errors.maxPayloadWeight}
                inputProps={{ min: 0, step: 0.1 }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Minimum Crew Size *"
                type="number"
                value={formData.minimumCrewSize}
                onChange={handleInputChange('minimumCrewSize')}
                error={!!errors.minimumCrewSize}
                helperText={errors.minimumCrewSize}
                inputProps={{ min: 1, step: 1 }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                fullWidth
                label="Battery Life (cycles) *"
                type="number"
                value={formData.batteryCycles}
                onChange={handleInputChange('batteryCycles')}
                error={!!errors.batteryCycles}
                helperText={errors.batteryCycles}
                inputProps={{ min: 1, step: 1 }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                fullWidth
                label="Max Flight Time (minutes) *"
                type="number"
                value={formData.maxFlightTime}
                onChange={handleInputChange('maxFlightTime')}
                error={!!errors.maxFlightTime}
                helperText={errors.maxFlightTime}
                inputProps={{ min: 0 }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                fullWidth
                label="Service Range (km) *"
                type="number"
                value={formData.serviceRange}
                onChange={handleInputChange('serviceRange')}
                error={!!errors.serviceRange}
                helperText={errors.serviceRange}
                inputProps={{ min: 0 }}
              />
            </Grid>
          </Grid>
        </Paper>

        {/* Maintenance Information */}
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
            Maintenance Information
          </Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Last Inspection *"
                type="date"
                value={formData.lastInspection}
                onChange={handleDateChange('lastInspection')}
                error={!!errors.lastInspection}
                helperText={errors.lastInspection}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Next Inspection Due *"
                type="date"
                value={formData.nextInspectionDue}
                onChange={handleDateChange('nextInspectionDue')}
                error={!!errors.nextInspectionDue}
                helperText={errors.nextInspectionDue}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Last Major Service *"
                type="date"
                value={formData.lastMajorService}
                onChange={handleDateChange('lastMajorService')}
                error={!!errors.lastMajorService}
                helperText={errors.lastMajorService}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Next Major Service Due *"
                type="date"
                value={formData.nextMajorServiceDue}
                onChange={handleDateChange('nextMajorServiceDue')}
                error={!!errors.nextMajorServiceDue}
                helperText={errors.nextMajorServiceDue}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Total Flight Hours"
                type="number"
                value={formData.totalFlightHours}
                onChange={handleInputChange('totalFlightHours')}
                inputProps={{ min: 0, step: 0.1 }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Hours Since Last Service"
                type="number"
                value={formData.hoursSinceLastService}
                onChange={handleInputChange('hoursSinceLastService')}
                inputProps={{ min: 0, step: 0.1 }}
              />
            </Grid>
          </Grid>
        </Paper>

        {/* Insurance Information */}
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
            Insurance Information
          </Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Policy Number *"
                value={formData.policyNumber}
                onChange={handleInputChange('policyNumber')}
                error={!!errors.policyNumber}
                helperText={errors.policyNumber}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Insurance Provider *"
                value={formData.provider}
                onChange={handleInputChange('provider')}
                error={!!errors.provider}
                helperText={errors.provider}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                fullWidth
                label="Expiry Date *"
                type="date"
                value={formData.expiryDate}
                onChange={handleDateChange('expiryDate')}
                error={!!errors.expiryDate}
                helperText={errors.expiryDate}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                fullWidth
                label="Coverage Amount (AUD) *"
                type="number"
                value={formData.coverageAmount}
                onChange={handleInputChange('coverageAmount')}
                error={!!errors.coverageAmount}
                helperText={errors.coverageAmount}
                inputProps={{ min: 0 }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                fullWidth
                label="Hull Value (AUD) *"
                type="number"
                value={formData.hullValue}
                onChange={handleInputChange('hullValue')}
                error={!!errors.hullValue}
                helperText={errors.hullValue}
                inputProps={{ min: 0 }}
              />
            </Grid>
          </Grid>
        </Paper>

        {/* CASA Compliance */}
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
            CASA Compliance
          </Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Last CASA Inspection"
                type="date"
                value={formData.lastCasaInspection}
                onChange={handleDateChange('lastCasaInspection')}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Next CASA Inspection Due"
                type="date"
                value={formData.nextCasaInspectionDue}
                onChange={handleDateChange('nextCasaInspectionDue')}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
          </Grid>
        </Paper>

        {/* Form Actions */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, pt: 2 }}>
          <Button onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={saving}
          >
            {saving ? 'Saving...' : aircraftId ? 'Update Aircraft' : 'Create Aircraft'}
          </Button>
        </Box>
      </Box>
  );
}
