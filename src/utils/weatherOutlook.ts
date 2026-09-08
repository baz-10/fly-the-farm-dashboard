export function selectRollingTwoHourly<T extends { time: string }>(points: T[], from: string): T[] {
  const start = Date.parse(from);
  if (!Number.isFinite(start)) return [];
  const end = start + 24 * 60 * 60 * 1000;
  const eligible = points.filter(point => { const at=Date.parse(point.time); return at >= start && at <= end; });
  if (eligible.length < 2) return eligible;
  const selected: T[] = [];
  let next = Date.parse(eligible[0].time);
  for (const point of eligible) { const at=Date.parse(point.time); if (at >= next) { selected.push(point); next = at + 2 * 60 * 60 * 1000; } }
  return selected;
}

export const weatherLocationKey = (location: { latitude: number; longitude: number }) =>
  `${Number(location.latitude).toFixed(5)},${Number(location.longitude).toFixed(5)}`;
