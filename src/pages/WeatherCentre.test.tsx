import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WeatherCentre from './WeatherCentre';

var mockRead = jest.fn(), mockSearchWeather = jest.fn(), mockSearchedWeather = jest.fn();
jest.mock('../services/operationsBriefApi', () => ({ createOperationsBriefApi: () => ({ read: (...args: any[]) => mockRead(...args), searchWeather: (...args: any[]) => mockSearchWeather(...args), searchedWeather: (...args: any[]) => mockSearchedWeather(...args) }) }));

beforeEach(() => mockRead.mockResolvedValue({
  location: { id: 'loc-1', name: 'Fly The Farm Base' },
  locations: [{ id: 'loc-1', name: 'Fly The Farm Base' }],
  recentWeatherSearches: [{ label: 'Dalby, QLD 4405', latitude: -27.18, longitude: 151.26 }],
  weather: {
    state: 'READY',
    resolvedLocation: { label: 'Molendinar, QLD 4214', latitude: -27.97, longitude: 153.36 },
    sourceLabel: 'Fly The Farm Base',
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
  expect(screen.getByText('Molendinar, QLD 4214')).toBeInTheDocument();
});

test('searches an advisory location without changing the Home operating location and exposes recent searches', async () => {
  const user=userEvent.setup();
  mockSearchWeather.mockResolvedValue({results:[{label:'Toowoomba, QLD 4350',latitude:-27.56,longitude:151.95}]});
  mockSearchedWeather.mockResolvedValue({state:'READY',locationSource:'SEARCH',resolvedLocation:{label:'Toowoomba, QLD 4350',latitude:-27.56,longitude:151.95},sourceLabel:'Searched location',recentSearches:[{label:'Toowoomba, QLD 4350',latitude:-27.56,longitude:151.95}],current:{temperatureC:21,windSpeedKmh:9,windGustKmh:14,rainProbability:5,deltaTC:4,sprayCondition:{status:'GO',label:'Good'}},hourly:[],daily:[]});
  render(<WeatherCentre/>);await screen.findByText('Weather Centre');
  expect(await screen.findByRole('button',{name:'Dalby, QLD 4405'})).toBeInTheDocument();
  await user.type(screen.getByRole('textbox',{name:'Search weather location'}),'Toowoomba');
  await user.click(screen.getByRole('button',{name:'Search locations'}));
  await user.click(await screen.findByRole('button',{name:/Toowoomba, QLD 4350/}));
  expect(mockSearchedWeather).toHaveBeenCalledWith(expect.objectContaining({label:'Toowoomba, QLD 4350'}));
  expect(await screen.findByText('Advisory search — Home and Mission defaults unchanged.')).toBeInTheDocument();
  expect(screen.getAllByText('Toowoomba, QLD 4350').length).toBeGreaterThan(0);
});
