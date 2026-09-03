import React from 'react';
import { Alert, Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { FleetAsset, FleetAssetCreateInput, FleetAssetType } from '../types/fleetAsset';

interface LocationOption { id: string; name: string; }

interface FleetAssetFormProps {
  asset?: FleetAsset;
  locations: LocationOption[];
  locationsReady: boolean;
  onSave: (input: FleetAssetCreateInput) => void | Promise<void>;
  onCancel: () => void;
}

const types: Array<[FleetAssetType, string]> = [
  ['truck', 'Truck'], ['trailer', 'Trailer'], ['generator', 'Generator'], ['crane', 'Crane'],
  ['pump', 'Pump'], ['compressor', 'Compressor'], ['other', 'Other equipment'],
];

function initial(asset?: FleetAsset): FleetAssetCreateInput {
  return asset ? {
    operatingLocationId: asset.operatingLocationId, assetType: asset.assetType, assetIdentifier: asset.assetIdentifier,
    registration: asset.registration, vin: asset.vin, serialNumber: asset.serialNumber, manufacturer: asset.manufacturer,
    model: asset.model, manufactureYear: asset.manufactureYear, status: asset.status, notes: asset.notes,
  } : { operatingLocationId: '', assetType: 'truck', assetIdentifier: '', status: 'available', notes: '' };
}

export default function FleetAssetForm({ asset, locations, locationsReady, onSave, onCancel }: FleetAssetFormProps) {
  const [form, setForm] = React.useState<FleetAssetCreateInput>(() => initial(asset));
  const [error, setError] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const resolvedLocationId = locationsReady && locations.some((location) => location.id === form.operatingLocationId)
    ? form.operatingLocationId
    : locationsReady && locations.length === 1 ? locations[0].id : '';

  React.useEffect(() => {
    setForm((current) => {
      if (!locationsReady) return { ...current, operatingLocationId: '' };
      if (locations.some((location) => location.id === current.operatingLocationId)) return current;
      return { ...current, operatingLocationId: locations.length === 1 ? locations[0].id : '' };
    });
  }, [locations, locationsReady]);

  const set = <K extends keyof FleetAssetCreateInput>(field: K, value: FleetAssetCreateInput[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const save = async () => {
    if (!locationsReady || !locations.some((location) => location.id === resolvedLocationId)) return setError('Select an authorised Base.');
    if (!form.assetIdentifier.trim()) return setError('Enter an asset identifier.');
    if (['truck', 'trailer'].includes(form.assetType) && !form.registration?.trim()) return setError(`Enter the ${form.assetType} registration.`);
    setError('');
    setSaving(true);
    try {
      await onSave({
        ...form, operatingLocationId: resolvedLocationId,
        assetIdentifier: form.assetIdentifier.trim(),
        registration: form.registration?.trim().toUpperCase() || undefined,
        vin: form.vin?.trim().toUpperCase() || undefined,
        serialNumber: form.serialNumber?.trim().toUpperCase() || undefined,
        manufacturer: form.manufacturer?.trim() || undefined,
        model: form.model?.trim() || undefined,
        notes: form.notes.trim(),
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Fleet asset could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const ready = locationsReady && locations.length > 0;
  const vehicle = form.assetType === 'truck' || form.assetType === 'trailer';
  const grid = { display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 };

  return <Stack spacing={3}>
    {error && <Alert severity="error">{error}</Alert>}
    {!locationsReady && <Alert severity="info">Loading authorised Bases…</Alert>}
    {locationsReady && locations.length === 0 && <Alert severity="warning">No authorised Base is available. Ask an Organisation Administrator to assign one.</Alert>}
    <Box>
      <Typography variant="overline" color="text.secondary">Asset identity</Typography>
      <Box sx={grid}>
        <TextField select label="Base" value={resolvedLocationId} disabled={!ready || saving} onChange={(event) => set('operatingLocationId', event.target.value)} required>
          {locations.map((location) => <MenuItem key={location.id} value={location.id}>{location.name}</MenuItem>)}
        </TextField>
        <TextField select label="Asset type" value={form.assetType} disabled={!ready || saving} onChange={(event) => set('assetType', event.target.value as FleetAssetType)}>
          {types.map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
        </TextField>
        <TextField label="Asset identifier" value={form.assetIdentifier} disabled={!ready || saving} onChange={(event) => set('assetIdentifier', event.target.value)} required />
        {vehicle && <TextField label="Registration" value={form.registration || ''} disabled={!ready || saving} onChange={(event) => set('registration', event.target.value)} required />}
        {vehicle && <TextField label="VIN" value={form.vin || ''} disabled={!ready || saving} onChange={(event) => set('vin', event.target.value)} />}
        <TextField label="Serial number" value={form.serialNumber || ''} disabled={!ready || saving} onChange={(event) => set('serialNumber', event.target.value)} />
        <TextField label="Manufacturer" value={form.manufacturer || ''} disabled={!ready || saving} onChange={(event) => set('manufacturer', event.target.value)} />
        <TextField label="Model" value={form.model || ''} disabled={!ready || saving} onChange={(event) => set('model', event.target.value)} />
        <TextField label="Year" type="number" value={form.manufactureYear || ''} disabled={!ready || saving} onChange={(event) => set('manufactureYear', event.target.value ? Number(event.target.value) : undefined)} inputProps={{ min: 1900, max: 2200 }} />
        <TextField select label="Status" value={form.status} disabled={!ready || saving} onChange={(event) => set('status', event.target.value as FleetAsset['status'])}>
          <MenuItem value="available">Available</MenuItem><MenuItem value="assigned">Assigned</MenuItem>
          <MenuItem value="maintenance">Maintenance</MenuItem><MenuItem value="retired">Retired</MenuItem>
        </TextField>
      </Box>
    </Box>
    <TextField label="Notes" multiline minRows={3} value={form.notes} disabled={!ready || saving} onChange={(event) => set('notes', event.target.value)} />
    <Stack direction="row" justifyContent="flex-end" spacing={1.5}>
      <Button onClick={onCancel} disabled={saving}>Cancel</Button>
      <Button variant="contained" disabled={!ready || saving} onClick={() => void save()}>Save asset</Button>
    </Stack>
  </Stack>;
}
