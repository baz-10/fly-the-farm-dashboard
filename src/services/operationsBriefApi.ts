export interface BriefAction { label: string; route: string; primary?: boolean; secondary?: boolean }
export interface WeatherLocation { label: string; locality?: string; state?: string; postcode?: string; latitude: number; longitude: number }
export interface BriefAlert { title: string; reason: string; route: string; blocking: boolean }
export interface BriefWeather {
  state: 'READY' | 'LOCATION_REQUIRED' | 'UNAVAILABLE';
  message?: string;
  current?: any;
  hourly?: any[];
  daily?: any[];
  bestSprayWindow?: { start: string; end: string } | null;
  retrievedAt?: string;
  resolvedLocation?: WeatherLocation | null;
  sourceLabel?: string;
  locationSource?: 'OPERATING_LOCATION' | 'DEVICE' | 'SEARCH';
  recentSearches?: WeatherLocation[];
  favouriteWeatherLocations?: WeatherLocation[];
}
export interface OperationsBrief {
  location: { id: string; name: string; address?: string } | null;
  locations: Array<{ id: string; name: string }>;
  weather: BriefWeather;
  schedule: any[];
  quickActions: BriefAction[];
  nextActions: any[];
  alerts: BriefAlert[];
  recentWeatherSearches?: WeatherLocation[];
  favouriteWeatherLocations?: WeatherLocation[];
}

async function request<T>(fetcher: typeof fetch, action = '', init: RequestInit = {}) {
  const response = await fetcher(`/api/v1/operations-brief${action ? `?action=${action}` : ''}`, { credentials: 'same-origin', headers: init.body ? { 'Content-Type': 'application/json' } : undefined, ...init });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || 'Operations Brief could not be loaded.');
  return payload.data as T;
}

export const createOperationsBriefApi = (fetcher: typeof fetch = fetch) => ({
  read: () => request<OperationsBrief>(fetcher),
  selectLocation: (operatingLocationId: string) => request<{ location: { id: string; name: string } }>(fetcher, 'select-location', { method: 'POST', body: JSON.stringify({ operatingLocationId }) }),
  deviceWeather: (latitude: number, longitude: number) => request<BriefWeather>(fetcher, 'device-weather', { method: 'POST', body: JSON.stringify({ latitude, longitude }) }),
  searchWeather: (query: string) => request<{ results: WeatherLocation[] }>(fetcher, 'search-weather', { method: 'POST', body: JSON.stringify({ query }) }),
  searchedWeather: (location: WeatherLocation) => request<BriefWeather>(fetcher, 'searched-weather', { method: 'POST', body: JSON.stringify({ location }) }),
  favouriteWeather: (location: WeatherLocation) => request<{ favouriteWeatherLocations: WeatherLocation[] }>(fetcher, 'favourite-weather', { method: 'POST', body: JSON.stringify({ location }) }),
  unfavouriteWeather: (location: WeatherLocation) => request<{ favouriteWeatherLocations: WeatherLocation[] }>(fetcher, 'unfavourite-weather', { method: 'POST', body: JSON.stringify({ location }) }),
});
