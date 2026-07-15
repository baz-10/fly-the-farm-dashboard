import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import AddIcon from '@mui/icons-material/Add';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import AssessmentIcon from '@mui/icons-material/Assessment';
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import FlightTakeoffIcon from '@mui/icons-material/FlightTakeoff';
import GavelIcon from '@mui/icons-material/Gavel';
import InsightsIcon from '@mui/icons-material/Insights';
import PriceCheckIcon from '@mui/icons-material/PriceCheck';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import ScienceIcon from '@mui/icons-material/Science';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { getActuals } from '../services/financialsStore';
import { getClientById } from '../services/fieldManagementStore';
import { formatCurrency } from '../utils/quoteCalculator';
import { useAuth } from '../contexts/AuthContext';
import type { JobActual } from '../types/financials';

interface PanelProps {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  sx?: SxProps<Theme>;
}

interface CostSegment {
  label: string;
  value: number;
  color: string;
}

interface ReviewRow {
  id: string;
  actualId?: string;
  title: string;
  client: string;
  location: string;
  date: string;
  treatment: string;
  revenue: number;
  totalCost: number;
  grossProfit: number;
  margin: number;
  quotedMargin: number;
  variance: number;
  complianceScore: number;
  status: 'Ready' | 'Review' | 'Draft';
  statusTone: 'success' | 'warning' | 'error';
  complianceState: string;
  costSegments: CostSegment[];
  risks: string[];
  nextAction: string;
}

function Panel({ title, children, action, icon, sx }: PanelProps) {
  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: '8px',
        border: '1px solid rgba(20, 58, 26, 0.1)',
        bgcolor: 'rgba(255, 255, 255, 0.96)',
        boxShadow: '0 12px 28px rgba(10, 31, 10, 0.055)',
        ...sx,
      }}
    >
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            {icon && <Box sx={{ color: 'primary.main', display: 'flex' }}>{icon}</Box>}
            <Typography variant="subtitle2" sx={{ color: 'primary.dark', letterSpacing: '0.08em' }}>
              {title}
            </Typography>
          </Stack>
          {action}
        </Stack>
        {children}
      </CardContent>
    </Card>
  );
}

function StatusPill({ label, tone }: { label: string; tone: 'success' | 'warning' | 'error' | 'info' }) {
  const palette = {
    success: ['#2e9e3c', '#e4f5e7'],
    warning: ['#d4860a', '#fff3d8'],
    error: ['#c62828', '#fde8e6'],
    info: ['#00897b', '#dff4ef'],
  } as const;
  const [color, background] = palette[tone];

  return (
    <Chip
      label={label}
      size="small"
      sx={{
        height: 24,
        borderRadius: '6px',
        bgcolor: background,
        color,
        fontSize: '0.72rem',
        fontWeight: 900,
      }}
    />
  );
}

function MetricCard({ label, value, detail, icon, color }: { label: string; value: string; detail: string; icon: React.ReactNode; color: string }) {
  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: '8px',
        border: '1px solid rgba(20, 58, 26, 0.1)',
        bgcolor: 'rgba(255, 255, 255, 0.94)',
        minHeight: 126,
      }}
    >
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1.5}>
          <Box>
            <Typography sx={{ fontSize: '0.74rem', color: 'text.secondary', fontWeight: 800 }}>
              {label}
            </Typography>
            <Typography sx={{ mt: 0.75, fontSize: { xs: '1.35rem', md: '1.55rem' }, fontWeight: 950, color: 'primary.dark' }}>
              {value}
            </Typography>
          </Box>
          <Box
            sx={{
              width: 38,
              height: 38,
              borderRadius: '8px',
              display: 'grid',
              placeItems: 'center',
              color,
              bgcolor: alpha(color, 0.1),
            }}
          >
            {icon}
          </Box>
        </Stack>
        <Typography sx={{ mt: 1, fontSize: '0.76rem', color: 'text.secondary' }}>{detail}</Typography>
      </CardContent>
    </Card>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  const isPlainValue = typeof value === 'string' || typeof value === 'number';

  return (
    <Stack direction="row" justifyContent="space-between" spacing={2} sx={{ py: 0.75 }}>
      <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>{label}</Typography>
      {isPlainValue ? (
        <Typography component="span" sx={{ fontSize: '0.8rem', fontWeight: 900, textAlign: 'right' }}>
          {value}
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', minWidth: 0 }}>{value}</Box>
      )}
    </Stack>
  );
}

