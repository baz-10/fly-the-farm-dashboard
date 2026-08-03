type ForecastRecord = Record<string, any>;

export type PlanningForecastProjection = {
  revisionId: string;
  revisionVersion: number;
  provider: string;
  providerModel: string | null;
  issuedAt: string;
  validFrom: string;
  validTo: string;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  matchedAt: string | null;
  alignment: 'EXACT' | 'NEAREST' | 'OUTSIDE_VALID_PERIOD' | 'NO_INTERVAL';
  freshness: 'CURRENT' | 'STALE' | 'MISALIGNED';
  temperatureC: number | null;
  relativeHumidityPercent: number | null;
  deltaTC: number | null;
  windSpeedKmh: number | null;
  windGustKmh: number | null;
  windDirectionDegrees: number | null;
  precipitationProbabilityPercent: number | null;
  expectedPrecipitationMm: number | null;
  cloudCoverPercent: number | null;
};

const value = (record: ForecastRecord, ...keys: string[]) => keys
  .map((key) => record?.[key])
  .find((item) => item !== undefined && item !== null);

const finite = (item: unknown): number | null => {
  const numeric = Number(item);
  return Number.isFinite(numeric) ? numeric : null;
};

const at = (values: unknown, index: number): number | null => Array.isArray(values)
  ? finite(values[index])
  : null;

const offsetSuffix = (offsetSeconds: number) => {
  const sign = offsetSeconds < 0 ? '-' : '+';
  const absolute = Math.abs(offsetSeconds);
  const hours = String(Math.floor(absolute / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((absolute % 3600) / 60)).padStart(2, '0');
  return `${sign}${hours}:${minutes}`;
};

const providerTime = (raw: unknown, offsetSeconds: number): Date | null => {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const explicitZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const parsed = new Date(explicitZone ? raw : `${raw}${offsetSuffix(offsetSeconds)}`);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
};

const calculateDeltaT = (temperatureC: number | null, humidity: number | null): number | null => {
  if (temperatureC === null || humidity === null || humidity < 0 || humidity > 100) return null;
  const wetBulb = temperatureC * Math.atan(0.151977 * Math.sqrt(humidity + 8.313659))
    + Math.atan(temperatureC + humidity)
    - Math.atan(humidity - 1.676331)
    + 0.00391838 * Math.pow(humidity, 1.5) * Math.atan(0.023101 * humidity)
    - 4.686035;
  return Math.round((temperatureC - wetBulb) * 10) / 10;
};

export function projectSelectedPlanningForecast(
  forecasts: ForecastRecord[],
  scheduledStartAt: string | undefined,
  now = new Date(),
): PlanningForecastProjection | null {
  const selected = forecasts.find((record) => Boolean(value(record, 'selected')));
  if (!selected) return null;

  const snapshot = value(selected, 'provider_snapshot', 'providerSnapshot') || {};
  const hourly = snapshot.hourly || {};
  const offsetSeconds = Number(snapshot.utc_offset_seconds || 0);
  const missionTime = scheduledStartAt ? new Date(scheduledStartAt) : null;
  const validFrom = String(value(selected, 'valid_from', 'validFrom') || '');
  const validTo = String(value(selected, 'valid_to', 'validTo') || '');
  const validFromMs = Date.parse(validFrom);
  const validToMs = Date.parse(validTo);
  const missionMs = missionTime && Number.isFinite(missionTime.getTime()) ? missionTime.getTime() : NaN;
  const outsideValidPeriod = Number.isFinite(missionMs)
    && Number.isFinite(validFromMs)
    && Number.isFinite(validToMs)
    && (missionMs < validFromMs || missionMs > validToMs);

  const intervals = (Array.isArray(hourly.time) ? hourly.time : [])
    .map((raw: unknown, index: number) => ({ index, date: providerTime(raw, offsetSeconds) }))
    .filter((item: { index: number; date: Date | null }): item is { index: number; date: Date } => item.date !== null);
  const nearest = Number.isFinite(missionMs) && intervals.length
    ? intervals.reduce((best: { index: number; date: Date }, candidate: { index: number; date: Date }) => Math.abs(candidate.date.getTime() - missionMs) < Math.abs(best.date.getTime() - missionMs) ? candidate : best)
    : null;
  const index = nearest?.index ?? -1;
  const exact = Boolean(nearest && nearest.date.getTime() === missionMs);
  const alignment = outsideValidPeriod
    ? 'OUTSIDE_VALID_PERIOD'
    : nearest
      ? (exact ? 'EXACT' : 'NEAREST')
      : 'NO_INTERVAL';
  const stale = Number.isFinite(validToMs) && now.getTime() > validToMs;
  const freshness = outsideValidPeriod ? 'MISALIGNED' : stale ? 'STALE' : 'CURRENT';
  const temperatureC = at(hourly.temperature_2m, index);
  const relativeHumidityPercent = at(hourly.relative_humidity_2m, index);

  return {
    revisionId: String(value(selected, 'id') || ''),
    revisionVersion: Number(value(selected, 'version_number', 'versionNumber') || 0),
    provider: String(value(selected, 'provider') || 'UNKNOWN'),
    providerModel: value(selected, 'provider_model', 'providerModel') || null,
    issuedAt: String(value(selected, 'issued_at', 'issuedAt') || ''),
    validFrom,
    validTo,
    latitude: finite(value(selected, 'latitude')),
    longitude: finite(value(selected, 'longitude')),
    timezone: snapshot.timezone || null,
    matchedAt: nearest?.date.toISOString() || null,
    alignment,
    freshness,
    temperatureC,
    relativeHumidityPercent,
    deltaTC: calculateDeltaT(temperatureC, relativeHumidityPercent),
    windSpeedKmh: at(hourly.wind_speed_10m, index),
    windGustKmh: at(hourly.wind_gusts_10m, index),
    windDirectionDegrees: at(hourly.wind_direction_10m, index),
    precipitationProbabilityPercent: at(hourly.precipitation_probability, index),
    expectedPrecipitationMm: at(hourly.precipitation, index),
    cloudCoverPercent: at(hourly.cloud_cover, index),
  };
}
