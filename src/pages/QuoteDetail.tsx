import React, { useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Typography,
  Box,
  Card,
  CardContent,
  Button,
  Stack,
  Chip,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  MenuItem,
  TextField,
  Alert,
  alpha,
  useTheme,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PrintIcon from '@mui/icons-material/Print';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AssignmentIcon from '@mui/icons-material/Assignment';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { getQuoteById, updateQuote, deleteQuote, getQuoteConfig } from '../services/quoteStore';
import { getClients, getPropertiesByClient } from '../services/fieldManagementStore';
import { QuoteStatus } from '../types/quote';
import { formatCurrency } from '../utils/quoteCalculator';
import { useAuth } from '../contexts/AuthContext';
import { WorkflowMaturityBoundary } from '../components/productMaturity/WorkflowMaturityBoundary';

const STATUS_COLORS: Record<QuoteStatus, 'default' | 'info' | 'success' | 'warning' | 'error'> = {
  draft: 'default',
  sent: 'info',
  accepted: 'success',
  declined: 'error',
  expired: 'warning',
  invoiced: 'success',
};

export default function QuoteDetail() {
  const { quoteId } = useParams<{ quoteId: string }>();
  const navigate = useNavigate();
  const theme = useTheme();
  const { user } = useAuth();
  const printRef = useRef<HTMLDivElement>(null);

  const quote = useMemo(() => (quoteId ? getQuoteById(quoteId) : undefined), [quoteId]);
  const clients = useMemo(() => getClients(), []);
  const config = useMemo(() => getQuoteConfig(user?.id || ''), [user]);

  if (!quote) {
    return (
      <Box>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/quotes')}>
          Back to Quotes
        </Button>
        <Alert severity="error" sx={{ mt: 2 }}>Quote not found.</Alert>
      </Box>
    );
  }

  const client = clients.find((c) => c.id === quote.clientId);

  const handleStatusChange = (newStatus: QuoteStatus) => {
    updateQuote(quote.id, {
      status: newStatus,
      ...(newStatus === 'sent' ? { sentAt: new Date().toISOString() } : {}),
      ...(newStatus === 'accepted' ? { acceptedAt: new Date().toISOString() } : {}),
    });
    window.location.reload();
  };

  const handleDelete = () => {
    if (window.confirm('Delete this quote?')) {
      deleteQuote(quote.id);
      navigate('/quotes');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <Box>
      <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/quotes')} sx={{ mb: 2 }} className="no-print">
        Back to Quotes
      </Button>

      <div ref={printRef}>
        {/* Header */}
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 3 }} className="no-print">
          <Box>
            <Stack direction="row" spacing={2} alignItems="center">
              <Typography variant="h4" fontWeight={800}>
                {quote.quoteNumber}
              </Typography>
              <Chip
                label={quote.status}
                color={STATUS_COLORS[quote.status]}
                sx={{ fontWeight: 700, textTransform: 'capitalize' }}
              />
            </Stack>
            <Typography variant="body2" color="text.secondary">
              Created {new Date(quote.createdAt).toLocaleDateString('en-AU')}
              {quote.estimatedDate && ` · Spray date: ${quote.estimatedDate}`}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <TextField
              select
              size="small"
              value={quote.status}
              onChange={(e) => handleStatusChange(e.target.value as QuoteStatus)}
              sx={{ width: 140 }}
            >
              {(['draft', 'sent', 'accepted', 'declined', 'expired', 'invoiced'] as QuoteStatus[]).map((s) => (
                <MenuItem key={s} value={s} sx={{ textTransform: 'capitalize' }}>{s}</MenuItem>
              ))}
            </TextField>
            <Button variant="outlined" startIcon={<PrintIcon />} onClick={handlePrint}>
              Print
            </Button>
            <WorkflowMaturityBoundary moduleCode="quotes" workflowCode="pdf-export">
              <Button variant="outlined" disabled>Export PDF</Button>
            </WorkflowMaturityBoundary>
            {quote.status === 'accepted' && quote.fieldIds?.[0] && (
              <Button
                variant="outlined"
                startIcon={<AssignmentIcon />}
                onClick={() => {
                  const prefill = {
                    fromQuoteId: quote.id,
                    clientId: quote.clientId,
                    propertyId: quote.propertyId,
                    fieldId: quote.fieldIds?.[0],
                    jobDescription: quote.jobDescription,
                  };
                  sessionStorage.setItem('ftf_job_prefill', JSON.stringify(prefill));
                  navigate(`/jobs/client/${quote.clientId}/property/${quote.propertyId}/field/${quote.fieldIds?.[0]}/new-job`);
                }}
                sx={{ borderRadius: '10px', fontWeight: 700 }}
              >
                Create Job
              </Button>
            )}
            <Button variant="outlined" color="error" startIcon={<DeleteIcon />} onClick={handleDelete}>
              Delete
            </Button>
          </Stack>
        </Stack>

        {quote.jobIds && quote.jobIds.length > 0 && (
          <Alert severity="info" sx={{ mb: 2, borderRadius: '12px' }}>
            This quote has {quote.jobIds.length} linked job(s).
          </Alert>
        )}

        {/* Printable quote */}
        <Card sx={{ borderRadius: 3, mb: 3 }} id="quote-printable">
          <CardContent sx={{ p: { xs: 3, md: 4 } }}>
            {/* Business header */}
            {config?.businessName && (
              <Box sx={{ mb: 3, pb: 2, borderBottom: `2px solid ${theme.palette.primary.main}` }}>
                <Typography variant="h5" fontWeight={800} color="primary">
                  {config.businessName}
                </Typography>
                {config.businessABN && (
                  <Typography variant="caption" color="text.secondary">
                    ABN: {config.businessABN}
                  </Typography>
                )}
                <Stack direction="row" spacing={3} sx={{ mt: 0.5 }}>
                  {config.businessPhone && (
                    <Typography variant="caption" color="text.secondary">{config.businessPhone}</Typography>
                  )}
                  {config.businessEmail && (
                    <Typography variant="caption" color="text.secondary">{config.businessEmail}</Typography>
                  )}
                </Stack>
              </Box>
            )}

            {/* Quote info + client */}
            <Stack direction="row" justifyContent="space-between" sx={{ mb: 3 }}>
              <Box>
                <Typography variant="overline" color="text.secondary">Quote To</Typography>
                <Typography variant="subtitle1" fontWeight={700}>{client?.name || 'Unknown'}</Typography>
                {client?.phone && <Typography variant="body2">{client.phone}</Typography>}
                {client?.email && <Typography variant="body2">{client.email}</Typography>}
              </Box>
              <Box sx={{ textAlign: 'right' }}>
                <Typography variant="h6" fontWeight={800}>{quote.quoteNumber}</Typography>
                <Typography variant="body2">Date: {new Date(quote.createdAt).toLocaleDateString('en-AU')}</Typography>
                <Typography variant="body2">Valid until: {quote.validUntil}</Typography>
                {quote.estimatedDate && <Typography variant="body2">Est. spray date: {quote.estimatedDate}</Typography>}
              </Box>
            </Stack>

            {quote.jobDescription && (
              <Box sx={{ mb: 3, p: 2, bgcolor: alpha(theme.palette.primary.main, 0.04), borderRadius: 2 }}>
                <Typography variant="subtitle2" fontWeight={700}>Job Description</Typography>
                <Typography variant="body2">{quote.jobDescription}</Typography>
              </Box>
            )}

            {/* Line items */}
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: alpha(theme.palette.primary.main, 0.06) }}>
                    <TableCell sx={{ fontWeight: 700 }}>Description</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Qty</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Rate</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Amount</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {quote.lineItems.map((li) => (
                    <TableRow key={li.id}>
                      <TableCell>{li.description}</TableCell>
                      <TableCell align="right">{li.quantity} {li.unitLabel}</TableCell>
                      <TableCell align="right">{formatCurrency(li.unitRate)}</TableCell>
                      <TableCell align="right">{formatCurrency(li.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Totals */}
            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
              <Stack spacing={0.5} sx={{ minWidth: 280 }}>
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2">Subtotal</Typography>
                  <Typography variant="body2">{formatCurrency(quote.subtotal)}</Typography>
                </Stack>
                {quote.markupAmount > 0 && (
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2">Markup ({quote.markupPercent}%)</Typography>
                    <Typography variant="body2">{formatCurrency(quote.markupAmount)}</Typography>
                  </Stack>
                )}
                {quote.gstApplicable && (
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2">GST (10%)</Typography>
                    <Typography variant="body2">{formatCurrency(quote.gstAmount)}</Typography>
                  </Stack>
                )}
                <Divider />
                <Stack direction="row" justifyContent="space-between" sx={{ pt: 1 }}>
                  <Typography variant="h6" fontWeight={800}>
                    Total {quote.gstApplicable ? '(inc. GST)' : '(ex. GST)'}
                  </Typography>
                  <Typography variant="h5" fontWeight={800} color="primary">
                    {formatCurrency(quote.total)}
                  </Typography>
                </Stack>
              </Stack>
            </Box>

            {/* Notes and terms */}
            {quote.clientNotes && (
              <Box sx={{ mt: 3, p: 2, bgcolor: alpha(theme.palette.info.main, 0.04), borderRadius: 2 }}>
                <Typography variant="subtitle2" fontWeight={700}>Notes</Typography>
                <Typography variant="body2">{quote.clientNotes}</Typography>
              </Box>
            )}

            <Box sx={{ mt: 3, pt: 2, borderTop: `1px solid ${theme.palette.divider}` }}>
              <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                Terms & Conditions
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>
                {quote.termsAndConditions}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                Payment terms: {quote.paymentTermsDays} days
              </Typography>
            </Box>
          </CardContent>
        </Card>
      </div>
    </Box>
  );
}
