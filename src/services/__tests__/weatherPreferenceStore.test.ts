import { beforeEach, describe, expect, test } from 'vitest';

import { cacheForecast, getCachedForecast, readWeatherPreferences, saveWeatherPreferences } from '../weatherPreferenceStore';
import { WeatherLocation } from '../../types/weather';

const brisbane: WeatherLocation = { name: 'Brisbane', latitude: -27.4698, longitude: 153.0251 };

describe('weather preference store', () => {
  beforeEach(() => localStorage.clear());

  test('keeps selected and recent locations scoped to the user', () => {
    saveWeatherPreferences('one', { selected: brisbane, recent: [brisbane] });
    expect(readWeatherPreferences('one').selected).toEqual(brisbane);
    expect(readWeatherPreferences('two')).toEqual({ recent: [] });
  });

  test('limits recent locations to five unique entries', () => {
    const recent = Array.from({ length: 7 }, (_, index) => ({ name: `Place ${index}`, latitude: index, longitude: index }));
    saveWeatherPreferences('one', { selected: recent[0], recent });
    expect(readWeatherPreferences('one').recent).toHaveLength(5);
  });

  test('uses rounded coordinates and expiry for forecast cache', () => {
    const fetchedAt = '2026-07-18T10:00:00.000Z';
    cacheForecast({ location: brisbane, fetchedAt, timezone: 'Australia/Brisbane', hourly: [], daily: [] });
    expect(getCachedForecast({ ...brisbane, latitude: -27.4701 }, new Date('2026-07-18T10:20:00.000Z'))?.fetchedAt).toBe(fetchedAt);
    expect(getCachedForecast(brisbane, new Date('2026-07-18T11:01:00.000Z'))).toBeNull();
  });
});
