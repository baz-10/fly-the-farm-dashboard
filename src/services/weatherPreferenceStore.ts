import { CachedOperationalForecast, WeatherLocation, WeatherPreferences } from '../types/weather';

const PREF_KEY = 'ftf:weather:preferences';
const CACHE_KEY = 'ftf:weather:forecast-cache';
const CACHE_TTL_MS = 60 * 60 * 1000;

const safeRead = <T,>(key: string, fallback: T): T => {
  try { return JSON.parse(localStorage.getItem(key) || '') as T; } catch { return fallback; }
};

const safeWrite = (key: string, value: unknown) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* cache is best effort */ }
};

export function readWeatherPreferences(userId: string): WeatherPreferences {
  const all = safeRead<Record<string, WeatherPreferences>>(PREF_KEY, {});
  return all[userId] || { recent: [] };
}

export function saveWeatherPreferences(userId: string, preferences: WeatherPreferences): void {
  const all = safeRead<Record<string, WeatherPreferences>>(PREF_KEY, {});
  const unique = preferences.recent.filter((candidate, index, values) => (
    values.findIndex((value) => value.name === candidate.name && value.latitude === candidate.latitude && value.longitude === candidate.longitude) === index
  )).slice(0, 5);
  safeWrite(PREF_KEY, { ...all, [userId]: { ...preferences, recent: unique } });
}

function locationKey(location: WeatherLocation): string {
  return `${location.latitude.toFixed(2)}:${location.longitude.toFixed(2)}`;
}

export function cacheForecast(forecast: CachedOperationalForecast): void {
  const all = safeRead<Record<string, CachedOperationalForecast>>(CACHE_KEY, {});
  safeWrite(CACHE_KEY, { ...all, [locationKey(forecast.location)]: forecast });
}

export function getCachedForecast(location: WeatherLocation, now = new Date()): CachedOperationalForecast | null {
  const all = safeRead<Record<string, CachedOperationalForecast>>(CACHE_KEY, {});
  const cached = all[locationKey(location)];
  if (!cached || now.getTime() - new Date(cached.fetchedAt).getTime() > CACHE_TTL_MS) return null;
  return cached;
}
