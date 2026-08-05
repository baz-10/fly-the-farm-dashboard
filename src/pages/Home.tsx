import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Collapse, Grid, MenuItem, Select, Stack, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import CloudOutlinedIcon from '@mui/icons-material/CloudOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SearchIcon from '@mui/icons-material/Search';
import PersonAddAltOutlinedIcon from '@mui/icons-material/PersonAddAltOutlined';
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
  const [moreActions, setMoreActions] = React.useState(false);
  React.useEffect(() => { api.read().then(setBrief).catch(e => setError(e.message)); }, []);
  const selectLocation = async (id: string) => { await api.selectLocation(id); setBrief(await api.read()); };

  if (!brief && !error) return <Stack alignItems="center" sx={{ py: 10 }}><CircularProgress aria-label="Loading Operations Brief" /></Stack>;
  if (!brief) return <Alert severity="error" action={<Button onClick={() => window.location.reload()}>Try again</Button>}>{error}</Alert>;
  const weather = brief.weather.current;
  const directActions = brief.quickActions.filter(action => !action.secondary);
  const secondaryActions = brief.quickActions.filter(action => action.secondary);
  const attentionItems = brief.nextActions.filter(action => !action.shownInBanner);
  const iconForAction = (label: string) => label === 'Search' ? <SearchIcon /> : label === 'New Client' ? <PersonAddAltOutlinedIcon /> : <ArrowForwardIcon />;

  return <Box sx={{ maxWidth: 1500, mx: 'auto', pb: 6 }}>
    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2} sx={{ mb: 3 }}>
      <Box><Typography variant="overline" color="primary.main" fontWeight={900} letterSpacing={1.6}>TODAY’S OPERATING PICTURE</Typography><Typography variant="h3" fontWeight={900} color="primary.dark">Operations Brief</Typography><Typography color="text.secondary">What needs attention, what is coming up, and what is ready.</Typography></Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.2} alignSelf={{ md: 'flex-start' }}><Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/missions/new')}>New Mission</Button><Button variant="outlined" startIcon={<CalendarTodayIcon />} onClick={() => navigate('/missions')}>Open Schedule</Button></Stack>
    </Stack>

    {brief.alerts.map(alert => <Alert key={alert.title} severity="warning" sx={{ mb: 2 }} action={<Button color="inherit" onClick={() => navigate(alert.route)}>Review</Button>}><strong>{alert.title}.</strong> {alert.reason} This does not stop planning work.</Alert>)}

    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 7fr) minmax(340px, 5fr)' }, gridTemplateAreas: { xs: '"weather" "quick" "schedule" "attention"', lg: '"weather quick" "schedule attention"' }, gap: 2.5, alignItems: 'start' }}>
      <Box data-testid="brief-weather" sx={{ gridArea: 'weather', minWidth: 0 }}><Card sx={cardSx}><CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} justifyContent="space-between" alignItems={{ sm: 'flex-start' }}><Box><SectionTitle icon={<WbSunnyOutlinedIcon />}>Weather now</SectionTitle>{brief.weather.resolvedLocation?.label && <Typography variant="h5" fontWeight={900} sx={{ mt: 1 }}>{brief.weather.resolvedLocation.label}</Typography>}{brief.weather.sourceLabel && <Typography variant="caption" color="text.secondary">Source: {brief.weather.sourceLabel}</Typography>}</Box>{brief.locations.length > 1 ? <Select size="small" value={brief.location?.id || ''} displayEmpty onChange={e => selectLocation(String(e.target.value))} aria-label="Operating location"><MenuItem value="" disabled>Select operating location</MenuItem>{brief.locations.map(item => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}</Select> : null}</Stack>
        {brief.weather.state === 'READY' && weather ? <>
          <Grid container spacing={2} sx={{ mt: 1 }}><Grid size={{ xs: 6, sm: 3 }}><Typography variant="h2" fontWeight={800}>{Math.round(weather.temperatureC)}°C</Typography><Typography color="text.secondary">{Math.round(weather.minTemperatureC)}° / {Math.round(weather.maxTemperatureC)}°</Typography></Grid><Grid size={{ xs: 6, sm: 3 }}><Typography variant="h5" fontWeight={800}>{weather.windSpeedKmh} km/h</Typography><Typography color="text.secondary">{weather.windDirection} · gusts {weather.windGustKmh}</Typography></Grid><Grid size={{ xs: 6, sm: 3 }}><Typography variant="h5" fontWeight={800}>{weather.humidityPercent}%</Typography><Typography color="text.secondary">Humidity · rain {weather.rainProbability}%</Typography></Grid><Grid size={{ xs: 6, sm: 3 }}><Typography variant="h5" fontWeight={800}>Delta T {weather.deltaTC}°C</Typography><Chip sx={{ mt: .6 }} label={weather.sprayCondition?.label || 'Advisory'} color={weather.sprayCondition?.status === 'GO' ? 'success' : 'warning'} size="small" /></Grid></Grid>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 2 }}>Advisory conditions for operational awareness. The operator remains responsible for the decision to spray.</Typography>
        </> : <Alert severity="info" sx={{ mt: 2 }} icon={<CloudOutlinedIcon />}>{brief.weather.message || 'Set an operating-location address to see local weather. You can continue working.'}</Alert>}
        <Button endIcon={<ArrowForwardIcon />} sx={{ mt: 2 }} onClick={() => navigate('/weather')}>Open Weather Centre</Button>
      </CardContent></Card></Box>

      <Box data-testid="brief-schedule" sx={{ gridArea: 'schedule', minWidth: 0 }}><Card sx={cardSx}><CardContent sx={{ p: { xs: 2.5, md: 3 } }}><SectionTitle icon={<CalendarTodayIcon />}>Today’s Schedule</SectionTitle>
        {brief.schedule.length ? <Stack spacing={1.2} sx={{ mt: 2 }}>{brief.schedule.map(item => <Button key={item.id} variant="outlined" onClick={() => navigate(item.action.route)} sx={{ justifyContent: 'space-between', py: 1.4, textAlign: 'left' }}><span>{formatTime(item.time)} · {item.title}</span><ArrowForwardIcon fontSize="small" /></Button>)}</Stack> : <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="space-between" gap={2} sx={{ pt: 2 }}><Box><Typography fontWeight={800}>Nothing scheduled today</Typography><Typography color="text.secondary">Plan upcoming work or review the full schedule.</Typography></Box><Stack direction="row" gap={1} flexWrap="wrap"><Button variant="contained" onClick={() => navigate('/missions/new')}>Plan a Mission</Button><Button variant="outlined" onClick={() => navigate('/missions')}>Open Schedule</Button></Stack></Stack>}
      </CardContent></Card></Box>

      <Box data-testid="brief-quick" sx={{ gridArea: 'quick', minWidth: 0 }}><Card sx={cardSx}><CardContent sx={{ p: { xs: 2.5, md: 3 } }}><SectionTitle icon={<AddIcon />}>Quick Actions</SectionTitle><Stack spacing={1.1} sx={{ mt: 2 }}>{directActions.map(action => <Button key={action.label} fullWidth variant="outlined" startIcon={iconForAction(action.label)} onClick={() => navigate(action.route)} sx={{ justifyContent: 'flex-start', py: 1.35 }}>{action.label}</Button>)}</Stack>{secondaryActions.length > 0 && <><Button fullWidth endIcon={<ExpandMoreIcon sx={{ transform: moreActions ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />} onClick={() => setMoreActions(value => !value)} aria-expanded={moreActions} sx={{ mt: 1.2 }}>{moreActions ? 'Fewer actions' : 'More actions'}</Button><Collapse in={moreActions} unmountOnExit><Stack spacing={1} sx={{ pt: 1 }}>{secondaryActions.map(action => <Button key={action.label} fullWidth variant="text" onClick={() => navigate(action.route)}>{action.label}</Button>)}</Stack></Collapse></>}</CardContent></Card></Box>

      <Box data-testid="brief-attention" sx={{ gridArea: 'attention', minWidth: 0 }}><Card sx={cardSx}><CardContent sx={{ p: { xs: 2.5, md: 3 } }}><SectionTitle icon={<ErrorOutlineIcon />}>Needs attention</SectionTitle>
        {attentionItems.length ? <Stack divider={<Box sx={{ borderBottom: '1px solid', borderColor: 'divider' }} />} sx={{ mt: 1 }}>{attentionItems.map((action, index) => <Stack key={`${action.title}-${index}`} direction={{ xs: 'column', sm: 'row', lg: 'column', xl: 'row' }} justifyContent="space-between" gap={1} sx={{ py: 1.4 }}><Box><Chip label={action.urgency} size="small" color={action.urgency === 'Critical' ? 'warning' : 'default'} /><Typography fontWeight={800} sx={{ mt: .7 }}>{action.title}</Typography><Typography variant="body2" color="text.secondary">{action.reason}</Typography></Box><Button onClick={() => navigate(action.route)} sx={{ alignSelf: 'flex-start' }}>Open</Button></Stack>)}</Stack> : <Box sx={{ py: 2 }}><Typography fontWeight={800}>Nothing needs immediate attention</Typography><Typography color="text.secondary">Spray Command will surface the next useful action here.</Typography></Box>}
      </CardContent></Card></Box>
    </Box>
  </Box>;
}
