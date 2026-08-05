import React from 'react';
import { render, screen } from '@testing-library/react';
import WeatherCentre from './WeatherCentre';

var mockRead = jest.fn();
jest.mock('../services/operationsBriefApi', () => ({ createOperationsBriefApi: () => ({ read: (...args: any[]) => mockRead(...args) }) }));

beforeEach(() => mockRead.mockResolvedValue({
  location: { id: 'loc-1', name: 'Fly The Farm Base' },
  weather: {
    state: 'READY',
    current: { temperatureC: 24, windSpeedKmh: 11, windGustKmh: 18, rainProbability: 10, deltaTC: 5.2, sprayCondition: { status: 'GO', label: 'Good' } },
    hourly: [{ time: '2026-08-05T09:00', temperatureC: 24, windSpeedKmh: 11, windGustKmh: 18, rainProbability: 10, deltaTC: 5.2, sprayCondition: { status: 'GO', label: 'Good' } }],
    daily: [{ date: '2026-08-05', minTemperatureC: 12, maxTemperatureC: 27, rainProbability: 10 }],
    bestSprayWindow: { start: '2026-08-05T09:00', end: '2026-08-05T11:00' },
  },
}));

test('explains advisory weather and presents current, hourly and seven-day views', async () => {
  render(<WeatherCentre />);
  expect(await screen.findByText('Weather Centre')).toBeInTheDocument();
  expect(screen.getByText(/decision support only/i)).toBeInTheDocument();
  expect(screen.getByText('Current conditions')).toBeInTheDocument();
  expect(screen.getByText('Next 24 hours')).toBeInTheDocument();
  expect(screen.getByText('7 day forecast')).toBeInTheDocument();
  expect(screen.getByText(/09:00.*11:00/)).toBeInTheDocument();
});
