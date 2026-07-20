import React from 'react';
import { Alert, Button, CircularProgress, Stack, TextField, Typography } from '@mui/material';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import { useOperationalWeather } from '../../hooks/useOperationalWeather';
import { assessInversionPotential, classifyDeltaT, selectCurrentHourlyPoint } from '../../utils/sprayWeather';

export default function OperationalWeatherCard({ userId, onOpenWeather }: { userId: string; onOpenWeather: () => void }) {
  const weather = useOperationalWeather(userId);
  const [query, setQuery] = React.useState('');
  const current = selectCurrentHourlyPoint(weather.forecast?.hourly || [], new Date(), weather.forecast?.timezone);
  const currentSolarDay = current ? weather.forecast?.daily.find((day) => day.date === current.time.slice(0, 10)) : undefined;
  const currentSunrise = currentSolarDay?.sunrise || weather.forecast?.sunrise;
  const currentSunset = currentSolarDay?.sunset || weather.forecast?.sunset;
  const inversion = current && currentSunrise && currentSunset ? assessInversionPotential({ time: current.time, sunrise: currentSunrise, sunset: currentSunset, windSpeedKmh: current.windSpeedKmh, cloudCoverPercent: current.cloudCoverPercent, humidityPercent: current.humidity, temperatureTrendC: 0 }) : null;
  if (weather.status === 'loading') return <Stack alignItems="center" py={4}><CircularProgress size={24} /></Stack>;
  return <Stack spacing={1.1}>
    {weather.error && <Alert severity={weather.status === 'stale' ? 'warning' : 'info'}>{weather.error}</Alert>}
    {current ? <><Stack direction="row" justifyContent="space-between"><Typography fontWeight={900}>{weather.location?.name}</Typography><Typography variant="h5" fontWeight={900}>{current.tempC}°C</Typography></Stack><Typography variant="body2">Wind {current.windDirectionCompass} {current.windSpeedKmh} km/h · Gusts {current.windGustsKmh} · Rain {current.precipitationProbability}%</Typography><Stack direction="row" spacing={1}><Typography variant="body2" fontWeight={800}>Delta T {current.deltaT}°C · {classifyDeltaT(current.deltaT)}</Typography><Typography variant="body2" fontWeight={800}>{inversion?.rating || 'Unknown'} inversion potential</Typography></Stack></> : <Stack component="form" direction="row" spacing={1} onSubmit={(event) => { event.preventDefault(); if (query.trim()) void weather.searchLocation(query.trim()); }}><TextField size="small" label="Weather location" value={query} onChange={(event) => setQuery(event.target.value)} /><Button type="submit">Search</Button><Button aria-label="Use my location" onClick={() => void weather.useDeviceLocation()}><MyLocationIcon /></Button></Stack>}
    <Stack direction="row" spacing={1}><Button size="small" variant="outlined" onClick={onOpenWeather}>Open Weather</Button>{weather.location && <Button size="small" onClick={() => void weather.refresh()}>Refresh</Button>}</Stack>
  </Stack>;
}
