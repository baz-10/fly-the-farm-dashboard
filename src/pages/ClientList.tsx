import React, { useState, useRef } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  Typography,
  Box,
  Card,
  CardContent,
  CardActionArea,
  Grid,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stack,
  Alert,
  Snackbar,
  IconButton,
  MenuItem,
  Divider,
  alpha,
  useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import PersonIcon from '@mui/icons-material/Person';
import BusinessIcon from '@mui/icons-material/Business';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import AssignmentIcon from '@mui/icons-material/Assignment';
import HistoryIcon from '@mui/icons-material/History';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteIcon from '@mui/icons-material/Delete';
import PlaceIcon from '@mui/icons-material/Place';
import AddressAutocomplete, { AddressResult } from '../components/AddressAutocomplete';
import {
  getClients,
  saveClient,
  saveProperty,
  saveField,
  getClientSummary,
} from '../services/fieldManagementStore';
import { Client, ClientAddress } from '../types/fieldManagement';
import { AustralianState, ALL_STATES } from '../types/chemical';
import { useAuth } from '../contexts/AuthContext';

const emptyAddress = (): ClientAddress => ({
  label: 'Home',
  address: '',
  locality: '',
  state: 'NSW' as AustralianState,
  postcode: '',
});

export default function ClientList() {
  const navigate = useNavigate();
  const theme = useTheme();
  const { user } = useAuth();
  const [clients, setClients] = useState(getClients);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '' });
  const [formAddresses, setFormAddresses] = useState<ClientAddress[]>([emptyAddress()]);
  const [codeCopied, setCodeCopied] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isContractor = user?.role === 'contractor';
  const isClient = user?.role === 'client';
  const isAdmin = user?.role === 'admin';

  const filtered = clients.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = () => {
    if (!form.name.trim()) return;
    const addresses = formAddresses.filter((a) => a.address.trim() || a.locality.trim());
    const client = saveClient({
      ...form,
      addresses: addresses.length > 0 ? addresses : undefined,
      contractorUserId: user?.id || '',
    });
    setClients([...clients, client]);
    setDialogOpen(false);
    setForm({ name: '', phone: '', email: '', notes: '' });
    setFormAddresses([emptyAddress()]);
    navigate(`/jobs/client/${client.id}`);
  };

  const updateAddress = (index: number, updates: Partial<ClientAddress>) => {
    setFormAddresses((prev) => prev.map((a, i) => i === index ? { ...a, ...updates } : a));
  };

  const addAddress = () => {
    setFormAddresses((prev) => [...prev, emptyAddress()]);
  };

  const removeAddress = (index: number) => {
    setFormAddresses((prev) => prev.filter((_, i) => i !== index));
  };

  const copyInviteCode = () => {
    if (user?.inviteCode) {
      navigator.clipboard.writeText(user.inviteCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  };

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = !inQuotes; }
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const handleCSVImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = evt.target?.result as string;
        const lines = text.split(/\r?\n/).filter((l) => l.trim());
        if (lines.length < 2) {
          setSnackbar({ open: true, message: 'CSV file is empty or has no data rows.', severity: 'error' });
          return;
        }

        const header = parseCSVLine(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim());
        const col = (name: string, ...alts: string[]) =>
          header.findIndex((h) => h === name || alts.includes(h));

        const nameIdx = col('name', 'client name', 'client');
        const phoneIdx = col('phone');
        const emailIdx = col('email');
        const notesIdx = col('notes');
        const addressIdx = col('address', 'street address');
        const townIdx = col('town', 'locality', 'nearest town');
        const stateIdx = col('state');
        const postcodeIdx = col('postcode', 'post code');
        const propertyIdx = col('property name', 'property');
        const fieldIdx = col('field name', 'field', 'paddock name', 'paddock');
        const hectaresIdx = col('hectares', 'ha', 'size ha', 'area');

        if (nameIdx === -1) {
          setSnackbar({ open: true, message: 'CSV must have a "Name" column.', severity: 'error' });
          return;
        }

        // Track created entities to dedup across rows
        // key: lowercase client name → client record
        const clientMap = new Map<string, ReturnType<typeof saveClient>>();
        // key: clientId + '|' + lowercase property name → property record
        const propMap = new Map<string, ReturnType<typeof saveProperty>>();

        let clientCount = 0;
        let propCount = 0;
        let fieldCount = 0;
        let skipped = 0;

        for (let i = 1; i < lines.length; i++) {
          const values = parseCSVLine(lines[i]);
          const name = values[nameIdx]?.trim() || '';
          if (!name) { skipped++; continue; }

          const addr = addressIdx >= 0 ? values[addressIdx]?.trim() || '' : '';
          const town = townIdx >= 0 ? values[townIdx]?.trim() || '' : '';
          const stateVal = stateIdx >= 0 ? values[stateIdx]?.trim().toUpperCase() || '' : '';
          const postcode = postcodeIdx >= 0 ? values[postcodeIdx]?.trim() || '' : '';
          const propertyName = propertyIdx >= 0 ? values[propertyIdx]?.trim() || '' : '';
          const fieldName = fieldIdx >= 0 ? values[fieldIdx]?.trim() || '' : '';
          const hectares = hectaresIdx >= 0 ? parseFloat(values[hectaresIdx] || '') || 0 : 0;

          const validState = ALL_STATES.includes(stateVal as AustralianState) ? stateVal as AustralianState : 'NSW';
          const clientKey = name.toLowerCase();

          // Get or create client
          let client = clientMap.get(clientKey);
          if (!client) {
            // Build address from first row for this client
            const addresses: ClientAddress[] | undefined = (addr || town)
              ? [{ label: 'Primary', address: addr, locality: town, state: validState, postcode }]
              : undefined;

            client = saveClient({
              name,
              phone: phoneIdx >= 0 ? values[phoneIdx]?.trim() || '' : '',
              email: emailIdx >= 0 ? values[emailIdx]?.trim() || '' : '',
              addresses,
              notes: notesIdx >= 0 ? values[notesIdx]?.trim() || '' : '',
              contractorUserId: user?.id || '',
            });
            clientMap.set(clientKey, client);
            clientCount++;
          }

          // Get or create property if property name provided
          if (propertyName) {
            const propKey = `${client.id}|${propertyName.toLowerCase()}`;
            let property = propMap.get(propKey);
            if (!property) {
              property = saveProperty({
                clientId: client.id,
                name: propertyName,
                address: addr,
                state: validState,
                locality: town,
                lotPlan: '',
                notes: '',
              });
              propMap.set(propKey, property);
              propCount++;
            }

            // Create field if field name provided
            if (fieldName) {
              saveField({
                propertyId: property.id,
                name: fieldName,
                sizeHa: hectares,
                boundary: null,
                notes: '',
              });
              fieldCount++;
            }
          }
        }

        setClients(getClients());
        const parts: string[] = [];
        parts.push(`${clientCount} client${clientCount !== 1 ? 's' : ''}`);
        if (propCount > 0) parts.push(`${propCount} propert${propCount !== 1 ? 'ies' : 'y'}`);
        if (fieldCount > 0) parts.push(`${fieldCount} field${fieldCount !== 1 ? 's' : ''}`);
        let msg = `Imported ${parts.join(', ')}`;
        if (skipped > 0) msg += ` (${skipped} row${skipped !== 1 ? 's' : ''} skipped — no name)`;
        msg += '.';
        setSnackbar({ open: true, message: msg, severity: 'success' });
      } catch {
        setSnackbar({ open: true, message: 'Failed to parse CSV file. Check the format and try again.', severity: 'error' });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Client users go straight to their own area
  if (isClient && user?.clientRecordId && clients.length === 1) {
    return <Navigate to={`/jobs/client/${encodeURIComponent(user.clientRecordId)}`} replace />;
  }

  return (
    <Box>
      <Box className="ftf-animate-in" sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 800, color: 'primary.dark', fontSize: { xs: '1.5rem', md: '2rem' } }}>
              {isClient ? 'My Properties' : 'Your Clients'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {isClient
                ? 'Manage your properties, fields, and spray jobs'
                : 'Manage clients, properties, fields, and spray jobs'}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
            <Button
              variant="contained"
              color="secondary"
              startIcon={<UploadFileIcon />}
              onClick={() => navigate('/jobs/import')}
              sx={{ borderRadius: '10px', fontWeight: 700 }}
            >
              Import Spray Rec
            </Button>
            <Button
              variant="outlined"
              startIcon={<HistoryIcon />}
              onClick={() => navigate('/jobs/history')}
              sx={{ borderRadius: '10px', fontWeight: 700 }}
            >
              Job History
            </Button>
            {!isClient && (
              <>
                <Button
                  variant="outlined"
                  startIcon={<DownloadIcon />}
                  component="a"
                  href="/client-import-template.csv"
                  download="client-import-template.csv"
                  sx={{ borderRadius: '10px', fontWeight: 700 }}
                >
                  CSV Template
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<UploadFileIcon />}
                  onClick={() => fileInputRef.current?.click()}
                  sx={{ borderRadius: '10px', fontWeight: 700 }}
                >
                  Import CSV
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  hidden
                  onChange={handleCSVImport}
                />
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={() => setDialogOpen(true)}
                  sx={{ borderRadius: '10px', px: 3, fontWeight: 700 }}
                >
                  Add Client
                </Button>
              </>
            )}
          </Stack>
        </Box>

        {/* Contractor invite code */}
        {isContractor && user?.inviteCode && (
          <Box sx={{
            mb: 2.5, p: 1.5, borderRadius: '12px',
            bgcolor: alpha(theme.palette.primary.main, 0.04),
            border: `1px solid ${alpha(theme.palette.primary.main, 0.1)}`,
            display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap',
          }}>
            <Typography variant="caption" color="text.secondary" fontWeight={600}>
              Your Client Invite Code:
            </Typography>
            <Typography variant="body2" sx={{
              fontFamily: 'monospace', fontWeight: 800, letterSpacing: '0.15em',
              color: 'primary.main', bgcolor: alpha(theme.palette.primary.main, 0.08),
              px: 1.5, py: 0.25, borderRadius: '6px',
            }}>
              {user.inviteCode}
            </Typography>
            <Button size="small" startIcon={<ContentCopyIcon />} onClick={copyInviteCode} sx={{ fontWeight: 600, fontSize: '0.7rem' }}>
              {codeCopied ? 'Copied!' : 'Copy'}
            </Button>
            <Typography variant="caption" color="text.disabled">
              Share this with your clients so they can register and create jobs
            </Typography>
          </Box>
        )}

        {clients.length > 0 && (
          <TextField
            placeholder="Search clients..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            size="small"
            fullWidth
            sx={{ maxWidth: 400, mb: 3 }}
          />
        )}
      </Box>

      {filtered.length === 0 && clients.length === 0 && (
        <Box className="ftf-animate-in-delay-1" sx={{ textAlign: 'center', py: 8 }}>
          <Box sx={{
            width: 80, height: 80, borderRadius: '20px',
            bgcolor: alpha(theme.palette.primary.main, 0.08),
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', mb: 3,
          }}>
            <AssignmentIcon sx={{ fontSize: 40, color: 'primary.main' }} />
          </Box>
          <Typography variant="h6" sx={{ mb: 1, fontWeight: 700 }}>No clients yet</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3, maxWidth: 400, mx: 'auto' }}>
            Add your first client to start recording properties, fields, and spray jobs.
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setDialogOpen(true)}
            sx={{ borderRadius: '10px', px: 3, fontWeight: 700 }}
          >
            Add Your First Client
          </Button>
        </Box>
      )}

      <Grid container spacing={2} className="ftf-animate-in-delay-1">
        {filtered.map((client) => {
          const summary = getClientSummary(client.id);
          const primaryAddr = client.addresses?.[0];
          return (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={client.id}>
              <Card
                elevation={0}
                sx={{
                  height: '100%',
                  border: `1.5px solid ${alpha(theme.palette.primary.main, 0.1)}`,
                  borderRadius: '14px',
                  '&:hover': {
                    borderColor: alpha(theme.palette.primary.main, 0.3),
                    transform: 'translateY(-2px)',
                    boxShadow: `0 8px 24px ${alpha(theme.palette.primary.main, 0.08)}`,
                    '& .card-arrow': { opacity: 1, transform: 'translateX(0)' },
                  },
                }}
              >
                <CardActionArea onClick={() => navigate(`/jobs/client/${client.id}`)} sx={{ height: '100%' }}>
                  <CardContent sx={{ p: 3 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                      <Box sx={{
                        width: 44, height: 44, borderRadius: '12px',
                        bgcolor: alpha(theme.palette.primary.main, 0.08),
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <PersonIcon sx={{ color: 'primary.main' }} />
                      </Box>
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="h6" sx={{ fontSize: '1.05rem', fontWeight: 700, lineHeight: 1.2 }}>
                          {client.name}
                        </Typography>
                        {client.phone && (
                          <Typography variant="caption" color="text.secondary">{client.phone}</Typography>
                        )}
                      </Box>
                    </Box>

                    {primaryAddr && (primaryAddr.locality || primaryAddr.address) && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                        <PlaceIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                        <Typography variant="caption" color="text.secondary" noWrap>
                          {primaryAddr.locality ? `${primaryAddr.locality}, ${primaryAddr.state}` : primaryAddr.address}
                          {client.addresses && client.addresses.length > 1 && (
                            <Box component="span" sx={{ ml: 0.5, color: 'text.disabled' }}>
                              +{client.addresses.length - 1} more
                            </Box>
                          )}
                        </Typography>
                      </Box>
                    )}

                    <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
                      <Box>
                        <Typography variant="h5" sx={{ fontWeight: 800, color: 'primary.main', fontFamily: '"Outfit", system-ui', lineHeight: 1 }}>
                          {summary.propertyCount}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {summary.propertyCount === 1 ? 'Property' : 'Properties'}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography variant="h5" sx={{ fontWeight: 800, color: 'secondary.main', fontFamily: '"Outfit", system-ui', lineHeight: 1 }}>
                          {summary.fieldCount}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {summary.fieldCount === 1 ? 'Field' : 'Fields'}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography variant="h5" sx={{ fontWeight: 800, color: '#5b7a3a', fontFamily: '"Outfit", system-ui', lineHeight: 1 }}>
                          {summary.jobCount}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {summary.jobCount === 1 ? 'Job' : 'Jobs'}
                        </Typography>
                      </Box>
                    </Stack>

                    {summary.lastJobDate && (
                      <Typography variant="caption" sx={{ display: 'block', mt: 1.5, color: alpha(theme.palette.text.secondary, 0.6) }}>
                        Last job: {new Date(summary.lastJobDate).toLocaleDateString('en-AU')}
                      </Typography>
                    )}

                    <Box className="card-arrow" sx={{
                      display: 'flex', justifyContent: 'flex-end', mt: 1.5,
                      opacity: 0, transform: 'translateX(-8px)', transition: 'all 0.2s ease',
                    }}>
                      <ArrowForwardIcon sx={{ fontSize: 18, color: 'primary.main' }} />
                    </Box>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {/* Add Client Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth
        PaperProps={{ sx: { borderRadius: '16px' } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Add New Client</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            <TextField
              label="Client / Farmer Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              autoFocus
              fullWidth
            />
            <TextField
              label="Phone"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              fullWidth
            />
            <TextField
              label="Email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              fullWidth
            />

            <Divider sx={{ pt: 0.5 }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                Addresses
              </Typography>
            </Divider>

            {formAddresses.map((addr, idx) => (
              <Box key={idx} sx={{
                p: 2, borderRadius: '12px',
                border: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
                bgcolor: alpha(theme.palette.primary.main, 0.01),
              }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                  <TextField
                    label="Label"
                    value={addr.label}
                    onChange={(e) => updateAddress(idx, { label: e.target.value })}
                    size="small"
                    sx={{ width: 140 }}
                    select
                  >
                    {['Home', 'Office', 'Farm', 'Postal', 'Other'].map((l) => (
                      <MenuItem key={l} value={l}>{l}</MenuItem>
                    ))}
                  </TextField>
                  {formAddresses.length > 1 && (
                    <IconButton size="small" onClick={() => removeAddress(idx)} sx={{ color: 'error.main' }}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  )}
                </Box>
                <Stack spacing={1.5}>
                  <AddressAutocomplete
                    label="Search Address"
                    initialValue={addr.address}
                    lat={addr.lat}
                    lng={addr.lng}
                    onSelect={(result: AddressResult) => {
                      updateAddress(idx, {
                        address: result.address,
                        locality: result.locality,
                        state: result.state,
                        postcode: result.postcode,
                        lat: result.lat,
                        lng: result.lng,
                      });
                    }}
                    mapHeight={180}
                  />
                  <Stack direction="row" spacing={1.5}>
                    <TextField
                      label="Town / Locality"
                      value={addr.locality}
                      onChange={(e) => updateAddress(idx, { locality: e.target.value })}
                      size="small"
                      fullWidth
                    />
                    <TextField
                      label="State"
                      select
                      value={addr.state}
                      onChange={(e) => updateAddress(idx, { state: e.target.value as AustralianState })}
                      size="small"
                      sx={{ minWidth: 90 }}
                    >
                      {ALL_STATES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                    </TextField>
                    <TextField
                      label="Postcode"
                      value={addr.postcode}
                      onChange={(e) => updateAddress(idx, { postcode: e.target.value })}
                      size="small"
                      sx={{ width: 110 }}
                    />
                  </Stack>
                </Stack>
              </Box>
            ))}

            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={addAddress}
              sx={{ alignSelf: 'flex-start', fontWeight: 600 }}
            >
              Add Another Address
            </Button>

            <TextField
              label="Notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              multiline
              rows={2}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={!form.name.trim()} sx={{ borderRadius: '10px', fontWeight: 700 }}>
            Add Client
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity} variant="filled" onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
