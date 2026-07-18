import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Weather from './Weather';

const mockSearchLocation = jest.fn(); const mockUseDeviceLocation = jest.fn(); const mockRefresh = jest.fn();
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
jest.mock('../hooks/useOperationalWeather', () => ({ useOperationalWeather: () => ({
  location: { name: 'Dalby', latitude: -27.18, longitude: 151.26 }, status: 'fresh', error: '', recent: [], searchLocation: mockSearchLocation, useDeviceLocation: mockUseDeviceLocation, refresh: mockRefresh, selectRecent: jest.fn(),
  forecast: { fetchedAt: '2026-07-18T10:00:00Z', timezone: 'Australia/Brisbane', sunrise: '2026-07-18T06:30:00', sunset: '2026-07-18T17:15:00',
    hourly: [{ time: '2026-07-18T12:00:00', tempC: 30, humidity: 50, dewpointC: 18, deltaT: 7.7, windSpeedKmh: 12, windGustsKmh: 18, windDirectionDeg: 90, windDirectionCompass: 'E', precipitationProbability: 20, cloudCoverPercent: 15, isDay: true }],
    daily: [{ date: '2026-07-18', maxTempC: 31, minTempC: 18, rainChancePercent: 25, maxWindKmh: 20, maxGustKmh: 28 }],
  },
}) }));

describe('Weather page', () => {
  test('shows spray indicators and forecast detail and supports location actions', async () => {
    const user = userEvent.setup(); render(<Weather />);
    expect(screen.getByRole('heading', { name: 'Weather' })).toBeInTheDocument();
    expect(screen.getByText(/Delta T 7.7/)).toBeInTheDocument();
    expect(screen.getByText(/forecast inversion potential/i)).toBeInTheDocument();
    expect(screen.getByText('Hourly forecast')).toBeInTheDocument();
    expect(screen.getByText('Seven-day forecast')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Search location'), 'Toowoomba');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(mockSearchLocation).toHaveBeenCalledWith('Toowoomba');
    await user.click(screen.getByRole('button', { name: 'Use my location' }));
    expect(mockUseDeviceLocation).toHaveBeenCalled();
  });
});