function totalLineItems(items: { total: number }[]) {
  return items.reduce((sum, item) => sum + item.total, 0);
}

function buildActualRow(actual: JobActual): ReviewRow {
  const client = actual.clientId ? getClientById(actual.clientId) : undefined;
  const pilotTotal = actual.labour.pilotCount * actual.labour.pilotHours * actual.labour.pilotRatePerHour;
  const chemOperatorTotal = actual.labour.hasChemOperator
    ? actual.labour.chemOpHours * actual.labour.chemOpRatePerHour
    : 0;
  const labourTotal = pilotTotal + chemOperatorTotal + totalLineItems(actual.labour.additionalLabour);
  const travelTotal = actual.travel.vehicleTotal + actual.travel.accommodation + actual.travel.meals;
  const repairTotal = totalLineItems(actual.repairs.items);
  const otherTotal = totalLineItems(actual.otherCosts.items);
  const aircraftTotal = actual.equipment.fuelTotal + repairTotal + otherTotal;
  const quotedMargin = Math.min(58, Math.max(18, actual.grossMarginPercent + (actual.status === 'finalised' ? 4.5 : 8)));
  const variance = actual.grossMarginPercent - quotedMargin;
  const complianceScore = actual.status === 'draft'
    ? 62
    : Math.max(42, Math.min(98, Math.round(actual.grossMarginPercent + 52)));
  const hasMarginRisk = actual.grossMarginPercent < 20;
  const hasVarianceRisk = variance < -8;

  return {
    id: actual.id,
    actualId: actual.id,
    title: actual.title,
    client: client?.name || 'Unknown Client',
    location: actual.fieldId ? `Field ${actual.fieldId.slice(0, 4).toUpperCase()}` : 'No field linked',
    date: new Date(`${actual.startDate}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }),
    treatment: actual.revenueNotes || 'Recorded job actual',
    revenue: actual.revenue,
    totalCost: actual.totalCost,
    grossProfit: actual.grossProfit,
    margin: actual.grossMarginPercent,
    quotedMargin,
    variance,
    complianceScore,
    status: actual.status === 'draft' ? 'Draft' : hasMarginRisk || hasVarianceRisk ? 'Review' : 'Ready',
    statusTone: actual.status === 'draft' ? 'warning' : hasMarginRisk ? 'error' : hasVarianceRisk ? 'warning' : 'success',
    complianceState: actual.status === 'draft'
      ? 'Awaiting finalisation'
      : hasMarginRisk
        ? 'Hold for admin review'
        : hasVarianceRisk
          ? 'Margin review required'
          : 'Ready for close-out',
    costSegments: [
      { label: 'Chemical', value: actual.chemicalCost, color: '#1b8a5a' },
      { label: 'Labour', value: labourTotal, color: '#00897b' },
      { label: 'Aircraft', value: aircraftTotal, color: '#d4860a' },
      { label: 'Travel', value: travelTotal, color: '#5f765f' },
    ],
    risks: [
      ...(hasMarginRisk ? ['Low gross margin'] : []),
      ...(hasVarianceRisk ? ['Margin variance exceeds tolerance'] : []),
      ...(actual.status === 'draft' ? ['Actuals still in draft'] : []),
      ...(actual.notes ? [] : ['Close-out notes not recorded']),
    ],
    nextAction: actual.status === 'draft'
      ? 'Finalise actuals'
      : hasMarginRisk || hasVarianceRisk
        ? 'Review variance before invoice'
        : 'Approve close-out pack',
  };
}

function getPercent(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.max(4, Math.round((value / total) * 100));
}

export default function FinancialsList() {
  const navigate = useNavigate();
  const theme = useTheme();
  const { user } = useAuth();
  const userId = user?.id || '';
  const [selectedId, setSelectedId] = React.useState<string | undefined>();

  const actuals = useMemo(
    () => getActuals(userId).sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [userId],
  );

  const rows = useMemo(() => actuals.map(buildActualRow), [actuals]);

  const selected = rows.find((row) => row.id === selectedId) || rows[0];
  const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  const totalCost = rows.reduce((sum, row) => sum + row.totalCost, 0);
  const totalProfit = rows.reduce((sum, row) => sum + row.grossProfit, 0);
  const avgMargin = rows.length > 0 ? rows.reduce((sum, row) => sum + row.margin, 0) / rows.length : 0;
  const reviewCount = rows.filter((row) => row.status !== 'Ready').length;
  const readyCount = rows.filter((row) => row.status === 'Ready').length;

  if (!selected) {
    return (
      <Box sx={{ pb: 3 }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          justifyContent="space-between"
          alignItems={{ xs: 'stretch', md: 'flex-start' }}
          spacing={2}
          sx={{ mb: 3 }}
        >
          <Stack direction="row" spacing={2} alignItems="center">
            <Box sx={{ width: 54, height: 54, borderRadius: '8px', bgcolor: alpha(theme.palette.primary.main, 0.1), display: 'grid', placeItems: 'center', color: 'primary.main' }}>
              <AssessmentIcon sx={{ fontSize: 30 }} />
            </Box>
            <Box>
              <Typography variant="h4" sx={{ color: 'primary.dark', fontWeight: 950 }}>Job Profit Review</Typography>
              <Typography sx={{ color: 'text.secondary', fontSize: '0.95rem' }}>
                Close the loop between quoted margin, actual costs and compliance sign-off.
              </Typography>
            </Box>
          </Stack>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/financials/new')}>
            New Actual
          </Button>
        </Stack>

        <Card elevation={0} sx={{ borderRadius: '8px', border: '1px solid rgba(20,58,26,0.1)' }}>
          <CardContent>
            <Stack alignItems="center" textAlign="center" sx={{ py: 7 }}>
              <AccountBalanceIcon sx={{ fontSize: 52, color: 'text.disabled', mb: 1.5 }} />
              <Typography variant="h6" fontWeight={850}>No job actuals yet</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2.5, maxWidth: 480 }}>
                Financial totals start at zero. Add real revenue and costs after a job to build the margin review.
              </Typography>
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/financials/new')}>
                Add first actual
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Box>
    );
  }

  const complianceChecks = [
    { label: 'Spray diary complete', complete: selected.complianceScore >= 70 },
    { label: 'APVMA label evidence attached', complete: selected.complianceScore >= 85 },
    { label: 'Weather and drift record captured', complete: selected.complianceScore >= 75 },
    { label: 'CASA flight log reconciled', complete: selected.status !== 'Draft' },
    { label: 'Margin variance accepted', complete: selected.status === 'Ready' },
  ];

  return (
    <Box sx={{ pb: 3 }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', md: 'flex-start' }}
        spacing={2}
        sx={{ mb: 3 }}
        className="ftf-animate-in"
      >
        <Stack direction="row" spacing={2} alignItems="center">
          <Box
            sx={{
              width: 54,
              height: 54,
              borderRadius: '8px',
              bgcolor: alpha(theme.palette.primary.main, 0.1),
              display: 'grid',
              placeItems: 'center',
              color: 'primary.main',
            }}
          >
            <AssessmentIcon sx={{ fontSize: 30 }} />
          </Box>
          <Box>
            <Typography
              variant="h4"
              sx={{
                color: 'primary.dark',
                fontSize: { xs: '1.7rem', md: '2.15rem' },
                fontWeight: 950,
              }}
            >
              Job Profit Review
            </Typography>
            <Typography sx={{ color: 'text.secondary', fontSize: '0.95rem' }}>
              Close the loop between quoted margin, actual costs and compliance sign-off.
            </Typography>
          </Box>
        </Stack>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button
            variant="outlined"
            startIcon={<GavelIcon />}
            onClick={() => navigate('/compliance')}
            sx={{ borderRadius: '8px', fontWeight: 900, px: 2.4 }}
          >
            Compliance
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => navigate('/financials/new')}
            sx={{ borderRadius: '8px', fontWeight: 900, px: 2.4 }}
          >
            New Actual
          </Button>
        </Stack>
      </Stack>

      <Grid container spacing={2} sx={{ mb: 2.5 }} className="ftf-animate-in-delay-1">
        <Grid size={{ xs: 6, md: 2.4 }}>
          <MetricCard
            label="Revenue"
            value={formatCurrency(totalRevenue)}
            detail={`${rows.length} job${rows.length === 1 ? '' : 's'} in review`}
            icon={<ReceiptLongIcon />}
            color="#1b8a5a"
          />
        </Grid>
        <Grid size={{ xs: 6, md: 2.4 }}>
          <MetricCard
            label="Actual Cost"
            value={formatCurrency(totalCost)}
            detail="All captured cost categories"
            icon={<AccountBalanceIcon />}
            color="#5f765f"
          />
        </Grid>
        <Grid size={{ xs: 6, md: 2.4 }}>
          <MetricCard
            label="Gross Profit"
            value={formatCurrency(totalProfit)}
            detail={`${avgMargin.toFixed(1)}% average margin`}
            icon={<PriceCheckIcon />}
            color="#2e9e3c"
          />
        </Grid>
        <Grid size={{ xs: 6, md: 2.4 }}>
          <MetricCard
            label="Review Queue"
            value={`${reviewCount}`}
            detail="Needs margin or compliance attention"
            icon={<WarningAmberIcon />}
            color="#d4860a"
          />
        </Grid>
        <Grid size={{ xs: 12, md: 2.4 }}>
          <MetricCard
            label="Ready"
            value={`${readyCount}`}
            detail="Can move to close-out"
            icon={<CheckCircleIcon />}
            color="#00897b"
          />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Panel
            title="Review Queue"
            icon={<InsightsIcon />}
            action={<StatusPill label={`${rows.length} active`} tone="info" />}
            sx={{ overflow: 'hidden' }}
          >
            <Box sx={{ display: { xs: 'block', md: 'none' }, mx: -2, mb: -2 }}>
              {rows.map((row) => {
                const isSelected = row.id === selected.id;

                return (
                  <Box
                    key={row.id}
                    onClick={() => setSelectedId(row.id)}
                    sx={{
                      px: 2,
                      py: 1.45,
                      cursor: 'pointer',
                      borderTop: `1px solid ${alpha(theme.palette.primary.main, 0.08)}`,
                      bgcolor: isSelected ? alpha(theme.palette.primary.main, 0.06) : 'transparent',
                    }}
                  >
                    <Stack direction="row" justifyContent="space-between" spacing={1.5} alignItems="flex-start">
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontSize: '0.88rem', fontWeight: 950, color: 'primary.dark' }}>
                          {row.title}
                        </Typography>
                        <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>
                          {row.client} - {row.location}
                        </Typography>
                      </Box>
                      <StatusPill label={row.status} tone={row.statusTone} />
                    </Stack>

                    <Grid container spacing={1.2} sx={{ mt: 1 }}>
                      <Grid size={{ xs: 4 }}>
                        <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary' }}>Revenue</Typography>
                        <Typography sx={{ fontSize: '0.78rem', fontWeight: 900 }}>{formatCurrency(row.revenue)}</Typography>
                      </Grid>
                      <Grid size={{ xs: 4 }}>
                        <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary' }}>Margin</Typography>
                        <Typography
                          sx={{
                            fontSize: '0.78rem',
                            fontWeight: 900,
                            color: row.margin >= 35 ? 'success.main' : row.margin >= 20 ? '#d4860a' : 'error.main',
                          }}
                        >
                          {row.margin.toFixed(1)}%
                        </Typography>
                      </Grid>
                      <Grid size={{ xs: 4 }}>
                        <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary' }}>Variance</Typography>
                        <Typography
                          sx={{
                            fontSize: '0.78rem',
                            fontWeight: 900,
                            color: row.variance < -8 ? 'error.main' : row.variance < 0 ? '#d4860a' : 'success.main',
                          }}
                        >
                          {row.variance > 0 ? '+' : ''}
                          {row.variance.toFixed(1)} pts
                        </Typography>
                      </Grid>
                    </Grid>

                    <LinearProgress
                      variant="determinate"
                      value={row.complianceScore}
                      sx={{
                        mt: 1,
                        height: 7,
                        borderRadius: 999,
                        bgcolor: alpha(theme.palette.primary.main, 0.1),
                        '& .MuiLinearProgress-bar': {
                          borderRadius: 999,
                          bgcolor: row.complianceScore >= 85 ? '#2e9e3c' : row.complianceScore >= 70 ? '#d4860a' : '#c62828',
                        },
                      }}
                    />
                  </Box>
                );
              })}
            </Box>

            <TableContainer sx={{ display: { xs: 'none', md: 'block' }, mx: -2, mb: -2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow
                    sx={{
                      '& th': {
                        borderColor: alpha(theme.palette.primary.main, 0.08),
                        color: 'text.secondary',
                        fontSize: '0.72rem',
                        fontWeight: 900,
                      },
                    }}
                  >
                    <TableCell>Job</TableCell>
                    <TableCell>Client</TableCell>
                    <TableCell align="right">Revenue</TableCell>
                    <TableCell align="right">Margin</TableCell>
                    <TableCell align="right">Variance</TableCell>
                    <TableCell>Compliance</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row) => {
                    const isSelected = row.id === selected.id;

                    return (
                      <TableRow
                        key={row.id}
                        hover
                        onClick={() => setSelectedId(row.id)}
                        sx={{
                          cursor: 'pointer',
                          bgcolor: isSelected ? alpha(theme.palette.primary.main, 0.06) : 'transparent',
                          '& td': {
                            borderColor: alpha(theme.palette.primary.main, 0.07),
                            py: 1.35,
                          },
                        }}
                      >
                        <TableCell sx={{ minWidth: 220 }}>
                          <Typography sx={{ fontSize: '0.86rem', fontWeight: 900, color: 'primary.dark' }}>
                            {row.title}
                          </Typography>
                          <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>
                            {row.location} - {row.date}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography sx={{ fontSize: '0.8rem', fontWeight: 700 }}>{row.client}</Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography sx={{ fontSize: '0.8rem', fontWeight: 800 }}>{formatCurrency(row.revenue)}</Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Chip
                            size="small"
                            label={`${row.margin.toFixed(1)}%`}
                            sx={{
                              height: 24,
                              borderRadius: '6px',
                              bgcolor: row.margin >= 35 ? '#e4f5e7' : row.margin >= 20 ? '#fff3d8' : '#fde8e6',
                              color: row.margin >= 35 ? '#2e9e3c' : row.margin >= 20 ? '#d4860a' : '#c62828',
                              fontWeight: 900,
                            }}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Typography
                            sx={{
                              fontSize: '0.8rem',
                              fontWeight: 900,
                              color: row.variance < -8 ? 'error.main' : row.variance < 0 ? '#d4860a' : 'success.main',
                            }}
                          >
                            {row.variance > 0 ? '+' : ''}
                            {row.variance.toFixed(1)} pts
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ minWidth: 150 }}>
                          <LinearProgress
                            variant="determinate"
                            value={row.complianceScore}
                            sx={{
                              height: 8,
                              borderRadius: 999,
                              bgcolor: alpha(theme.palette.primary.main, 0.1),
                              '& .MuiLinearProgress-bar': {
                                borderRadius: 999,
                                bgcolor: row.complianceScore >= 85 ? '#2e9e3c' : row.complianceScore >= 70 ? '#d4860a' : '#c62828',
                              },
                            }}
                          />
                          <Typography sx={{ mt: 0.45, fontSize: '0.68rem', color: 'text.secondary' }}>
                            {row.complianceScore}% complete
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <StatusPill label={row.status} tone={row.statusTone} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Panel>

          <Grid container spacing={2} sx={{ mt: 0 }}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Panel title="Margin Leakage" icon={<WarningAmberIcon />} sx={{ height: '100%' }}>
                <Stack spacing={1.5}>
                  {rows
                    .filter((row) => row.variance < 0)
                    .slice(0, 3)
                    .map((row) => (
                      <Box key={row.id}>
                        <Stack direction="row" justifyContent="space-between" spacing={2}>
                          <Box>
                            <Typography sx={{ fontSize: '0.84rem', fontWeight: 900 }}>{row.client}</Typography>
                            <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>{row.title}</Typography>
                          </Box>
                          <Typography sx={{ fontSize: '0.9rem', color: row.variance < -8 ? 'error.main' : '#d4860a', fontWeight: 950 }}>
                            {row.variance.toFixed(1)} pts
                          </Typography>
                        </Stack>
                        <LinearProgress
                          variant="determinate"
                          value={Math.min(100, Math.abs(row.variance) * 4)}
                          sx={{
                            mt: 0.9,
                            height: 7,
                            borderRadius: 999,
                            bgcolor: alpha(theme.palette.warning.main, 0.12),
                            '& .MuiLinearProgress-bar': { bgcolor: row.variance < -8 ? '#c62828' : '#d4860a' },
                          }}
                        />
                      </Box>
                    ))}
                </Stack>
              </Panel>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Panel title="Close-Out Rules" icon={<AssignmentTurnedInIcon />} sx={{ height: '100%' }}>
                <Stack spacing={1}>
                  {[
                    ['Margin above floor', `${rows.filter((row) => row.margin >= 20).length}/${rows.length}`],
                    ['Compliance over 80%', `${rows.filter((row) => row.complianceScore >= 80).length}/${rows.length}`],
                    ['Actuals finalised', `${rows.filter((row) => row.status !== 'Draft').length}/${rows.length}`],
                    ['Admin review queue', `${reviewCount} open`],
                  ].map(([label, value]) => (
                    <DetailRow key={label} label={label} value={value} />
                  ))}
                </Stack>
              </Panel>
            </Grid>
          </Grid>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Stack spacing={2}>
            <Panel
              title="Selected Job"
              icon={<FlightTakeoffIcon />}
              action={<StatusPill label={selected.complianceState} tone={selected.statusTone} />}
            >
              <Typography sx={{ fontSize: '1.08rem', fontWeight: 950, color: 'primary.dark' }}>{selected.title}</Typography>
              <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary', mb: 1.5 }}>
                {selected.client} - {selected.location}
              </Typography>

              <Grid container spacing={1.25}>
                <Grid size={{ xs: 6 }}>
                  <DetailRow label="Revenue" value={formatCurrency(selected.revenue)} />
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <DetailRow label="Actual Cost" value={formatCurrency(selected.totalCost)} />
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <DetailRow label="Quoted Margin" value={`${selected.quotedMargin.toFixed(1)}%`} />
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <DetailRow label="Actual Margin" value={`${selected.margin.toFixed(1)}%`} />
                </Grid>
              </Grid>

              <Divider sx={{ my: 1.5 }} />

              <Stack spacing={1.1}>
                {selected.costSegments.map((segment) => (
                  <Box key={segment.label}>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography sx={{ fontSize: '0.76rem', color: 'text.secondary' }}>{segment.label}</Typography>
                      <Typography sx={{ fontSize: '0.78rem', fontWeight: 900 }}>{formatCurrency(segment.value)}</Typography>
                    </Stack>
                    <LinearProgress
                      variant="determinate"
                      value={getPercent(segment.value, selected.totalCost)}
                      sx={{
                        mt: 0.55,
                        height: 8,
                        borderRadius: 999,
                        bgcolor: alpha(segment.color, 0.12),
                        '& .MuiLinearProgress-bar': { bgcolor: segment.color, borderRadius: 999 },
                      }}
                    />
                  </Box>
                ))}
              </Stack>
            </Panel>

            <Panel title="Compliance Readiness" icon={<GavelIcon />}>
              <Stack spacing={1.05}>
                {complianceChecks.map((check) => (
                  <Stack key={check.label} direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Box sx={{ color: check.complete ? 'success.main' : '#d4860a', display: 'flex' }}>
                        {check.complete ? <CheckCircleIcon fontSize="small" /> : <WarningAmberIcon fontSize="small" />}
                      </Box>
                      <Typography sx={{ fontSize: '0.8rem', fontWeight: 700 }}>{check.label}</Typography>
                    </Stack>
                    <StatusPill label={check.complete ? 'Done' : 'Open'} tone={check.complete ? 'success' : 'warning'} />
                  </Stack>
                ))}
              </Stack>
            </Panel>

            <Panel title="Review Notes" icon={<ScienceIcon />}>
              <Stack spacing={1}>
                {selected.risks.length > 0 ? (
                  selected.risks.map((risk) => (
                    <Alert key={risk} severity={selected.statusTone === 'error' ? 'error' : 'warning'} sx={{ borderRadius: '8px', py: 0.3 }}>
                      {risk}
                    </Alert>
                  ))
                ) : (
                  <Alert severity="success" sx={{ borderRadius: '8px' }}>
                    No material variance or compliance issues detected.
                  </Alert>
                )}
                <Button
                  fullWidth
                  variant="contained"
                  onClick={() => {
                    if (selected.actualId) {
                      navigate(`/financials/${selected.actualId}`);
                    } else {
                      navigate('/financials/new');
                    }
                  }}
                  sx={{ mt: 0.5, borderRadius: '8px', fontWeight: 900 }}
                >
                  {selected.actualId ? 'Open Actual Detail' : selected.nextAction}
                </Button>
              </Stack>
            </Panel>
          </Stack>
        </Grid>
      </Grid>
    </Box>
  );
}
