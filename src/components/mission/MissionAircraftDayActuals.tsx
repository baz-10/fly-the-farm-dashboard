import React from 'react';
import { Alert, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { missionOperationsApi } from '../../services/missionOperationsApi';
import type {
  MissionAircraftDayActualsRecord,
  MissionAircraftDayActualsSaveInput,
  MissionFlightActualInput,
} from '../../types/missionOperations';

const HOURS = /^(?:0|[1-9]\d{0,5})\.\d{4}$/;

export interface MissionAircraftOption {
  id: string;
  label: string;
}

interface AircraftActualsApi {
  saveAircraftActuals(dayId: string, input: MissionAircraftDayActualsSaveInput): Promise<unknown>;
}

interface Props {
  missionId: string;
  dayId: string;
  packageRevisionId: string;
  dayVersion: number;
  aircraft: MissionAircraftOption[];
  actual?: MissionAircraftDayActualsRecord;
  api?: AircraftActualsApi;
  readOnly?: boolean;
  onSaved?: (record: MissionAircraftDayActualsRecord) => void;
}

const emptyFlight = (aircraftId: string): MissionFlightActualInput => ({
  aircraftId,
  durationHours: '',
  startedAt: null,
  finishedAt: null,
  fieldId: null,
  sourceImportId: null,
});

function sumHours(values: string[]): string | null {
  if (values.some((value) => !HOURS.test(value))) return null;
  const units = values.reduce((sum, value) => sum + Number(value.replace('.', '')), 0);
  if (!Number.isSafeInteger(units) || units > 9_999_999_999) return null;
  return `${Math.floor(units / 10_000)}.${String(units % 10_000).padStart(4, '0')}`;
}

export default function MissionAircraftDayActuals({
  missionId,
  dayId,
  packageRevisionId,
  dayVersion,
  aircraft,
  actual,
  api = missionOperationsApi,
  readOnly = false,
  onSaved,
}: Props) {
  const [totals, setTotals] = React.useState<Record<string, string>>({});
  const [flights, setFlights] = React.useState<MissionFlightActualInput[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    setTotals(Object.fromEntries(aircraft.map((item) => [
      item.id,
      actual?.actuals.find((entry) => entry.aircraftId === item.id)?.declaredTotalHours || '',
    ])));
    setFlights((actual?.actuals || []).flatMap((entry) => entry.flights.map((flight) => ({
      aircraftId: flight.aircraftId,
      durationHours: flight.durationHours,
      startedAt: flight.startedAt,
      finishedAt: flight.finishedAt,
      fieldId: flight.fieldId,
      sourceImportId: flight.sourceImportId,
    }))));
  }, [actual, aircraft]);

  const save = async () => {
    setError('');
    const aircraftTotals = aircraft
      .filter((item) => totals[item.id] || flights.some((flight) => flight.aircraftId === item.id))
      .map((item) => ({ aircraftId: item.id, totalFlightHours: totals[item.id] || null }));
    if (!aircraftTotals.length || aircraftTotals.some((item) => item.totalFlightHours !== null && !HOURS.test(item.totalFlightHours))
      || flights.some((flight) => !HOURS.test(flight.durationHours))) {
      setError('Enter flight hours with exactly four decimal places.');
      return;
    }
    const effectiveTotals = aircraftTotals.map((item) => item.totalFlightHours
      || sumHours(flights.filter((flight) => flight.aircraftId === item.aircraftId).map((flight) => flight.durationHours))
      || '');
    const totalAircraftHours = sumHours(effectiveTotals);
    if (!totalAircraftHours) {
      setError('Enter flight hours with exactly four decimal places.');
      return;
    }
    setBusy(true);
    try {
      const saved = await api.saveAircraftActuals(dayId, {
        missionId,
        expectedVersion: actual?.dayVersion || dayVersion,
        totalAircraftHours,
        aircraftTotals,
        flights,
      });
      if (saved && typeof saved === 'object' && 'actuals' in saved) onSaved?.(saved as MissionAircraftDayActualsRecord);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Aircraft-day actuals could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const mismatches = actual?.actuals.filter((entry) => entry.reconciliationStatus === 'MISMATCH') || [];
  const signedOff = readOnly || Boolean(actual?.actuals.length && actual.actuals.every((entry) => entry.signedOffAt));

  return <Stack spacing={1.5}>
    <Stack spacing={0.25}>
      <Typography variant="h6">Aircraft-day actuals</Typography>
      <Typography variant="body2">Record one authoritative daily total per aircraft. Individual flights are optional.</Typography>
      <Typography variant="caption">Bound to package {packageRevisionId}</Typography>
    </Stack>
    {error && <Alert severity="error">{error}</Alert>}
    {mismatches.map((entry) => <Alert severity="warning" key={entry.id}>
      Flight details total {entry.flightsTotalHours} h; declared total is {entry.declaredTotalHours} h.
    </Alert>)}
    {actual && <Alert severity={actual.readyForSignOff ? 'success' : 'warning'}>
      {actual.readyForSignOff ? `Aircraft actuals are reconciled · ${actual.totalAircraftHours} total aircraft hours.` : 'Aircraft actuals are not ready for sign-off.'}
    </Alert>}
    {aircraft.map((item) => <TextField
      key={item.id}
      label={`${item.label} flight hours`}
      value={totals[item.id] || ''}
      disabled={busy || signedOff}
      inputProps={{ inputMode: 'decimal' }}
      helperText="Daily total, exactly four decimal places"
      onChange={(event) => setTotals((current) => ({ ...current, [item.id]: event.target.value }))}
    />)}
    {flights.map((flight, index) => <Stack key={index} direction={{ xs: 'column', sm: 'row' }} spacing={1}>
      <TextField
        select
        label={`Flight ${index + 1} aircraft`}
        value={flight.aircraftId}
        disabled={busy || signedOff}
        onChange={(event) => setFlights((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, aircraftId: event.target.value } : item))}
      >
        {aircraft.map((item) => <MenuItem key={item.id} value={item.id}>{item.label}</MenuItem>)}
      </TextField>
      <TextField
        label={`Flight ${index + 1} duration hours`}
        value={flight.durationHours}
        disabled={busy || signedOff}
        inputProps={{ inputMode: 'decimal' }}
        onChange={(event) => setFlights((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, durationHours: event.target.value } : item))}
      />
      <Button disabled={busy || signedOff} onClick={() => setFlights((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove flight</Button>
    </Stack>)}
    {!signedOff && <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
      <Button variant="outlined" disabled={busy || !aircraft.length} onClick={() => setFlights((current) => [...current, emptyFlight(aircraft[0].id)])}>Add flight detail</Button>
      <Button variant="contained" disabled={busy || !aircraft.length} onClick={() => void save()}>Save aircraft totals</Button>
    </Stack>}
  </Stack>;
}
