import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Typography,
  Box,
  Card,
  CardContent,
  Button,
  TextField,
  Stack,
  Alert,
  MenuItem,
  Autocomplete,
  Divider,
  IconButton,
  Chip,
  Checkbox,
  CircularProgress,
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
import SaveIcon from '@mui/icons-material/Save';
import ScienceIcon from '@mui/icons-material/Science';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import AirIcon from '@mui/icons-material/Air';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import DescriptionIcon from '@mui/icons-material/Description';
import PlaceIcon from '@mui/icons-material/Place';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import { parseSprayRec, SprayRecExtraction } from '../services/sprayRecParser';
import {
  getFieldById,
  getPropertyById,
  getClientById,
  saveJob,
  updateJob,
} from '../services/fieldManagementStore';
import { getQuoteById, updateQuote } from '../services/quoteStore';
import { WeatherConditions, WeatherLogEntry, ChemicalEntry, SprayRecFileRef, BatchInfo, BatchChemicalBreakdown } from '../types/fieldManagement';
import { getAllWeeds, getAllBrands, findTreatmentByBrand, getTreatmentById, getSeasonsForTreatment, getStatesForTreatment } from '../data/chemicals';
import { getAllSurfactants, getSurfactantById, Surfactant } from '../data/surfactants';
import { WeedTreatment } from '../types/chemical';
import DroneStatusChip from '../components/DroneStatusChip';
import {
  fetchWeatherForDate,
  filterTo2Hourly,
  geocodeLocality,
  HourlyWeatherPoint,
} from '../services/weatherService';
import { useOperationalData } from '../contexts/OperationalDataContext';
import { describeOperationalError } from '../services/operationalDataStore';
import JobFieldScopeSelector from '../components/jobs/JobFieldScopeSelector';

const WIND_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

const defaultWeather: WeatherConditions = {
  tempC: null,
  windSpeedKmh: null,
  windDirection: '',
  humidity: null,
  deltaT: null,
};

const emptyChemical = (): ChemicalEntry => ({
  product: '',
  activeIngredient: '',
  ratePerHa: '',
  treatmentId: null,
});

