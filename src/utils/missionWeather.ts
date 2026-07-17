import { HourlyWeatherPoint } from '../services/weatherService';
import { MissionWeatherSnapshot } from '../types/mission';

export function validateWeatherRequest(
  plannedDate: string,
  latitude: number | undefined,
  longitude: number | undefined,
  address: string,
): string | null {
  if (!plannedDate) return 'Choose a planned date before getting weather.';
  const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);
  if (!hasCoordinates && !address.trim()) return 'Add a site address or map location before getting weather.';
  return null;
}

export function selectWeatherWindow(
  hourly: HourlyWeatherPoint[],
  plannedStart: string,
  durationMinutes: number,
  timezone: string,
): MissionWeatherSnapshot {
  if (hourly.length === 0) throw new Error('No weather data is available for the planned date.');
  const startMs = new Date(plannedStart).getTime();
  const selected = hourly.reduce((nearest, candidate) => (
    Math.abs(new Date(candidate.time).getTime() - startMs) < Math.abs(new Date(nearest.time).getTime() - startMs)
      ? candidate
      : nearest
  ));

  return {
    source: 'Open-Meteo',
    fetchedAt: new Date().toISOString(),
    forecastDate: plannedStart.slice(0, 10),
    plannedStart,
    durationMinutes,
    timezone,
    temperatureC: selected.tempC,
    humidityPercent: selected.humidity,
    windSpeedKmh: selected.windSpeedKmh,
    windGustKmh: selected.windGustsKmh,
    windDirection: selected.windDirectionCompass,
  };
}
