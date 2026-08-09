import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Typography,
  Box,
  Card,
  CardContent,
  Button,
  Stack,
  Alert,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  alpha,
  useTheme,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteIcon from '@mui/icons-material/Delete';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import DescriptionIcon from '@mui/icons-material/Description';
import AssessmentIcon from '@mui/icons-material/Assessment';
import FlightTakeoffIcon from '@mui/icons-material/FlightTakeoff';
import PeopleIcon from '@mui/icons-material/People';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import ScienceIcon from '@mui/icons-material/Science';
import BuildIcon from '@mui/icons-material/Build';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { getActualById, updateActual, deleteActual } from '../services/financialsStore';
import { getClientById } from '../services/fieldManagementStore';
import { getQuoteById, getKitById } from '../services/quoteStore';
import { formatCurrency } from '../utils/quoteCalculator';
import { useAuth } from '../contexts/AuthContext';
import { JobActual, CostLineItem } from '../types/financials';
import { Quote } from '../types/quote';
import { generateActualReport } from '../utils/actualReportPdf';
import { WorkflowMaturityBoundary } from '../components/productMaturity/WorkflowMaturityBoundary';

// ─── Helper components (defined outside main component) ─────────

const InfoRow = ({ label, value }: { label: string; value: string | null | undefined }) => {
  if (!value) return null;
  return (
    <Box sx={{ display: 'flex', gap: 2, py: 0.75 }}>
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 150, fontWeight: 600 }}>
        {label}
      </Typography>
      <Typography variant="body2">{value}</Typography>
    </Box>
  );
};

const LineItemRows = ({ items }: { items: CostLineItem[] }) => {
  if (!items || items.length === 0) return null;
  return (
    <Box sx={{ mt: 1 }}>
      {items.map((item) => (
        <Box key={item.id} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            {item.description}
            {item.quantity > 1 ? ` (${item.quantity} ${item.unitLabel})` : ''}
          </Typography>
          <Typography variant="body2" fontWeight={600}>
            {formatCurrency(item.total)}
          </Typography>
        </Box>
      ))}
    </Box>
  );
};

const getMarginColor = (margin: number) => {
  if (margin >= 40) return '#2e7d32';
  if (margin >= 20) return '#e65100';
  return '#c62828';
};

const getVarianceColor = (variance: number, higherIsBetter: boolean) => {
  if (variance === 0) return 'text.secondary';
  const isBetter = higherIsBetter ? variance > 0 : variance < 0;
  return isBetter ? '#2e7d32' : '#c62828';
};

const MarginAnalysis = ({ actual, quote, border }: { actual: JobActual; quote?: Quote; border: string }) => {
  const rows = quote?.margin ? [
    { label: 'Revenue', quoted: quote.margin.revenue, actual: actual.revenue, higherIsBetter: true, isPercent: false },
    { label: 'Total Cost', quoted: quote.margin.totalCost, actual: actual.totalCost, higherIsBetter: false, isPercent: false },
    { label: 'Margin %', quoted: quote.margin.grossMarginPercent, actual: actual.grossMarginPercent, higherIsBetter: true, isPercent: true },
  ] : [];
  return (
    <Card elevation={0} sx={{ border, borderRadius: '16px' }}>
      <CardContent sx={{ p: 3 }}>
        <Typography variant="subtitle1" fontWeight={700} color="primary.dark" sx={{ mb: 2 }}>Margin Analysis</Typography>
        <Typography variant="h5" sx={{ fontWeight: 800, color: getMarginColor(actual.grossMarginPercent), mb: rows.length ? 2 : 0 }}>
          {actual.grossMarginPercent.toFixed(1)}%
        </Typography>
        {rows.length > 0 && <TableContainer><Table size="small"><TableHead><TableRow><TableCell>Category</TableCell><TableCell align="right">Quoted</TableCell><TableCell align="right">Actual</TableCell><TableCell align="right">Variance</TableCell></TableRow></TableHead><TableBody>{rows.map(row=>{const variance=row.actual-row.quoted;return <TableRow key={row.label}><TableCell>{row.label}</TableCell><TableCell align="right">{row.isPercent?`${row.quoted.toFixed(1)}%`:formatCurrency(row.quoted)}</TableCell><TableCell align="right">{row.isPercent?`${row.actual.toFixed(1)}%`:formatCurrency(row.actual)}</TableCell><TableCell align="right"><Typography variant="body2" fontWeight={700} sx={{color:getVarianceColor(variance,row.higherIsBetter)}}>{variance>=0?'+':''}{row.isPercent?`${variance.toFixed(1)}%`:formatCurrency(variance)}</Typography></TableCell></TableRow>})}</TableBody></Table></TableContainer>}
      </CardContent>
    </Card>
  );
};