export default function JobCreate() {
  const { clientId, propertyId, fieldId } = useParams<{ clientId: string; propertyId: string; fieldId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('returnTo') === '/getting-started' ? '/getting-started' : null;
  const theme = useTheme();
  const operational = useOperationalData();

  const field = operational.mode === 'remote'
    ? operational.fields.find((record) => record.id === fieldId && record.propertyId === propertyId)
    : getFieldById(fieldId || '');
  const property = operational.mode === 'remote'
    ? operational.properties.find((record) => record.id === propertyId && record.clientId === clientId)
    : getPropertyById(propertyId || '');
  const client = operational.mode === 'remote'
    ? operational.clients.find((record) => record.id === clientId)
    : getClientById(clientId || '');
  const initialScopeFieldIds = useMemo(() => {
    const queryFieldIds = searchParams.get('fieldIds')?.split(',').filter(Boolean) || [];
    return Array.from(new Set(queryFieldIds.length ? queryFieldIds : (fieldId ? [fieldId] : [])));
  }, [fieldId, searchParams]);
  const [scope, setScope] = useState({ clientId: clientId || '', fieldIds: initialScopeFieldIds });
  const scopedFields = operational.mode === 'remote'
    ? scope.fieldIds.map((id) => operational.fields.find((record) => record.id === id)).filter((record): record is typeof operational.fields[number] => Boolean(record))
    : field ? [field] : [];
  const scopedClient = operational.mode === 'remote'
    ? operational.clients.find((record) => record.id === scope.clientId)
    : client;
  const scopedPrimaryField = scopedFields[0];
  const scopedPrimaryProperty = scopedPrimaryField
    ? operational.properties.find((record) => record.id === scopedPrimaryField.propertyId && record.clientId === scope.clientId)
    : undefined;

  const allWeeds = useMemo(() => getAllWeeds(), []);
  const allBrandNames = useMemo(() => getAllBrands(), []);
  const allSurfactants = useMemo(() => getAllSurfactants(), []);

  // Check for exported brew from calculator
  const [brewImported, setBrewImported] = useState(false);
  const importedBrew = useMemo(() => {
    try {
      const raw = localStorage.getItem('ftf_calc_export');
      if (!raw) return null;
      return JSON.parse(raw) as {
        chemicals: { name: string; unit: string; ratePerHa: number; perBatch: number; totalJob: number }[];
        waterRateLHa: number;
        batchInfo?: {
          hectares: number;
          applicationRateLHa: number;
          tankSizeL: number;
          totalSprayVolumeL: number;
          totalBatches: number;
          hectaresPerBatch: number;
          waterPerBatchL: number;
        };
        exportedAt: string;
      };
    } catch { return null; }
  }, []);

  const buildInitialChemicals = (): { chems: ChemicalEntry[]; matched: (WeedTreatment | null)[] } => {
    if (!importedBrew || importedBrew.chemicals.length === 0) {
      return { chems: [emptyChemical()], matched: [null] };
    }
    const chems: ChemicalEntry[] = [];
    const matched: (WeedTreatment | null)[] = [];
    for (const ic of importedBrew.chemicals) {
      const treatment = findTreatmentByBrand(ic.name);
      const rateStr = ic.unit === 'g'
        ? `${ic.ratePerHa} g/ha`
        : `${ic.ratePerHa} L/ha`;
      chems.push({
        product: ic.name,
        activeIngredient: treatment?.activeIngredient || '',
        ratePerHa: treatment?.aerialRate || rateStr,
        treatmentId: treatment?.id || null,
      });
      matched.push(treatment || null);
    }
    return { chems, matched };
  };

  const initial = useMemo(() => buildInitialChemicals(), []);

  const buildInitialBatchInfo = (): BatchInfo | null => {
    if (!importedBrew?.batchInfo) return null;
    const bi = importedBrew.batchInfo;
    return {
      ...bi,
      chemicalBreakdown: importedBrew.chemicals.map((c) => ({
        name: c.name,
        unit: c.unit as 'L' | 'g',
        ratePerHa: c.ratePerHa,
        perBatch: c.perBatch,
        totalJob: c.totalJob,
      })),
    };
  };

  const [fromQuoteId, setFromQuoteId] = useState<string | null>(null);
  const [weedTarget, setWeedTarget] = useState('');
  const [chemicals, setChemicals] = useState<ChemicalEntry[]>(initial.chems);
  const [matchedTreatments, setMatchedTreatments] = useState<(WeedTreatment | null)[]>(initial.matched);
  const [waterRateLHa, setWaterRateLHa] = useState(importedBrew ? String(importedBrew.waterRateLHa) : '');
  const [batchInfo, setBatchInfo] = useState<BatchInfo | null>(() => buildInitialBatchInfo());
  const [adjuvants, setAdjuvants] = useState('');
  const [selectedSurfactants, setSelectedSurfactants] = useState<Surfactant[]>([]);
  const [dateSprayed, setDateSprayed] = useState(new Date().toISOString().split('T')[0]);
  const [weather, setWeather] = useState<WeatherConditions>(defaultWeather);
  const [weatherLog, setWeatherLog] = useState<WeatherLogEntry[]>([]);
  const [sprayConditions, setSprayConditions] = useState<WeatherLogEntry[]>([]);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState('');
  const [manualTime, setManualTime] = useState('');
  const [sprayRec, setSprayRec] = useState<SprayRecFileRef | null>(null);
  const [sprayRecParsing, setSprayRecParsing] = useState(false);
  const [sprayRecParsingMsg, setSprayRecParsingMsg] = useState('');
  const [sprayRecExtraction, setSprayRecExtraction] = useState<SprayRecExtraction | null>(null);
  const [sprayRecError, setSprayRecError] = useState('');
  const [droneModel, setDroneModel] = useState('');
  const [applicatorName, setApplicatorName] = useState('');
  const [notes, setNotes] = useState('');
  const [jobReference, setJobReference] = useState(`JOB-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`);
  const [jobStatus, setJobStatus] = useState('draft');
  const [requestedDate, setRequestedDate] = useState('');
  const [saveError, setSaveError] = useState('');
  const [onboardingSaved, setOnboardingSaved] = useState(false);

  // Clear the export after importing
  useEffect(() => {
    if (importedBrew) {
      localStorage.removeItem('ftf_calc_export');
      setBrewImported(true);
    }
  }, [importedBrew]);

  // Check for job prefill data from QuoteDetail
  useEffect(() => {
    const raw = sessionStorage.getItem('ftf_job_prefill');
    if (raw) {
      sessionStorage.removeItem('ftf_job_prefill');
      try {
        const prefill = JSON.parse(raw);
        if (prefill.jobDescription) setWeedTarget(prefill.jobDescription);
        setFromQuoteId(prefill.fromQuoteId || null);
      } catch { /* ignore */ }
    }
  }, []);

  if (operational.mode === 'remote' && (operational.status === 'idle' || operational.status === 'loading')) {
    return <Alert severity="info">Loading job form…</Alert>;
  }
  if (operational.mode === 'remote' && operational.status === 'error') {
    return <Alert severity="error">The authoritative job workflow is unavailable. Refresh and try again.</Alert>;
  }
  if (operational.mode === 'remote' && operational.status === 'unauthorised') {
    return <Alert severity="error">You are not authorised to create a job for this organisation.</Alert>;
  }

  if (!field || !property || !client) {
    return (
      <Box>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)} sx={{ mb: 2 }}>Back</Button>
        <Alert severity="error">Field not found.</Alert>
      </Box>
    );
  }

  const updateChemical = (index: number, updates: Partial<ChemicalEntry>) => {
    setChemicals(chemicals.map((c, i) => i === index ? { ...c, ...updates } : c));
  };

  const handleProductChange = (index: number, value: string) => {
    const match = findTreatmentByBrand(value);
    const newMatched = [...matchedTreatments];
    newMatched[index] = match || null;
    setMatchedTreatments(newMatched);
    if (match) {
      updateChemical(index, {
        product: value,
        activeIngredient: match.activeIngredient,
        ratePerHa: match.aerialRate,
        treatmentId: match.id,
      });
    } else {
      updateChemical(index, { product: value, treatmentId: null });
    }
  };

  const addChemical = () => {
    setChemicals([...chemicals, emptyChemical()]);
    setMatchedTreatments([...matchedTreatments, null]);
  };

  const removeChemical = (index: number) => {
    if (chemicals.length <= 1) return;
    setChemicals(chemicals.filter((_, i) => i !== index));
    setMatchedTreatments(matchedTreatments.filter((_, i) => i !== index));
  };

  const getCurrentSeason = (): string => {
    const month = new Date(dateSprayed || Date.now()).getMonth(); // 0-indexed
    if (month >= 2 && month <= 4) return 'Autumn';
    if (month >= 5 && month <= 7) return 'Winter';
    if (month >= 8 && month <= 10) return 'Spring';
    return 'Summer';
  };

  const getGoogleLabelUrl = (productName: string) => {
    return `https://www.google.com/search?q=${encodeURIComponent(productName + ' product label Australia PDF')}`;
  };

  const getApvmaSearchUrl = (productName: string) => {
    return `https://portal.apvma.gov.au/pubcris?searchstring=${encodeURIComponent(productName)}`;
  };

  const handleFetchWeather = async () => {
    if (!dateSprayed) return;
    setWeatherLoading(true);
    setWeatherError('');
    setWeatherLog([]);

    try {
      const locality = property.locality || property.state;
      const geo = await geocodeLocality(locality);
      if (!geo) {
        setWeatherError(`Could not find location "${locality}". Try adding a nearest town to the property.`);
        setWeatherLoading(false);
        return;
      }

      const result = await fetchWeatherForDate(geo.latitude, geo.longitude, dateSprayed);
      const twoHourly = filterTo2Hourly(result.hourly);

      if (twoHourly.length === 0) {
        setWeatherError('No weather data available for this date.');
        setWeatherLoading(false);
        return;
      }

      const log: WeatherLogEntry[] = twoHourly.map((p) => ({
        time: p.time,
        tempC: p.tempC,
        humidity: p.humidity,
        dewpointC: p.dewpointC,
        deltaT: p.deltaT,
        windSpeedKmh: p.windSpeedKmh,
        windGustsKmh: p.windGustsKmh,
        windDirection: p.windDirectionCompass,
      }));

      setWeatherLog(log);
    } catch (err: any) {
      setWeatherError(err.message || 'Failed to fetch weather data.');
    } finally {
      setWeatherLoading(false);
    }
  };

  const toggleSprayCondition = (entry: WeatherLogEntry) => {
    const exists = sprayConditions.find((sc) => sc.time === entry.time);
    if (exists) {
      setSprayConditions(sprayConditions.filter((sc) => sc.time !== entry.time));
    } else {
      const updated = [...sprayConditions, entry].sort((a, b) => a.time.localeCompare(b.time));
      setSprayConditions(updated);
    }
  };

  const removeSprayCondition = (time: string) => {
    setSprayConditions(sprayConditions.filter((sc) => sc.time !== time));
  };

  const addManualCondition = () => {
    if (!manualTime) return;
    const timeStr = `${dateSprayed}T${manualTime}`;
    if (sprayConditions.find((sc) => sc.time === timeStr)) return;
    const tempC = weather.tempC ?? 0;
    const humidity = weather.humidity ?? 0;
    const dewpointC = humidity > 0 ? calcDewpoint(tempC, humidity) : 0;
    const deltaT = calcDeltaT(tempC, humidity) ?? (weather.deltaT ?? 0);
    const entry: WeatherLogEntry = {
      time: timeStr,
      tempC,
      humidity,
      dewpointC,
      deltaT,
      windSpeedKmh: weather.windSpeedKmh ?? 0,
      windGustsKmh: 0,
      windDirection: weather.windDirection || '',
    };
    const updated = [...sprayConditions, entry].sort((a, b) => a.time.localeCompare(b.time));
    setSprayConditions(updated);
    setWeather(defaultWeather);
    setManualTime('');
  };

  const handleSprayRecUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const rec: SprayRecFileRef = {
        fileName: file.name,
        sizeBytes: file.size,
        dataUrl,
        uploadedAt: new Date().toISOString(),
      };
      setSprayRec(rec);
      setSprayRecError('');
      setSprayRecExtraction(null);

      // Auto-parse PDFs
      if (file.name.toLowerCase().endsWith('.pdf')) {
        setSprayRecParsing(true);
        setSprayRecParsingMsg('Extracting text from PDF...');
        try {
          const extraction = await parseSprayRec(dataUrl, (msg) => setSprayRecParsingMsg(msg));
          setSprayRecExtraction(extraction);
          applyExtraction(extraction);
        } catch (err) {
          console.error('Spray rec parsing error:', err);
          setSprayRecError('Could not extract data from this PDF. You can still fill in the details manually.');
        } finally {
          setSprayRecParsing(false);
          setSprayRecParsingMsg('');
        }
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const applyExtraction = (extraction: SprayRecExtraction) => {
    // Apply chemicals if found and current chemicals are empty
    if (extraction.chemicals.length > 0) {
      const currentEmpty = chemicals.length === 1 && !chemicals[0].product.trim();
      if (currentEmpty) {
        setChemicals(extraction.chemicals);
        setMatchedTreatments(extraction.chemicals.map(c => {
          if (!c.treatmentId) return null;
          // Try by ID first (works for APVMA-saved products), fall back to brand search
          return getTreatmentById(c.treatmentId) || findTreatmentByBrand(c.product) || null;
        }));
      }
    }

    // Apply water rate if found and currently empty
    if (extraction.waterRateLHa && !waterRateLHa.trim()) {
      setWaterRateLHa(extraction.waterRateLHa);
    }

    // Apply weed target if found and currently empty
    if (extraction.weedTarget && !weedTarget.trim()) {
      setWeedTarget(extraction.weedTarget);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  const handleSave = async () => {
    if (!weedTarget.trim() || !dateSprayed || (operational.mode === 'remote' && !jobReference.trim())) return;
    const validChemicals = chemicals.filter((c) => c.product.trim());
    if (operational.mode === 'remote') {
      const hasUnsupportedChemicalValue = chemicals.some((chemical) => Object.values(chemical).some((entry) => (
        typeof entry === 'string' ? entry.trim() !== '' : entry !== null && entry !== undefined
      )));
      const hasUnsupportedValue = hasUnsupportedChemicalValue || waterRateLHa.trim() !== '' || adjuvants.trim() !== ''
        || selectedSurfactants.length > 0 || weatherLog.length > 0 || sprayConditions.length > 0
        || Object.values(weather).some((value) => value !== null && value !== '') || !!manualTime
        || !!sprayRec || !!batchInfo || droneModel.trim() !== '' || applicatorName.trim() !== '' || !!fromQuoteId;
      if (hasUnsupportedValue) {
        setSaveError('Chemical, weather, spray recommendation, operator, quote and compliance values are not yet supported by the Production Beta job API. Remove those values before saving; they have not been saved.');
        return;
      }
      if (!scopedClient || !scopedPrimaryField || !scopedPrimaryProperty || scopedFields.length === 0) {
        setSaveError('Select at least one Field for this Job.');
        return;
      }
      try {
        const created = await operational.createJob({
          clientId: scopedClient.id, propertyId: scopedPrimaryProperty.id, fieldIds: scopedFields.map((record) => record.id), reference: jobReference.trim(),
          scope: weedTarget.trim(), status: jobStatus, notes, requestedDate: requestedDate || undefined,
          scheduledDate: dateSprayed || undefined,
        });
        setSaveError('');
        if (returnTo) setOnboardingSaved(true);
        else navigate(`/jobs/client/${scopedClient.id}/property/${scopedPrimaryProperty.id}/field/${scopedPrimaryField.id}/job/${created.id}`);
      } catch (error) {
        setSaveError(describeOperationalError(error));
      }
      return;
    }
    // Use first spray condition as primary weather, or manual fields
    const primaryWeather: WeatherConditions = sprayConditions.length > 0
      ? {
          tempC: sprayConditions[0].tempC,
          humidity: sprayConditions[0].humidity,
          deltaT: sprayConditions[0].deltaT,
          windSpeedKmh: sprayConditions[0].windSpeedKmh,
          windDirection: sprayConditions[0].windDirection,
        }
      : weather;
    const job = saveJob({
      fieldId: field.id,
      propertyId: property.id,
      clientId: client.id,
      weedTarget,
      chemicals: validChemicals.length > 0 ? validChemicals : chemicals,
      waterRateLHa,
      adjuvants,
      dateSprayed,
      weather: primaryWeather,
      weatherLog: weatherLog.length > 0 ? weatherLog : undefined,
      sprayConditions: sprayConditions.length > 0 ? sprayConditions : undefined,
      sprayRec,
      batchInfo: batchInfo || undefined,
      droneModel,
      applicatorName,
      notes,
    });
    if (fromQuoteId) {
      updateJob(job.id, { quoteId: fromQuoteId });
      const existingQuote = getQuoteById(fromQuoteId);
      if (existingQuote) {
        const existingJobIds = existingQuote.jobIds || [];
        updateQuote(fromQuoteId, { jobIds: [...existingJobIds, job.id] });
      }
    }
    navigate(`/jobs/client/${clientId}/property/${propertyId}/field/${fieldId}/job/${job.id}`);
  };

  const calcDewpoint = (tempC: number, humidity: number): number => {
    // Magnus formula
    const a = 17.27;
    const b = 237.7;
    const alpha = (a * tempC) / (b + tempC) + Math.log(humidity / 100);
    return Math.round((b * alpha) / (a - alpha) * 10) / 10;
  };

  const calcDeltaT = (tempC: number | null, humidity: number | null): number | null => {
    if (tempC == null || humidity == null || humidity <= 0 || humidity > 100) return null;
    const dewpoint = calcDewpoint(tempC, humidity);
    return Math.round((tempC - dewpoint) * 10) / 10;
  };

  const updateWeather = (key: keyof WeatherConditions, value: string) => {
    setWeather((prev) => {
      if (key === 'windDirection') {
        return { ...prev, windDirection: value };
      }
      const num = value === '' ? null : parseFloat(value);
      const updated = { ...prev, [key]: num };
      // Auto-calculate Delta T when temp or humidity changes
      if (key === 'tempC' || key === 'humidity') {
        const t = key === 'tempC' ? num : prev.tempC;
        const h = key === 'humidity' ? num : prev.humidity;
        updated.deltaT = calcDeltaT(t, h);
      }
      return updated;
    });
  };

  // Derived dewpoint for display in manual entry
  const manualDewpoint = (weather.tempC != null && weather.humidity != null && weather.humidity > 0 && weather.humidity <= 100)
    ? calcDewpoint(weather.tempC, weather.humidity)
    : null;

  const getDeltaTColor = (dt: number) => {
    if (dt >= 2 && dt <= 8) return '#2e7d32'; // ideal
    if (dt > 8 && dt <= 10) return '#e65100'; // marginal
    return '#c62828'; // poor
  };

  const getDeltaTLabel = (dt: number) => {
    if (dt >= 2 && dt <= 8) return 'Ideal';
    if (dt > 8 && dt <= 10) return 'Marginal';
    if (dt > 10) return 'Too dry';
    return 'Too humid';
  };

  return (
    <Box>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate(`/jobs/client/${clientId}/property/${propertyId}/field/${fieldId}`)}
        sx={{ mb: 3, color: 'text.secondary', fontWeight: 600, '&:hover': { color: 'primary.main' } }}
      >
        {field.name}
      </Button>

      <Typography variant="h4" sx={{ fontWeight: 800, color: 'primary.dark', mb: 0.5, fontSize: { xs: '1.4rem', md: '1.75rem' } }} className="ftf-animate-in">
        Record Spray Job
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {client.name} &bull; {property.name} &bull; {field.name}
        {field.sizeHa > 0 && ` \u2022 ${field.sizeHa} ha`}
      </Typography>

      {brewImported && (
        <Alert
          severity="info"
          icon={<InfoOutlinedIcon />}
          onClose={() => setBrewImported(false)}
          sx={{ mb: 2, borderRadius: '12px', fontWeight: 600 }}
        >
          Brew imported from Calculator — chemicals and water rate have been pre-filled.
        </Alert>
      )}

      {saveError && <Alert severity="error" sx={{ mb: 2, borderRadius: '12px' }}>{saveError}</Alert>}
      {returnTo && onboardingSaved && <Alert severity="success" sx={{ mb: 2, borderRadius: '12px' }} action={<Button color="inherit" onClick={() => navigate(returnTo)}>Return to Getting Started</Button>}>Job saved. Continue setup when you are ready.</Alert>}

      <Stack spacing={3} className="ftf-animate-in-delay-1">
        {operational.mode === 'remote' && (
          <Card elevation={0} sx={{ border: `1.5px solid ${alpha(theme.palette.primary.main, 0.1)}`, borderRadius: '16px' }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="subtitle1" fontWeight={700} color="primary.dark" sx={{ mb: 2.5 }}>Job Details</Typography>
              <Stack spacing={2.5}>
                <JobFieldScopeSelector
                  clients={operational.clients}
                  properties={operational.properties}
                  fields={operational.fields}
                  selectedClientId={scope.clientId}
                  selectedFieldIds={scope.fieldIds}
                  onScopeChange={setScope}
                />
                <TextField label="Job Reference" value={jobReference} onChange={(event) => setJobReference(event.target.value)} required fullWidth />
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <TextField select label="Status" value={jobStatus} onChange={(event) => setJobStatus(event.target.value)} fullWidth>
                    <MenuItem value="draft">Draft</MenuItem>
                    <MenuItem value="requested">Requested</MenuItem>
                    <MenuItem value="scheduled">Scheduled</MenuItem>
                    <MenuItem value="complete">Complete</MenuItem>
                  </TextField>
                  <TextField label="Requested Date" type="date" value={requestedDate} onChange={(event) => setRequestedDate(event.target.value)}
                    slotProps={{ inputLabel: { shrink: true } }} fullWidth />
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        )}
        {/* Weed & Chemicals */}
        <Card elevation={0} sx={{ border: `1.5px solid ${alpha(theme.palette.primary.main, 0.1)}`, borderRadius: '16px' }}>
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2.5 }}>
              <ScienceIcon sx={{ color: 'primary.main', fontSize: 20 }} />
              <Typography variant="subtitle1" fontWeight={700} color="primary.dark">Weed & Chemicals</Typography>
            </Box>

            <Stack spacing={2.5}>
              <Autocomplete
                freeSolo
                options={allWeeds}
                value={weedTarget}
                onInputChange={(_e, value) => setWeedTarget(value)}
                renderInput={(params) => <TextField {...params} label="Weed Target" required />}
              />

              <Divider />

              <Typography variant="body2" fontWeight={600} color="text.secondary">
                Chemicals ({chemicals.length})
              </Typography>

              {chemicals.map((chem, index) => {
                const treatment = matchedTreatments[index];
                const currentSeason = getCurrentSeason();
                const propertyState = property.state;

                // Check for warnings when we have a matched treatment
                const stateWarning = treatment && treatment.states && !getStatesForTreatment(treatment).includes(propertyState);
                const seasonWarning = treatment && !getSeasonsForTreatment(treatment).includes(currentSeason as any);

                return (
                  <Box key={index} sx={{
                    p: 2, borderRadius: '12px',
                    bgcolor: alpha(theme.palette.primary.main, 0.02),
                    border: `1px solid ${alpha(theme.palette.primary.main, 0.06)}`,
                  }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                      <Typography variant="caption" fontWeight={700} color="text.secondary">
                        Chemical {index + 1}
                      </Typography>
                      {chemicals.length > 1 && (
                        <IconButton size="small" onClick={() => removeChemical(index)} sx={{ color: 'error.main' }}>
                          <DeleteIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      )}
                    </Box>
                    <Stack spacing={2}>
                      <Autocomplete
                        freeSolo
                        options={allBrandNames}
                        value={chem.product}
                        onInputChange={(_e, value) => handleProductChange(index, value)}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            label="Product / Brand"
                            size="small"
                            placeholder="Start typing to search database..."
                          />
                        )}
                      />
                      <TextField
                        label="Active Ingredient"
                        value={chem.activeIngredient}
                        onChange={(e) => updateChemical(index, { activeIngredient: e.target.value })}
                        size="small"
                        fullWidth
                        sx={{
                          '& .MuiInputBase-root': chem.treatmentId ? {
                            bgcolor: alpha('#4caf50', 0.04),
                          } : {},
                        }}
                        helperText={chem.treatmentId ? 'Auto-filled from database' : ''}
                      />
                      <TextField
                        label="Rate per hectare"
                        value={chem.ratePerHa}
                        onChange={(e) => updateChemical(index, { ratePerHa: e.target.value })}
                        size="small"
                        fullWidth
                        helperText={chem.treatmentId ? 'Auto-filled from database' : ''}
                      />

                      {/* Treatment info panel — shown when matched from database */}
                      {treatment && (
                        <Box sx={{
                          p: 2, borderRadius: '10px',
                          bgcolor: alpha(theme.palette.primary.main, 0.03),
                          border: `1px solid ${alpha(theme.palette.primary.main, 0.08)}`,
                        }}>
                          {/* Drone status */}
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5, flexWrap: 'wrap' }}>
                            <DroneStatusChip status={treatment.droneStatus} />
                            {treatment.bestTiming && treatment.bestTiming !== '—' && (
                              <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                                {treatment.bestTiming}
                              </Typography>
                            )}
                          </Box>

                          {/* State & Season */}
                          <Stack direction="row" spacing={2} sx={{ mb: 1.5, flexWrap: 'wrap' }} useFlexGap>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <PlaceIcon sx={{ fontSize: 13, color: 'text.secondary' }} />
                              <Typography variant="caption" fontWeight={600} color="text.secondary">
                                {getStatesForTreatment(treatment).join(', ')}
                              </Typography>
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <CalendarMonthIcon sx={{ fontSize: 13, color: 'text.secondary' }} />
                              <Typography variant="caption" fontWeight={600} color="text.secondary">
                                {getSeasonsForTreatment(treatment).join(', ')}
                              </Typography>
                            </Box>
                          </Stack>

                          {/* Warnings */}
                          {(stateWarning || seasonWarning || treatment.droneStatus.startsWith('not-')) && (
                            <Stack spacing={0.75} sx={{ mb: 1.5 }}>
                              {treatment.droneStatus.startsWith('not-') && (
                                <Alert severity="error" icon={<WarningAmberIcon sx={{ fontSize: 18 }} />} sx={{ py: 0, borderRadius: '8px', '& .MuiAlert-message': { py: 0.5 } }}>
                                  <Typography variant="caption" fontWeight={700}>
                                    Not approved for aerial/drone application
                                  </Typography>
                                </Alert>
                              )}
                              {stateWarning && (
                                <Alert severity="warning" icon={<WarningAmberIcon sx={{ fontSize: 18 }} />} sx={{ py: 0, borderRadius: '8px', '& .MuiAlert-message': { py: 0.5 } }}>
                                  <Typography variant="caption" fontWeight={700}>
                                    Not registered in {propertyState} — check label
                                  </Typography>
                                </Alert>
                              )}
                              {seasonWarning && (
                                <Alert severity="warning" icon={<WarningAmberIcon sx={{ fontSize: 18 }} />} sx={{ py: 0, borderRadius: '8px', '& .MuiAlert-message': { py: 0.5 } }}>
                                  <Typography variant="caption" fontWeight={700}>
                                    Not recommended for {currentSeason} — check label timing
                                  </Typography>
                                </Alert>
                              )}
                            </Stack>
                          )}

                          {/* Label lookup buttons */}
                          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                            <Button
                              size="small"
                              variant="outlined"
                              startIcon={<DescriptionIcon sx={{ fontSize: 14 }} />}
                              endIcon={<OpenInNewIcon sx={{ fontSize: 12 }} />}
                              href={getGoogleLabelUrl(treatment.brands)}
                              target="_blank"
                              rel="noopener noreferrer"
                              sx={{
                                fontSize: '0.7rem', fontWeight: 600, borderRadius: '8px', py: 0.25,
                                borderColor: alpha(theme.palette.primary.main, 0.2),
                                '&:hover': { borderColor: theme.palette.primary.main },
                              }}
                            >
                              Google Label
                            </Button>
                            <Button
                              size="small"
                              variant="outlined"
                              startIcon={<DescriptionIcon sx={{ fontSize: 14 }} />}
                              endIcon={<OpenInNewIcon sx={{ fontSize: 12 }} />}
                              href={getApvmaSearchUrl(treatment.brands)}
                              target="_blank"
                              rel="noopener noreferrer"
                              sx={{
                                fontSize: '0.7rem', fontWeight: 600, borderRadius: '8px', py: 0.25,
                                borderColor: alpha('#7b3fa0', 0.3), color: '#7b3fa0',
                                '&:hover': { borderColor: '#7b3fa0' },
                              }}
                            >
                              APVMA Lookup
                            </Button>
                          </Stack>
                        </Box>
                      )}

                      {/* Label lookup for non-matched chemicals — show if user has typed a product name */}
                      {!treatment && chem.product.trim().length > 2 && (
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<DescriptionIcon sx={{ fontSize: 14 }} />}
                            endIcon={<OpenInNewIcon sx={{ fontSize: 12 }} />}
                            href={getGoogleLabelUrl(chem.product)}
                            target="_blank"
                            rel="noopener noreferrer"
                            sx={{
                              fontSize: '0.7rem', fontWeight: 600, borderRadius: '8px', py: 0.25,
                              borderColor: alpha(theme.palette.primary.main, 0.2),
                              '&:hover': { borderColor: theme.palette.primary.main },
                            }}
                          >
                            Google Label
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<DescriptionIcon sx={{ fontSize: 14 }} />}
                            endIcon={<OpenInNewIcon sx={{ fontSize: 12 }} />}
                            href={getApvmaSearchUrl(chem.product)}
                            target="_blank"
                            rel="noopener noreferrer"
                            sx={{
                              fontSize: '0.7rem', fontWeight: 600, borderRadius: '8px', py: 0.25,
                              borderColor: alpha('#7b3fa0', 0.3), color: '#7b3fa0',
                              '&:hover': { borderColor: '#7b3fa0' },
                            }}
                          >
                            APVMA Lookup
                          </Button>
                        </Stack>
                      )}
                    </Stack>
                  </Box>
                );
              })}

              <Button
                startIcon={<AddIcon />}
                onClick={addChemical}
                sx={{ alignSelf: 'flex-start', borderRadius: '10px', fontWeight: 600 }}
              >
                Add Another Chemical
              </Button>

              <Divider />

              <TextField label="Water Rate (L/ha)" value={waterRateLHa} onChange={(e) => setWaterRateLHa(e.target.value)} fullWidth />

              <Divider />

              <Typography variant="body2" fontWeight={600} color="text.secondary">
                Adjuvants / Surfactants
              </Typography>

              <Autocomplete
                options={allSurfactants}
                getOptionLabel={(option) => `${option.name} — ${option.category}`}
                groupBy={(option) => option.category}
                onChange={(_e, value) => {
                  if (value && !selectedSurfactants.find((s) => s.id === value.id)) {
                    setSelectedSurfactants([...selectedSurfactants, value]);
                    setAdjuvants(
                      [...selectedSurfactants, value].map((s) => `${s.name} (${s.typicalRate})`).join(', ')
                    );
                  }
                }}
                value={null}
                renderInput={(params) => (
                  <TextField {...params} label="Select from database" size="small" placeholder="Search surfactants..." />
                )}
                isOptionEqualToValue={(option, value) => option.id === value.id}
              />

              {selectedSurfactants.length > 0 && (
                <Stack spacing={1.5}>
                  {selectedSurfactants.map((surf) => (
                    <Box key={surf.id} sx={{
                      p: 2, borderRadius: '10px',
                      bgcolor: alpha('#7b3fa0', 0.03),
                      border: `1px solid ${alpha('#7b3fa0', 0.1)}`,
                    }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.75 }}>
                        <Box>
                          <Typography variant="body2" fontWeight={700}>{surf.name}</Typography>
                          <Chip label={surf.category} size="small" sx={{
                            mt: 0.25, height: 20, fontSize: '0.65rem', fontWeight: 600,
                            bgcolor: alpha('#7b3fa0', 0.08), color: '#7b3fa0',
                          }} />
                        </Box>
                        <IconButton size="small" onClick={() => {
                          const updated = selectedSurfactants.filter((s) => s.id !== surf.id);
                          setSelectedSurfactants(updated);
                          setAdjuvants(updated.map((s) => `${s.name} (${s.typicalRate})`).join(', '));
                        }} sx={{ color: 'error.main' }}>
                          <DeleteIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Box>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                        <strong>Active:</strong> {surf.activeIngredient}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                        <strong>Rate:</strong> {surf.typicalRate}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, lineHeight: 1.5 }}>
                        {surf.description}
                      </Typography>
                      <Typography variant="caption" sx={{ display: 'block', lineHeight: 1.5, color: alpha(theme.palette.text.secondary, 0.7), fontStyle: 'italic' }}>
                        Best with: {surf.bestUsedWith}
                      </Typography>
                      {surf.notes && (
                        <Alert severity="info" sx={{ mt: 1, py: 0, borderRadius: '8px', '& .MuiAlert-message': { py: 0.5 } }}>
                          <Typography variant="caption">{surf.notes}</Typography>
                        </Alert>
                      )}
                    </Box>
                  ))}
                </Stack>
              )}

              <TextField
                label="Additional notes / custom adjuvants"
                value={adjuvants}
                onChange={(e) => setAdjuvants(e.target.value)}
                size="small"
                fullWidth
                multiline
                rows={2}
                helperText={selectedSurfactants.length > 0 ? 'Auto-populated from selections above — edit or add more' : ''}
              />
            </Stack>
          </CardContent>
        </Card>

        {/* Batch Info (from Calculator) */}
        {batchInfo && (
          <Card elevation={0} sx={{
            border: `1.5px solid ${alpha('#1976d2', 0.15)}`,
            borderRadius: '16px',
            bgcolor: alpha('#1976d2', 0.02),
          }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <ScienceIcon sx={{ color: '#1976d2', fontSize: 20 }} />
                  <Typography variant="subtitle1" fontWeight={700} sx={{ color: '#1976d2' }}>
                    Batch Mix — from Calculator
                  </Typography>
                </Box>
                <IconButton size="small" onClick={() => setBatchInfo(null)} title="Remove batch info" sx={{ color: 'text.secondary' }}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>

              <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
                {[
                  { label: 'Hectares', value: `${batchInfo.hectares} ha` },
                  { label: 'App Rate', value: `${batchInfo.applicationRateLHa} L/ha` },
                  { label: 'Tank Size', value: `${batchInfo.tankSizeL} L` },
                  { label: 'Total Volume', value: `${batchInfo.totalSprayVolumeL} L` },
                  { label: 'Batches', value: String(batchInfo.totalBatches) },
                  { label: 'Ha / Batch', value: `${Number(batchInfo.hectaresPerBatch.toFixed(2))} ha` },
                ].map((s) => (
                  <Box key={s.label}>
                    <Typography variant="h6" sx={{ fontWeight: 800, color: '#1976d2', fontFamily: '"Outfit", system-ui', lineHeight: 1 }}>
                      {s.value}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">{s.label}</Typography>
                  </Box>
                ))}
              </Stack>

              <TableContainer sx={{
                borderRadius: '10px',
                border: `1px solid ${alpha('#1976d2', 0.1)}`,
              }}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ '& th': { fontWeight: 700, fontSize: '0.7rem', color: 'text.secondary' } }}>
                      <TableCell>Product</TableCell>
                      <TableCell align="right">Rate / ha</TableCell>
                      <TableCell align="right">Per Batch</TableCell>
                      <TableCell align="right">Total Job</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {batchInfo.chemicalBreakdown.map((c, idx) => (
                      <TableRow key={idx}>
                        <TableCell><Typography variant="body2" fontWeight={600}>{c.name}</Typography></TableCell>
                        <TableCell align="right"><Typography variant="body2">{c.ratePerHa} {c.unit}/ha</Typography></TableCell>
                        <TableCell align="right"><Typography variant="body2" fontWeight={700} sx={{ color: '#1976d2' }}>{Number(c.perBatch.toFixed(2))} {c.unit}</Typography></TableCell>
                        <TableCell align="right"><Typography variant="body2" fontWeight={700} sx={{ color: '#1b8a5a' }}>{Number(c.totalJob.toFixed(2))} {c.unit}</Typography></TableCell>
                      </TableRow>
                    ))}
                    <TableRow sx={{ bgcolor: alpha('#1976d2', 0.04) }}>
                      <TableCell><Typography variant="body2" fontWeight={700} sx={{ color: '#1976d2' }}>Water</Typography></TableCell>
                      <TableCell />
                      <TableCell align="right"><Typography variant="body2" fontWeight={700} sx={{ color: '#1976d2' }}>{Number(batchInfo.waterPerBatchL.toFixed(1))} L</Typography></TableCell>
                      <TableCell align="right"><Typography variant="body2" fontWeight={700} sx={{ color: '#1976d2' }}>{Number((batchInfo.waterPerBatchL * batchInfo.totalBatches).toFixed(0))} L</Typography></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        )}

        {/* Date & Weather */}
        <Card elevation={0} sx={{ border: `1.5px solid ${alpha(theme.palette.primary.main, 0.1)}`, borderRadius: '16px' }}>
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2.5 }}>
              <AirIcon sx={{ color: 'primary.main', fontSize: 20 }} />
              <Typography variant="subtitle1" fontWeight={700} color="primary.dark">Date & Weather</Typography>
            </Box>

            <Stack spacing={2.5}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="flex-start">
                <TextField
                  label="Date Sprayed"
                  type="date"
                  value={dateSprayed}
                  onChange={(e) => {
                    setDateSprayed(e.target.value);
                    setWeatherLog([]);
                    setSprayConditions([]);
                  }}
                  required
                  fullWidth
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <Button
                  variant="outlined"
                  startIcon={weatherLoading ? <CircularProgress size={16} /> : <CloudDownloadIcon />}
                  onClick={handleFetchWeather}
                  disabled={!dateSprayed || weatherLoading}
                  sx={{ borderRadius: '10px', fontWeight: 700, whiteSpace: 'nowrap', minWidth: 180, height: 56 }}
                >
                  {weatherLoading ? 'Fetching...' : 'Fetch Weather'}
                </Button>
              </Stack>

              {weatherError && <Alert severity="warning" sx={{ borderRadius: '10px' }}>{weatherError}</Alert>}

              {/* 2-Hourly Weather — select conditions to record */}
              {weatherLog.length > 0 && (
                <Box>
                  <Typography variant="body2" fontWeight={600} color="text.secondary" sx={{ mb: 1 }}>
                    2-Hourly Weather — {property.locality || property.state}
                    <Typography component="span" variant="caption" color="text.disabled" sx={{ ml: 1 }}>
                      Select the times you were spraying to record conditions
                    </Typography>
                  </Typography>
                  <TableContainer sx={{
                    borderRadius: '12px',
                    border: `1px solid ${alpha(theme.palette.primary.main, 0.08)}`,
                    maxHeight: 380,
                  }}>
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem', width: 40 }} padding="checkbox" />
                          <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem' }}>Time</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem' }} align="right">Temp</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem' }} align="right">Humidity</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem' }} align="right">Delta T</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem' }} align="right">Wind</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem' }} align="right">Gusts</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem' }}>Dir</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {weatherLog.map((entry) => {
                          const hour = new Date(entry.time).getHours();
                          const isSelected = !!sprayConditions.find((sc) => sc.time === entry.time);
                          const isSprayWindow = hour >= 6 && hour <= 18;
                          return (
                            <TableRow
                              key={entry.time}
                              hover
                              selected={isSelected}
                              onClick={() => toggleSprayCondition(entry)}
                              sx={{
                                cursor: 'pointer',
                                bgcolor: isSelected
                                  ? alpha(theme.palette.primary.main, 0.08)
                                  : !isSprayWindow
                                    ? alpha(theme.palette.text.secondary, 0.03)
                                    : 'transparent',
                                '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.06) },
                              }}
                            >
                              <TableCell padding="checkbox">
                                <Checkbox size="small" checked={isSelected} sx={{ p: 0.5 }} />
                              </TableCell>
                              <TableCell sx={{ fontWeight: isSelected ? 700 : 400, fontSize: '0.8rem' }}>
                                {String(hour).padStart(2, '0')}:00
                              </TableCell>
                              <TableCell align="right" sx={{ fontSize: '0.8rem' }}>{entry.tempC}°C</TableCell>
                              <TableCell align="right" sx={{ fontSize: '0.8rem' }}>{entry.humidity}%</TableCell>
                              <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                                <Chip
                                  label={`${entry.deltaT} ${getDeltaTLabel(entry.deltaT)}`}
                                  size="small"
                                  sx={{
                                    height: 20, fontSize: '0.65rem', fontWeight: 700,
                                    bgcolor: alpha(getDeltaTColor(entry.deltaT), 0.1),
                                    color: getDeltaTColor(entry.deltaT),
                                  }}
                                />
                              </TableCell>
                              <TableCell align="right" sx={{ fontSize: '0.8rem' }}>{entry.windSpeedKmh}</TableCell>
                              <TableCell align="right" sx={{ fontSize: '0.8rem' }}>{entry.windGustsKmh}</TableCell>
                              <TableCell sx={{ fontSize: '0.8rem', fontWeight: 600 }}>{entry.windDirection}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                  <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.5 }}>
                    Weather data by Open-Meteo.com (CC-BY 4.0)
                  </Typography>
                </Box>
              )}

              <Divider />

              {/* Recorded Spray Conditions */}
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="body2" fontWeight={600} color="text.secondary">
                  Recorded Spray Conditions ({sprayConditions.length})
                </Typography>
              </Box>

              {sprayConditions.length > 0 && (
                <TableContainer sx={{
                  borderRadius: '12px',
                  border: `1.5px solid ${alpha(theme.palette.primary.main, 0.12)}`,
                }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem' }}>Time</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem' }} align="right">Temp</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem' }} align="right">Humidity</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem' }} align="right">Delta T</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem' }} align="right">Wind</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem' }}>Dir</TableCell>
                        <TableCell sx={{ width: 36 }} />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {sprayConditions.map((entry) => {
                        const hour = new Date(entry.time).getHours();
                        const min = new Date(entry.time).getMinutes();
                        return (
                          <TableRow key={entry.time} sx={{ bgcolor: alpha(theme.palette.primary.main, 0.04) }}>
                            <TableCell sx={{ fontWeight: 700, fontSize: '0.8rem' }}>
                              {String(hour).padStart(2, '0')}:{String(min).padStart(2, '0')}
                            </TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.8rem' }}>{entry.tempC}°C</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.8rem' }}>{entry.humidity}%</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                              <Chip
                                label={`${entry.deltaT} ${getDeltaTLabel(entry.deltaT)}`}
                                size="small"
                                sx={{
                                  height: 20, fontSize: '0.65rem', fontWeight: 700,
                                  bgcolor: alpha(getDeltaTColor(entry.deltaT), 0.1),
                                  color: getDeltaTColor(entry.deltaT),
                                }}
                              />
                            </TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.8rem' }}>{entry.windSpeedKmh} km/h</TableCell>
                            <TableCell sx={{ fontSize: '0.8rem', fontWeight: 600 }}>{entry.windDirection}</TableCell>
                            <TableCell>
                              <IconButton size="small" onClick={() => removeSprayCondition(entry.time)} sx={{ color: 'error.main' }}>
                                <DeleteIcon sx={{ fontSize: 14 }} />
                              </IconButton>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}

              {sprayConditions.length === 0 && !weatherLog.length && (
                <Typography variant="caption" color="text.secondary">
                  Fetch weather above or manually add conditions below.
                </Typography>
              )}

              {/* Manual entry */}
              <Box sx={{
                p: 2, borderRadius: '12px',
                bgcolor: alpha(theme.palette.primary.main, 0.02),
                border: `1px solid ${alpha(theme.palette.primary.main, 0.06)}`,
              }}>
                <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                  Manual Entry
                </Typography>
                <Stack spacing={2}>
                  <TextField
                    label="Time"
                    type="time"
                    value={manualTime}
                    onChange={(e) => setManualTime(e.target.value)}
                    size="small"
                    slotProps={{ inputLabel: { shrink: true } }}
                    sx={{ maxWidth: 150 }}
                  />
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <TextField label="Temp (°C)" type="number" value={weather.tempC ?? ''} onChange={(e) => updateWeather('tempC', e.target.value)} size="small" fullWidth />
                    <TextField label="Humidity (%)" type="number" value={weather.humidity ?? ''} onChange={(e) => updateWeather('humidity', e.target.value)} size="small" fullWidth />
                  </Stack>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <TextField
                      label="Dewpoint (°C)" type="number" value={manualDewpoint ?? ''} size="small" fullWidth
                      slotProps={{ input: { readOnly: true } }}
                      helperText="Auto-calculated"
                    />
                    <TextField
                      label="Delta T" type="number" value={weather.deltaT ?? ''} size="small" fullWidth
                      slotProps={{ input: { readOnly: true } }}
                      helperText={weather.deltaT != null ? getDeltaTLabel(weather.deltaT) : 'Auto-calculated'}
                      sx={{ '& .MuiFormHelperText-root': weather.deltaT != null ? { color: getDeltaTColor(weather.deltaT), fontWeight: 700 } : {} }}
                    />
                  </Stack>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <TextField label="Wind (km/h)" type="number" value={weather.windSpeedKmh ?? ''} onChange={(e) => updateWeather('windSpeedKmh', e.target.value)} size="small" fullWidth />
                    <TextField select label="Wind Dir" value={weather.windDirection} onChange={(e) => updateWeather('windDirection', e.target.value)} size="small" fullWidth>
                      <MenuItem value="">—</MenuItem>
                      {WIND_DIRECTIONS.map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>)}
                    </TextField>
                  </Stack>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<AddIcon />}
                    onClick={addManualCondition}
                    disabled={!manualTime}
                    sx={{ alignSelf: 'flex-start', borderRadius: '8px', fontWeight: 600 }}
                  >
                    Add Recording
                  </Button>
                </Stack>
              </Box>
            </Stack>
          </CardContent>
        </Card>

        {/* Spray Recommendation */}
        <Card elevation={0} sx={{ border: `1.5px solid ${alpha(theme.palette.primary.main, 0.1)}`, borderRadius: '16px' }}>
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <DescriptionIcon sx={{ color: 'primary.main', fontSize: 20 }} />
              <Typography variant="subtitle1" fontWeight={700} color="primary.dark">Spray Recommendation</Typography>
            </Box>

            {sprayRec ? (
              <Stack spacing={2}>
                <Box sx={{
                  p: 2, borderRadius: '12px',
                  bgcolor: alpha(theme.palette.primary.main, 0.03),
                  border: `1px solid ${alpha(theme.palette.primary.main, 0.08)}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  flexWrap: 'wrap', gap: 1.5,
                }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <DescriptionIcon sx={{ color: 'primary.main' }} />
                    <Box>
                      <Typography variant="body2" fontWeight={700}>{sprayRec.fileName}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatFileSize(sprayRec.sizeBytes)}
                      </Typography>
                    </Box>
                  </Box>
                  <IconButton size="small" onClick={() => { setSprayRec(null); setSprayRecExtraction(null); setSprayRecError(''); }} sx={{ color: 'error.main' }}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>

                {/* Parsing indicator */}
                {sprayRecParsing && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2, borderRadius: '12px', bgcolor: alpha(theme.palette.info.main, 0.05), border: `1px solid ${alpha(theme.palette.info.main, 0.15)}` }}>
                    <CircularProgress size={20} />
                    <Typography variant="body2" color="info.main" fontWeight={600}>
                      {sprayRecParsingMsg || 'Scanning spray rec...'}
                    </Typography>
                  </Box>
                )}

                {/* Parse error */}
                {sprayRecError && (
                  <Alert severity="warning" sx={{ borderRadius: '12px' }}>{sprayRecError}</Alert>
                )}

                {/* Extraction results */}
                {sprayRecExtraction && sprayRecExtraction.extractedItems.length > 0 && (
                  <Box sx={{ p: 2, borderRadius: '12px', bgcolor: alpha(theme.palette.success.main, 0.04), border: `1px solid ${alpha(theme.palette.success.main, 0.15)}` }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                      <AutoFixHighIcon sx={{ color: 'success.main', fontSize: 20 }} />
                      <Typography variant="body2" fontWeight={700} color="success.dark">
                        Extracted from spray rec
                      </Typography>
                      {sprayRecExtraction.ocrUsed && (
                        <Chip label="OCR" size="small" variant="outlined" sx={{ fontWeight: 600, fontSize: '0.65rem', height: 20 }} />
                      )}
                      <Chip
                        label={sprayRecExtraction.confidence}
                        size="small"
                        color={sprayRecExtraction.confidence === 'high' ? 'success' : sprayRecExtraction.confidence === 'medium' ? 'warning' : 'default'}
                        sx={{ ml: 'auto', fontWeight: 600, fontSize: '0.7rem', height: 22 }}
                      />
                    </Box>
                    <Stack spacing={0.75}>
                      {sprayRecExtraction.extractedItems.map((item, idx) => (
                        <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Chip
                            label={item.label}
                            size="small"
                            variant="outlined"
                            sx={{ minWidth: 110, fontSize: '0.7rem', height: 22, fontWeight: 600 }}
                          />
                          <Typography variant="body2" sx={{ flex: 1 }}>{item.value}</Typography>
                          <CheckCircleIcon sx={{ fontSize: 16, color: item.confidence === 'high' ? 'success.main' : 'warning.main' }} />
                        </Box>
                      ))}
                    </Stack>
                    {sprayRecExtraction.clientName && sprayRecExtraction.clientName.toLowerCase() !== client.name.toLowerCase() && (
                      <Alert severity="info" sx={{ mt: 1.5, borderRadius: '10px', py: 0.5 }}>
                        Spray rec mentions "<strong>{sprayRecExtraction.clientName}</strong>" — current client is "<strong>{client.name}</strong>"
                      </Alert>
                    )}
                    {sprayRecExtraction.fieldName && sprayRecExtraction.fieldName.toLowerCase() !== field.name.toLowerCase() && (
                      <Alert severity="info" sx={{ mt: 1, borderRadius: '10px', py: 0.5 }}>
                        Spray rec mentions field "<strong>{sprayRecExtraction.fieldName}</strong>" — current field is "<strong>{field.name}</strong>"
                      </Alert>
                    )}
                  </Box>
                )}

                {sprayRecExtraction && sprayRecExtraction.extractedItems.length === 0 && !sprayRecParsing && (
                  <Alert severity="info" sx={{ borderRadius: '12px' }}>
                    No chemicals or rates could be automatically extracted. The PDF may use a format that isn't recognised — fill in the details manually.
                  </Alert>
                )}
              </Stack>
            ) : (
              <Box sx={{ textAlign: 'center', py: 2 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                  Upload a spray recommendation PDF and we'll automatically extract chemicals, rates and client details.
                </Typography>
                <Button
                  variant="outlined"
                  component="label"
                  startIcon={<UploadFileIcon />}
                  sx={{ borderRadius: '10px', fontWeight: 600 }}
                >
                  Upload Spray Rec
                  <input type="file" hidden accept=".pdf,.doc,.docx" onChange={handleSprayRecUpload} />
                </Button>
              </Box>
            )}
          </CardContent>
        </Card>

        {/* Operator Details */}
        <Card elevation={0} sx={{ border: `1.5px solid ${alpha(theme.palette.primary.main, 0.1)}`, borderRadius: '16px' }}>
          <CardContent sx={{ p: 3 }}>
            <Typography variant="subtitle1" fontWeight={700} color="primary.dark" sx={{ mb: 2.5 }}>Operator Details</Typography>
            <Stack spacing={2.5}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField label="Drone Model" value={droneModel} onChange={(e) => setDroneModel(e.target.value)} fullWidth placeholder="e.g. DJI T50" />
                <TextField label="Applicator Name" value={applicatorName} onChange={(e) => setApplicatorName(e.target.value)} fullWidth />
              </Stack>
              <TextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} multiline rows={3} fullWidth />
            </Stack>
          </CardContent>
        </Card>

        {/* Actions */}
        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', pb: 4 }}>
          <Button
            onClick={() => navigate(`/jobs/client/${clientId}/property/${propertyId}/field/${fieldId}`)}
            sx={{ borderRadius: '10px' }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={() => void handleSave()}
            disabled={!weedTarget.trim() || !dateSprayed || operational.saving || (operational.mode === 'remote' && (!jobReference.trim() || scopedFields.length === 0))}
            sx={{ borderRadius: '10px', fontWeight: 700, px: 4 }}
          >
            {operational.saving ? 'Saving…' : 'Save Job'}
          </Button>
        </Box>
      </Stack>
    </Box>
  );
}
