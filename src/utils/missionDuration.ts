export interface MissionDurationParts {
  hours: number;
  minutes: number;
}

function safeWholeNumber(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function minutesToDurationParts(totalMinutes: number): MissionDurationParts {
  const total = safeWholeNumber(totalMinutes);
  return {
    hours: Math.floor(total / 60),
    minutes: total % 60,
  };
}

export function durationPartsToMinutes(hours: number, minutes: number): number {
  return safeWholeNumber(hours) * 60 + safeWholeNumber(minutes);
}
