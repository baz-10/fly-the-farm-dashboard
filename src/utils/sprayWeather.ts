export type DeltaTBand = 'preferred' | 'marginal' | 'unsuitable';
export type InversionPotential = 'low' | 'moderate' | 'high';

export interface InversionInput {
  time: string;
  sunrise: string;
  sunset: string;
  windSpeedKmh: number;
  cloudCoverPercent?: number;
  humidityPercent?: number;
  temperatureTrendC?: number;
}

export interface InversionAssessment {
  rating: InversionPotential;
  reasons: string[];
  message: string;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Stull (2011) approximation, valid for ordinary near-surface operational weather. */
export function calculateWetBulbC(tempC: number, humidityPercent: number): number {
  const rh = clamp(humidityPercent, 0, 100);
  const wetBulb = tempC * Math.atan(0.151977 * Math.sqrt(rh + 8.313659))
    + Math.atan(tempC + rh)
    - Math.atan(rh - 1.676331)
    + 0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh)
    - 4.686035;
  return Math.round(wetBulb * 10) / 10;
}

export function calculateDeltaT(tempC: number, humidityPercent: number): number {
  return Math.round((tempC - calculateWetBulbC(tempC, humidityPercent)) * 10) / 10;
}

export function classifyDeltaT(deltaT: number): DeltaTBand {
  if (deltaT >= 2 && deltaT <= 8) return 'preferred';
  if (deltaT <= 10) return 'marginal';
  return 'unsuitable';
}

export function selectCurrentHourlyPoint<T extends { time: string }>(points: T[], now = new Date(), timezone?: string): T | undefined {
  if (points.length === 0) return undefined;
  const localNow = timezone ? new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).reduce<Record<string, string>>((parts, part) => ({ ...parts, [part.type]: part.value }), {}) : null;
  const target = localNow ? Date.UTC(Number(localNow.year), Number(localNow.month) - 1, Number(localNow.day), Number(localNow.hour), Number(localNow.minute)) : now.getTime();
  const comparable = (value: string) => timezone ? Date.parse(`${value}Z`) : new Date(value).getTime();
  return points.reduce((nearest, point) => Math.abs(comparable(point.time) - target) < Math.abs(comparable(nearest.time) - target) ? point : nearest);
}

function clockMinutes(value: string): number {
  const match = value.match(/T(\d{2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : new Date(value).getHours() * 60 + new Date(value).getMinutes();
}

export function assessInversionPotential(input: InversionInput): InversionAssessment {
  const time = clockMinutes(input.time);
  const sunrise = clockMinutes(input.sunrise);
  const sunset = clockMinutes(input.sunset);
  const nearNight = time >= sunset - 120 || time <= sunrise + 120;
  const reasons: string[] = [];
  let score = 0;

  if (nearNight) { score += 2; reasons.push('Within the evening or early-morning inversion window'); }
  if (input.windSpeedKmh < 11) { score += 2; reasons.push('Wind below 11 km/h'); }
  if (input.windSpeedKmh < 6) score += 1;
  if ((input.cloudCoverPercent ?? 100) < 30) { score += 1; reasons.push('Clear sky supports surface cooling'); }
  if ((input.humidityPercent ?? 0) >= 90) { score += 1; reasons.push('High humidity may indicate mist, dew, or fog'); }
  if ((input.temperatureTrendC ?? 0) < -0.5) { score += 1; reasons.push('Near-surface temperature is falling'); }

  if (score >= 6 && nearNight) return { rating: 'high', reasons, message: 'Do not spray—verify conditions on site for a hazardous surface temperature inversion.' };
  if (score >= 3) return { rating: 'moderate', reasons, message: 'Conditions may support an inversion—verify on site before spraying.' };
  return { rating: 'low', reasons, message: 'Low forecast potential—an on-site check is still required.' };
}
