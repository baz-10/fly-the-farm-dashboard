import React from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { AuthorisedMissionOperatingField } from '../../types/missionWorkspace';
import type { MissionFieldActivity, MissionFieldActivityStatus, MissionJsaDayReviewOutcome, MissionOperatingDay } from '../../types/missionOperations';
import { canStartMissionOperatingDay, formatMissionOperatingWorkDate } from '../../utils/missionWorkspace';

type DayCommandApi = {
  reviewJsa: (missionId: string, dayId: string, expectedVersion: number, outcome: MissionJsaDayReviewOutcome, notes: string | null) => Promise<MissionOperatingDay>;
  startDay: (missionId: string, dayId: string, expectedVersion: number, startedAt: string) => Promise<MissionOperatingDay>;
  saveFieldActivity: (missionId: string, dayId: string, activityId: string | null, expectedVersion: number, input: {
    fieldId: string; hectaresAttempted: string | null; hectaresCompleted: string | null; startedAt: string | null; finishedAt: string | null; status: MissionFieldActivityStatus; notes: string | null;
  }) => Promise<MissionOperatingDay>;
  completeDay: (missionId: string, dayId: string, expectedVersion: number, finishedAt: string, notes: string | null) => Promise<MissionOperatingDay>;
};

const conflictCodes = new Set([
  'MISSION_OPERATING_DAY_VERSION_CONFLICT',
  'MISSION_FIELD_ACTIVITY_VERSION_CONFLICT',
  'JSA_DAY_REVIEW_CONFLICT',
  'MISSION_FIELD_ACTIVITY_CONFLICT',
]);

