import React from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, Grid, Skeleton, Stack, TextField, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { useNavigate } from 'react-router-dom';
import { createComplianceApi } from '../services/complianceApi';

const initialForm = { instrumentNumber: '', issueDate: '', expiryDate: '', holder: '', arn: '', conditions: '' };

export default function ReocComplianceWorkspace() {
  const navigate = useNavigate();
  const api = React.useMemo(() => createComplianceApi(), []);
  const [data, setData] = React.useState<any>(null);
  const [form, setForm] = React.useState(initialForm);
  const [file, setFile] = React.useState<File | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [message, setMessage] = React.useState('');

  const load = React.useCallback(async () => {
    try {
      setData(await api.overview());
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ReOC evidence could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [api]);

  React.useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!form.instrumentNumber || !form.expiryDate || !file) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await api.saveInstrument({
        operation: 'CREATE',
        instrumentType: 'REOC',
        instrumentNumber: form.instrumentNumber,
        issueDate: form.issueDate || null,
        expiryDate: form.expiryDate,
        status: 'CURRENT',
        scope: { legalCertificateHolder: form.holder, organisationArn: form.arn },
        conditions: form.conditions.split('\n').filter(Boolean),
      }, file);
      setMessage('ReOC certificate saved.');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ReOC certificate could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const current = data?.reoc;

  return <Box sx={{ maxWidth: 1080, mx: 'auto', pb: 6 }}>
    <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/compliance')} sx={{ mb: 2 }}>
      Back to CASA Compliance
    </Button>
    <Stack spacing={0.75} sx={{ mb: 3 }}>
      <Typography variant="overline" color="text.secondary">CASA COMPLIANCE</Typography>
      <Typography component="h1" variant="h3" fontWeight={850}>ReOC certificate</Typography>
      <Typography color="text.secondary">Manage the evidence proving your organisation’s current operating authority.</Typography>
    </Stack>

    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    {message && <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert>}

    {loading ? <Skeleton height={180} /> : <Grid container spacing={3}>
      <Grid size={{ xs: 12, md: 4 }}>
        <Card variant="outlined"><CardContent>
          <Stack spacing={1.5}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="h6" fontWeight={850}>Current status</Typography>
              <Chip label={current ? 'Recorded' : 'Evidence missing'} color={current ? 'success' : 'error'} />
            </Stack>
            {current ? <>
              <Box><Typography variant="caption" color="text.secondary">ReOC number</Typography><Typography fontWeight={750}>{current.instrument_number}</Typography></Box>
              <Box><Typography variant="caption" color="text.secondary">Expiry date</Typography><Typography fontWeight={750}>{current.expiry_date || 'No expiry recorded'}</Typography></Box>
              <Typography variant="body2" color="text.secondary">This is the current authoritative record held by Spray Command.</Typography>
            </> : <Typography variant="body2" color="text.secondary">Upload the current certificate so Spray Command can assess the organisation’s operating authority.</Typography>}
          </Stack>
        </CardContent></Card>
      </Grid>

      <Grid size={{ xs: 12, md: 8 }}>
        <Card variant="outlined"><CardContent>
          <Stack spacing={2}>
            <Box><Typography variant="h5" fontWeight={850}>{current ? 'Add renewed certificate evidence' : 'Add the current ReOC certificate'}</Typography><Typography color="text.secondary" sx={{ mt: 0.5 }}>Enter the certificate details once. Spray Command will reuse this authoritative record across compliance views.</Typography></Box>
            <TextField required label="ReOC number" value={form.instrumentNumber} onChange={event => setForm(value => ({ ...value, instrumentNumber: event.target.value }))} />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField fullWidth type="date" label="Issue date" InputLabelProps={{ shrink: true }} value={form.issueDate} onChange={event => setForm(value => ({ ...value, issueDate: event.target.value }))} />
              <TextField required fullWidth type="date" label="Expiry date" InputLabelProps={{ shrink: true }} value={form.expiryDate} onChange={event => setForm(value => ({ ...value, expiryDate: event.target.value }))} />
            </Stack>
            <TextField label="Legal certificate holder" value={form.holder} onChange={event => setForm(value => ({ ...value, holder: event.target.value }))} />
            <TextField label="Organisation ARN" value={form.arn} onChange={event => setForm(value => ({ ...value, arn: event.target.value }))} />
            <TextField multiline minRows={3} label="Certificate conditions" value={form.conditions} onChange={event => setForm(value => ({ ...value, conditions: event.target.value }))} />
            <Button component="label" variant="outlined" startIcon={<UploadFileIcon />} sx={{ minHeight: 48 }}>
              {file?.name || 'Choose ReOC certificate'}
              <input aria-label="Choose ReOC certificate" hidden type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={event => setFile(event.target.files?.[0] || null)} />
            </Button>
            <Button variant="contained" disabled={!form.instrumentNumber || !form.expiryDate || !file || saving} onClick={() => void save()} sx={{ minHeight: 48 }}>
              {saving ? 'Saving…' : 'Save ReOC certificate'}
            </Button>
          </Stack>
        </CardContent></Card>
      </Grid>
    </Grid>}
  </Box>;
}
