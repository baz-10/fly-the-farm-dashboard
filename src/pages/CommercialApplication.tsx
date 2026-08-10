import React from 'react';
import {
  Alert, Box, Button, Card, CardContent, Checkbox, Container, Divider, FormControlLabel,
  Grid, Stack, TextField, Typography, alpha, useTheme,
} from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import AddressAutocomplete, { AddressResult } from '../components/AddressAutocomplete';
import PlatformBrand from '../brand/PlatformBrand';
import { submitCommercialApplication } from '../services/commercialOnboardingApi';

const CONSENT_VERSION = 'commercial-application-2026-08-09';
const STATE_TIMEZONES: Record<string, string> = {
  QLD: 'Australia/Brisbane', NSW: 'Australia/Sydney', ACT: 'Australia/Sydney',
  VIC: 'Australia/Melbourne', TAS: 'Australia/Hobart', SA: 'Australia/Adelaide',
  NT: 'Australia/Darwin', WA: 'Australia/Perth',
};

type FormState = {
  businessName: string; administratorName: string; administratorEmail: string;
  administratorPhone: string; baseName: string; baseAddress: string;
  latitude?: number; longitude?: number; timezone: string;
  addressSource?: 'GEOCODED' | 'MANUALLY_ADJUSTED'; locationConfirmedAt?: string;
  notes: string; consent: boolean;
};

const initialForm: FormState = {
  businessName: '', administratorName: '', administratorEmail: '', administratorPhone: '',
  baseName: '', baseAddress: '', timezone: 'Australia/Brisbane', notes: '', consent: false,
};

function SectionHeading({ children, detail }: { children: React.ReactNode; detail: string }) {
  return <Box sx={{ mb: 2.5 }}>
    <Typography component="h2" variant="h5" fontWeight={800}>{children}</Typography>
    <Typography variant="body2" color="text.secondary">{detail}</Typography>
  </Box>;
}

