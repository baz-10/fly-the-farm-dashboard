import React from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, Divider, Grid, Stack, TextField, Typography } from '@mui/material';
import { organisationBrandingApi } from '../../services/organisationBrandingApi';

const value = (input: any) => input ?? '';
const fieldProps = { fullWidth: true, placeholder: ' ', slotProps: { inputLabel: { shrink: true } } } as const;

export default function OrganisationBranding({ api = organisationBrandingApi, canManage = true }: { api?: any; canManage?: boolean }) {
  const [state, setState] = React.useState<any>(null);
  const [form, setForm] = React.useState<any>({});
  const [error, setError] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [preview, setPreview] = React.useState('');

  const load = React.useCallback(() => api.read().then((response: any) => {
    setState(response);
    const profile = response.organisation?.profile || response.profile || {};
    setForm({
      legalBusinessName: value(profile.legal_business_name),
      tradingName: value(profile.trading_name),
      reportDisplayName: value(profile.report_display_name),
      businessIdentifierType: 'ABN',
      businessIdentifierValue: value(profile.business_identifier_value),
      primaryPhone: value(profile.primary_phone),
      primaryEmail: value(profile.primary_email),
      website: value(profile.website),
    });
  }).catch((cause: any) => setError(cause.message)), [api]);

  React.useEffect(() => { load(); }, [load]);
  React.useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const profile = state?.organisation?.profile || state?.profile || {};
  const logos = state?.logos || [];
  const entitlement = state?.organisation?.entitlement || state?.entitlement;
  const set = (key: string) => (event: any) => setForm((current: any) => ({ ...current, [key]: event.target.value }));
  const run = async (operation: () => Promise<any>) => {
    setSaving(true);
    setError('');
    try { await operation(); await load(); } catch (cause: any) { setError(cause.message); } finally { setSaving(false); }
  };
  const upload = async (file?: File) => {
    if (!file) return;
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
    await run(() => api.uploadLogo(file));
  };

  if (!state && !error) return <Typography>Loading organisation branding…</Typography>;
  return <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}><CardContent><Stack spacing={2}>
    <Box><Typography variant="h5">Report identity</Typography><Typography color="text.secondary">Organisation details and logo used by authoritative Spray Command reports.</Typography></Box>
    {error && <Alert severity="error">{error}</Alert>}
    <Alert severity={entitlement?.capabilityCode === 'BRANDING_UNAVAILABLE' ? 'info' : 'success'}>Capability: {entitlement?.capabilityCode || 'Not configured'}. Spray Command attribution remains mandatory.</Alert>
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, md: 6 }}><TextField {...fieldProps} label="Legal business name" value={form.legalBusinessName || ''} onChange={set('legalBusinessName')} /></Grid>
      <Grid size={{ xs: 12, md: 6 }}><TextField {...fieldProps} label="Trading name" value={form.tradingName || ''} onChange={set('tradingName')} /></Grid>
      <Grid size={12}><TextField {...fieldProps} label="Report display name" value={form.reportDisplayName || ''} onChange={set('reportDisplayName')} /></Grid>
      <Grid size={12}><TextField {...fieldProps} label="ABN" value={form.businessIdentifierValue || ''} onChange={set('businessIdentifierValue')} /></Grid>
      <Grid size={{ xs: 12, md: 6 }}><TextField {...fieldProps} label="Primary email" value={form.primaryEmail || ''} onChange={set('primaryEmail')} /></Grid>
      <Grid size={{ xs: 12, md: 6 }}><TextField {...fieldProps} label="Primary phone" value={form.primaryPhone || ''} onChange={set('primaryPhone')} /></Grid>
      <Grid size={12}><TextField {...fieldProps} label="Website" value={form.website || ''} onChange={set('website')} /></Grid>
    </Grid>
    <Button variant="contained" disabled={!canManage || saving} onClick={() => run(() => api.update(profile.row_version, form))}>Save report identity</Button>
    <Divider /><Typography variant="h6">Organisation logo</Typography>
    <Typography variant="body2">PNG, JPEG or WebP · maximum 5 MiB and 6000 × 6000 px. Originals and checksums are retained as immutable versions.</Typography>
    {preview && <Box component="img" src={preview} alt="Local logo preview" sx={{ maxWidth: 320, height: 120, objectFit: 'contain', alignSelf: 'flex-start' }} />}
    <Button component="label" variant="outlined" disabled={!canManage || saving}>Upload logo version<input hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={event => void upload(event.target.files?.[0])} /></Button>
    {logos.map((logo: any) => <Stack key={`${logo.internalFileId}-${logo.fileVersion}`} direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
      <Typography sx={{ flex: 1 }}>{logo.originalFilename} · version {logo.fileVersion} · {logo.width}×{logo.height}</Typography>
      <Chip label={logo.active ? 'Active' : 'Retained'} color={logo.active ? 'success' : 'default'} />
      {!logo.active && <Button disabled={!canManage || saving} onClick={() => run(() => api.activateLogo(profile.row_version, logo.internalFileId, logo.fileVersion))}>Use this logo</Button>}
    </Stack>)}
    {profile.active_logo_file_id && <Button color="warning" disabled={!canManage || saving} onClick={() => run(() => api.removeLogo(profile.row_version))}>Remove active logo</Button>}
    <Divider /><Box sx={{ border: '1px solid', borderColor: 'divider', p: 2, borderRadius: 2 }}>
      <Typography variant="overline">Report header preview</Typography>
      <Typography variant="h5">{form.reportDisplayName || form.tradingName || form.legalBusinessName || 'Organisation name'}</Typography>
      <Typography>{form.primaryEmail}{form.primaryPhone ? ` · ${form.primaryPhone}` : ''}</Typography>
      <Typography variant="caption" color="text.secondary">Generated by Spray Command</Typography>
    </Box>
  </Stack></CardContent></Card>;
}
