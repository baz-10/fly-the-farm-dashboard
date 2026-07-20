import React from 'react';
import { Alert, Box, Button, ButtonGroup, Chip, CircularProgress, Paper, Stack, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { addDays, addMonths, eachDayOfInterval, format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useMission } from '../contexts/MissionContext';
import { CalendarView, getCalendarRange, groupMissionsByLocalDate } from '../utils/missionSchedule';

const STATUS_COLORS: Record<string, string> = { Planning: '#d4860a', Authorised: '#1565c0', 'In Progress': '#2e7d32', Completed: '#607d66', Locked: '#455a64' };

export default function Schedule() {
  const navigate = useNavigate();
  const { missions, isLoading, error } = useMission();
  const [view, setView] = React.useState<CalendarView>('week');
  const [anchor, setAnchor] = React.useState(new Date());
  const range = getCalendarRange(view, anchor);
  const dates = eachDayOfInterval(range);
  const groups = groupMissionsByLocalDate(missions, dates);
  const byDate = new Map(groups.map((group) => [group.dateKey, group.missions]));
  const move = (direction: number) => setAnchor((current) => view === 'month' ? addMonths(current, direction) : addDays(current, direction * (view === 'week' ? 7 : 1)));

  return (
    <Box sx={{ maxWidth: 1600, mx: 'auto', p: { xs: 2, md: 3.5 } }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2} sx={{ mb: 2.5 }}>
        <Box><Stack direction="row" spacing={1} alignItems="center"><CalendarMonthIcon color="primary" /><Typography variant="h4" fontWeight={900}>Schedule</Typography></Stack><Typography color="text.secondary">Mission bookings across your operation.</Typography></Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/missions/new')}>New Mission</Button>
      </Stack>
      <Paper variant="outlined" sx={{ p: 1.5, mb: 2, borderRadius: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={1.5}>
          <ButtonGroup aria-label="Calendar view">{(['day', 'week', 'month'] as CalendarView[]).map((item) => <Button key={item} aria-pressed={view === item} variant={view === item ? 'contained' : 'outlined'} onClick={() => setView(item)}>{item[0].toUpperCase() + item.slice(1)}</Button>)}</ButtonGroup>
          <Stack direction="row" alignItems="center" spacing={0.5}><Button aria-label="Previous period" onClick={() => move(-1)}><ChevronLeftIcon /></Button><Button onClick={() => setAnchor(new Date())}>Today</Button><Button aria-label="Next period" onClick={() => move(1)}><ChevronRightIcon /></Button></Stack>
        </Stack>
      </Paper>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {isLoading ? <Stack alignItems="center" py={8}><CircularProgress /></Stack> : (
        <Box sx={{ display: 'grid', gridTemplateColumns: view === 'day' ? '1fr' : view === 'week' ? { xs: 'repeat(7, minmax(220px, 1fr))', lg: 'repeat(7, minmax(0, 1fr))' } : { xs: 'repeat(7, minmax(130px, 1fr))', lg: 'repeat(7, minmax(0, 1fr))' }, gap: 1, overflowX: 'auto', pb: 1 }}>
          {dates.map((date) => {
            const key = format(date, 'yyyy-MM-dd'); const items = byDate.get(key) || [];
            return <Paper data-testid="schedule-day" key={key} variant="outlined" sx={{ minHeight: view === 'month' ? 150 : 320, p: 1.25, borderRadius: 2 }}><Typography fontWeight={900} fontSize="0.82rem">{format(date, view === 'month' ? 'EEE d' : 'EEE d MMM')}</Typography><Stack spacing={1} mt={1}>{items.map((mission) => <Button key={mission.id} aria-label={`Open ${mission.missionName}`} onClick={() => navigate(`/missions/${encodeURIComponent(mission.id)}`)} sx={{ display: 'block', textAlign: 'left', p: 1, borderLeft: `4px solid ${STATUS_COLORS[mission.status] || '#607d66'}`, bgcolor: 'rgba(20,58,26,.035)' }}><Typography fontSize="0.75rem" fontWeight={900}>{format(new Date(mission.scheduledDate), 'HH:mm')} {mission.missionName}</Typography><Typography fontSize="0.66rem" color="text.secondary">{mission.location?.name || 'Location not set'}</Typography><Chip size="small" label={mission.status} sx={{ mt: 0.5, height: 20, fontSize: '0.62rem' }} /></Button>)}</Stack></Paper>;
          })}
        </Box>
      )}
    </Box>
  );
}
