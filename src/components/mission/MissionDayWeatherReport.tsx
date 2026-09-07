import React from 'react';
import { Alert, Button, Stack, TextField, Typography } from '@mui/material';
import { missionOperationsApi } from '../../services/missionOperationsApi';
import type {
  MissionDayWeatherCoverage,
  MissionDayWeatherEvidence,
  MissionDayWeatherReportRecord,
  MissionOperatingDay,
} from '../../types/missionOperations';

interface WeatherApi {
  captureWeather(dayId: string, input: { coverage: MissionDayWeatherCoverage }): Promise<MissionDayWeatherReportRecord>;
  saveManualWeather(dayId: string, input: { coverage: MissionDayWeatherCoverage; evidence: MissionDayWeatherEvidence }): Promise<MissionDayWeatherReportRecord>;
}

interface Props {
  day: MissionOperatingDay;
  report: MissionDayWeatherReportRecord | null;
  api?: WeatherApi;
  readOnly?: boolean;
  onCaptured?: (report: MissionDayWeatherReportRecord) => void;
}

function sourceLabel(report: MissionDayWeatherReportRecord): string {
  return report.source === 'OPEN_METEO' ? 'Open-Meteo archive' : 'Manual evidence';
}

type ManualHour = {
  observedAt: string;
  kind: '' | 'OBSERVATION' | 'GAP';
  temperatureC: string;
  gapReason: string;
};

const HOUR_MS = 60 * 60 * 1000;

function zonedMidnightUtc(workDate: string, timezone: string): string {
  const [year, month, date] = workDate.split('-').map(Number);
  const target = Date.UTC(year, month - 1, date);
  let candidate = target;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(candidate))
      .filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
    const represented = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    candidate += target - represented;
  }
  return new Date(candidate).toISOString();
}

function nextDate(workDate: string): string {
  const [year, month, date] = workDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + 1)).toISOString().slice(0, 10);
}

function expectedBuckets(day: MissionOperatingDay, coverage: MissionDayWeatherCoverage): string[] {
  const start = coverage === 'ACTUAL_INTERVAL' ? day.actualStartedAt : zonedMidnightUtc(day.workDate, day.timezone);
  const end = coverage === 'ACTUAL_INTERVAL' ? day.actualFinishedAt : zonedMidnightUtc(nextDate(day.workDate), day.timezone);
  if (!start || !end) return [];
  const result: string[] = [];
  for (let value = Math.ceil(Date.parse(start) / HOUR_MS) * HOUR_MS; value < Date.parse(end); value += HOUR_MS) {
    result.push(new Date(value).toISOString());
  }
  return result;
}

