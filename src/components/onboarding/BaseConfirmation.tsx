import React from 'react';
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import AddressAutocomplete, { AddressResult } from '../AddressAutocomplete';
import { createOperationalApi, OperationalOperatingLocation } from '../../services/operationalApi';

type ConfirmationInput = {
  address: string;
  latitude: number;
  longitude: number;
  addressSource: 'ADDRESS_SEARCH' | 'MANUALLY_ADJUSTED';
  locationConfirmed: true;
  locationConfirmedAt: string;
};

type Props = {
  base: OperationalOperatingLocation;
  updateOperatingLocation?: (id: string, expectedVersion: number, input: ConfirmationInput) => Promise<OperationalOperatingLocation>;
  onSaved?: (base: OperationalOperatingLocation) => void;
  onReturn?: () => void;
};

const toAddressResult = (base: OperationalOperatingLocation): AddressResult | null => {
  if (!Number.isFinite(base.latitude) || !Number.isFinite(base.longitude)) return null;
  return {
    address: base.address,
    displayName: base.address,
    locality: '', state: 'QLD', postcode: '',
    lat: Number(base.latitude), lng: Number(base.longitude),
    coordinateSource: base.addressSource === 'MANUALLY_ADJUSTED' ? 'MANUALLY_ADJUSTED' : 'GEOCODED',
    locationConfirmedAt: base.locationConfirmedAt,
  };
};

export default function BaseConfirmation({ base, updateOperatingLocation, onSaved, onReturn }: Props) {
  const api = React.useMemo(() => createOperationalApi(), []);
  const update = updateOperatingLocation || ((id: string, expectedVersion: number, input: ConfirmationInput) => (
    api.operatingLocations.update(id, input, expectedVersion)
  ));
  const [location, setLocation] = React.useState<AddressResult | null>(() => toAddressResult(base));
  const [address, setAddress] = React.useState(base.address);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState('');

  const selectLocation = (result: AddressResult) => {
    setLocation(result);
    setAddress(result.address || result.displayName);
    setSaved(false);
    setError('');
  };

  const save = async () => {
    if (!location?.locationConfirmedAt || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) {
      setError('Search for your Base, adjust the pin if needed, then confirm the final map location.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const result = await update(base.id, base.rowVersion, {
        address: address.trim(), latitude: location.lat, longitude: location.lng,
        addressSource: location.coordinateSource === 'MANUALLY_ADJUSTED' ? 'MANUALLY_ADJUSTED' : 'ADDRESS_SEARCH',
        locationConfirmed: true, locationConfirmedAt: location.locationConfirmedAt,
      });
      setSaved(true);
      onSaved?.(result);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Your Base could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box component="section" aria-labelledby="confirm-base-heading">
      <Stack spacing={2}>
        <Box>
          <Typography id="confirm-base-heading" component="h2" variant="h5" fontWeight={900} tabIndex={-1}>Confirm your Base</Typography>
          <Typography color="text.secondary">Place the pin where your team normally prepares for work. You can move it without losing your address.</Typography>
        </Box>
        {error && <Alert severity="error">{error}</Alert>}
        {saved && <Alert severity="success">Your Base is confirmed and saved.</Alert>}
        <AddressAutocomplete
          key={`${base.id}-${base.rowVersion}`}
          label="Search Base address"
          initialValue={address}
          lat={location?.lat}
          lng={location?.lng}
          coordinateSource={location?.coordinateSource}
          locationConfirmedAt={location?.locationConfirmedAt}
          onInputChange={(value) => { setAddress(value); setSaved(false); }}
          onSelect={selectLocation}
          showMap
          mapHeight={320}
          size="medium"
        />
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
          <Button
            variant="contained"
            disabled={saving || !location?.locationConfirmedAt || !address.trim()}
            onClick={() => void save()}
          >
            {saving ? <><CircularProgress size={18} color="inherit" sx={{ mr: 1 }} />Saving…</> : 'Save confirmed Base'}
          </Button>
          {saved && <Button variant="outlined" onClick={onReturn}>Return to Getting Started</Button>}
        </Stack>
      </Stack>
    </Box>
  );
}
