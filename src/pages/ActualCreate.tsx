import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography,
  Box,
  Card,
  CardContent,
  Button,
  TextField,
  Stack,
  Alert,
  Autocomplete,
  Chip,
  Switch,
  FormControlLabel,
  IconButton,
  alpha,
  useTheme,
  MenuItem,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import AgricultureIcon from '@mui/icons-material/Agriculture';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import BuildIcon from '@mui/icons-material/Build';
import ScienceIcon from '@mui/icons-material/Science';
import PeopleIcon from '@mui/icons-material/People';
import NoteAltIcon from '@mui/icons-material/NoteAlt';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import {
  getClients,
  getJobs,
  getClientById,
  getJobById,
} from '../services/fieldManagementStore';
import {
  getQuotes,
  getQuoteById,
  getKits,
} from '../services/quoteStore';
import { formatCurrency } from '../utils/quoteCalculator';
import { useAuth } from '../contexts/AuthContext';
import { JobActual, CostLineItem, ActualStatus, DailyHoursEntry } from '../types/financials';
import { saveActual } from '../services/financialsStore';
import type { Client } from '../types/fieldManagement';
import type { Quote, Kit, KitSelection } from '../types/quote';
import { WorkflowMaturityBoundary } from '../components/productMaturity/WorkflowMaturityBoundary';

// ─── Module-level helper components ─────────────────────────────

function SectionCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card sx={{ borderRadius: 3 }}>
      <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
          {icon}
          <Typography variant="subtitle1" fontWeight={700}>
            {title}
          </Typography>
        </Stack>
        {children}
      </CardContent>
    </Card>
  );
}

function CostLineItemRow({
  item,
  onChange,
  onRemove,
  placeholder,
}: {
  item: CostLineItem;
  onChange: (updated: CostLineItem) => void;
  onRemove: () => void;
  placeholder?: string;
}) {
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <TextField
        label="Description"
        value={item.description}
        onChange={(e) => onChange({ ...item, description: e.target.value })}
        size="small"
        sx={{ flex: 2 }}
        placeholder={placeholder}
      />
      <TextField
        label="Qty"
        type="number"
        value={item.quantity || ''}
        onChange={(e) => {
          const qty = parseFloat(e.target.value) || 0;
          onChange({ ...item, quantity: qty, total: qty * item.unitCost });
        }}
        size="small"
        sx={{ width: 80 }}
      />
      <TextField
        label={`$/${item.unitLabel}`}
        type="number"
        value={item.unitCost || ''}
        onChange={(e) => {
          const uc = parseFloat(e.target.value) || 0;
          onChange({ ...item, unitCost: uc, total: item.quantity * uc });
        }}
        size="small"
        sx={{ width: 100 }}
      />
      <Typography variant="body2" fontWeight={600} sx={{ minWidth: 80, textAlign: 'right' }}>
        {formatCurrency(item.total)}
      </Typography>
      <IconButton size="small" color="error" onClick={onRemove}>
        <DeleteIcon fontSize="small" />
      </IconButton>
    </Stack>
  );
}

function SimpleLineItemRow({
  item,
  onChange,
  onRemove,
  placeholder,
}: {
  item: { id: string; description: string; amount: number };
  onChange: (updated: { id: string; description: string; amount: number }) => void;
  onRemove: () => void;
  placeholder?: string;
}) {
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <TextField
        label="Description"
        value={item.description}
        onChange={(e) => onChange({ ...item, description: e.target.value })}
        size="small"
        sx={{ flex: 2 }}
        placeholder={placeholder}
      />
      <TextField
        label="Amount ($)"
        type="number"
        value={item.amount || ''}
        onChange={(e) => onChange({ ...item, amount: parseFloat(e.target.value) || 0 })}
        size="small"
        sx={{ width: 130 }}
      />
      <IconButton size="small" color="error" onClick={onRemove}>
        <DeleteIcon fontSize="small" />
      </IconButton>
    </Stack>
  );
}

function newCostLineItem(unitLabel: string = 'ea'): CostLineItem {
  return {
    id: crypto.randomUUID(),
    description: '',
    quantity: 0,
    unitLabel,
    unitCost: 0,
    total: 0,
  };
}

function newSimpleItem(): { id: string; description: string; amount: number } {
  return { id: crypto.randomUUID(), description: '', amount: 0 };
}

// ─── Main Component ─────────────────────────────────────────────

