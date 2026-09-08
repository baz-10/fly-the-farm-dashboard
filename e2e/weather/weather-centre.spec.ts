import { expect, Page, test } from '@playwright/test';

const userId = '33333333-3333-4333-8333-333333333333';
const organisationId = '44444444-4444-4444-8444-444444444444';
const searchedLocation = { label: 'Toowoomba, QLD 4350', latitude: -27.56, longitude: 151.95 };

const hours = Array.from({ length: 25 }, (_, index) => ({
  time: `2026-09-${index < 15 ? '08' : '09'}T${String((9 + index) % 24).padStart(2, '0')}:00`,
  temperatureC: 24,
  windSpeedKmh: 10 + index,
  windGustKmh: 16 + index,
  windDirection: ['N', 'NE', 'E', 'SE'][index % 4],
  rainProbability: 5,
  deltaTC: 4.2,
  isDay: index >= 0 && index < 9,
  inversionPotential: { rating: index < 4 ? 'high' : index < 8 ? 'moderate' : 'low', score: index < 4 ? 2 : index < 8 ? 1 : 0, label: index < 4 ? 'High' : index < 8 ? 'Medium' : 'Low' },
  sprayCondition: { status: 'GO', label: 'Good' },
}));

const weather = (location = { label: 'Fly The Farm Base', latitude: -27.97, longitude: 153.36 }, source = 'OPERATING_LOCATION') => ({
  state: 'READY', locationSource: source, resolvedLocation: location, sourceLabel: source === 'SEARCH' ? 'Searched location' : 'Fly The Farm Base',
  current: { temperatureC: 24, windSpeedKmh: 10, windGustKmh: 16, rainProbability: 5, deltaTC: 4.2, inversionPotential: { rating: 'high', score: 2, label: 'High' }, sprayCondition: { status: 'GO', label: 'Good' } },
  hourly: hours,
  daily: [{ date: '2026-09-08', minTemperatureC: 14, maxTemperatureC: 27, rainProbability: 5 }],
  bestSprayWindow: { start: '2026-09-08T09:00', end: '2026-09-08T11:00' },
});

async function installApi(page: Page) {
  let favourites: typeof searchedLocation[] = [];
  await page.route('**/api/v1/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) }));
  await page.route('**/api/store*', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**/api/auth', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { id: userId, email: 'operator@example.test', name: 'Operator', role: 'contractor', identityPlane: 'organisation', entitlements: [] } }) }));
  await page.route('**/api/v1/session', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { user: { id: userId, email: 'operator@example.test', name: 'Operator' }, organisation: { id: organisationId, name: 'Test Organisation' }, roles: ['organisation_admin'], permissions: ['*'], operatingLocationIds: [] } }) }));
  await page.route('**/api/v1/operations-brief*', async route => {
    const request = route.request();
    const action = new URL(request.url()).searchParams.get('action');
    if (action === 'search-weather') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { results: [searchedLocation] } }) });
    if (action === 'searched-weather') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { ...weather(searchedLocation, 'SEARCH'), recentSearches: [searchedLocation], favouriteWeatherLocations: favourites } }) });
    if (action === 'favourite-weather') {
      favourites = [searchedLocation];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { favouriteWeatherLocations: favourites } }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { location: { id: 'loc-1', name: 'Fly The Farm Base' }, locations: [{ id: 'loc-1', name: 'Fly The Farm Base' }], weather: weather(), schedule: [], quickActions: [], nextActions: [], alerts: [], recentWeatherSearches: [], favouriteWeatherLocations: favourites } }) });
  });
}

test('shows a rolling two-hour wind and inversion outlook while retaining written forecasts', async ({ page }) => {
  await installApi(page);
  await page.goto('/weather');
  await expect(page.getByRole('heading', { name: 'Weather Centre' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Wind and inversion outlook' })).toBeVisible();
  await expect(page.getByLabel('Two-hour wind and inversion outlook')).toBeVisible();
  await expect(page.getByText('Next 24 hours')).toBeVisible();
  await expect(page.getByText('7 day forecast')).toBeVisible();
  await expect(page.getByText(/Now.*09:00 N · High/).first()).toBeVisible();
  await expect(page.getByText('Wind (km/h)')).toBeVisible();
  await expect(page.getByText(/Forecast inversion potential:/)).toBeVisible();
  await expect(page.getByText(/Times shown in provider local time/)).toBeVisible();
});

test('lets the signed-in user keep a searched location as a personal favourite', async ({ page }) => {
  await installApi(page);
  await page.goto('/weather');
  await page.getByRole('textbox', { name: 'Search weather location' }).fill('Toowoomba');
  await page.getByRole('button', { name: 'Search locations' }).click();
  await page.getByRole('button', { name: searchedLocation.label }).click();
  await page.getByRole('button', { name: /Add Toowoomba.*to favourites/i }).click();
  await expect(page.getByText('Favourite locations')).toBeVisible();
  await expect(page.getByRole('button', { name: /Remove Toowoomba.*from favourites/i })).toBeVisible();
});
