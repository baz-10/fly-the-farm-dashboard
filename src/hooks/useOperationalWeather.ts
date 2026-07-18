import React from 'react';
import { format } from 'date-fns';
import { fetchWeatherForDate, geocodeLocality, reverseGeocodeLocation } from '../services/weatherService';
import { cacheForecast, getCachedForecast, readWeatherPreferences, saveWeatherPreferences } from '../services/weatherPreferenceStore';
import { CachedOperationalForecast, WeatherLocation } from '../types/weather';

export type WeatherLoadStatus = 'idle' | 'loading' | 'fresh' | 'stale' | 'unavailable' | 'permission-denied' | 'location-not-found';

export function useOperationalWeather(userId: string) {
  const initialPreferences = React.useMemo(() => readWeatherPreferences(userId), [userId]);
  const [location, setLocation] = React.useState<WeatherLocation | null>(initialPreferences.selected || null);
  const [forecast, setForecast] = React.useState<CachedOperationalForecast | null>(() => initialPreferences.selected ? getCachedForecast(initialPreferences.selected) : null);
  const [status, setStatus] = React.useState<WeatherLoadStatus>(forecast ? 'fresh' : 'idle');
  const [error, setError] = React.useState('');
  const [recent, setRecent] = React.useState(initialPreferences.recent);

  const load = React.useCallback(async (nextLocation: WeatherLocation, force = false) => {
    const cached = !force ? getCachedForecast(nextLocation) : null;
    if (cached) { setLocation(nextLocation); setForecast(cached); setStatus('fresh'); return; }
    setStatus('loading'); setError('');
    try {
      const result = await fetchWeatherForDate(nextLocation.latitude, nextLocation.longitude, format(new Date(), 'yyyy-MM-dd'));
      const nextForecast: CachedOperationalForecast = { location: nextLocation, fetchedAt: new Date().toISOString(), ...result };
      const nextRecent = [nextLocation, ...recent.filter((item) => item.name !== nextLocation.name)].slice(0, 5);
      setLocation(nextLocation); setRecent(nextRecent); setForecast(nextForecast); setStatus('fresh');
      cacheForecast(nextForecast);
      saveWeatherPreferences(userId, { selected: nextLocation, recent: nextRecent });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Weather is unavailable.');
      setStatus(forecast ? 'stale' : 'unavailable');
    }
  }, [forecast, recent, userId]);

  const searchLocation = React.useCallback(async (query: string) => {
    setStatus('loading'); setError('');
    try {
      const found = await geocodeLocality(query.trim());
      if (!found) { setStatus('location-not-found'); setError(`Could not find "${query.trim()}".`); return; }
      await load(found, true);
    } catch (cause) {
      setStatus(forecast ? 'stale' : 'unavailable');
      setError(cause instanceof Error ? cause.message : 'Location search is unavailable.');
    }
  }, [forecast, load]);

  const refresh = React.useCallback(async () => { if (location) await load(location, true); }, [load, location]);

  const useDeviceLocation = React.useCallback(async () => {
    if (!navigator.geolocation) { setStatus('unavailable'); setError('Device location is unavailable.'); return; }
    setStatus('loading');
    await new Promise<void>((resolve) => navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const name = await reverseGeocodeLocation(coords.latitude, coords.longitude);
        await load({ name, latitude: coords.latitude, longitude: coords.longitude }, true);
        resolve();
      },
      () => { setStatus('permission-denied'); setError('Location permission was denied. Search for a location instead.'); resolve(); },
      { enableHighAccuracy: false, timeout: 10000 },
    ));
  }, [load]);

  return { location, forecast, status, error, recent, searchLocation, useDeviceLocation, refresh, selectRecent: (value: WeatherLocation) => load(value) };
}
