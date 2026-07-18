// Weather data from Open-Meteo (https://open-meteo.com/)
// Free, no API key, CC-BY 4.0 — attribution required
import { calculateDeltaT } from '../utils/sprayWeather';

export interface HourlyWeatherPoint {
  time: string;         // ISO 8601
  tempC: number;
  humidity: number;
  dewpointC: number;
  deltaT: number;       // temp - dewpoint (approximate)
  windSpeedKmh: number;
  windGustsKmh: number;
  windDirectionDeg: number;
  windDirectionCompass: string;
  precipitationProbability: number;
  cloudCoverPercent: number;
  isDay: boolean;
}

export interface WeatherFetchResult {
  latitude: number;
  longitude: number;
  timezone: string;
  sunrise?: string;
  sunset?: string;
  hourly: HourlyWeatherPoint[];
  daily: DailyWeatherPoint[];
}

export interface DailyWeatherPoint {
  date: string;
  maxTempC: number;
  minTempC: number;
  rainChancePercent: number;
  maxWindKmh: number;
  maxGustKmh: number;
  sunrise?: string;
  sunset?: string;
}

const COMPASS_DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

function degreesToCompass(deg: number): string {
  const idx = Math.round(deg / 45) % 8;
  return COMPASS_DIRS[idx];
}

/**
 * Fetch hourly weather data for a given lat/lng and date.
 * Returns all 24 hourly readings for that date (filtered to 2-hour intervals by the caller if needed).
 */
export async function fetchWeatherForDate(
  latitude: number,
  longitude: number,
  date: string, // YYYY-MM-DD
): Promise<WeatherFetchResult> {
  const today = new Date().toISOString().split('T')[0];
  const isHistorical = date < today;

  let url: string;
  if (isHistorical) {
    // Use archive API for past dates
    url = `https://archive-api.open-meteo.com/v1/archive`
      + `?latitude=${latitude}&longitude=${longitude}`
      + `&start_date=${date}&end_date=${date}`
      + `&hourly=temperature_2m,relative_humidity_2m,dew_point_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation_probability,cloud_cover,is_day`
      + `&daily=sunrise,sunset,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max`
      + `&timezone=auto`;
  } else {
    // Use forecast API with past_days for recent + future
    const dateObj = new Date(date);
    const todayObj = new Date(today);
    const diffDays = Math.max(0, Math.floor((todayObj.getTime() - dateObj.getTime()) / 86400000));
    const pastDays = Math.min(diffDays + 1, 92);
    const forecastDays = date >= today ? 7 : 1;

    url = `https://api.open-meteo.com/v1/forecast`
      + `?latitude=${latitude}&longitude=${longitude}`
      + `&hourly=temperature_2m,relative_humidity_2m,dew_point_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation_probability,cloud_cover,is_day`
      + `&daily=sunrise,sunset,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max`
      + `&timezone=auto`
      + `&past_days=${pastDays}`
      + `&forecast_days=${forecastDays}`;
  }

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Weather API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const hourly = data.hourly;

  if (!hourly || !hourly.time) {
    throw new Error('No hourly data returned from weather API');
  }

  const points: HourlyWeatherPoint[] = [];
  for (let i = 0; i < hourly.time.length; i++) {
    const timeStr: string = hourly.time[i];
    // Only include readings for the requested date
    if (!timeStr.startsWith(date)) continue;

    const temp = hourly.temperature_2m[i] ?? 0;
    const dewpoint = hourly.dew_point_2m[i] ?? 0;
    const windDir = hourly.wind_direction_10m[i] ?? 0;

    points.push({
      time: timeStr,
      tempC: Math.round(temp * 10) / 10,
      humidity: Math.round(hourly.relative_humidity_2m[i] ?? 0),
      dewpointC: Math.round(dewpoint * 10) / 10,
      deltaT: calculateDeltaT(temp, hourly.relative_humidity_2m[i] ?? 0),
      windSpeedKmh: Math.round(hourly.wind_speed_10m[i] ?? 0),
      windGustsKmh: Math.round(hourly.wind_gusts_10m?.[i] ?? 0),
      windDirectionDeg: Math.round(windDir),
      windDirectionCompass: degreesToCompass(windDir),
      precipitationProbability: Math.round(hourly.precipitation_probability?.[i] ?? 0),
      cloudCoverPercent: Math.round(hourly.cloud_cover?.[i] ?? 0),
      isDay: Boolean(hourly.is_day?.[i]),
    });
  }

  return {
    latitude: data.latitude,
    longitude: data.longitude,
    timezone: data.timezone,
    sunrise: data.daily?.sunrise?.find((value: string) => value.startsWith(date)),
    sunset: data.daily?.sunset?.find((value: string) => value.startsWith(date)),
    hourly: points,
    daily: (data.daily?.time || []).map((day: string, index: number) => ({
      date: day,
      maxTempC: Math.round((data.daily.temperature_2m_max?.[index] ?? 0) * 10) / 10,
      minTempC: Math.round((data.daily.temperature_2m_min?.[index] ?? 0) * 10) / 10,
      rainChancePercent: Math.round(data.daily.precipitation_probability_max?.[index] ?? 0),
      maxWindKmh: Math.round(data.daily.wind_speed_10m_max?.[index] ?? 0),
      maxGustKmh: Math.round(data.daily.wind_gusts_10m_max?.[index] ?? 0),
      sunrise: data.daily.sunrise?.[index],
      sunset: data.daily.sunset?.[index],
    })),
  };
}

/**
 * Filter hourly points to 2-hour intervals (6am–6pm typical spray window).
 */
export function filterTo2Hourly(points: HourlyWeatherPoint[]): HourlyWeatherPoint[] {
  return points.filter((p) => {
    const hour = new Date(p.time).getHours();
    return hour % 2 === 0; // every 2 hours
  });
}

/**
 * Geocode a locality name to lat/lng using Open-Meteo geocoding API.
 */
export async function geocodeLocality(name: string): Promise<{ latitude: number; longitude: number; name: string } | null> {
  const res = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=5&language=en&format=json`
  );
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.results || data.results.length === 0) return null;
  const r = data.results[0];
  return { latitude: r.latitude, longitude: r.longitude, name: r.name };
}

/** Resolve device coordinates to a useful locality label without requiring an API key. */
export async function reverseGeocodeLocation(latitude: number, longitude: number): Promise<string> {
  const fallback = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`,
    );
    if (!res.ok) return fallback;
    const data = await res.json();
    const locality = data.locality || data.city || data.principalSubdivision;
    const region = data.principalSubdivision && data.principalSubdivision !== locality
      ? data.principalSubdivision
      : '';
    return [locality, region, data.countryName].filter(Boolean).join(', ') || fallback;
  } catch {
    return fallback;
  }
}
