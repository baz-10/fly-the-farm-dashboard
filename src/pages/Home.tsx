import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Grid, MenuItem, Select, Stack, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import CloudOutlinedIcon from '@mui/icons-material/CloudOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import WbSunnyOutlinedIcon from '@mui/icons-material/WbSunnyOutlined';
import { createOperationsBriefApi, OperationsBrief } from '../services/operationsBriefApi';

const api = createOperationsBriefApi();
const cardSx = { height: '100%', border: '1px solid', borderColor: 'divider', borderRadius: 3, boxShadow: '0 14px 36px rgba(20,58,26,.06)' };
const formatTime = (value: string) => new Date(value).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false });

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return <Stack direction="row" spacing={1.2} alignItems="center"><Box sx={{ color: 'primary.main', display: 'flex' }}>{icon}</Box><Typography variant="h6" fontWeight={800}>{children}</Typography></Stack>;
}

export default function Home() {
  const navigate = useNavigate();
  const [brief, setBrief] = React.useState<OperationsBrief | null>(null);
  const [error, setError] = React.useState('');
  React.useEffect(() => { api.read().then(setBrief).catch(e => setError(e.message)); }, []);
  const selectLocation = async (id: string) => { await api.selectLocation(id); setBrief(await api.read()); };

  if (!brief && !error) return <Stack alignItems="center" sx={{ py: 10 }}><CircularProgress aria-label="Loading Operations Brief" /></Stack>;
  if (!brief) return <Alert severity="error" action={<Button onClick={() => window.location.reload()}>Try again</Button>}>{error}</Alert>;
  const weather = brief.weather.current;

  return <Box sx={{ maxWidth: 1500, mx: 'auto', pb: 6 }}>
    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2} sx={{ mb: 3 }}>
      <Box><Typography variant="overline" color="primary.main" fontWeight={900} letterSpacing={1.6}>TODAY’S OPERATING PICTURE</Typography><Typography variant="h3" fontWeight={900} color="primary.dark">Operations Brief</Typography><Typography color="text.secondary">What needs attention, what is coming up, and what is ready.</Typography></Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.2} alignSelf={{ md: 'flex-start' }}><Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/missions/new')}>New Mission</Button><Button variant="outlined" startIcon={<CalendarTodayIcon />} onClick={() => navigate('/missions')}>Open Schedule</Button></Stack>
    </Stack>

    {brief.alerts.map(alert => <Alert key={alert.title} severity="warning" sx={{ mb: 2 }} action={<Button color="inherit" onClick={() => navigate(alert.route)}>Review</Button>}><strong>{alert.title}.</strong> {alert.reason} This does not stop planning work.</Alert>)}

    <Grid container spacing={2.5}>
      <Grid size={{ xs: 12, lg: 7 }}><Card sx={cardSx}><CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} justifyContent="space-between" alignItems={{ sm: 'center' }}><SectionTitle icon={<WbSunnyOutlinedIcon />}>Weather now</SectionTitle>{brief.locations.length > 1 ? <Select size="small" value={brief.location?.id || ''} displayEmpty onChange={e => selectLocation(String(e.target.value))} aria-label="Operating location"><MenuItem value="" disabled>Select operating location</MenuItem>{brief.locations.map(item => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}</Select> : brief.location && <Chip label={brief.location.name} size="small" variant="outlined" />}</Stack>
        {brief.weather.state === 'READY' && weather ? <>
          <Grid container spacing={2} sx={{ mt: 1 }}><Grid size={{ xs: 6, sm: 3 }}><Typography variant="h2" fontWeight={800}>{Math.round(weather.temperatureC)}°C</Typography><Typography color="text.secondary">{Math.round(weather.minTemperatureC)}° / {Math.round(weather.maxTemperatureC)}°</Typography></Grid><Grid size={{ xs: 6, sm: 3 }}><Typography variant="h5" fontWeight={800}>{weather.windSpeedKmh} km/h</Typography><Typography color="text.secondary">{weather.windDirection} · gusts {weather.windGustKmh}</Typography></Grid><Grid size={{ xs: 6, sm: 3 }}><Typography variant="h5" fontWeight={800}>{weather.humidityPercent}%</Typography><Typography color="text.secondary">Humidity · rain {weather.rainProbability}%</Typography></Grid><Grid size={{ xs: 6, sm: 3 }}><Typography variant="h5" fontWeight={800}>Delta T {weather.deltaTC}°C</Typography><Chip sx={{ mt: .6 }} label={weather.sprayCondition?.label || 'Advisory'} color={weather.sprayCondition?.status === 'GO' ? 'success' : 'warning'} size="small" /></Grid></Grid>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 2 }}>Advisory conditions for operational awareness. The operator remains responsible for the decision to spray.</Typography>
        </> : <Alert severity="info" sx={{ mt: 2 }} icon={<CloudOutlinedIcon />}>{brief.weather.message || 'Set an operating-location address to see local weather. You can continue working.'}</Alert>}
        <Button endIcon={<ArrowForwardIcon />} sx={{ mt: 2 }} onClick={() => navigate('/weather')}>Open Weather Centre</Button>
      </CardContent></Card></Grid>

      <Grid size={{ xs: 12, lg: 5 }}><Card sx={cardSx}><CardContent sx={{ p: { xs: 2.5, md: 3 } }}><SectionTitle icon={<CalendarTodayIcon />}>Today’s Schedule</SectionTitle>
        {brief.schedule.length ? <Stack spacing={1.2} sx={{ mt: 2 }}>{brief.schedule.map(item => <Button key={item.id} variant="outlined" onClick={() => navigate(item.action.route)} sx={{ justifyContent: 'space-between', py: 1.4 }}><span>{formatTime(item.time)} · {item.title}</span><ArrowForwardIcon fontSize="small" /></Button>)}</Stack> : <Box sx={{ py: 4, textAlign: 'center' }}><Typography fontWeight={800}>Nothing scheduled today</Typography><Typography color="text.secondary" sx={{ mb: 2 }}>Use the clear day to plan upcoming work.</Typography><Button variant="outlined" onClick={() => navigate('/missions/new')}>Plan a Mission</Button></Box>}
      </CardContent></Card></Grid>

      <Grid size={{ xs: 12, md: 5 }}><Card sx={cardSx}><CardContent sx={{ p: { xs: 2.5, md: 3 } }}><SectionTitle icon={<AddIcon />}>Quick Actions</SectionTitle><Grid container spacing={1.2} sx={{ mt: 1 }}>{brief.quickActions.map(action => <Grid size={{ xs: 12, sm: 6 }} key={action.label}><Button fullWidth variant={action.primary ? 'contained' : 'outlined'} onClick={() => navigate(action.route)}>{action.label}</Button></Grid>)}</Grid></CardContent></Card></Grid>

      <Grid size={{ xs: 12, md: 7 }}><Card sx={cardSx}><CardContent sx={{ p: { xs: 2.5, md: 3 } }}><SectionTitle icon={<ErrorOutlineIcon />}>Needs attention</SectionTitle>
        {brief.nextActions.length ? <Stack divider={<Box sx={{ borderBottom: '1px solid', borderColor: 'divider' }} />} sx={{ mt: 1 }}>{brief.nextActions.map((action, index) => <Stack key={`${action.title}-${index}`} direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1.5} sx={{ py: 1.6 }}><Box><Chip label={action.urgency} size="small" color={action.urgency === 'Critical' ? 'warning' : 'default'} /><Typography fontWeight={800} sx={{ mt: .7 }}>{action.title}</Typography><Typography variant="body2" color="text.secondary">{action.reason}</Typography></Box><Button onClick={() => navigate(action.route)}>Open</Button></Stack>)}</Stack> : <Box sx={{ py: 4, textAlign: 'center' }}><Typography fontWeight={800}>Nothing needs immediate attention</Typography><Typography color="text.secondary">Spray Command will surface the next useful action here.</Typography></Box>}
      </CardContent></Card></Grid>
    </Grid>
  </Box>;
}
