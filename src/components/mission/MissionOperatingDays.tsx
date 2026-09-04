import React from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Stack, TextField, Typography } from '@mui/material';
import type { AuthorisedMissionOperatingField } from '../../types/missionWorkspace';
import type { MissionOperatingDay } from '../../types/missionOperations';
import { missionOperationsApi } from '../../services/missionOperationsApi';
import { formatMissionOperatingWorkDate } from '../../utils/missionWorkspace';
import MissionOperatingDayDetail from './MissionOperatingDayDetail';

type OperatingDaysApi = Pick<typeof missionOperationsApi, 'createDay' | 'readDays' | 'readPackageHistory' | 'reviewJsa' | 'startDay' | 'saveFieldActivity' | 'completeDay'>;

function stateLabel(state: MissionOperatingDay['state']) {
  return state.toLowerCase().replace('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function daySummary(day: MissionOperatingDay) {
  const actualActivities = day.fieldActivities.filter((activity) => activity.status !== 'PLANNED');
  const attempted = actualActivities.reduce((total, activity) => total + Number(activity.hectaresAttempted || 0), 0);
  const completed = actualActivities.reduce((total, activity) => total + Number(activity.hectaresCompleted || 0), 0);
  return { attempted, completed };
}

export default function MissionOperatingDays({
  missionId,
  days,
  authorisedFields,
  fields = [],
  api = missionOperationsApi,
}: {
  missionId: string;
  /** Supplying days is intended for a bounded read-only render; otherwise they are loaded from the canonical API. */
  days?: MissionOperatingDay[];
  authorisedFields?: AuthorisedMissionOperatingField[];
  /** Candidate Fields from the authoritative Job; package scope is applied before passing them to a detail. */
  fields?: AuthorisedMissionOperatingField[];
  api?: OperatingDaysApi;
}) {
  const [loadedDays, setLoadedDays] = React.useState<MissionOperatingDay[]>(days || []);
  const [packageFields, setPackageFields] = React.useState<Record<string, string[]>>({});
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [newWorkDate, setNewWorkDate] = React.useState('');
  const [loading, setLoading] = React.useState(days === undefined);
  const [error, setError] = React.useState('');
  const dayList = days || loadedDays;
  const selectedDay = dayList.find((day) => day.id === selectedId);

  const reload = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [records, history] = await Promise.all([api.readDays(missionId), api.readPackageHistory(missionId)]);
      setLoadedDays(records.days);
      setPackageFields(Object.fromEntries(history.packages.map((item) => [item.id, item.fieldIds])));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Authoritative operating days could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [api, missionId]);

  React.useEffect(() => { if (days === undefined) void reload(); }, [days, reload]);

  const resolvedFieldsFor = (day: MissionOperatingDay) => {
    if (authorisedFields) return authorisedFields;
    const ids = new Set(packageFields[day.packageRevisionId] || []);
    return fields.filter((field) => ids.has(field.id));
  };

  const updateDay = (updated: MissionOperatingDay) => {
    if (days === undefined) setLoadedDays((current) => current.map((day) => day.id === updated.id ? updated : day));
  };

  const reloadDay = async (dayId: string) => {
    const records = await api.readDays(missionId);
    const refreshed = records.days.find((day) => day.id === dayId);
    if (!refreshed) throw new Error('The operating day is no longer available from the authoritative record.');
    if (days === undefined) setLoadedDays(records.days);
    return refreshed;
  };

  const createDay = async () => {
    if (!newWorkDate) return;
    setLoading(true);
    setError('');
    try {
      const created = await api.createDay(missionId, newWorkDate, null);
      setLoadedDays((current) => [...current, created].sort((left, right) => left.workDate.localeCompare(right.workDate)));
      setNewWorkDate('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The authoritative operating day could not be created.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Stack direction="row" spacing={1} alignItems="center" aria-live="polite"><CircularProgress size={20} /><Typography>Loading authoritative operating days…</Typography></Stack>;
  if (error) return <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => void reload()}>Retry</Button>}>{error}</Alert>;
  if (selectedDay) return <Stack spacing={2}>
    <Button variant="text" sx={{ alignSelf: 'flex-start' }} onClick={() => setSelectedId(null)}>Back to operating days</Button>
    <MissionOperatingDayDetail day={selectedDay} authorisedFields={resolvedFieldsFor(selectedDay)} api={api} onDayChanged={updateDay} onReloadDay={reloadDay} />
  </Stack>;

  return <Box component="section" aria-label="Operating days">
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1} sx={{ mb: 1.5 }}>
      <Box><Typography variant="h6" fontWeight={900}>Operating days</Typography><Typography variant="body2" color="text.secondary">Open one day at a time to review its effective JSA and authorised Field activity.</Typography></Box>
      {days === undefined && <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}><TextField size="small" label="New operating day date" type="date" value={newWorkDate} onChange={(event) => setNewWorkDate(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} /><Button variant="contained" disabled={!newWorkDate} onClick={() => void createDay()}>Add operating day</Button><Button variant="outlined" onClick={() => void reload()}>Refresh days</Button></Stack>}
    </Stack>
    {!dayList.length ? <Alert severity="info">No operating days have been created for this Mission.</Alert> : <Box data-testid="operating-day-card-grid" sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 1.5 }}>
      {dayList.map((day) => {
        const summary = daySummary(day);
        const date = formatMissionOperatingWorkDate(day.workDate);
        const shortDate = date.replace(/ \d{4}$/, '');
        return <Card key={day.id} variant="outlined" sx={{ minWidth: 0 }}><CardContent><Stack spacing={1.25}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}><Typography variant="subtitle1" fontWeight={800}>{date}</Typography><Chip size="small" label={stateLabel(day.state)} color={day.state === 'DRAFT' ? 'warning' : day.state === 'COMPLETED' || day.state === 'SIGNED_OFF' ? 'success' : 'primary'} /></Stack>
          <Typography variant="body2" color="text.secondary">{day.jsaReview?.outcome === 'CONDITIONS_COVERED' ? 'JSA reviewed' : day.jsaReview?.outcome === 'CHANGE_DECLARED' ? 'JSA change declared' : 'JSA review required'}</Typography>
          <Typography variant="body2">Actual: {summary.completed.toFixed(1)} ha completed of {summary.attempted.toFixed(1)} ha attempted</Typography>
          <Button fullWidth variant="outlined" aria-label={`Open operating day ${shortDate}`} onClick={() => setSelectedId(day.id)}>Open operating day</Button>
        </Stack></CardContent></Card>;
      })}
    </Box>}
  </Box>;
}