function stateLabel(state: MissionOperatingDay['state'] | MissionFieldActivityStatus) {
  return state.toLowerCase().replace('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function asFixedHa(value: string) {
  if (!value.trim()) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric.toFixed(6) : null;
}

export default function MissionOperatingDayDetail({
  day,
  authorisedFields,
  api,
  onDayChanged,
  onReloadDay,
}: {
  day: MissionOperatingDay;
  authorisedFields: AuthorisedMissionOperatingField[];
  api: DayCommandApi;
  onDayChanged?: (day: MissionOperatingDay) => void;
  onReloadDay?: (dayId: string) => Promise<MissionOperatingDay>;
}) {
  const [reviewNotes, setReviewNotes] = React.useState('');
  const [fieldId, setFieldId] = React.useState(authorisedFields[0]?.id || '');
  const [attempted, setAttempted] = React.useState('');
  const [completed, setCompleted] = React.useState('');
  const [activityStatus, setActivityStatus] = React.useState<MissionFieldActivityStatus>('PLANNED');
  const [activityNotes, setActivityNotes] = React.useState('');
  const [completionNotes, setCompletionNotes] = React.useState(day.notes || '');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [hasConflict, setHasConflict] = React.useState(false);
  const [editingActivity, setEditingActivity] = React.useState<MissionFieldActivity | null>(null);
  const jsaEffective = canStartMissionOperatingDay(day);
  const mutable = day.state !== 'SIGNED_OFF';
  const canComplete = day.state === 'IN_PROGRESS';
  const proposedActivities = day.fieldActivities.filter((activity) => activity.status === 'PLANNED');
  const actualActivities = day.fieldActivities.filter((activity) => activity.status !== 'PLANNED');

  React.useEffect(() => {
    if (!authorisedFields.some((field) => field.id === fieldId)) setFieldId(authorisedFields[0]?.id || '');
  }, [authorisedFields, fieldId]);

  const command = async (action: () => Promise<MissionOperatingDay>) => {
    setBusy(true);
    setError('');
    setHasConflict(false);
    try {
      const updated = await action();
      onDayChanged?.(updated);
      setEditingActivity(null);
    } catch (caught) {
      setHasConflict(conflictCodes.has((caught as { code?: string })?.code || ''));
      setError(caught instanceof Error ? caught.message : 'The authoritative operating-day command could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  const reloadAfterConflict = async () => {
    if (!onReloadDay) return;
    setBusy(true);
    setError('');
    try {
      onDayChanged?.(await onReloadDay(day.id));
      setHasConflict(false);
      setEditingActivity(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The authoritative operating day could not be reloaded.');
    } finally {
      setBusy(false);
    }
  };

  const editActivity = (activity: MissionFieldActivity) => {
    setEditingActivity(activity);
    setFieldId(activity.fieldId);
    setAttempted(activity.hectaresAttempted || '');
    setCompleted(activity.hectaresCompleted || '');
    setActivityStatus(activity.status);
    setActivityNotes(activity.notes || '');
  };

  const saveActivity = () => command(() => api.saveFieldActivity(day.missionId, day.id, editingActivity?.id || null, editingActivity?.rowVersion ?? 0, {
    fieldId, hectaresAttempted: asFixedHa(attempted), hectaresCompleted: asFixedHa(completed), startedAt: null, finishedAt: null, status: activityStatus, notes: activityNotes.trim() || null,
  }));

  return <Box component="section" aria-labelledby={`operating-day-${day.id}`} sx={{ maxWidth: 1080, mx: 'auto' }}>
    <Stack spacing={2.25}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1}>
        <Box>
          <Typography component="h2" id={`operating-day-${day.id}`} variant="h5" fontWeight={900}>{formatMissionOperatingWorkDate(day.workDate)}</Typography>
          <Typography variant="body2" color="text.secondary">Base local date · {day.timezone}</Typography>
        </Box>
        <Chip label={stateLabel(day.state)} color={day.state === 'SIGNED_OFF' || day.state === 'COMPLETED' ? 'success' : day.state === 'DRAFT' ? 'warning' : 'primary'} variant="outlined" />
      </Stack>
      {error && <Alert severity="error" action={hasConflict && onReloadDay ? <Button color="inherit" size="small" onClick={() => void reloadAfterConflict()}>Reload operating day</Button> : undefined}>{error}</Alert>}
      <Alert severity={jsaEffective ? 'success' : 'warning'}>
        {jsaEffective ? 'The effective JSA revision has been reviewed for this operating day.' : 'Review the effective JSA before starting this operating day.'}
      </Alert>

      <Box component="section" aria-labelledby={`jsa-review-${day.id}`} sx={{ borderLeft: 3, borderColor: 'warning.main', pl: 2 }}>
        <Typography component="h3" id={`jsa-review-${day.id}`} variant="subtitle1" fontWeight={800}>Effective JSA review</Typography>
        {day.jsaReview ? <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {day.jsaReview.outcome === 'CONDITIONS_COVERED' ? 'Conditions covered' : 'Change declared'} · reviewed {new Date(day.jsaReview.reviewedAt).toLocaleString()}
        </Typography> : <>
          <TextField fullWidth multiline minRows={2} label="JSA review notes" value={reviewNotes} onChange={(event) => setReviewNotes(event.target.value)} disabled={!mutable || busy} sx={{ mt: 1.25 }} />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1.25 }}>
            <Button variant="contained" disabled={!mutable || busy} onClick={() => void command(() => api.reviewJsa(day.missionId, day.id, day.rowVersion, 'CONDITIONS_COVERED', reviewNotes.trim() || null))}>Confirm conditions covered</Button>
            <Button variant="outlined" color="warning" disabled={!mutable || busy} onClick={() => void command(() => api.reviewJsa(day.missionId, day.id, day.rowVersion, 'CHANGE_DECLARED', reviewNotes.trim() || null))}>Declare change</Button>
          </Stack>
        </>}
      </Box>

      <Divider />
      <Box component="section" aria-labelledby={`day-activity-${day.id}`}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1} alignItems={{ sm: 'center' }}>
          <Box>
            <Typography component="h3" id={`day-activity-${day.id}`} variant="subtitle1" fontWeight={800}>Authorised Fields</Typography>
            <Typography variant="body2" color="text.secondary">Only Fields in this day’s authorised Mission package can be recorded.</Typography>
          </Box>
          <Chip label="Proposed" size="small" variant="outlined" color="info" />
        </Stack>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>Plan data remains Proposed until you record it below.</Typography>
        {!authorisedFields.length ? <Alert severity="warning" sx={{ mt: 1.5 }}>The authorised Field scope for this package is unavailable. No Field activity can be entered.</Alert> : <Grid container spacing={1.5} sx={{ mt: 0.25 }}>
          <Grid size={{ xs: 12, md: 5 }}><FormControl fullWidth disabled={!mutable || busy}><InputLabel id={`field-label-${day.id}`}>Field</InputLabel><Select labelId={`field-label-${day.id}`} label="Field" value={fieldId} onChange={(event) => setFieldId(event.target.value)}>{authorisedFields.map((field) => <MenuItem key={field.id} value={field.id}>{field.name}</MenuItem>)}</Select></FormControl></Grid>
          <Grid size={{ xs: 6, md: 2 }}><TextField fullWidth label="Hectares attempted" inputMode="decimal" value={attempted} onChange={(event) => setAttempted(event.target.value)} disabled={!mutable || busy} /></Grid>
          <Grid size={{ xs: 6, md: 2 }}><TextField fullWidth label="Hectares completed" inputMode="decimal" value={completed} onChange={(event) => setCompleted(event.target.value)} disabled={!mutable || busy} /></Grid>
          <Grid size={{ xs: 12, md: 3 }}><FormControl fullWidth disabled={!mutable || busy}><InputLabel id={`activity-state-label-${day.id}`}>Activity status</InputLabel><Select labelId={`activity-state-label-${day.id}`} label="Activity status" value={activityStatus} onChange={(event) => setActivityStatus(event.target.value as MissionFieldActivityStatus)}><MenuItem value="PLANNED">Proposed</MenuItem><MenuItem value="IN_PROGRESS">In progress</MenuItem><MenuItem value="COMPLETED">Completed</MenuItem><MenuItem value="NOT_WORKED">Not worked</MenuItem></Select></FormControl></Grid>
          <Grid size={{ xs: 12, md: 9 }}><TextField fullWidth label="Field activity notes" value={activityNotes} onChange={(event) => setActivityNotes(event.target.value)} disabled={!mutable || busy} /></Grid>
          <Grid size={{ xs: 12, md: 3 }}><Button fullWidth variant="outlined" disabled={!mutable || busy || !fieldId || (attempted.trim() !== '' && !asFixedHa(attempted)) || (completed.trim() !== '' && !asFixedHa(completed))} onClick={() => void saveActivity()}>{editingActivity ? 'Update Field activity' : 'Record Field activity'}</Button></Grid>
        </Grid>}
        {proposedActivities.length > 0 && <Box sx={{ mt: 2 }}><Typography variant="subtitle2" fontWeight={800} sx={{ mb: 0.75 }}>Proposed Field activity</Typography><Stack spacing={0.75}>{proposedActivities.map((activity) => {
          const field = authorisedFields.find((candidate) => candidate.id === activity.fieldId);
          return <Box key={activity.id} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 1, borderTop: '1px solid', borderColor: 'divider' }}><Typography variant="body2" fontWeight={700}>{field?.name || 'Authorised Field'}</Typography><Stack direction="row" spacing={1} alignItems="center"><Typography variant="body2" color="text.secondary">Proposed · {activity.hectaresAttempted || '0.000000'} ha attempted / {activity.hectaresCompleted || '0.000000'} ha completed</Typography><Button size="small" disabled={!mutable || busy} aria-label={`Edit ${field?.name || 'authorised Field'} activity`} onClick={() => editActivity(activity)}>Edit</Button></Stack></Box>;
        })}</Stack></Box>}
        {actualActivities.length > 0 && <Box sx={{ mt: 2 }}><Typography variant="subtitle2" fontWeight={800} sx={{ mb: 0.75 }}>Actual Field activity</Typography><Stack spacing={0.75}>{actualActivities.map((activity) => {
          const field = authorisedFields.find((candidate) => candidate.id === activity.fieldId);
          return <Box key={activity.id} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 1, borderTop: '1px solid', borderColor: 'divider' }}><Typography variant="body2" fontWeight={700}>{field?.name || 'Authorised Field'}</Typography><Stack direction="row" spacing={1} alignItems="center"><Typography variant="body2" color="text.secondary">{activity.status === 'PLANNED' ? 'Proposed' : stateLabel(activity.status)} · {activity.hectaresAttempted || '0.000000'} ha attempted / {activity.hectaresCompleted || '0.000000'} ha completed</Typography><Button size="small" disabled={!mutable || busy} aria-label={`Edit ${field?.name || 'authorised Field'} activity`} onClick={() => editActivity(activity)}>Edit</Button></Stack></Box>;
        })}</Stack></Box>}
      </Box>

      <Divider />
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1.5}>
        <Button variant="contained" disabled={!canStartMissionOperatingDay(day) || busy} onClick={() => void command(() => api.startDay(day.missionId, day.id, day.rowVersion, new Date().toISOString()))}>Start operating day</Button>
        {canComplete && <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}><TextField label="Completion notes" value={completionNotes} onChange={(event) => setCompletionNotes(event.target.value)} disabled={busy} /><Button variant="contained" color="success" disabled={busy} onClick={() => void command(() => api.completeDay(day.missionId, day.id, day.rowVersion, new Date().toISOString(), completionNotes.trim() || null))}>Complete operating day</Button></Stack>}
      </Stack>
    </Stack>
  </Box>;
}
