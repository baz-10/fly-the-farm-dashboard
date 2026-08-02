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
  IconButton,
  Card,
  CardContent,
  CardActions,
  Chip,
  FormControlLabel,
  Switch,
  Autocomplete,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
} from '@mui/icons-material';
// import { DatePicker } from '@mui/x-date-pickers/DatePicker';
// import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
// import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { useAircraft } from '../contexts/AircraftContext';
import { useOperationalData } from '../contexts/OperationalDataContext';
import { EquipmentKit, EquipmentKitType, OperationalStatus } from '../types/aircraft';
// import { enAU } from 'date-fns/locale';

interface EquipmentKitFormProps {
  kitId: string | null;
  onSave: () => void;
  onCancel: () => void;
}

interface ComponentData {
  id: string;
  name: string;
  partNumber: string;
  manufacturer: string;
  serialNumber?: string;
  quantity: number;
  unitCost: number;
  warrantyExpiry: string;
}

interface FormData {
  operatingLocationId: string;
  name: string;
  type: EquipmentKitType;
  description: string;

  // Specifications
  weight: string;
  length: string;
  width: string;
  height: string;
  powerRequirement: string;
  operatingVoltage: string;
  minTemperature: string;
  maxTemperature: string;
  weatherResistance: string;

  // Operational data
  status: OperationalStatus;
  totalOperatingHours: string;
  lastCalibrationDate: string;
  nextCalibrationDue: string;
  lastMaintenanceDate: string;
  nextMaintenanceDue: string;
  averageSetupTime: string;
  averagePackupTime: string;

  // Financial data
  purchasePrice: string;
  currentValue: string;
  depreciationRate: string;
  maintenanceCostPerHour: string;
  insuranceValue: string;
  hasLeaseRates: boolean;
  dailyRate: string;
  weeklyRate: string;
  monthlyRate: string;

  // Components
  components: ComponentData[];

  // Compatibility
  compatibleAircraft: string[];
}

const initialFormData: FormData = {
  operatingLocationId: '',
  name: '',
  type: 'spray-system',
  description: '',
  weight: '',
  length: '',
  width: '',
  height: '',
  powerRequirement: '',
  operatingVoltage: '',
  minTemperature: '',
  maxTemperature: '',
  weatherResistance: '',
  status: 'available',
  totalOperatingHours: '0',
  lastCalibrationDate: '',
  nextCalibrationDue: '',
  lastMaintenanceDate: '',
  nextMaintenanceDue: '',
  averageSetupTime: '',
  averagePackupTime: '',
  purchasePrice: '',
  currentValue: '',
  depreciationRate: '10',
  maintenanceCostPerHour: '',
  insuranceValue: '',
  hasLeaseRates: false,
  dailyRate: '',
  weeklyRate: '',
  monthlyRate: '',
  components: [],
  compatibleAircraft: [],
};

const equipmentKitTypes: EquipmentKitType[] = [
  'spray-system',
  'camera-gimbal',
  'lidar',
  'multispectral',
  'thermal',
  'custom'
];

const NATIVE_EQUIPMENT_KIT_DATE_FIELDS = ['lastCalibrationDate','nextCalibrationDue','lastMaintenanceDate','nextMaintenanceDue'] as const;
export function reconcileNativeEquipmentKitDates<T extends object>(form: HTMLFormElement,current:T):T {
  const reconciled={...current} as unknown as Record<string,unknown>;
  NATIVE_EQUIPMENT_KIT_DATE_FIELDS.forEach((field)=>{const input=form.elements.namedItem(field);if(input instanceof HTMLInputElement&&input.value)reconciled[field]=input.value;});
  return reconciled as unknown as T;
}

interface FormErrors {
  [key: string]: string;
}