export default function MissionDayWeatherReport({ day, report, api, readOnly = false, onCaptured }: Props) {
  const [current, setCurrent] = React.useState(report);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [manual, setManual] = React.useState(false);
  const [manualReason, setManualReason] = React.useState('');

  React.useEffect(() => setCurrent(report), [report]);

  const scopedApi: WeatherApi = React.useMemo(() => api || {
    captureWeather: (dayId, input) => missionOperationsApi.captureWeather(dayId, { missionId: day.missionId, ...input }),
    saveManualWeather: (dayId, input) => missionOperationsApi.saveManualWeather(dayId, { missionId: day.missionId, ...input }),
  }, [api, day.missionId]);

  const hasActualInterval = Boolean(day.actualStartedAt && day.actualFinishedAt);
  const coverage: MissionDayWeatherCoverage = hasActualInterval ? 'ACTUAL_INTERVAL' : 'FULL_DAY';
  const buckets = React.useMemo(() => expectedBuckets(day, coverage), [coverage, day]);
  const [manualHours, setManualHours] = React.useState<ManualHour[]>(() => buckets.map((observedAt) => ({
    observedAt, kind: '', temperatureC: '', gapReason: '',
  })));

  React.useEffect(() => setManualHours(buckets.map((observedAt) => ({
    observedAt, kind: '', temperatureC: '', gapReason: '',
  }))), [buckets]);

  const updateManualHour = (index: number, patch: Partial<ManualHour>) => {
    setManualHours((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, ...patch } : entry));
  };

  const finish = (saved: MissionDayWeatherReportRecord) => {
    setCurrent(saved);
    onCaptured?.(saved);
  };

  const capture = async (coverage: MissionDayWeatherCoverage) => {
    setBusy(true);
    setError('');
    try {
      finish(await scopedApi.captureWeather(day.id, { coverage }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Historical weather could not be captured.');
      setManual(true);
    } finally {
      setBusy(false);
    }
  };

  const saveManual = async (coverage: MissionDayWeatherCoverage) => {
    setError('');
    const invalid = !manualReason.trim() || !manualHours.length || !manualHours.some((entry) => entry.kind === 'OBSERVATION')
      || manualHours.some((entry) => entry.kind === ''
        || (entry.kind === 'OBSERVATION' && (entry.temperatureC.trim() === '' || !Number.isFinite(Number(entry.temperatureC))))
        || (entry.kind === 'GAP' && !entry.gapReason.trim()));
    if (invalid) {
      setError('Every measured hour needs at least one observed value; every gap needs a truthful reason.');
      return;
    }
    const evidence: MissionDayWeatherEvidence = {
      source: 'MANUAL',
      providerIdentifier: null,
      providerRetrievedAt: null,
      hourlyObservations: manualHours.filter((entry) => entry.kind === 'OBSERVATION').map((entry) => ({
        observedAt: entry.observedAt,
        temperatureC: Number(entry.temperatureC),
        relativeHumidity: null,
        dewPointC: null,
        windSpeedKmh: null,
        windDirectionDegrees: null,
        precipitationMm: null,
      })),
      inversionInputs: { method: 'MANUAL_OBSERVATION_V1', inputsAvailable: false },
      inversionResults: { assessment: 'UNABLE_TO_DETERMINE' },
      coverageGaps: manualHours.filter((entry) => entry.kind === 'GAP').map((entry) => ({
        observedAt: entry.observedAt,
        reason: entry.gapReason.trim(),
      })),
      manualReason: manualReason.trim(),
      sourceMetadata: { entryMethod: 'MISSION_DAY_MANUAL_FALLBACK' },
    };
    setBusy(true);
    try {
      finish(await scopedApi.saveManualWeather(day.id, { coverage, evidence }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Manual weather evidence could not be frozen.');
    } finally {
      setBusy(false);
    }
  };

  if (current) return <Stack spacing={1.25}>
    <Typography variant="h6">Daily weather report</Typography>
    <Alert severity="success">Frozen weather evidence</Alert>
    <Typography>{sourceLabel(current)} · {current.coverage === 'ACTUAL_INTERVAL' ? 'Actual operating interval' : 'Full Base-local day'}</Typography>
    <Typography variant="body2">{current.intervalStartAt} to {current.intervalEndAt} UTC · {current.timezone}</Typography>
    <Typography variant="body2">Coordinates {current.latitude}, {current.longitude} · {current.hourlyObservations.length} hourly observations</Typography>
    {current.coverageGaps.length > 0 && <Alert severity="warning">{current.coverageGaps.length} hourly coverage gaps are retained in this report.</Alert>}
    <Stack spacing={0}>
      <Typography variant="caption">Evidence digest</Typography>
      <Typography variant="caption" sx={{ overflowWrap: 'anywhere' }}>{current.sourceDigest}</Typography>
    </Stack>
  </Stack>;

  return <Stack spacing={1.5}>
    <Typography variant="h6">Daily weather report</Typography>
    <Typography variant="body2">
      Capture historical observations once. The UTC interval, Base timezone, source coordinates and evidence digest will be frozen.
    </Typography>
    {error && <Alert severity="error">{error}</Alert>}
    {!readOnly && !manual && (hasActualInterval
      ? <Button variant="contained" disabled={busy} onClick={() => void capture('ACTUAL_INTERVAL')}>Capture weather for operating hours</Button>
      : <Button variant="contained" disabled={busy} onClick={() => void capture('FULL_DAY')}>Capture full Base-local day</Button>)}
    {!readOnly && !manual && hasActualInterval && <Button variant="outlined" disabled={busy} onClick={() => void capture('FULL_DAY')}>Capture full Base-local day</Button>}
    {!readOnly && !manual && <Button disabled={busy} onClick={() => setManual(true)}>Enter manual evidence</Button>}
    {!readOnly && manual && <Stack spacing={1}>
      <Alert severity="info">Manual evidence fallback will be frozen with the same authoritative interval and coordinates.</Alert>
      <Typography variant="body2">Declare measured evidence or a truthful coverage gap for every UTC hour bucket.</Typography>
      {manualHours.map((entry, index) => <Stack key={entry.observedAt} spacing={1}>
        <Typography variant="subtitle2">{entry.observedAt}</Typography>
        <TextField
          select
          required
          label={`Evidence for ${entry.observedAt}`}
          value={entry.kind}
          disabled={busy}
          SelectProps={{ native: true }}
          onChange={(event) => updateManualHour(index, { kind: event.target.value as ManualHour['kind'] })}
        >
          <option value="">Select evidence</option>
          <option value="OBSERVATION">Measured observation</option>
          <option value="GAP">Coverage gap</option>
        </TextField>
        {entry.kind === 'OBSERVATION' && <TextField
          required
          label={`Observed temperature at ${entry.observedAt} (°C)`}
          value={entry.temperatureC}
          disabled={busy}
          inputProps={{ inputMode: 'decimal' }}
          onChange={(event) => updateManualHour(index, { temperatureC: event.target.value })}
        />}
        {entry.kind === 'GAP' && <TextField
          required
          label={`Gap reason at ${entry.observedAt}`}
          value={entry.gapReason}
          disabled={busy}
          onChange={(event) => updateManualHour(index, { gapReason: event.target.value })}
        />}
      </Stack>)}
      <TextField
        required
        multiline
        minRows={2}
        label="Reason for manual evidence"
        value={manualReason}
        disabled={busy}
        onChange={(event) => setManualReason(event.target.value)}
      />
      <Button variant="contained" disabled={busy} onClick={() => void saveManual(coverage)}>Freeze manual weather evidence</Button>
    </Stack>}
  </Stack>;
}