export default function ActualCreate() {
  const theme = useTheme();
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id || '';

  // ─── Data sources ───────────────────────────────────
  const allClients = useMemo(() => getClients(), []);
  const allJobs = useMemo(() => getJobs(), []);
  const allQuotes = useMemo(() => getQuotes(userId), [userId]);
  const allKits = useMemo(() => getKits(userId), [userId]);

  // ─── Header state ──────────────────────────────────
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [dailyHours, setDailyHours] = useState<DailyHoursEntry[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [rateType, setRateType] = useState<'hourly' | 'hectare'>('hourly');
  const [rate, setRate] = useState(0);
  const [rateStr, setRateStr] = useState('');
  const [hectares, setHectares] = useState(0);
  const [hectaresStr, setHectaresStr] = useState('');
  const [revenue, setRevenue] = useState(0);
  const [revenueStr, setRevenueStr] = useState('');
  const [revenueNotes, setRevenueNotes] = useState('');
  const [status, setStatus] = useState<ActualStatus>('draft');

  // ─── Equipment state ───────────────────────────────
  const [kitSelections, setKitSelections] = useState<Array<{ kitId: string; quantity: number }>>([]);
  const [actualFlightHours, setActualFlightHours] = useState(0);
  const [flightHoursStr, setFlightHoursStr] = useState('');
  const [fuelTotal, setFuelTotal] = useState(0);
  const [fuelTotalStr, setFuelTotalStr] = useState('');
  const [showFuelBreakdown, setShowFuelBreakdown] = useState(false);
  const [fuelBreakdown, setFuelBreakdown] = useState<CostLineItem[]>([]);

  // ─── Labour state ──────────────────────────────────
  const [pilotCount, setPilotCount] = useState(1);
  const [pilotRate, setPilotRate] = useState(0);
  const [pilotRateStr, setPilotRateStr] = useState('');
  const [hasChemOp, setHasChemOp] = useState(false);
  const [chemOpHours, setChemOpHours] = useState(0);
  const [chemOpHoursStr, setChemOpHoursStr] = useState('');
  const [chemOpRate, setChemOpRate] = useState(0);
  const [chemOpRateStr, setChemOpRateStr] = useState('');
  const [additionalLabour, setAdditionalLabour] = useState<Array<{ id: string; description: string; amount: number }>>([]);

  // ─── Travel state ──────────────────────────────────
  const [kilometres, setKilometres] = useState(0);
  const [kilometresStr, setKilometresStr] = useState('');
  const [vehicleCostPerKm, setVehicleCostPerKm] = useState(0);
  const [vehicleCostPerKmStr, setVehicleCostPerKmStr] = useState('');
  const [accommodation, setAccommodation] = useState(0);
  const [accommodationStr, setAccommodationStr] = useState('');
  const [showAccBreakdown, setShowAccBreakdown] = useState(false);
  const [accNights, setAccNights] = useState(0);
  const [accNightsStr, setAccNightsStr] = useState('');
  const [accPerNight, setAccPerNight] = useState(0);
  const [accPerNightStr, setAccPerNightStr] = useState('');
  const [meals, setMeals] = useState(0);
  const [mealsStr, setMealsStr] = useState('');
  const [showMealsBreakdown, setShowMealsBreakdown] = useState(false);
  const [mealsDays, setMealsDays] = useState(0);
  const [mealsDaysStr, setMealsDaysStr] = useState('');
  const [mealsPerDay, setMealsPerDay] = useState(0);
  const [mealsPerDayStr, setMealsPerDayStr] = useState('');

  // ─── Repairs state ─────────────────────────────────
  const [repairItems, setRepairItems] = useState<Array<{ id: string; description: string; amount: number }>>([]);

  // ─── Other Costs state ─────────────────────────────
  const [otherItems, setOtherItems] = useState<Array<{ id: string; description: string; amount: number }>>([]);

  // ─── Chemical Cost ─────────────────────────────────
  const [chemicalCost, setChemicalCost] = useState(0);
  const [chemicalCostStr, setChemicalCostStr] = useState('');

  // ─── Notes state ───────────────────────────────────
  const [notes, setNotes] = useState('');
  const [lessonsLearned, setLessonsLearned] = useState('');

  // ─── Prefill from sessionStorage ───────────────────
  useEffect(() => {
    const raw = sessionStorage.getItem('ftf_actual_prefill');
    if (raw) {
      sessionStorage.removeItem('ftf_actual_prefill');
      try {
        const prefill = JSON.parse(raw);
        if (prefill.jobId) setSelectedJobId(prefill.jobId);
        if (prefill.quoteId) setSelectedQuoteId(prefill.quoteId);
        if (prefill.clientId) setSelectedClientId(prefill.clientId);
        if (prefill.title) setTitle(prefill.title);
        if (prefill.jobDate) {
          setStartDate(prefill.jobDate);
          setEndDate(prefill.jobDate);
        }
        if (prefill.revenue) {
          setRevenue(prefill.revenue);
          setRevenueStr(String(prefill.revenue));
        }
      } catch {
        // ignore invalid JSON
      }
    }
  }, []);

  // ─── Auto-fill from job selection ──────────────────
  const handleJobSelect = useCallback(
    (jobId: string | null) => {
      setSelectedJobId(jobId);
      if (!jobId) return;
      const job = getJobById(jobId);
      if (!job) return;

      if (job.clientId) {
        setSelectedClientId(job.clientId);
        const client = getClientById(job.clientId);
        if (client) {
          setTitle(`${job.weedTarget} - ${client.name}`);
        }
      }
      if (job.dateSprayed) {
        setStartDate(job.dateSprayed);
        setEndDate(job.dateSprayed);
      }
    },
    [],
  );

  // ─── Auto-fill from quote selection ────────────────
  const handleQuoteSelect = useCallback(
    (quoteId: string | null) => {
      setSelectedQuoteId(quoteId);
      if (!quoteId) return;
      const quote = getQuoteById(quoteId);
      if (!quote) return;

      // Revenue
      setRevenue(quote.total);
      setRevenueStr(String(quote.total));

      // Client
      if (quote.clientId) setSelectedClientId(quote.clientId);

      // Rate type & rate from pricing mode
      if (quote.pricingMode === 'per-hectare') {
        setRateType('hectare');
        // Find the hectare line item to get rate and quantity
        const haLine = quote.lineItems.find((li) => li.type === 'broadacre-spray');
        if (haLine) {
          setRate(haLine.unitRate);
          setRateStr(String(haLine.unitRate));
          setHectares(haLine.quantity);
          setHectaresStr(String(haLine.quantity));
        }
      } else if (quote.pricingMode === 'per-hour') {
        setRateType('hourly');
        const hrLine = quote.lineItems.find((li) => li.type === 'spot-spray');
        if (hrLine) {
          setRate(hrLine.unitRate);
          setRateStr(String(hrLine.unitRate));
        }
      } else if (quote.pricingMode === 'daily-contract') {
        setRateType('hourly');
        // Convert daily rate to hourly estimate (assume 8hr day)
        const dayLine = quote.lineItems.find((li) => li.type === 'daily-contract');
        if (dayLine) {
          const hourlyEstimate = Math.round((dayLine.unitRate / 8) * 100) / 100;
          setRate(hourlyEstimate);
          setRateStr(String(hourlyEstimate));
        }
      }

      // Kit selections
      if (quote.kitSelections && quote.kitSelections.length > 0) {
        setKitSelections(quote.kitSelections.map((ks) => ({ kitId: ks.kitId, quantity: ks.quantity })));
      }

      // Crew config → labour
      if (quote.crew) {
        setPilotCount(quote.crew.pilotCount);
        setPilotRate(quote.crew.pilotRatePerHour);
        setPilotRateStr(String(quote.crew.pilotRatePerHour));
        setHasChemOp(quote.crew.hasChemOperator);
        if (quote.crew.hasChemOperator) {
          setChemOpRate(quote.crew.chemOperatorRatePerHour);
          setChemOpRateStr(String(quote.crew.chemOperatorRatePerHour));
        }
      }

      // Travel — pull vehicle cost per km from kit
      if (quote.costBreakdown) {
        if (quote.costBreakdown.travelKm > 0) {
          setKilometres(quote.costBreakdown.travelKm);
          setKilometresStr(String(quote.costBreakdown.travelKm));
        }
      }
      // Travel line item for per-km rate
      const travelLine = quote.lineItems.find((li) => li.type === 'travel');
      if (travelLine && travelLine.unitRate > 0) {
        setVehicleCostPerKm(travelLine.unitRate);
        setVehicleCostPerKmStr(String(travelLine.unitRate));
      }

      // Chemical cost
      const chemLine = quote.lineItems.find((li) => li.type === 'chemical-cost');
      if (chemLine) {
        setChemicalCost(chemLine.amount);
        setChemicalCostStr(String(chemLine.amount));
      }

      // Title from job description
      if (quote.jobDescription) {
        setTitle(quote.jobDescription);
      }
    },
    [],
  );

  // ─── Quote for comparison ─────────────────────────
  const linkedQuote: Quote | undefined = useMemo(
    () => (selectedQuoteId ? getQuoteById(selectedQuoteId) : undefined),
    [selectedQuoteId],
  );

  // ─── Generate daily hours from date range ─────────
  useEffect(() => {
    if (!startDate || !endDate) return;
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
      setDailyHours([]);
      return;
    }
    const entries: DailyHoursEntry[] = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      const dateStr = cursor.toISOString().slice(0, 10);
      // Preserve existing hours for this date if already entered
      const existing = dailyHours.find((d) => d.date === dateStr);
      entries.push({ date: dateStr, hours: existing ? existing.hours : 0 });
      cursor.setDate(cursor.getDate() + 1);
    }
    // Only update if the dates changed (avoid infinite loop)
    const newDates = entries.map((e) => e.date).join(',');
    const oldDates = dailyHours.map((e) => e.date).join(',');
    if (newDates !== oldDates) {
      setDailyHours(entries);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

  const totalDays = dailyHours.length;
  const totalHours = dailyHours.reduce((sum, d) => sum + d.hours, 0);

  const updateDailyHoursEntry = useCallback((date: string, hours: number) => {
    setDailyHours((prev) =>
      prev.map((d) => (d.date === date ? { ...d, hours } : d)),
    );
  }, []);

  // ─── Auto-calculate revenue from rate ────────────
  useEffect(() => {
    if (rate <= 0) return;
    if (rateType === 'hourly' && totalHours > 0) {
      const calc = rate * totalHours;
      setRevenue(calc);
      setRevenueStr(String(Math.round(calc * 100) / 100));
    } else if (rateType === 'hectare' && hectares > 0) {
      const calc = rate * hectares;
      setRevenue(calc);
      setRevenueStr(String(Math.round(calc * 100) / 100));
    }
  }, [rate, rateType, totalHours, hectares]);

  const effectiveHourlyRate = totalHours > 0 ? revenue / totalHours : 0;

  // ─── Kit helpers ───────────────────────────────────
  const addKit = () => {
    if (allKits.length === 0) return;
    setKitSelections((prev) => [...prev, { kitId: allKits[0].id, quantity: 1 }]);
  };

  const updateKitSelection = (index: number, field: 'kitId' | 'quantity', value: string | number) => {
    setKitSelections((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const removeKit = (index: number) => {
    setKitSelections((prev) => prev.filter((_, i) => i !== index));
  };

  // ─── P&L Calculations ─────────────────────────────
  const calculations = useMemo(() => {
    const labourPilots = pilotCount * totalHours * pilotRate;
    const labourChemOp = hasChemOp ? chemOpHours * chemOpRate : 0;
    const labourAdditional = additionalLabour.reduce((s, i) => s + i.amount, 0);
    const totalLabour = labourPilots + labourChemOp + labourAdditional;

    const vehicleTotal = kilometres * vehicleCostPerKm;
    const totalTravel = vehicleTotal + accommodation + meals;

    const totalRepairs = repairItems.reduce((s, i) => s + i.amount, 0);
    const totalOther = otherItems.reduce((s, i) => s + i.amount, 0);

    const totalCost =
      fuelTotal + totalLabour + totalTravel + totalRepairs + totalOther + chemicalCost;

    const grossProfit = revenue - totalCost;
    const grossMarginPercent = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

    return {
      labourPilots,
      labourChemOp,
      labourAdditional,
      totalLabour,
      vehicleTotal,
      totalTravel,
      totalRepairs,
      totalOther,
      totalCost,
      grossProfit,
      grossMarginPercent,
    };
  }, [
    pilotCount, totalHours, pilotRate,
    hasChemOp, chemOpHours, chemOpRate,
    additionalLabour, kilometres, vehicleCostPerKm,
    accommodation, meals, fuelTotal,
    repairItems, otherItems, chemicalCost, revenue,
  ]);

  const marginColor =
    calculations.grossMarginPercent >= 40
      ? theme.palette.success.main
      : calculations.grossMarginPercent >= 20
        ? theme.palette.warning.main
        : theme.palette.error.main;

  // ─── Save handler ──────────────────────────────────
  const handleSave = () => {
    const actual = saveActual({
      contractorUserId: userId,
      jobId: selectedJobId || undefined,
      quoteId: selectedQuoteId || undefined,
      clientId: selectedClientId || undefined,
      title,
      startDate,
      endDate,
      dailyHours,
      totalDays,
      totalHours,
      status,
      rateType,
      rate,
      hectares: rateType === 'hectare' ? hectares : undefined,
      revenue,
      effectiveHourlyRate: Math.round(effectiveHourlyRate * 100) / 100,
      revenueNotes,
      equipment: {
        kitSelections: kitSelections as KitSelection[],
        actualFlightHours: actualFlightHours,
        fuelTotal,
        fuelBreakdown,
      },
      labour: {
        pilotCount,
        pilotHours: totalHours,
        pilotRatePerHour: pilotRate,
        hasChemOperator: hasChemOp,
        chemOpHours,
        chemOpRatePerHour: chemOpRate,
        additionalLabour: additionalLabour.map((l) => ({
          id: l.id,
          description: l.description,
          quantity: 1,
          unitLabel: 'ea',
          unitCost: l.amount,
          total: l.amount,
        })),
      },
      travel: {
        kilometres,
        vehicleCostPerKm,
        vehicleTotal: calculations.vehicleTotal,
        accommodation,
        accommodationBreakdown: [],
        meals,
        mealsBreakdown: [],
      },
      repairs: {
        items: repairItems.map((r) => ({
          id: r.id,
          description: r.description,
          quantity: 1,
          unitLabel: 'ea',
          unitCost: r.amount,
          total: r.amount,
        })),
      },
      otherCosts: {
        items: otherItems.map((o) => ({
          id: o.id,
          description: o.description,
          quantity: 1,
          unitLabel: 'ea',
          unitCost: o.amount,
          total: o.amount,
        })),
      },
      chemicalCost,
      totalCost: calculations.totalCost,
      grossProfit: calculations.grossProfit,
      grossMarginPercent: Math.round(calculations.grossMarginPercent * 10) / 10,
      notes,
      lessonsLearned,
    });
    navigate(`/financials/${actual.id}`);
  };

  // ─── Render ────────────────────────────────────────
  return (
    <Box>
      <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/financials')} sx={{ mb: 2 }}>
        Back to Financials
      </Button>

      <Typography variant="h4" fontWeight={800} gutterBottom>
        Record Job Actual
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Record the actual costs and revenue for a completed job.
      </Typography>

      <Stack spacing={3}>
        {/* ─── A. Header ─────────────────────────────────── */}
        <SectionCard icon={<ReceiptLongIcon color="primary" />} title="Job Details">
          <Stack spacing={2}>
            <TextField
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              size="small"
              fullWidth
              placeholder="e.g. Blackberry Spray - Smith Farm"
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
              <TextField
                label="Start Date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                size="small"
                InputLabelProps={{ shrink: true }}
                sx={{ width: 170 }}
              />
              <TextField
                label="End Date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                size="small"
                InputLabelProps={{ shrink: true }}
                sx={{ width: 170 }}
              />
              {totalDays > 0 && (
                <Chip
                  label={`${totalDays} day${totalDays !== 1 ? 's' : ''}`}
                  size="small"
                  color="primary"
                  variant="outlined"
                  sx={{ fontWeight: 700 }}
                />
              )}
              <TextField
                label="Status"
                select
                value={status}
                onChange={(e) => setStatus(e.target.value as ActualStatus)}
                size="small"
                sx={{ width: 160 }}
              >
                <MenuItem value="draft">Draft</MenuItem>
                <MenuItem value="finalised">Finalised</MenuItem>
              </TextField>
            </Stack>

            {/* Daily Hours Breakdown */}
            {dailyHours.length > 0 && (
              <Box
                sx={{
                  border: `1px solid ${alpha(theme.palette.primary.main, 0.12)}`,
                  borderRadius: '12px',
                  p: 2,
                  bgcolor: alpha(theme.palette.primary.main, 0.02),
                }}
              >
                <Typography variant="body2" fontWeight={700} color="primary.dark" sx={{ mb: 1.5 }}>
                  Daily Hours
                </Typography>
                <Stack spacing={1}>
                  {dailyHours.map((entry) => (
                    <Stack
                      key={entry.date}
                      direction="row"
                      spacing={2}
                      alignItems="center"
                    >
                      <Typography
                        variant="body2"
                        sx={{ minWidth: 140, fontWeight: 600 }}
                      >
                        {new Date(entry.date + 'T00:00:00').toLocaleDateString('en-AU', {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                        })}
                      </Typography>
                      <TextField
                        type="number"
                        value={entry.hours || ''}
                        onChange={(e) =>
                          updateDailyHoursEntry(
                            entry.date,
                            Math.max(0, parseFloat(e.target.value) || 0),
                          )
                        }
                        size="small"
                        sx={{ width: 100 }}
                        inputProps={{ min: 0, step: 0.5 }}
                        placeholder="0"
                      />
                      <Typography variant="body2" color="text.secondary">
                        hrs
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
                <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 1.5, pt: 1.5, borderTop: `1px solid ${alpha(theme.palette.primary.main, 0.1)}` }}>
                  <Typography variant="body2" fontWeight={700} sx={{ minWidth: 140 }}>
                    Total
                  </Typography>
                  <Typography variant="body2" fontWeight={800} color="primary.main">
                    {totalHours} hrs
                  </Typography>
                </Stack>
              </Box>
            )}

            <Autocomplete
              options={allJobs}
              getOptionLabel={(j) => `${j.weedTarget} — ${j.dateSprayed}`}
              value={allJobs.find((j) => j.id === selectedJobId) || null}
              onChange={(_, v) => handleJobSelect(v?.id || null)}
              renderInput={(params) => (
                <TextField {...params} label="Link to Job (optional)" size="small" />
              )}
            />

            <Stack direction="row" spacing={2} alignItems="center">
              <Autocomplete
                options={allQuotes}
                getOptionLabel={(q) => `${q.quoteNumber} — ${q.jobDescription}`}
                value={allQuotes.find((q) => q.id === selectedQuoteId) || null}
                onChange={(_, v) => handleQuoteSelect(v?.id || null)}
                renderInput={(params) => (
                  <TextField {...params} label="Link to Quote (optional)" size="small" />
                )}
                sx={{ flex: 1 }}
              />
              {linkedQuote && (
                <Chip
                  label={`Quoted: ${formatCurrency(linkedQuote.total)}`}
                  color="info"
                  size="small"
                />
              )}
            </Stack>

            <Autocomplete
              options={allClients}
              getOptionLabel={(c) => c.name}
              value={allClients.find((c) => c.id === selectedClientId) || null}
              onChange={(_, v) => setSelectedClientId(v?.id || null)}
              renderInput={(params) => (
                <TextField {...params} label="Client" size="small" />
              )}
            />

            {/* Rate & Revenue */}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
              <TextField
                label="Rate Type"
                select
                value={rateType}
                onChange={(e) => setRateType(e.target.value as 'hourly' | 'hectare')}
                size="small"
                sx={{ width: 150 }}
              >
                <MenuItem value="hourly">Per Hour</MenuItem>
                <MenuItem value="hectare">Per Hectare</MenuItem>
              </TextField>
              <TextField
                label={rateType === 'hourly' ? 'Rate ($/hr)' : 'Rate ($/ha)'}
                type="number"
                value={rateStr}
                onChange={(e) => {
                  setRateStr(e.target.value);
                  setRate(parseFloat(e.target.value) || 0);
                }}
                size="small"
                sx={{ width: 140 }}
              />
              {rateType === 'hectare' && (
                <TextField
                  label="Hectares"
                  type="number"
                  value={hectaresStr}
                  onChange={(e) => {
                    setHectaresStr(e.target.value);
                    setHectares(parseFloat(e.target.value) || 0);
                  }}
                  size="small"
                  sx={{ width: 130 }}
                />
              )}
              {effectiveHourlyRate > 0 && (
                <Chip
                  label={`Effective: ${formatCurrency(effectiveHourlyRate)}/hr`}
                  size="small"
                  color="primary"
                  variant="outlined"
                  sx={{ fontWeight: 700 }}
                />
              )}
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Revenue ($)"
                type="number"
                value={revenueStr}
                onChange={(e) => {
                  setRevenueStr(e.target.value);
                  setRevenue(parseFloat(e.target.value) || 0);
                }}
                size="small"
                sx={{ width: 180 }}
                helperText={rate > 0 ? 'Auto-calculated from rate' : undefined}
              />
              <TextField
                label="Revenue Notes"
                value={revenueNotes}
                onChange={(e) => setRevenueNotes(e.target.value)}
                size="small"
                fullWidth
                placeholder="Explain any variance from quote..."
              />
            </Stack>
          </Stack>
        </SectionCard>

        {/* ─── B. Equipment ──────────────────────────────── */}
        <SectionCard icon={<AgricultureIcon color="primary" />} title="Equipment">
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Select kits used on this job
            </Typography>

            {kitSelections.map((ks, idx) => (
              <Stack key={ks.kitId + idx} direction="row" spacing={1} alignItems="center">
                <TextField
                  select
                  label="Kit"
                  value={ks.kitId}
                  onChange={(e) => updateKitSelection(idx, 'kitId', e.target.value)}
                  size="small"
                  sx={{ flex: 1 }}
                >
                  {allKits.map((k) => (
                    <MenuItem key={k.id} value={k.id}>
                      {k.name} ({k.droneModel})
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="Qty"
                  type="number"
                  value={ks.quantity}
                  onChange={(e) =>
                    updateKitSelection(idx, 'quantity', Math.max(1, parseInt(e.target.value) || 1))
                  }
                  size="small"
                  sx={{ width: 80 }}
                  inputProps={{ min: 1 }}
                />
                <IconButton size="small" color="error" onClick={() => removeKit(idx)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Stack>
            ))}

            <Button size="small" startIcon={<AddIcon />} onClick={addKit} disabled={allKits.length === 0}>
              Add Kit
            </Button>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Actual Flight Hours"
                type="number"
                value={flightHoursStr}
                onChange={(e) => {
                  setFlightHoursStr(e.target.value);
                  setActualFlightHours(parseFloat(e.target.value) || 0);
                }}
                size="small"
                sx={{ width: 180 }}
              />
              <TextField
                label="Generator Fuel Total ($)"
                type="number"
                value={fuelTotalStr}
                onChange={(e) => {
                  setFuelTotalStr(e.target.value);
                  setFuelTotal(parseFloat(e.target.value) || 0);
                }}
                size="small"
                sx={{ width: 200 }}
              />
            </Stack>

            <FormControlLabel
              control={
                <Switch
                  checked={showFuelBreakdown}
                  onChange={(e) => setShowFuelBreakdown(e.target.checked)}
                />
              }
              label="Show fuel breakdown"
            />

            {showFuelBreakdown && (
              <Stack spacing={1} sx={{ pl: 2 }}>
                {fuelBreakdown.map((item, idx) => (
                  <CostLineItemRow
                    key={item.id}
                    item={item}
                    onChange={(updated) => {
                      const next = [...fuelBreakdown];
                      next[idx] = updated;
                      setFuelBreakdown(next);
                      setFuelTotal(next.reduce((s, i) => s + i.total, 0));
                      setFuelTotalStr(String(next.reduce((s, i) => s + i.total, 0)));
                    }}
                    onRemove={() => {
                      const next = fuelBreakdown.filter((_, i) => i !== idx);
                      setFuelBreakdown(next);
                      setFuelTotal(next.reduce((s, i) => s + i.total, 0));
                      setFuelTotalStr(String(next.reduce((s, i) => s + i.total, 0)));
                    }}
                  />
                ))}
                <Button
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={() => setFuelBreakdown([...fuelBreakdown, newCostLineItem('L')])}
                >
                  Add Fuel Line
                </Button>
              </Stack>
            )}
          </Stack>
        </SectionCard>

        {/* ─── C. Labour ─────────────────────────────────── */}
        <SectionCard icon={<PeopleIcon color="primary" />} title="Labour">
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Pilot Count"
                type="number"
                value={pilotCount}
                onChange={(e) => setPilotCount(Math.max(0, parseInt(e.target.value) || 0))}
                size="small"
                sx={{ width: 120 }}
                inputProps={{ min: 0 }}
              />
              <TextField
                label="Total Hours (from daily)"
                value={`${totalHours} hrs`}
                size="small"
                sx={{ width: 160 }}
                slotProps={{ input: { readOnly: true } }}
                helperText={totalDays > 0 ? `${totalDays} days` : undefined}
              />
              <TextField
                label="Pilot Rate ($/hr)"
                type="number"
                value={pilotRateStr}
                onChange={(e) => {
                  setPilotRateStr(e.target.value);
                  setPilotRate(parseFloat(e.target.value) || 0);
                }}
                size="small"
                sx={{ width: 140 }}
              />
              {pilotCount > 0 && totalHours > 0 && pilotRate > 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center' }}>
                  = {formatCurrency(pilotCount * totalHours * pilotRate)}
                </Typography>
              )}
            </Stack>

            <FormControlLabel
              control={
                <Switch checked={hasChemOp} onChange={(e) => setHasChemOp(e.target.checked)} />
              }
              label="Chemical Operator"
            />

            {hasChemOp && (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ pl: 2 }}>
                <TextField
                  label="Chem Op Hours"
                  type="number"
                  value={chemOpHoursStr}
                  onChange={(e) => {
                    setChemOpHoursStr(e.target.value);
                    setChemOpHours(parseFloat(e.target.value) || 0);
                  }}
                  size="small"
                  sx={{ width: 140 }}
                />
                <TextField
                  label="Rate ($/hr)"
                  type="number"
                  value={chemOpRateStr}
                  onChange={(e) => {
                    setChemOpRateStr(e.target.value);
                    setChemOpRate(parseFloat(e.target.value) || 0);
                  }}
                  size="small"
                  sx={{ width: 120 }}
                />
                {chemOpHours > 0 && chemOpRate > 0 && (
                  <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center' }}>
                    = {formatCurrency(chemOpHours * chemOpRate)}
                  </Typography>
                )}
              </Stack>
            )}

            <Typography variant="body2" fontWeight={600} sx={{ mt: 1 }}>
              Additional Labour
            </Typography>
            {additionalLabour.map((item, idx) => (
              <SimpleLineItemRow
                key={item.id}
                item={item}
                onChange={(updated) => {
                  const next = [...additionalLabour];
                  next[idx] = updated;
                  setAdditionalLabour(next);
                }}
                onRemove={() => setAdditionalLabour(additionalLabour.filter((_, i) => i !== idx))}
              />
            ))}
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={() => setAdditionalLabour([...additionalLabour, newSimpleItem()])}
            >
              Add Labour Item
            </Button>
          </Stack>
        </SectionCard>

        {/* ─── D. Travel & Accommodation ─────────────────── */}
        <SectionCard icon={<DirectionsCarIcon color="primary" />} title="Travel & Accommodation">
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Kilometres"
                type="number"
                value={kilometresStr}
                onChange={(e) => {
                  setKilometresStr(e.target.value);
                  setKilometres(parseFloat(e.target.value) || 0);
                }}
                size="small"
                sx={{ width: 140 }}
              />
              <TextField
                label="Vehicle Cost ($/km)"
                type="number"
                value={vehicleCostPerKmStr}
                onChange={(e) => {
                  setVehicleCostPerKmStr(e.target.value);
                  setVehicleCostPerKm(parseFloat(e.target.value) || 0);
                }}
                size="small"
                sx={{ width: 160 }}
                inputProps={{ step: 0.1 }}
              />
              {kilometres > 0 && vehicleCostPerKm > 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center' }}>
                  = {formatCurrency(kilometres * vehicleCostPerKm)}
                </Typography>
              )}
            </Stack>

            {/* Accommodation */}
            <Stack direction="row" spacing={2} alignItems="center">
              <TextField
                label="Accommodation Total ($)"
                type="number"
                value={accommodationStr}
                onChange={(e) => {
                  setAccommodationStr(e.target.value);
                  setAccommodation(parseFloat(e.target.value) || 0);
                }}
                size="small"
                sx={{ width: 200 }}
              />
              <Button
                size="small"
                onClick={() => setShowAccBreakdown(!showAccBreakdown)}
                endIcon={showAccBreakdown ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              >
                Breakdown
              </Button>
            </Stack>
            {showAccBreakdown && (
              <Stack direction="row" spacing={2} sx={{ pl: 2 }}>
                <TextField
                  label="Nights"
                  type="number"
                  value={accNightsStr}
                  onChange={(e) => {
                    setAccNightsStr(e.target.value);
                    const n = parseFloat(e.target.value) || 0;
                    setAccNights(n);
                    setAccommodation(n * accPerNight);
                    setAccommodationStr(String(n * accPerNight));
                  }}
                  size="small"
                  sx={{ width: 100 }}
                />
                <TextField
                  label="$/Night"
                  type="number"
                  value={accPerNightStr}
                  onChange={(e) => {
                    setAccPerNightStr(e.target.value);
                    const r = parseFloat(e.target.value) || 0;
                    setAccPerNight(r);
                    setAccommodation(accNights * r);
                    setAccommodationStr(String(accNights * r));
                  }}
                  size="small"
                  sx={{ width: 100 }}
                />
                <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center' }}>
                  = {formatCurrency(accNights * accPerNight)}
                </Typography>
              </Stack>
            )}

            {/* Meals */}
            <Stack direction="row" spacing={2} alignItems="center">
              <TextField
                label="Meals Total ($)"
                type="number"
                value={mealsStr}
                onChange={(e) => {
                  setMealsStr(e.target.value);
                  setMeals(parseFloat(e.target.value) || 0);
                }}
                size="small"
                sx={{ width: 200 }}
              />
              <Button
                size="small"
                onClick={() => setShowMealsBreakdown(!showMealsBreakdown)}
                endIcon={showMealsBreakdown ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              >
                Breakdown
              </Button>
            </Stack>
            {showMealsBreakdown && (
              <Stack direction="row" spacing={2} sx={{ pl: 2 }}>
                <TextField
                  label="Days"
                  type="number"
                  value={mealsDaysStr}
                  onChange={(e) => {
                    setMealsDaysStr(e.target.value);
                    const d = parseFloat(e.target.value) || 0;
                    setMealsDays(d);
                    setMeals(d * mealsPerDay);
                    setMealsStr(String(d * mealsPerDay));
                  }}
                  size="small"
                  sx={{ width: 100 }}
                />
                <TextField
                  label="$/Day"
                  type="number"
                  value={mealsPerDayStr}
                  onChange={(e) => {
                    setMealsPerDayStr(e.target.value);
                    const r = parseFloat(e.target.value) || 0;
                    setMealsPerDay(r);
                    setMeals(mealsDays * r);
                    setMealsStr(String(mealsDays * r));
                  }}
                  size="small"
                  sx={{ width: 100 }}
                />
                <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center' }}>
                  = {formatCurrency(mealsDays * mealsPerDay)}
                </Typography>
              </Stack>
            )}
          </Stack>
        </SectionCard>

        {/* ─── E. Repairs & Breakdowns ───────────────────── */}
        <SectionCard icon={<BuildIcon color="primary" />} title="Repairs & Breakdowns">
          <Stack spacing={2}>
            {repairItems.map((item, idx) => (
              <SimpleLineItemRow
                key={item.id}
                item={item}
                onChange={(updated) => {
                  const next = [...repairItems];
                  next[idx] = updated;
                  setRepairItems(next);
                }}
                onRemove={() => setRepairItems(repairItems.filter((_, i) => i !== idx))}
                placeholder="e.g. Prop replacement, alternator repair, tyre puncture..."
              />
            ))}
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={() => setRepairItems([...repairItems, newSimpleItem()])}
            >
              Add Item
            </Button>
          </Stack>
        </SectionCard>

        {/* ─── F. Other Costs ────────────────────────────── */}
        <SectionCard icon={<ReceiptLongIcon color="primary" />} title="Other Costs">
          <Stack spacing={2}>
            {otherItems.map((item, idx) => (
              <SimpleLineItemRow
                key={item.id}
                item={item}
                onChange={(updated) => {
                  const next = [...otherItems];
                  next[idx] = updated;
                  setOtherItems(next);
                }}
                onRemove={() => setOtherItems(otherItems.filter((_, i) => i !== idx))}
              />
            ))}
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={() => setOtherItems([...otherItems, newSimpleItem()])}
            >
              Add Item
            </Button>
          </Stack>
        </SectionCard>

        {/* ─── G. Chemical Cost ──────────────────────────── */}
        <SectionCard icon={<ScienceIcon color="primary" />} title="Chemical Cost">
          <TextField
            label="Actual Chemical Spend ($)"
            type="number"
            value={chemicalCostStr}
            onChange={(e) => {
              setChemicalCostStr(e.target.value);
              setChemicalCost(parseFloat(e.target.value) || 0);
            }}
            size="small"
            sx={{ width: 220 }}
          />
        </SectionCard>

        {/* ─── H. Notes ──────────────────────────────────── */}
        <SectionCard icon={<NoteAltIcon color="primary" />} title="Notes">
          <Stack spacing={2}>
            <TextField
              label="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              size="small"
              multiline
              rows={3}
              fullWidth
            />
            <TextField
              label="Lessons Learned"
              value={lessonsLearned}
              onChange={(e) => setLessonsLearned(e.target.value)}
              size="small"
              multiline
              rows={3}
              fullWidth
              placeholder="What would you do differently next time?"
            />
          </Stack>
        </SectionCard>

        <WorkflowMaturityBoundary moduleCode="financials" workflowCode="margin-analysis">
        <Stack spacing={3}>
        {/* ─── I. P&L Summary ────────────────────────────── */}
        <Card sx={{ borderRadius: 3, border: `2px solid ${marginColor}` }}>
          <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
            <Typography variant="h6" fontWeight={800} sx={{ mb: 2 }}>
              P&L Summary
            </Typography>

            <Stack spacing={1.5}>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2" color="text.secondary">
                  Revenue
                </Typography>
                <Typography variant="body2" fontWeight={700}>
                  {formatCurrency(revenue)}
                </Typography>
              </Stack>

              <Box
                sx={{
                  bgcolor: alpha(theme.palette.grey[500], 0.08),
                  borderRadius: 2,
                  p: 1.5,
                }}
              >
                <Typography variant="caption" fontWeight={700} sx={{ mb: 1, display: 'block' }}>
                  Cost Breakdown
                </Typography>
                <Stack spacing={0.5}>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="caption" color="text.secondary">Fuel</Typography>
                    <Typography variant="caption">{formatCurrency(fuelTotal)}</Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="caption" color="text.secondary">Labour</Typography>
                    <Typography variant="caption">{formatCurrency(calculations.totalLabour)}</Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="caption" color="text.secondary">Travel & Vehicle</Typography>
                    <Typography variant="caption">{formatCurrency(calculations.vehicleTotal)}</Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="caption" color="text.secondary">Accommodation</Typography>
                    <Typography variant="caption">{formatCurrency(accommodation)}</Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="caption" color="text.secondary">Meals</Typography>
                    <Typography variant="caption">{formatCurrency(meals)}</Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="caption" color="text.secondary">Repairs</Typography>
                    <Typography variant="caption">{formatCurrency(calculations.totalRepairs)}</Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="caption" color="text.secondary">Chemicals</Typography>
                    <Typography variant="caption">{formatCurrency(chemicalCost)}</Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="caption" color="text.secondary">Other</Typography>
                    <Typography variant="caption">{formatCurrency(calculations.totalOther)}</Typography>
                  </Stack>
                </Stack>
              </Box>

              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2" fontWeight={700}>
                  Total Cost
                </Typography>
                <Typography variant="body2" fontWeight={700}>
                  {formatCurrency(calculations.totalCost)}
                </Typography>
              </Stack>

              <Box sx={{ borderTop: `1px solid ${theme.palette.divider}`, pt: 1 }} />

              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body1" fontWeight={800}>
                  Gross Profit
                </Typography>
                <Typography
                  variant="body1"
                  fontWeight={800}
                  sx={{ color: marginColor }}
                >
                  {formatCurrency(calculations.grossProfit)}
                </Typography>
              </Stack>

              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body1" fontWeight={800}>
                  Margin
                </Typography>
                <Chip
                  label={`${calculations.grossMarginPercent.toFixed(1)}%`}
                  size="small"
                  sx={{
                    bgcolor: alpha(marginColor, 0.15),
                    color: marginColor,
                    fontWeight: 800,
                  }}
                />
              </Stack>
            </Stack>
          </CardContent>
        </Card>

        {/* ─── J. Quote Comparison ───────────────────────── */}
        {linkedQuote && (
          <Card sx={{ borderRadius: 3, border: `1px solid ${alpha(theme.palette.info.main, 0.3)}` }}>
            <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                <CompareArrowsIcon color="info" />
                <Typography variant="subtitle1" fontWeight={700}>
                  Quote Comparison
                </Typography>
              </Stack>

              <Stack spacing={1.5}>
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">
                    Quoted Revenue
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {formatCurrency(linkedQuote.total)}
                  </Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">
                    Actual Revenue
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {formatCurrency(revenue)}
                  </Typography>
                </Stack>
                {linkedQuote.margin && (
                  <>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">
                        Quoted Margin
                      </Typography>
                      <Typography variant="body2" fontWeight={600}>
                        {linkedQuote.margin.grossMarginPercent.toFixed(1)}%
                      </Typography>
                    </Stack>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">
                        Actual Margin
                      </Typography>
                      <Typography
                        variant="body2"
                        fontWeight={600}
                        sx={{ color: marginColor }}
                      >
                        {calculations.grossMarginPercent.toFixed(1)}%
                      </Typography>
                    </Stack>
                    {calculations.grossMarginPercent <
                      linkedQuote.margin.grossMarginPercent - 10 && (
                      <Alert severity="warning" sx={{ mt: 1 }}>
                        Actual margin is significantly lower than quoted margin (
                        {(
                          linkedQuote.margin.grossMarginPercent -
                          calculations.grossMarginPercent
                        ).toFixed(1)}
                        % below quote).
                      </Alert>
                    )}
                  </>
                )}
              </Stack>
            </CardContent>
          </Card>
        )}
        </Stack>
        </WorkflowMaturityBoundary>

        <WorkflowMaturityBoundary moduleCode="financials" workflowCode="invoice-export">
          <Card variant="outlined" sx={{ borderRadius: 3 }}>
            <CardContent>
              <Typography variant="h6" fontWeight={800}>Invoice Export</Typography>
              <Typography color="text.secondary">Invoice export availability will appear here when authoritative financial records support it.</Typography>
            </CardContent>
          </Card>
        </WorkflowMaturityBoundary>

        {/* ─── K. Save ───────────────────────────────────── */}
        <Stack direction="row" spacing={2} justifyContent="flex-end">
          <Button
            variant="outlined"
            onClick={() => navigate('/financials')}
            sx={{ borderRadius: 2 }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            size="large"
            startIcon={<SaveIcon />}
            disabled={!title}
            onClick={handleSave}
            sx={{ borderRadius: 2, px: 4, fontWeight: 700 }}
          >
            Save Actual
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