export default function CommercialApplication() {
  const theme = useTheme();
  const [form, setForm] = React.useState<FormState>(initialForm);
  const [error, setError] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [reference, setReference] = React.useState('');
  const set = (field: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement>) => setForm((current) => ({ ...current, [field]: event.target.value }));

  const addressChanged = (value: string) => setForm((current) => ({
    ...current, baseAddress: value, latitude: undefined, longitude: undefined,
    addressSource: undefined, locationConfirmedAt: undefined,
  }));
  const selectAddress = (result: AddressResult) => setForm((current) => ({
    ...current,
    baseAddress: result.displayName || result.address,
    latitude: result.lat,
    longitude: result.lng,
    timezone: STATE_TIMEZONES[result.state] || current.timezone,
    addressSource: result.coordinateSource || 'GEOCODED',
    locationConfirmedAt: result.locationConfirmedAt,
  }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!form.locationConfirmedAt || form.latitude === undefined || form.longitude === undefined || !form.addressSource) {
      setError('Search for the Base address, adjust the pin if needed, then confirm the final map location.');
      return;
    }
    if (!form.consent) { setError('Confirm the application details before sending.'); return; }
    setSubmitting(true);
    try {
      const receipt = await submitCommercialApplication({
        businessName: form.businessName.trim(), administratorName: form.administratorName.trim(),
        administratorEmail: form.administratorEmail.trim(), administratorPhone: form.administratorPhone.trim(),
        base: {
          name: form.baseName.trim(), address: form.baseAddress.trim(), latitude: form.latitude,
          longitude: form.longitude, timezone: form.timezone, addressSource: form.addressSource,
          locationConfirmedAt: form.locationConfirmedAt,
        },
        consentVersion: CONSENT_VERSION, notes: form.notes.trim(),
      });
      setReference(receipt.applicationReference);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Application could not be sent.');
    } finally { setSubmitting(false); }
  };

  if (reference) return <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', display: 'grid', placeItems: 'center', p: 2 }}>
    <Card variant="outlined" sx={{ maxWidth: 620, width: '100%', borderTop: '5px solid', borderTopColor: 'secondary.main' }}>
      <CardContent sx={{ p: { xs: 3, sm: 5 } }}>
        <CheckCircleOutlineRoundedIcon color="success" sx={{ fontSize: 46, mb: 2 }} />
        <Typography component="h1" variant="h4" fontWeight={850} gutterBottom>Application received</Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>Keep this application reference for your records.</Typography>
        <Box sx={{ bgcolor: alpha(theme.palette.primary.main, 0.06), borderRadius: 2, px: 2.5, py: 2, mb: 3 }}>
          <Typography variant="overline" color="text.secondary">Application reference</Typography>
          <Typography variant="h5" sx={{ fontFamily: 'ui-monospace, monospace', letterSpacing: '0.04em' }}>{reference}</Typography>
        </Box>
        <Typography>Our Platform team will review the business, administrator and Base details. Review occurs before any invitation is sent.</Typography>
      </CardContent>
    </Card>
  </Box>;

  return <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', pb: 8 }}>
    <Box sx={{ bgcolor: 'primary.dark', color: 'common.white', pt: { xs: 4, md: 7 }, pb: { xs: 9, md: 13 } }}>
      <Container maxWidth="md">
        <Box sx={{ display: 'inline-flex', bgcolor: 'rgba(255,255,255,0.96)', borderRadius: 2, px: 2, py: 1, mb: 4 }}><PlatformBrand /></Box>
        <Typography component="h1" variant="h2" sx={{ maxWidth: 700, color: 'inherit', fontSize: { xs: '2.35rem', md: '3.45rem' } }}>Apply for Spray Command</Typography>
        <Typography sx={{ color: alpha(theme.palette.common.white, 0.78), mt: 2, maxWidth: 620, fontSize: '1.05rem' }}>
          Tell us who will administer your workspace and where your first Base will be. The Platform team reviews every application before access is invited.
        </Typography>
      </Container>
    </Box>

    <Container maxWidth="md" sx={{ mt: { xs: -6, md: -9 }, position: 'relative' }}>
      <Card sx={{ boxShadow: '0 20px 55px rgba(10,31,10,0.14)', border: `1px solid ${alpha(theme.palette.primary.main, 0.08)}` }}>
        <CardContent sx={{ p: { xs: 2.5, sm: 4.5 } }}>
          {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
          <Box component="form" onSubmit={submit}>
            <SectionHeading detail="The legal or trading name that will appear in Spray Command.">Your business</SectionHeading>
            <TextField required fullWidth label="Business name" value={form.businessName} onChange={set('businessName')} inputProps={{ maxLength: 200 }} />

            <Divider sx={{ my: 4 }} />
            <SectionHeading detail="This person will receive the invitation and become the Organisation Administrator.">Your administrator</SectionHeading>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}><TextField required fullWidth label="Your name" value={form.administratorName} onChange={set('administratorName')} /></Grid>
              <Grid size={{ xs: 12, sm: 6 }}><TextField required fullWidth type="email" label="Email" value={form.administratorEmail} onChange={set('administratorEmail')} /></Grid>
              <Grid size={{ xs: 12, sm: 6 }}><TextField required fullWidth type="tel" label="Phone" value={form.administratorPhone} onChange={set('administratorPhone')} /></Grid>
            </Grid>

            <Divider sx={{ my: 4 }} />
            <SectionHeading detail="Search for the main dispatch point, check the pin and confirm its exact location.">Your Base</SectionHeading>
            <Stack spacing={2.5}>
              <TextField required fullWidth label="Base name" value={form.baseName} onChange={set('baseName')} inputProps={{ maxLength: 200 }} />
              <AddressAutocomplete label="Base address" size="medium" showMap mapHeight={330} initialValue={form.baseAddress} lat={form.latitude} lng={form.longitude} coordinateSource={form.addressSource} locationConfirmedAt={form.locationConfirmedAt} onInputChange={addressChanged} onSelect={selectAddress} />
              {form.latitude !== undefined && form.longitude !== undefined && <Box sx={{ borderLeft: '4px solid', borderColor: form.locationConfirmedAt ? 'success.main' : 'warning.main', pl: 2, py: 0.5 }}>
                <Typography fontWeight={750}>{form.locationConfirmedAt ? 'Base location confirmed' : 'Confirm the final Base location'}</Typography>
                <Typography variant="body2" color="text.secondary">{form.addressSource === 'MANUALLY_ADJUSTED' ? 'Manually adjusted location' : 'Address-derived location'} · {form.latitude.toFixed(6)}, {form.longitude.toFixed(6)} · {form.timezone}</Typography>
              </Box>}
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 4 }}><TextField fullWidth label="Latitude" value={form.latitude ?? ''} slotProps={{ input: { readOnly: true } }} /></Grid>
                <Grid size={{ xs: 12, sm: 4 }}><TextField fullWidth label="Longitude" value={form.longitude ?? ''} slotProps={{ input: { readOnly: true } }} /></Grid>
                <Grid size={{ xs: 12, sm: 4 }}><TextField fullWidth label="Timezone" value={form.timezone} slotProps={{ input: { readOnly: true } }} /></Grid>
              </Grid>
            </Stack>

            <Divider sx={{ my: 4 }} />
            <TextField fullWidth multiline minRows={3} label="Application notes" value={form.notes} onChange={set('notes')} inputProps={{ maxLength: 4000 }} helperText="Tell the reviewer anything useful about your business or intended use. Do not include passwords or sensitive operational records." />
            <FormControlLabel sx={{ alignItems: 'flex-start', mt: 2 }} control={<Checkbox checked={form.consent} onChange={(event) => setForm((current) => ({ ...current, consent: event.target.checked }))} />} label="I confirm these details are accurate and may be used to assess this Spray Command application." />
            <Button type="submit" variant="contained" size="large" endIcon={<ArrowForwardRoundedIcon />} disabled={submitting} sx={{ mt: 2, minWidth: { sm: 220 } }}>
              {submitting ? 'Sending application…' : 'Send application'}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Container>
  </Box>;
}
