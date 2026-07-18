import React from 'react';
import { Alert, Box, Button, Divider, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { DeploymentAsset, DeploymentAssetInput, TruckProfile, TruckOperatingCosts } from '../types/workPack';

interface TruckProfileFormProps {
  truck?: TruckProfile;
  asset?: DeploymentAsset;
  showFinancials: boolean;
  onSave: (input: DeploymentAssetInput) => void | Promise<void>;
  onCancel: () => void;
}

const EMPTY_COSTS: TruckOperatingCosts = {
  purchasePrice: 0,
  currentValue: 0,
  financePaymentMonthly: 0,
  registrationAnnual: 0,
  insuranceAnnual: 0,
  depreciationAnnual: 0,
  servicingAnnual: 0,
  tyresAnnual: 0,
  fuelCostPerLitre: 0,
  averageFuelLitresPer100Km: 0,
  costPerHour: 0,
  costPerDay: 0,
  costPerKm: 0,
};

function emptyTruck(): DeploymentAssetInput {
  return {
    assetType: 'truck',
    registration: '', name: '', manufacturer: '', model: '', year: new Date().getFullYear(), vin: '',
    ownershipType: 'owned', payloadCapacityKg: 0, operationalNotes: '', status: 'available', costs: EMPTY_COSTS,
  };
}

export default function TruckProfileForm({ truck, asset, showFinancials, onSave, onCancel }: TruckProfileFormProps) {
  const existing = asset || (truck ? { ...truck, assetType: 'truck' as const } : undefined);
  const [form, setForm] = React.useState<DeploymentAssetInput>(() => existing
    ? (({ id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...input }) => input)(existing)
    : emptyTruck());
  const [error, setError] = React.useState('');

  const setField = <K extends keyof DeploymentAssetInput>(field: K, value: DeploymentAssetInput[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };
  const setCost = (field: keyof TruckOperatingCosts, value: string) => {
    setForm((current) => ({
      ...current,
      costs: { ...current.costs, [field]: Math.max(0, Number(value) || 0) },
    }));
  };
  const save = () => {
    if (!form.registration.trim()) return setError(`Enter the ${form.assetType} registration.`);
    if (!form.name.trim()) return setError('Enter a name operators will recognise.');
    if (!form.manufacturer.trim() || !form.model.trim()) return setError('Enter the manufacturer and model.');
    setError('');
    onSave({ ...form, registration: form.registration.trim().toUpperCase(), name: form.name.trim() });
  };

  const fieldGrid = { display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 };
  const moneyFields: Array<[keyof TruckOperatingCosts, string]> = [
    ['purchasePrice', 'Purchase price'], ['currentValue', 'Current value'],
    ['financePaymentMonthly', 'Monthly finance payment'], ['registrationAnnual', 'Annual registration'],
    ['insuranceAnnual', 'Annual insurance'], ['depreciationAnnual', 'Annual depreciation'],
    ['servicingAnnual', 'Annual servicing'], ['tyresAnnual', 'Annual tyres'],
    ['fuelCostPerLitre', 'Fuel cost per litre'], ['averageFuelLitresPer100Km', 'Fuel litres per 100 km'],
    ['costPerHour', 'Cost per hour'], ['costPerDay', 'Cost per day'], ['costPerKm', 'Cost per kilometre'],
  ];

  return (
    <Stack spacing={3}>
      {error && <Alert severity="error">{error}</Alert>}
      <Box>
        <Typography variant="overline" color="text.secondary">Deployment asset identity</Typography>
        <Box sx={fieldGrid}>
          <TextField select label="Asset type" value={form.assetType} onChange={(e) => setField('assetType', e.target.value as DeploymentAssetInput['assetType'])}>
            <MenuItem value="truck">Truck</MenuItem><MenuItem value="trailer">Trailer</MenuItem>
          </TextField>
          <TextField label="Registration" value={form.registration} onChange={(e) => setField('registration', e.target.value)} required />
          <TextField label="Asset name" value={form.name} onChange={(e) => setField('name', e.target.value)} required />
          <TextField label="Manufacturer" value={form.manufacturer} onChange={(e) => setField('manufacturer', e.target.value)} required />
          <TextField label="Model" value={form.model} onChange={(e) => setField('model', e.target.value)} required />
          <TextField label="Year" type="number" value={form.year} onChange={(e) => setField('year', Number(e.target.value))} />
          <TextField label="VIN" value={form.vin} onChange={(e) => setField('vin', e.target.value)} />
        </Box>
      </Box>
      <Divider />
      <Box>
        <Typography variant="overline" color="text.secondary">Operational profile</Typography>
        <Box sx={fieldGrid}>
          <TextField select label="Status" value={form.status} onChange={(e) => setField('status', e.target.value as DeploymentAssetInput['status'])}>
            <MenuItem value="available">Available</MenuItem><MenuItem value="assigned">Assigned</MenuItem>
            <MenuItem value="maintenance">Maintenance</MenuItem><MenuItem value="retired">Retired</MenuItem>
          </TextField>
          <TextField label="Payload capacity (kg)" type="number" value={form.payloadCapacityKg || 0} onChange={(e) => setField('payloadCapacityKg', Number(e.target.value))} />
          <TextField label="Operational notes" value={form.operationalNotes} onChange={(e) => setField('operationalNotes', e.target.value)} multiline minRows={3} sx={{ gridColumn: { md: '1 / -1' } }} />
        </Box>
      </Box>
      {showFinancials && (
        <>
          <Divider />
          <Box>
            <Typography variant="overline" color="text.secondary">Cost model</Typography>
            <Box sx={fieldGrid}>
              <TextField select label="Ownership" value={form.ownershipType} onChange={(e) => setField('ownershipType', e.target.value as DeploymentAssetInput['ownershipType'])}>
                <MenuItem value="owned">Owned</MenuItem><MenuItem value="financed">Financed</MenuItem><MenuItem value="leased">Leased</MenuItem>
              </TextField>
              {moneyFields.map(([field, label]) => (
                <TextField key={field} label={label} type="number" value={form.costs[field]} onChange={(e) => setCost(field, e.target.value)} inputProps={{ min: 0, step: 'any' }} />
              ))}
            </Box>
          </Box>
        </>
      )}
      <Stack direction="row" justifyContent="flex-end" spacing={1.5}>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="contained" onClick={save}>Save {form.assetType}</Button>
      </Stack>
    </Stack>
  );
}
