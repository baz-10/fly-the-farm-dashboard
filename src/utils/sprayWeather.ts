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

export function assessInversionPotential(input: InversionInput): InversionAssessment {
  const time = new Date(input.time).getTime();
  const sunrise = new Date(input.sunrise).getTime();
  const sunset = new Date(input.sunset).getTime();
  const nearNight = time >= sunset - 2 * 3600000 || time <= sunrise + 2 * 3600000;
  const reasons: string[] = [];
  let score = 0;

  if (nearNight) { score += 2; reasons.push('Within the evening or early-morning inversion window'); }
  if (input.windSpeedKmh < 11) { score += 2; reasons.push('Wind below 11 km/h'); }
  if (input.windSpeedKmh < 6) score += 1;
  if ((input.cloudCoverPercent ?? 100) < 30) { score += 1; reasons.push('Clear sky supports surface cooling'); }
  if ((input.humidityPercent ?? 0) >= 90) { score += 1; reasons.push('High humidity may indicate mist, dew, or fog'); }
  if ((input.temperatureTrendC ?? 0) < -0.5) { score += 1; reasons.push('Near-surface temperature is falling'); }

  if (score >= 6) return { rating: 'high', reasons, message: 'Do not spray—verify conditions on site for a hazardous surface temperature inversion.' };
  if (score >= 3) return { rating: 'moderate', reasons, message: 'Conditions may support an inversion—verify on site before spraying.' };
  return { rating: 'low', reasons, message: 'Low forecast potential—an on-site check is still required.' };
}