export default function EquipmentKitForm({ kitId, onSave, onCancel }: EquipmentKitFormProps) {
  const {
    createEquipmentKit,
    updateEquipmentKit,
    getEquipmentKitById,
    aircraft,
    error
  } = useAircraft();
  const { mode, operatingLocations } = useOperationalData();

  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [editingComponent, setEditingComponent] = useState<ComponentData | null>(null);
  const [showComponentForm, setShowComponentForm] = useState(false);

  // Component form state
  const [componentForm, setComponentForm] = useState<ComponentData>({
    id: '',
    name: '',
    partNumber: '',
    manufacturer: '',
    serialNumber: '',
    quantity: 1,
    unitCost: 0,
    warrantyExpiry: '',
  });

  const compatibleAircraftOptions = aircraft.filter((item) => !formData.operatingLocationId || item.operatingLocationId === formData.operatingLocationId);

  // Load equipment kit data if editing
  useEffect(() => {
    if (kitId) {
      const kit = getEquipmentKitById(kitId);
      if (kit) {
        setFormData({
          operatingLocationId: kit.operatingLocationId || '',
          name: kit.name,
          type: kit.type,
          description: kit.description,
          weight: kit.specifications.weight.toString(),
          length: kit.specifications.dimensions.length.toString(),
          width: kit.specifications.dimensions.width.toString(),
          height: kit.specifications.dimensions.height.toString(),
          powerRequirement: kit.specifications.powerRequirement.toString(),
          operatingVoltage: kit.specifications.operatingVoltage,
          minTemperature: kit.specifications.temperatureRange.min.toString(),
          maxTemperature: kit.specifications.temperatureRange.max.toString(),
          weatherResistance: kit.specifications.weatherResistance,
          status: kit.operationalData.status,
          totalOperatingHours: kit.operationalData.totalOperatingHours.toString(),
          lastCalibrationDate: kit.operationalData.lastCalibrationDate.split('T')[0],
          nextCalibrationDue: kit.operationalData.nextCalibrationDue.split('T')[0],
          lastMaintenanceDate: kit.operationalData.lastMaintenanceDate.split('T')[0],
          nextMaintenanceDue: kit.operationalData.nextMaintenanceDue.split('T')[0],
          averageSetupTime: kit.operationalData.averageSetupTime.toString(),
          averagePackupTime: kit.operationalData.averagePackupTime.toString(),
          purchasePrice: kit.financialData.purchasePrice.toString(),
          currentValue: kit.financialData.currentValue.toString(),
          depreciationRate: kit.financialData.depreciationRate.toString(),
          maintenanceCostPerHour: kit.financialData.maintenanceCostPerHour.toString(),
          insuranceValue: kit.financialData.insuranceValue.toString(),
          hasLeaseRates: !!kit.financialData.leaseRate,
          dailyRate: kit.financialData.leaseRate?.dailyRate.toString() || '',
          weeklyRate: kit.financialData.leaseRate?.weeklyRate.toString() || '',
          monthlyRate: kit.financialData.leaseRate?.monthlyRate.toString() || '',
          components: kit.components.map(comp => ({
            ...comp,
            warrantyExpiry: comp.warrantyExpiry ? comp.warrantyExpiry.split('T')[0] : '',
          })),
          compatibleAircraft: kit.compatibleAircraft,
        });
      }
    }
  }, [kitId, getEquipmentKitById]);

  useEffect(() => {
    if (mode !== 'remote' || kitId || operatingLocations.length !== 1) return;
    setFormData((previous) => ({ ...previous, operatingLocationId: operatingLocations[0].id }));
  }, [kitId, mode, operatingLocations]);

  const validateForm = useCallback((candidate?: FormData): boolean => ((formData: FormData) => {
    const newErrors: FormErrors = {};

    // Required fields
    if (!formData.operatingLocationId) {
      newErrors.operatingLocationId = 'Operating location is required';
    }
    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Description is required';
    }

    // Numeric validations
    const weight = parseFloat(formData.weight);
    if (!formData.weight || isNaN(weight) || weight <= 0) {
      newErrors.weight = 'Weight must be a positive number';
    }

    const length = parseFloat(formData.length);
    if (!formData.length || isNaN(length) || length <= 0) {
      newErrors.length = 'Length must be a positive number';
    }

    const width = parseFloat(formData.width);
    if (!formData.width || isNaN(width) || width <= 0) {
      newErrors.width = 'Width must be a positive number';
    }

    const height = parseFloat(formData.height);
    if (!formData.height || isNaN(height) || height <= 0) {
      newErrors.height = 'Height must be a positive number';
    }

    const powerRequirement = parseFloat(formData.powerRequirement);
    if (!formData.powerRequirement || isNaN(powerRequirement) || powerRequirement < 0) {
      newErrors.powerRequirement = 'Power requirement must be a non-negative number';
    }

    if (!formData.operatingVoltage.trim()) {
      newErrors.operatingVoltage = 'Operating voltage is required';
    }

    if (!formData.weatherResistance.trim()) {
      newErrors.weatherResistance = 'Weather resistance rating is required';
    }

    // Financial validations
    const purchasePrice = parseFloat(formData.purchasePrice);
    if (!formData.purchasePrice || isNaN(purchasePrice) || purchasePrice < 0) {
      newErrors.purchasePrice = 'Purchase price must be a non-negative number';
    }

    const currentValue = parseFloat(formData.currentValue);
    if (!formData.currentValue || isNaN(currentValue) || currentValue < 0) {
      newErrors.currentValue = 'Current value must be a non-negative number';
    }

    const depreciationRate = parseFloat(formData.depreciationRate);
    if (!formData.depreciationRate || isNaN(depreciationRate) || depreciationRate < 0 || depreciationRate > 100) {
      newErrors.depreciationRate = 'Depreciation rate must be between 0 and 100';
    }

    const maintenanceCost = parseFloat(formData.maintenanceCostPerHour);
    if (!formData.maintenanceCostPerHour || isNaN(maintenanceCost) || maintenanceCost < 0) {
      newErrors.maintenanceCostPerHour = 'Maintenance cost per hour must be a non-negative number';
    }

    const insuranceValue = parseFloat(formData.insuranceValue);
    if (!formData.insuranceValue || isNaN(insuranceValue) || insuranceValue < 0) {
      newErrors.insuranceValue = 'Insurance value must be a non-negative number';
    }

    // Date validations
    if (!formData.lastCalibrationDate) {
      newErrors.lastCalibrationDate = 'Last calibration date is required';
    }

    if (!formData.nextCalibrationDue) {
      newErrors.nextCalibrationDue = 'Next calibration due date is required';
    }

    if (!formData.lastMaintenanceDate) {
      newErrors.lastMaintenanceDate = 'Last maintenance date is required';
    }

    if (!formData.nextMaintenanceDue) {
      newErrors.nextMaintenanceDue = 'Next maintenance due date is required';
    }

    // Time validations
    const setupTime = parseFloat(formData.averageSetupTime);
    if (!formData.averageSetupTime || isNaN(setupTime) || setupTime <= 0) {
      newErrors.averageSetupTime = 'Setup time must be a positive number';
    }

    const packupTime = parseFloat(formData.averagePackupTime);
    if (!formData.averagePackupTime || isNaN(packupTime) || packupTime <= 0) {
      newErrors.averagePackupTime = 'Pack-up time must be a positive number';
    }

    // Lease rate validations
    if (formData.hasLeaseRates) {
      const dailyRate = parseFloat(formData.dailyRate);
      if (!formData.dailyRate || isNaN(dailyRate) || dailyRate <= 0) {
        newErrors.dailyRate = 'Daily rate must be a positive number';
      }

      const weeklyRate = parseFloat(formData.weeklyRate);
      if (!formData.weeklyRate || isNaN(weeklyRate) || weeklyRate <= 0) {
        newErrors.weeklyRate = 'Weekly rate must be a positive number';
      }

      const monthlyRate = parseFloat(formData.monthlyRate);
      if (!formData.monthlyRate || isNaN(monthlyRate) || monthlyRate <= 0) {
        newErrors.monthlyRate = 'Monthly rate must be a positive number';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  })(candidate || formData), [formData]);

  const handleInputChange = (field: keyof FormData) => (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | SelectChangeEvent
  ) => {
    const value = event.target.value;
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

  const handleSwitchChange = (field: keyof FormData) => (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setFormData(prev => ({
      ...prev,
      [field]: event.target.checked,
    }));
  };

  const handleDateChange = (field: keyof FormData) => (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = event.target.value;
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));

    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: '',
      }));
    }
  };

  const handleCompatibleAircraftChange = (_event: any, newValue: string[]) => {
    setFormData(prev => ({
      ...prev,
      compatibleAircraft: newValue,
    }));
  };

  // Component management functions
  const addComponent = () => {
    setComponentForm({
      id: `comp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: '',
      partNumber: '',
      manufacturer: '',
      serialNumber: '',
      quantity: 1,
      unitCost: 0,
      warrantyExpiry: '',
    });
    setEditingComponent(null);
    setShowComponentForm(true);
  };

  const editComponent = (component: ComponentData) => {
    setComponentForm({ ...component });
    setEditingComponent(component);
    setShowComponentForm(true);
  };

  const deleteComponent = (componentId: string) => {
    setFormData(prev => ({
      ...prev,
      components: prev.components.filter(c => c.id !== componentId),
    }));
  };

  const saveComponent = () => {
    if (!componentForm.name.trim() || !componentForm.partNumber.trim() || !componentForm.manufacturer.trim()) {
      return;
    }

    setFormData(prev => ({
      ...prev,
      components: editingComponent
        ? prev.components.map(c => c.id === componentForm.id ? componentForm : c)
        : [...prev.components, componentForm],
    }));

    setShowComponentForm(false);
    setEditingComponent(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const submittedFormData = reconcileNativeEquipmentKitDates(event.currentTarget as HTMLFormElement, formData);
    setFormData(submittedFormData);
    if (!validateForm(submittedFormData)) {
      return;
    }

    setSaving(true);

    try {
      const formData = submittedFormData;
      const kitData: Omit<EquipmentKit, 'id' | 'createdAt' | 'updatedAt'> = {
        operatingLocationId: formData.operatingLocationId,
        name: formData.name.trim(),
        type: formData.type,
        description: formData.description.trim(),
        specifications: {
          weight: parseFloat(formData.weight),
          dimensions: {
            length: parseFloat(formData.length),
            width: parseFloat(formData.width),
            height: parseFloat(formData.height),
          },
          powerRequirement: parseFloat(formData.powerRequirement),
          operatingVoltage: formData.operatingVoltage.trim(),
          temperatureRange: {
            min: parseFloat(formData.minTemperature) || -20,
            max: parseFloat(formData.maxTemperature) || 50,
          },
          weatherResistance: formData.weatherResistance.trim(),
        },
        components: formData.components.map(comp => ({
          ...comp,
          warrantyExpiry: comp.warrantyExpiry ? new Date(comp.warrantyExpiry).toISOString() : undefined,
        })),
        operationalData: {
          status: formData.status,
          totalOperatingHours: parseFloat(formData.totalOperatingHours),
          lastCalibrationDate: new Date(formData.lastCalibrationDate).toISOString(),
          nextCalibrationDue: new Date(formData.nextCalibrationDue).toISOString(),
          lastMaintenanceDate: new Date(formData.lastMaintenanceDate).toISOString(),
          nextMaintenanceDue: new Date(formData.nextMaintenanceDue).toISOString(),
          averageSetupTime: parseFloat(formData.averageSetupTime),
          averagePackupTime: parseFloat(formData.averagePackupTime),
        },
        financialData: {
          purchasePrice: parseFloat(formData.purchasePrice),
          currentValue: parseFloat(formData.currentValue),
          depreciationRate: parseFloat(formData.depreciationRate),
          maintenanceCostPerHour: parseFloat(formData.maintenanceCostPerHour),
          insuranceValue: parseFloat(formData.insuranceValue),
          ...(formData.hasLeaseRates && {
            leaseRate: {
              dailyRate: parseFloat(formData.dailyRate),
              weeklyRate: parseFloat(formData.weeklyRate),
              monthlyRate: parseFloat(formData.monthlyRate),
            },
          }),
        },
        compatibleAircraft: formData.compatibleAircraft,
      };

      if (kitId) {
        await updateEquipmentKit(kitId, kitData);
      } else {
        await createEquipmentKit(kitData);
      }

      onSave();
    } catch (error) {
      console.error('Failed to save equipment kit:', error);
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
    }).format(amount);
  };

  // Extract inline components to prevent focus loss issues
  const renderCompatibleAircraftTags = useCallback((value: string[], getTagProps: any) =>
    value.map((option, index) => (
      <Chip
        variant="outlined"
        label={aircraft.find((item) => item.id === option)?.registration || option}
        {...getTagProps({ index })}
        key={option}
      />
    )), [aircraft]);

  const renderCompatibleAircraftInput = useCallback((params: any) => (
    <TextField
      {...params}
      label="Compatible Aircraft"
      helperText="Select aircraft at this operating location that can use this equipment kit"
      inputProps={{
        ...params.inputProps,
        'aria-describedby': 'compatible-aircraft-help'
      }}
    />
  ), []);

  return (
      <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
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
              <FormControl fullWidth error={!!errors.operatingLocationId}>
                <InputLabel>Operating Location *</InputLabel>
                <Select value={formData.operatingLocationId} onChange={handleInputChange('operatingLocationId')} label="Operating Location *">
                  {operatingLocations.map((location) => <MenuItem key={location.id} value={location.id}>{location.name}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 8 }}>
              <TextField
                fullWidth
                label="Equipment Kit Name *"
                value={formData.name}
                onChange={handleInputChange('name')}
                error={!!errors.name}
                helperText={errors.name}
                inputProps={{
                  'aria-describedby': errors.name ? 'name-error' : undefined
                }}
                aria-invalid={!!errors.name}
                FormHelperTextProps={{
                  id: errors.name ? 'name-error' : undefined
                }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <FormControl fullWidth>
                <InputLabel>Type *</InputLabel>
                <Select
                  value={formData.type}
                  onChange={handleInputChange('type')}
                  label="Type *"
                >
                  {equipmentKitTypes.map((type) => (
                    <MenuItem key={type} value={type}>
                      {type.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                label="Description *"
                value={formData.description}
                onChange={handleInputChange('description')}
                error={!!errors.description}
                helperText={errors.description}
                multiline
                rows={3}
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
                  <MenuItem value="available">Available</MenuItem>
                  <MenuItem value="assigned">Assigned</MenuItem>
                  <MenuItem value="maintenance">Maintenance</MenuItem>
                  <MenuItem value="calibration">Calibration</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </Paper>

        {/* Technical Specifications */}
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
            Technical Specifications
          </Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 3 }}>
              <TextField
                fullWidth
                label="Weight (kg) *"
                type="number"
                value={formData.weight}
                onChange={handleInputChange('weight')}
                error={!!errors.weight}
                helperText={errors.weight}
                inputProps={{
                  min: 0,
                  step: 0.1,
                  'aria-describedby': errors.weight ? 'weight-error' : undefined
                }}
                aria-invalid={!!errors.weight}
                FormHelperTextProps={{
                  id: errors.weight ? 'weight-error' : undefined
                }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 3 }}>
              <TextField
                fullWidth
                label="Length (cm) *"
                type="number"
                value={formData.length}
                onChange={handleInputChange('length')}
                error={!!errors.length}
                helperText={errors.length}
                inputProps={{ min: 0, step: 0.1 }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 3 }}>
              <TextField
                fullWidth
                label="Width (cm) *"
                type="number"
                value={formData.width}
                onChange={handleInputChange('width')}
                error={!!errors.width}
                helperText={errors.width}
                inputProps={{ min: 0, step: 0.1 }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 3 }}>
              <TextField
                fullWidth
                label="Height (cm) *"
                type="number"
                value={formData.height}
                onChange={handleInputChange('height')}
                error={!!errors.height}
                helperText={errors.height}
                inputProps={{ min: 0, step: 0.1 }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                fullWidth
                label="Power Requirement (W) *"
                type="number"
                value={formData.powerRequirement}
                onChange={handleInputChange('powerRequirement')}
                error={!!errors.powerRequirement}
                helperText={errors.powerRequirement}
                inputProps={{ min: 0 }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                fullWidth
                label="Operating Voltage *"
                value={formData.operatingVoltage}
                onChange={handleInputChange('operatingVoltage')}
                error={!!errors.operatingVoltage}
                helperText={errors.operatingVoltage || 'e.g., 12V DC, 24V DC'}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                fullWidth
                label="Weather Resistance *"
                value={formData.weatherResistance}
                onChange={handleInputChange('weatherResistance')}
                error={!!errors.weatherResistance}
                helperText={errors.weatherResistance || 'e.g., IP65, IP67'}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Min Temperature (°C)"
                type="number"
                value={formData.minTemperature}
                onChange={handleInputChange('minTemperature')}
                inputProps={{ step: 1 }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Max Temperature (°C)"
                type="number"
                value={formData.maxTemperature}
                onChange={handleInputChange('maxTemperature')}
                inputProps={{ step: 1 }}
              />
            </Grid>
          </Grid>
        </Paper>

        {/* Operational Data */}
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
            Operational Data
          </Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                fullWidth
                label="Total Operating Hours"
                type="number"
                value={formData.totalOperatingHours}
                onChange={handleInputChange('totalOperatingHours')}
                inputProps={{ min: 0, step: 0.1 }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                fullWidth
                label="Average Setup Time (min) *"
                type="number"
                value={formData.averageSetupTime}
                onChange={handleInputChange('averageSetupTime')}
                error={!!errors.averageSetupTime}
                helperText={errors.averageSetupTime}
                inputProps={{ min: 0 }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                fullWidth
                label="Average Pack-up Time (min) *"
                type="number"
                value={formData.averagePackupTime}
                onChange={handleInputChange('averagePackupTime')}
                error={!!errors.averagePackupTime}
                helperText={errors.averagePackupTime}
                inputProps={{ min: 0 }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Last Calibration Date *"
                name="lastCalibrationDate"
                type="date"
                value={formData.lastCalibrationDate}
                onChange={handleDateChange('lastCalibrationDate')}
                error={!!errors.lastCalibrationDate}
                helperText={errors.lastCalibrationDate}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Next Calibration Due *"
                name="nextCalibrationDue"
                type="date"
                value={formData.nextCalibrationDue}
                onChange={handleDateChange('nextCalibrationDue')}
                error={!!errors.nextCalibrationDue}
                helperText={errors.nextCalibrationDue}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Last Maintenance Date *"
                name="lastMaintenanceDate"
                type="date"
                value={formData.lastMaintenanceDate}
                onChange={handleDateChange('lastMaintenanceDate')}
                error={!!errors.lastMaintenanceDate}
                helperText={errors.lastMaintenanceDate}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Next Maintenance Due *"
                name="nextMaintenanceDue"
                type="date"
                value={formData.nextMaintenanceDue}
                onChange={handleDateChange('nextMaintenanceDue')}
                error={!!errors.nextMaintenanceDue}
                helperText={errors.nextMaintenanceDue}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
          </Grid>
        </Paper>

        {/* Financial Data */}
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
            Financial Data
          </Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Purchase Price (AUD) *"
                type="number"
                value={formData.purchasePrice}
                onChange={handleInputChange('purchasePrice')}
                error={!!errors.purchasePrice}
                helperText={errors.purchasePrice}
                inputProps={{ min: 0 }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Current Value (AUD) *"
                type="number"
                value={formData.currentValue}
                onChange={handleInputChange('currentValue')}
                error={!!errors.currentValue}
                helperText={errors.currentValue}
                inputProps={{ min: 0 }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                fullWidth
                label="Depreciation Rate (% per year) *"
                type="number"
                value={formData.depreciationRate}
                onChange={handleInputChange('depreciationRate')}
                error={!!errors.depreciationRate}
                helperText={errors.depreciationRate}
                inputProps={{ min: 0, max: 100, step: 0.1 }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                fullWidth
                label="Maintenance Cost per Hour (AUD) *"
                type="number"
                value={formData.maintenanceCostPerHour}
                onChange={handleInputChange('maintenanceCostPerHour')}
                error={!!errors.maintenanceCostPerHour}
                helperText={errors.maintenanceCostPerHour}
                inputProps={{ min: 0, step: 0.01 }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                fullWidth
                label="Insurance Value (AUD) *"
                type="number"
                value={formData.insuranceValue}
                onChange={handleInputChange('insuranceValue')}
                error={!!errors.insuranceValue}
                helperText={errors.insuranceValue}
                inputProps={{ min: 0 }}
              />
            </Grid>

            {/* Lease Rates */}
            <Grid size={{ xs: 12 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.hasLeaseRates}
                    onChange={handleSwitchChange('hasLeaseRates')}
                  />
                }
                label="Enable Lease Rates"
              />
            </Grid>

            {formData.hasLeaseRates && (
              <>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField
                    fullWidth
                    label="Daily Rate (AUD) *"
                    type="number"
                    value={formData.dailyRate}
                    onChange={handleInputChange('dailyRate')}
                    error={!!errors.dailyRate}
                    helperText={errors.dailyRate}
                    inputProps={{ min: 0, step: 0.01 }}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField
                    fullWidth
                    label="Weekly Rate (AUD) *"
                    type="number"
                    value={formData.weeklyRate}
                    onChange={handleInputChange('weeklyRate')}
                    error={!!errors.weeklyRate}
                    helperText={errors.weeklyRate}
                    inputProps={{ min: 0, step: 0.01 }}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField
                    fullWidth
                    label="Monthly Rate (AUD) *"
                    type="number"
                    value={formData.monthlyRate}
                    onChange={handleInputChange('monthlyRate')}
                    error={!!errors.monthlyRate}
                    helperText={errors.monthlyRate}
                    inputProps={{ min: 0, step: 0.01 }}
                  />
                </Grid>
              </>
            )}
          </Grid>
        </Paper>

        {/* Components */}
        <Paper sx={{ p: 3, mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Components ({formData.components.length})
            </Typography>
            <Button
              startIcon={<AddIcon />}
              onClick={addComponent}
              variant="outlined"
              size="small"
            >
              Add Component
            </Button>
          </Box>

          {formData.components.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
              No components added yet
            </Typography>
          ) : (
            <Grid container spacing={2}>
              {formData.components.map((component) => (
                <Grid size={{ xs: 12, sm: 6, md: 4 }} key={component.id}>
                  <Card variant="outlined">
                    <CardContent sx={{ pb: 1 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                        {component.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                        {component.manufacturer}
                      </Typography>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="caption">
                          Part: {component.partNumber}
                        </Typography>
                        <Chip
                          label={`Qty: ${component.quantity}`}
                          size="small"
                          variant="outlined"
                        />
                      </Box>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {formatCurrency(component.unitCost)}
                      </Typography>
                    </CardContent>
                    <CardActions sx={{ pt: 0 }}>
                      <Button
                        size="small"
                        startIcon={<EditIcon />}
                        onClick={() => editComponent(component)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="small"
                        color="error"
                        startIcon={<DeleteIcon />}
                        onClick={() => deleteComponent(component.id)}
                      >
                        Delete
                      </Button>
                    </CardActions>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}

          {/* Component Form Dialog */}
          {showComponentForm && (
            <Paper sx={{ mt: 3, p: 3, bgcolor: 'grey.50' }}>
              <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
                {editingComponent ? 'Edit Component' : 'Add Component'}
              </Typography>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    label="Component Name"
                    value={componentForm.name}
                    onChange={(e) => setComponentForm(prev => ({ ...prev, name: e.target.value }))}
                    size="small"
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    label="Part Number"
                    value={componentForm.partNumber}
                    onChange={(e) => setComponentForm(prev => ({ ...prev, partNumber: e.target.value }))}
                    size="small"
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    label="Manufacturer"
                    value={componentForm.manufacturer}
                    onChange={(e) => setComponentForm(prev => ({ ...prev, manufacturer: e.target.value }))}
                    size="small"
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    label="Serial Number"
                    value={componentForm.serialNumber}
                    onChange={(e) => setComponentForm(prev => ({ ...prev, serialNumber: e.target.value }))}
                    size="small"
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField
                    fullWidth
                    label="Quantity"
                    type="number"
                    value={componentForm.quantity}
                    onChange={(e) => setComponentForm(prev => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))}
                    inputProps={{ min: 1 }}
                    size="small"
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField
                    fullWidth
                    label="Unit Cost (AUD)"
                    type="number"
                    value={componentForm.unitCost}
                    onChange={(e) => setComponentForm(prev => ({ ...prev, unitCost: parseFloat(e.target.value) || 0 }))}
                    inputProps={{ min: 0, step: 0.01 }}
                    size="small"
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField
                    fullWidth
                    label="Warranty Expiry"
                    type="date"
                    value={componentForm.warrantyExpiry}
                    onChange={(e) => setComponentForm(prev => ({ ...prev, warrantyExpiry: e.target.value }))}
                    size="small"
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
              </Grid>
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }}>
                <Button onClick={() => setShowComponentForm(false)} size="small">
                  Cancel
                </Button>
                <Button onClick={saveComponent} variant="contained" size="small">
                  {editingComponent ? 'Update' : 'Add'} Component
                </Button>
              </Box>
            </Paper>
          )}
        </Paper>

        {/* Aircraft Compatibility */}
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
            Aircraft Compatibility
          </Typography>
          <Autocomplete
            multiple
            options={compatibleAircraftOptions.map((item) => item.id)}
            value={formData.compatibleAircraft}
            onChange={handleCompatibleAircraftChange}
            getOptionLabel={(option) => {
              const item = aircraft.find((candidate) => candidate.id === option);
              return item ? `${item.registration} — ${item.manufacturer} ${item.model}` : option;
            }}
            renderTags={renderCompatibleAircraftTags}
            renderInput={renderCompatibleAircraftInput}
          />
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
            {saving ? 'Saving...' : kitId ? 'Update Equipment Kit' : 'Create Equipment Kit'}
          </Button>
        </Box>
      </Box>
  );
}
