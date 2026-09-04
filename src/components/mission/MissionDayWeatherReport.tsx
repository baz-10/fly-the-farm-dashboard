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

export default function MissionDayWeatherReport({ day, report, api, readOnly = false, onCaptured }: Props) {
  const [current, setCurrent] = React.useState(report);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [manual, setManual] = React.useState(false);
  const [manualReason, setManualReason] = React.useState('');
  const [observedAt, setObservedAt] = React.useState(day.actualStartedAt || '');
  const [temperatureC, setTemperatureC] = React.useState('');

  React.useEffect(() => setCurrent(report), [report]);

  const scopedApi: WeatherApi = React.useMemo(() => api || {
    captureWeather: (dayId, input) => missionOperationsApi.captureWeather(dayId, { missionId: day.missionId, ...input }),
    saveManualWeather: (dayId, input) => missionOperationsApi.saveManualWeather(dayId, { missionId: day.missionId, ...input }),
  }, [api, day.missionId]);

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
    const temperature = temperatureC === '' ? null : Number(temperatureC);
    if (!observedAt || !Number.isFinite(Date.parse(observedAt)) || !manualReason.trim()
      || (temperatureC !== '' && !Number.isFinite(temperature))) {
      setError('Enter a timestamp with an offset, a reason, and valid observed values.');
      return;
    }
    const evidence: MissionDayWeatherEvidence = {
      source: 'MANUAL',
      providerIdentifier: null,
      providerRetrievedAt: null,
      hourlyObservations: [{
        observedAt,
        temperatureC: temperature,
        relativeHumidity: null,
        dewPointC: null,
        windSpeedKmh: null,
        windDirectionDegrees: null,
        precipitationMm: null,
      }],
      inversionInputs: { method: 'MANUAL_OBSERVATION_V1', inputsAvailable: false },
      inversionResults: { assessment: 'UNABLE_TO_DETERMINE' },
      coverageGaps: [],
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

  const hasActualInterval = Boolean(day.actualStartedAt && day.actualFinishedAt);
  const coverage: MissionDayWeatherCoverage = hasActualInterval ? 'ACTUAL_INTERVAL' : 'FULL_DAY';
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
      <TextField
        required
        label="Observation timestamp (ISO 8601)"
        value={observedAt}
        disabled={busy}
        onChange={(event) => setObservedAt(event.target.value)}
      />
      <TextField
        label="Observed temperature (°C)"
        value={temperatureC}
        disabled={busy}
        inputProps={{ inputMode: 'decimal' }}
        onChange={(event) => setTemperatureC(event.target.value)}
      />
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
