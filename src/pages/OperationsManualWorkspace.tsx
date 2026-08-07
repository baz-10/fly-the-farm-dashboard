import React from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, Grid, Skeleton, Stack, TextField, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { useNavigate } from 'react-router-dom';
import { createComplianceApi } from '../services/complianceApi';

const initialForm = { title: 'RPAS Operations Manual', effectiveDate: '', reviewDueDate: '' };

export default function OperationsManualWorkspace() {
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
      setError(caught instanceof Error ? caught.message : 'Operations Manual evidence could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [api]);

  React.useEffect(() => { void load(); }, [load]);

  const publish = async () => {
    if (!form.effectiveDate || !file) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await api.publishManual({
        ...form,
        documentId: data?.operationsManual?.document_id,
        expectedVersion: data?.operationsManual?.document_row_version,
      }, file);
      setMessage('Operations Manual published.');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Operations Manual could not be published.');
    } finally {
      setSaving(false);
    }
  };

  const current = data?.operationsManual;

  return <Box sx={{ maxWidth: 1080, mx: 'auto', pb: 6 }}>
    <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/compliance')} sx={{ mb: 2 }}>
      Back to CASA Compliance
    </Button>
    <Stack spacing={0.75} sx={{ mb: 3 }}>
      <Typography variant="overline" color="text.secondary">CASA COMPLIANCE</Typography>
      <Typography component="h1" variant="h3" fontWeight={850}>Operations Manual</Typography>
      <Typography color="text.secondary">Publish and preserve the approved manual version governing your organisation’s operations.</Typography>
    </Stack>

    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    {message && <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert>}

    {loading ? <Skeleton height={180} /> : <Grid container spacing={3}>
      <Grid size={{ xs: 12, md: 4 }}>
        <Card variant="outlined"><CardContent>
          <Stack spacing={1.5}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="h6" fontWeight={850}>Current status</Typography>
              <Chip label={current ? 'Published' : 'Not yet published'} color={current ? 'success' : 'error'} />
            </Stack>
            {current ? <>
              <Box><Typography variant="caption" color="text.secondary">Document</Typography><Typography fontWeight={750}>{current.title || 'RPAS Operations Manual'}</Typography></Box>
              <Box><Typography variant="caption" color="text.secondary">Effective date</Typography><Typography fontWeight={750}>{current.effective_date || 'Not recorded'}</Typography></Box>
              <Box><Typography variant="caption" color="text.secondary">Review due</Typography><Typography fontWeight={750}>{current.review_due_date || 'No review date recorded'}</Typography></Box>
              <Typography variant="body2" color="text.secondary">This is the current authoritative published version held by Spray Command.</Typography>
            </> : <Typography variant="body2" color="text.secondary">Publish the approved Operations Manual so its controlling version is available across compliance and Mission evidence.</Typography>}
          </Stack>
        </CardContent></Card>
      </Grid>

      <Grid size={{ xs: 12, md: 8 }}>
        <Card variant="outlined"><CardContent>
          <Stack spacing={2}>
            <Box><Typography variant="h5" fontWeight={850}>{current ? 'Publish a new approved version' : 'Publish the approved Operations Manual'}</Typography><Typography color="text.secondary" sx={{ mt: 0.5 }}>Each publication creates protected evidence. Earlier versions and Mission history remain unchanged.</Typography></Box>
            <Alert severity="info">Confirm the document has completed your organisation’s approval process before publishing it here.</Alert>
            <TextField label="Document title" value={form.title} onChange={event => setForm(value => ({ ...value, title: event.target.value }))} />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField required fullWidth type="date" label="Effective date" InputLabelProps={{ shrink: true }} value={form.effectiveDate} onChange={event => setForm(value => ({ ...value, effectiveDate: event.target.value }))} />
              <TextField fullWidth type="date" label="Review due date" InputLabelProps={{ shrink: true }} value={form.reviewDueDate} onChange={event => setForm(value => ({ ...value, reviewDueDate: event.target.value }))} />
            </Stack>
            <Button component="label" variant="outlined" startIcon={<UploadFileIcon />} sx={{ minHeight: 48 }}>
              {file?.name || 'Choose Operations Manual'}
              <input aria-label="Choose Operations Manual" hidden type="file" accept="application/pdf" onChange={event => setFile(event.target.files?.[0] || null)} />
            </Button>
            <Button variant="contained" disabled={!form.effectiveDate || !file || saving} onClick={() => void publish()} sx={{ minHeight: 48 }}>
              {saving ? 'Publishing…' : 'Publish Operations Manual'}
            </Button>
          </Stack>
        </CardContent></Card>
      </Grid>
    </Grid>}
  </Box>;
}
