import React from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Grid, Paper, Stack, TextField, Typography } from '@mui/material';
import CloudQueueIcon from '@mui/icons-material/CloudQueue';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import { format } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { useOperationalWeather } from '../hooks/useOperationalWeather';
import { assessInversionPotential, classifyDeltaT, selectCurrentHourlyPoint } from '../utils/sprayWeather';

export default function Weather() {
  const { user } = useAuth();
  const weather = useOperationalWeather(user?.id || 'anonymous');
  const [query, setQuery] = React.useState('');
  const current = selectCurrentHourlyPoint(weather.forecast?.hourly || [], new Date(), weather.forecast?.timezone);
  const inversion = current && weather.forecast?.sunrise && weather.forecast?.sunset ? assessInversionPotential({ time: current.time, sunrise: weather.forecast.sunrise, sunset: weather.forecast.sunset, windSpeedKmh: current.windSpeedKmh, cloudCoverPercent: current.cloudCoverPercent, humidityPercent: current.humidity, temperatureTrendC: 0 }) : null;
  const submit = (event: React.FormEvent) => { event.preventDefault(); if (query.trim()) void weather.searchLocation(query.trim()); };

  return <Box sx={{ maxWidth: 1500, mx: 'auto', p: { xs: 2, md: 3.5 } }}>
    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2} mb={2.5}><Box><Stack direction="row" spacing={1} alignItems="center"><CloudQueueIcon color="primary" /><Typography variant="h4" fontWeight={900}>Weather</Typography></Stack><Typography color="text.secondary">Spray-weather intelligence for the location you choose.</Typography></Box><Button startIcon={<RefreshIcon />} variant="outlined" disabled={!weather.location || weather.status === 'loading'} onClick={() => void weather.refresh()}>Refresh</Button></Stack>
    <Paper component="form" onSubmit={submit} variant="outlined" sx={{ p: 1.5, mb: 2, borderRadius: 2 }}><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}><TextField fullWidth size="small" label="Search location" value={query} onChange={(e) => setQuery(e.target.value)} /><Button type="submit" variant="contained" startIcon={<SearchIcon />}>Search</Button><Button variant="outlined" startIcon={<MyLocationIcon />} onClick={() => void weather.useDeviceLocation()}>Use my location</Button></Stack></Paper>
    {weather.error && <Alert severity={weather.status === 'stale' ? 'warning' : 'error'} sx={{ mb: 2 }}>{weather.error}{weather.status === 'stale' ? ' Showing the last successful forecast.' : ''}</Alert>}
    {weather.status === 'loading' && <Stack alignItems="center" py={6}><CircularProgress /></Stack>}
    {!weather.forecast && weather.status !== 'loading' && <Alert severity="info">Search for a location or use your device location to load weather.</Alert>}
    {weather.forecast && current && <Stack spacing={2}>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 5 }}><Card variant="outlined" sx={{ height: '100%' }}><CardContent><Stack direction="row" spacing={1} alignItems="center"><LocationOnIcon color="primary" /><Typography fontWeight={900}>{weather.location?.name}</Typography></Stack><Typography variant="h2" fontWeight={900} mt={2}>{current.tempC}°C</Typography><Typography color="text.secondary">Humidity {current.humidity}% · Wind {current.windDirectionCompass} {current.windSpeedKmh} km/h · Gusts {current.windGustsKmh} km/h</Typography><Typography color="text.secondary">Rain chance {current.precipitationProbability}%</Typography><Typography variant="caption">Open-Meteo · retrieved {new Date(weather.forecast.fetchedAt).toLocaleString('en-AU')}</Typography></CardContent></Card></Grid>
        <Grid size={{ xs: 12, md: 3 }}><Card variant="outlined" sx={{ height: '100%' }}><CardContent><Typography variant="overline">Delta T</Typography><Typography variant="h3" fontWeight={900}>Delta T {current.deltaT}°C</Typography><Chip label={classifyDeltaT(current.deltaT)} color={classifyDeltaT(current.deltaT) === 'preferred' ? 'success' : classifyDeltaT(current.deltaT) === 'marginal' ? 'warning' : 'error'} /><Typography variant="body2" mt={1}>Calculated from {current.tempC}°C and {current.humidity}% RH. Check the product label.</Typography></CardContent></Card></Grid>
        <Grid size={{ xs: 12, md: 4 }}><Card variant="outlined" sx={{ height: '100%' }}><CardContent><Typography variant="overline">Inversion</Typography><Typography variant="h5" fontWeight={900}>{inversion?.rating || 'Unknown'} forecast inversion potential</Typography><Typography mt={1}>{inversion?.message || 'Forecast inputs are incomplete. Verify conditions on site.'}</Typography></CardContent></Card></Grid>
      </Grid>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}><Typography fontWeight={900} mb={1.5}>Hourly forecast</Typography><Box sx={{ overflowX: 'auto' }}><Stack direction="row" spacing={1}>{weather.forecast.hourly.map((hour) => { const solarDay = weather.forecast?.daily.find((day) => day.date === hour.time.slice(0, 10)); const sunrise = solarDay?.sunrise || weather.forecast?.sunrise; const sunset = solarDay?.sunset || weather.forecast?.sunset; const hourlyInversion = sunrise && sunset ? assessInversionPotential({ time: hour.time, sunrise, sunset, windSpeedKmh: hour.windSpeedKmh, cloudCoverPercent: hour.cloudCoverPercent, humidityPercent: hour.humidity }) : null; return <Paper key={hour.time} variant="outlined" sx={{ p: 1.25, minWidth: 170 }}><Typography fontWeight={800}>{format(new Date(hour.time), 'ha')}</Typography><Typography>{hour.tempC}°C · RH {hour.humidity}%</Typography><Typography variant="caption" display="block">ΔT {hour.deltaT} · Wind {hour.windSpeedKmh} km/h</Typography><Typography variant="caption" display="block">Gusts {hour.windGustsKmh} · Rain {hour.precipitationProbability}%</Typography><Chip size="small" sx={{ mt: 0.75 }} label={`${hourlyInversion?.rating || 'Unknown'} inversion`} color={hourlyInversion?.rating === 'high' ? 'error' : hourlyInversion?.rating === 'moderate' ? 'warning' : 'success'} /></Paper>; })}</Stack></Box></Paper>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}><Typography fontWeight={900} mb={1.5}>Seven-day forecast</Typography><Grid container spacing={1}>{weather.forecast.daily.map((day) => <Grid key={day.date} size={{ xs: 6, sm: 4, md: 12 / 7 }}><Paper variant="outlined" sx={{ p: 1.25, height: '100%' }}><Typography fontWeight={800}>{format(new Date(`${day.date}T12:00:00`), 'EEE d')}</Typography><Typography>{day.minTempC}–{day.maxTempC}°C</Typography><Typography variant="caption">Rain {day.rainChancePercent}% · Gusts {day.maxGustKmh}</Typography></Paper></Grid>)}</Grid></Paper>
      <Alert severity="warning">Forecast indicators do not authorise spraying. Check the chemical label and verify live conditions, including inversion warning signs, on site.</Alert>
    </Stack>}
  </Box>;
}
