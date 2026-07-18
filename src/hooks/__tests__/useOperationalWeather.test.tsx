import { act, renderHook, waitFor } from '@testing-library/react';
import { useOperationalWeather } from '../useOperationalWeather';
import * as weatherService from '../../services/weatherService';

jest.mock('../../services/weatherService');
const mockedWeather = weatherService as jest.Mocked<typeof weatherService>;

describe('useOperationalWeather', () => {
  beforeEach(() => { localStorage.clear(); jest.resetAllMocks(); });

  test('searches a location and exposes fresh weather', async () => {
    mockedWeather.geocodeLocality.mockResolvedValue({ name: 'Dalby', latitude: -27.18, longitude: 151.26 });
    mockedWeather.fetchWeatherForDate.mockResolvedValue({ latitude: -27.18, longitude: 151.26, timezone: 'Australia/Brisbane', hourly: [], daily: [] });
    const { result } = renderHook(() => useOperationalWeather('user-1'));

    await act(() => result.current.searchLocation('Dalby'));

    expect(result.current.location?.name).toBe('Dalby');
    expect(result.current.status).toBe('fresh');
  });

  test('retains the last successful forecast as stale when refresh fails', async () => {
    mockedWeather.geocodeLocality.mockResolvedValue({ name: 'Dalby', latitude: -27.18, longitude: 151.26 });
    mockedWeather.fetchWeatherForDate.mockResolvedValueOnce({ latitude: -27.18, longitude: 151.26, timezone: 'Australia/Brisbane', hourly: [], daily: [] }).mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useOperationalWeather('user-1'));
    await act(() => result.current.searchLocation('Dalby'));
    await act(() => result.current.refresh());
    await waitFor(() => expect(result.current.status).toBe('stale'));
    expect(result.current.forecast).not.toBeNull();
  });
});