// ─── Main component ─────────────────────────────────────────────

export default function ActualDetail() {
  const { actualId } = useParams<{ actualId: string }>();
  const navigate = useNavigate();
  const theme = useTheme();
  const { user } = useAuth();

  const [actual, setActual] = useState<JobActual | undefined>(() => getActualById(actualId || ''));
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);

  if (!actual) {
    return (
      <Box>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/financials')} sx={{ mb: 2 }}>
          Back
        </Button>
        <Alert severity="error">Actual not found.</Alert>
      </Box>
    );
  }

  const client = actual.clientId ? getClientById(actual.clientId) : undefined;
  const quote: Quote | undefined = actual.quoteId ? getQuoteById(actual.quoteId) : undefined;

  const handleDelete = () => {
    deleteActual(actual.id);
    navigate('/financials');
  };

  const handleToggleStatus = () => {
    const newStatus = actual.status === 'draft' ? 'finalised' : 'draft';
    const updated = updateActual(actual.id, { status: newStatus });
    if (updated) setActual(updated);
  };

  // Build kit names for display
  const kitNames = actual.equipment.kitSelections
    .map((sel) => {
      const kit = getKitById(sel.kitId);
      return kit ? `${kit.name} x${sel.quantity}` : `Unknown kit x${sel.quantity}`;
    })
    .join(', ');

  // Labour totals
  const pilotTotal = actual.labour.pilotCount * actual.labour.pilotHours * actual.labour.pilotRatePerHour;
  const chemOpTotal = actual.labour.hasChemOperator
    ? actual.labour.chemOpHours * actual.labour.chemOpRatePerHour
    : 0;
  const labourTotal = pilotTotal + chemOpTotal + actual.labour.additionalLabour.reduce((s, i) => s + i.total, 0);

  // Travel totals
  const travelTotal =
    actual.travel.vehicleTotal + actual.travel.accommodation + actual.travel.meals;

  const cardBorder = `1.5px solid ${alpha(theme.palette.primary.main, 0.1)}`;

  return (
    <Box>
      {/* Back button */}
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate('/financials')}
        sx={{ mb: 3, color: 'text.secondary', fontWeight: 600, '&:hover': { color: 'primary.main' } }}
      >
        Financials
      </Button>

      {/* Header */}
      <Box
        sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}
        className="ftf-animate-in"
      >
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
            <Typography
              variant="h4"
              sx={{
                fontWeight: 800,
                color: 'primary.dark',
                fontSize: { xs: '1.4rem', md: '1.75rem' },
              }}
            >
              {actual.title}
            </Typography>
            <Chip
              label={actual.status}
              size="small"
              color={actual.status === 'finalised' ? 'success' : 'default'}
              sx={{ fontWeight: 700, textTransform: 'capitalize' }}
            />
          </Box>
          <Typography variant="body2" color="text.secondary">
            {new Date(actual.startDate + 'T00:00:00').toLocaleDateString('en-AU', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
            {actual.startDate !== actual.endDate && (
              <> &ndash; {new Date(actual.endDate + 'T00:00:00').toLocaleDateString('en-AU', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}</>
            )}
            {` \u2022 ${actual.totalDays} day${actual.totalDays !== 1 ? 's' : ''} \u2022 ${actual.totalHours} hrs`}
            {client ? ` \u2022 ${client.name}` : ''}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center">
          <Button
            size="small"
            variant="contained"
            onClick={() => setPdfDialogOpen(true)}
            startIcon={<PictureAsPdfIcon />}
            sx={{ borderRadius: '10px', fontWeight: 700, textTransform: 'none' }}
          >
            Export PDF
          </Button>
          <Button
            size="small"
            variant="outlined"
            onClick={handleToggleStatus}
            startIcon={<CheckCircleIcon />}
            sx={{ borderRadius: '10px', fontWeight: 700, textTransform: 'none' }}
          >
            {actual.status === 'draft' ? 'Finalise' : 'Revert to Draft'}
          </Button>
          <IconButton
            size="small"
            onClick={() => setDeleteConfirm(true)}
            sx={{ color: 'error.main' }}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Stack>
      </Box>

      {/* Link chips */}
      <Stack direction="row" spacing={1} sx={{ mb: 3 }}>
        {actual.jobId && (
          <Chip
            label="View Job"
            size="small"
            color="primary"
            variant="outlined"
            onClick={() => {
              if (actual.clientId && actual.propertyId && actual.fieldId) {
                navigate(
                  `/jobs/client/${actual.clientId}/property/${actual.propertyId}/field/${actual.fieldId}/job/${actual.jobId}`,
                );
              }
            }}
            sx={{ cursor: 'pointer', fontWeight: 700 }}
          />
        )}
        {actual.quoteId && (
          <Chip
            label="View Quote"
            size="small"
            color="secondary"
            variant="outlined"
            onClick={() => navigate(`/quotes/${actual.quoteId}`)}
            sx={{ cursor: 'pointer', fontWeight: 700 }}
          />
        )}
      </Stack>

      <WorkflowMaturityBoundary moduleCode="financials" workflowCode="invoice-export">
        <Card variant="outlined" sx={{ mb: 3, borderRadius: '16px' }}>
          <CardContent>
            <Typography variant="h6" fontWeight={800}>Invoice Export</Typography>
            <Typography color="text.secondary">Invoice export availability is separate from the operational PDF report.</Typography>
          </CardContent>
        </Card>
      </WorkflowMaturityBoundary>

      <Stack spacing={3} className="ftf-animate-in-delay-1">
        {/* ─── P&L Summary ─────────────────────────────────────── */}
        <Card
          elevation={0}
          sx={{
            border: `1.5px solid ${alpha(theme.palette.primary.main, 0.15)}`,
            borderRadius: '16px',
            bgcolor: alpha(theme.palette.primary.main, 0.02),
          }}
        >
          <CardContent sx={{ p: 3 }}>
            <Typography variant="subtitle1" fontWeight={700} color="primary.dark" sx={{ mb: 2.5 }}>
              Profit & Loss Summary
            </Typography>
            <Stack direction="row" spacing={4} flexWrap="wrap" useFlexGap>
              {[
                { label: 'Revenue', value: formatCurrency(actual.revenue), color: '#1976d2' },
                { label: 'Total Cost', value: formatCurrency(actual.totalCost), color: '#e65100' },
                {
                  label: 'Gross Profit',
                  value: formatCurrency(actual.grossProfit),
                  color: actual.grossProfit >= 0 ? '#2e7d32' : '#c62828',
                },
              ].map((item) => (
                <Box key={item.label}>
                  <Typography variant="caption" color="text.secondary">
                    {item.label}
                  </Typography>
                  <Typography
                    variant="h5"
                    sx={{
                      fontWeight: 800,
                      color: item.color,
                      fontFamily: '"Outfit", system-ui',
                      lineHeight: 1.2,
                    }}
                  >
                    {item.value}
                  </Typography>
                </Box>
              ))}
              {actual.rate > 0 && (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Rate
                  </Typography>
                  <Typography
                    variant="h5"
                    sx={{
                      fontWeight: 800,
                      color: '#6a1b9a',
                      fontFamily: '"Outfit", system-ui',
                      lineHeight: 1.2,
                    }}
                  >
                    {formatCurrency(actual.rate)}/{actual.rateType === 'hourly' ? 'hr' : 'ha'}
                  </Typography>
                </Box>
              )}
              {actual.effectiveHourlyRate > 0 && (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Effective $/hr
                  </Typography>
                  <Typography
                    variant="h5"
                    sx={{
                      fontWeight: 800,
                      color: '#00695c',
                      fontFamily: '"Outfit", system-ui',
                      lineHeight: 1.2,
                    }}
                  >
                    {formatCurrency(actual.effectiveHourlyRate)}
                  </Typography>
                </Box>
              )}
            </Stack>
            {actual.rateType === 'hectare' && actual.hectares && actual.hectares > 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {actual.hectares} ha @ {formatCurrency(actual.rate)}/ha = {formatCurrency(actual.revenue)} revenue
                {actual.totalHours > 0 && ` \u00F7 ${actual.totalHours} hrs = ${formatCurrency(actual.effectiveHourlyRate)}/hr`}
              </Typography>
            )}
          </CardContent>
        </Card>

        <WorkflowMaturityBoundary moduleCode="financials" workflowCode="margin-analysis">
          <MarginAnalysis actual={actual} quote={quote} border={cardBorder} />
        </WorkflowMaturityBoundary>

        {/* ─── Daily Hours ────────────────────────────────────── */}
        {actual.dailyHours && actual.dailyHours.length > 1 && (
          <Card elevation={0} sx={{ border: cardBorder, borderRadius: '16px' }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="subtitle1" fontWeight={700} color="primary.dark" sx={{ mb: 2 }}>
                Daily Hours ({actual.totalDays} days)
              </Typography>
              {actual.dailyHours.map((entry) => (
                <Box key={entry.date} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                  <Typography variant="body2" color="text.secondary">
                    {new Date(entry.date + 'T00:00:00').toLocaleDateString('en-AU', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                    })}
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {entry.hours} hrs
                  </Typography>
                </Box>
              ))}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', pt: 1, mt: 1, borderTop: `1px solid ${alpha(theme.palette.primary.main, 0.1)}` }}>
                <Typography variant="body2" fontWeight={700}>Total</Typography>
                <Typography variant="body2" fontWeight={800} color="primary.main">
                  {actual.totalHours} hrs
                </Typography>
              </Box>
            </CardContent>
          </Card>
        )}

        {/* ─── Equipment ───────────────────────────────────────── */}
        <Card elevation={0} sx={{ border: cardBorder, borderRadius: '16px' }}>
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <FlightTakeoffIcon sx={{ color: 'primary.main', fontSize: 20 }} />
              <Typography variant="subtitle1" fontWeight={700} color="primary.dark">
                Equipment
              </Typography>
              <Box sx={{ flex: 1 }} />
              <Typography variant="subtitle1" fontWeight={700} color="primary.dark">
                {formatCurrency(actual.equipment.fuelTotal)}
              </Typography>
            </Box>
            {kitNames && <InfoRow label="Kits" value={kitNames} />}
            <InfoRow
              label="Flight Hours"
              value={
                actual.equipment.actualFlightHours > 0
                  ? `${actual.equipment.actualFlightHours} hrs`
                  : undefined
              }
            />
            <InfoRow label="Fuel Total" value={formatCurrency(actual.equipment.fuelTotal)} />
            <LineItemRows items={actual.equipment.fuelBreakdown} />
          </CardContent>
        </Card>

        {/* ─── Labour ──────────────────────────────────────────── */}
        <Card elevation={0} sx={{ border: cardBorder, borderRadius: '16px' }}>
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <PeopleIcon sx={{ color: 'primary.main', fontSize: 20 }} />
              <Typography variant="subtitle1" fontWeight={700} color="primary.dark">
                Labour
              </Typography>
              <Box sx={{ flex: 1 }} />
              <Typography variant="subtitle1" fontWeight={700} color="primary.dark">
                {formatCurrency(labourTotal)}
              </Typography>
            </Box>
            <InfoRow
              label="Pilots"
              value={`${actual.labour.pilotCount} x ${actual.labour.pilotHours} hrs @ ${formatCurrency(actual.labour.pilotRatePerHour)}/hr = ${formatCurrency(pilotTotal)}`}
            />
            {actual.labour.hasChemOperator && (
              <InfoRow
                label="Chem Operator"
                value={`${actual.labour.chemOpHours} hrs @ ${formatCurrency(actual.labour.chemOpRatePerHour)}/hr = ${formatCurrency(chemOpTotal)}`}
              />
            )}
            <LineItemRows items={actual.labour.additionalLabour} />
          </CardContent>
        </Card>

        {/* ─── Travel & Accommodation ──────────────────────────── */}
        <Card elevation={0} sx={{ border: cardBorder, borderRadius: '16px' }}>
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <DirectionsCarIcon sx={{ color: 'primary.main', fontSize: 20 }} />
              <Typography variant="subtitle1" fontWeight={700} color="primary.dark">
                Travel & Accommodation
              </Typography>
              <Box sx={{ flex: 1 }} />
              <Typography variant="subtitle1" fontWeight={700} color="primary.dark">
                {formatCurrency(travelTotal)}
              </Typography>
            </Box>
            <InfoRow
              label="Vehicle"
              value={
                actual.travel.kilometres > 0
                  ? `${actual.travel.kilometres} km @ ${formatCurrency(actual.travel.vehicleCostPerKm)}/km = ${formatCurrency(actual.travel.vehicleTotal)}`
                  : undefined
              }
            />
            <InfoRow
              label="Accommodation"
              value={actual.travel.accommodation > 0 ? formatCurrency(actual.travel.accommodation) : undefined}
            />
            <LineItemRows items={actual.travel.accommodationBreakdown} />
            <InfoRow
              label="Meals"
              value={actual.travel.meals > 0 ? formatCurrency(actual.travel.meals) : undefined}
            />
            <LineItemRows items={actual.travel.mealsBreakdown} />
          </CardContent>
        </Card>

        {/* ─── Chemicals ───────────────────────────────────────── */}
        {actual.chemicalCost > 0 && (
          <Card elevation={0} sx={{ border: cardBorder, borderRadius: '16px' }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <ScienceIcon sx={{ color: 'primary.main', fontSize: 20 }} />
                <Typography variant="subtitle1" fontWeight={700} color="primary.dark">
                  Chemicals
                </Typography>
                <Box sx={{ flex: 1 }} />
                <Typography variant="subtitle1" fontWeight={700} color="primary.dark">
                  {formatCurrency(actual.chemicalCost)}
                </Typography>
              </Box>
              <InfoRow label="Chemical Cost" value={formatCurrency(actual.chemicalCost)} />
            </CardContent>
          </Card>
        )}

        {/* ─── Repairs ─────────────────────────────────────────── */}
        {actual.repairs.items.length > 0 && (
          <Card elevation={0} sx={{ border: cardBorder, borderRadius: '16px' }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <BuildIcon sx={{ color: 'primary.main', fontSize: 20 }} />
                <Typography variant="subtitle1" fontWeight={700} color="primary.dark">
                  Repairs
                </Typography>
                <Box sx={{ flex: 1 }} />
                <Typography variant="subtitle1" fontWeight={700} color="primary.dark">
                  {formatCurrency(actual.repairs.items.reduce((s, i) => s + i.total, 0))}
                </Typography>
              </Box>
              <LineItemRows items={actual.repairs.items} />
            </CardContent>
          </Card>
        )}

        {/* ─── Other ───────────────────────────────────────────── */}
        {actual.otherCosts.items.length > 0 && (
          <Card elevation={0} sx={{ border: cardBorder, borderRadius: '16px' }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <MoreHorizIcon sx={{ color: 'primary.main', fontSize: 20 }} />
                <Typography variant="subtitle1" fontWeight={700} color="primary.dark">
                  Other
                </Typography>
                <Box sx={{ flex: 1 }} />
                <Typography variant="subtitle1" fontWeight={700} color="primary.dark">
                  {formatCurrency(actual.otherCosts.items.reduce((s, i) => s + i.total, 0))}
                </Typography>
              </Box>
              <LineItemRows items={actual.otherCosts.items} />
            </CardContent>
          </Card>
        )}

        {/* ─── Notes ───────────────────────────────────────────── */}
        {(actual.notes || actual.lessonsLearned) && (
          <Card elevation={0} sx={{ border: cardBorder, borderRadius: '16px' }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="subtitle1" fontWeight={700} color="primary.dark" sx={{ mb: 2 }}>
                Notes
              </Typography>
              {actual.notes && (
                <Box sx={{ mb: actual.lessonsLearned ? 2 : 0 }}>
                  <Typography variant="body2" color="text.secondary" fontWeight={600} sx={{ mb: 0.5 }}>
                    Notes
                  </Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                    {actual.notes}
                  </Typography>
                </Box>
              )}
              {actual.lessonsLearned && (
                <Box>
                  <Typography variant="body2" color="text.secondary" fontWeight={600} sx={{ mb: 0.5 }}>
                    Lessons Learned
                  </Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                    {actual.lessonsLearned}
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        )}
      </Stack>

      {/* PDF Export Choice Dialog */}
      <Dialog
        open={pdfDialogOpen}
        onClose={() => setPdfDialogOpen(false)}
        PaperProps={{ sx: { borderRadius: '16px', maxWidth: 400 } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Export PDF Report</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Would you like a summary or complete report with P&L?
          </Typography>
          <Stack spacing={1.5}>
            <Button
              fullWidth
              variant="outlined"
              startIcon={<DescriptionIcon />}
              onClick={() => {
                generateActualReport(actual, { includePnL: false });
                setPdfDialogOpen(false);
              }}
              sx={{
                borderRadius: '12px',
                py: 1.5,
                textTransform: 'none',
                justifyContent: 'flex-start',
                textAlign: 'left',
              }}
            >
              <Box>
                <Typography variant="body2" fontWeight={700}>Job Summary</Typography>
                <Typography variant="caption" color="text.secondary">
                  Clean report — no financial numbers
                </Typography>
              </Box>
            </Button>
            <Button
              fullWidth
              variant="outlined"
              startIcon={<AssessmentIcon />}
              onClick={() => {
                generateActualReport(actual, { includePnL: true });
                setPdfDialogOpen(false);
              }}
              sx={{
                borderRadius: '12px',
                py: 1.5,
                textTransform: 'none',
                justifyContent: 'flex-start',
                textAlign: 'left',
              }}
            >
              <Box>
                <Typography variant="body2" fontWeight={700}>Complete with P&L</Typography>
                <Typography variant="caption" color="text.secondary">
                  Includes costs, margins & quote comparison
                </Typography>
              </Box>
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setPdfDialogOpen(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog
        open={deleteConfirm}
        onClose={() => setDeleteConfirm(false)}
        PaperProps={{ sx: { borderRadius: '16px' } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Delete Actual?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            This will permanently delete this actual record. This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setDeleteConfirm(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDelete}
            sx={{ borderRadius: '10px', fontWeight: 700 }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
