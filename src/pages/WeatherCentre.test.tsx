import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WeatherCentre from './WeatherCentre';

class ResizeObserverMock { observe(){} unobserve(){} disconnect(){} }
(global as any).ResizeObserver=ResizeObserverMock;

var mockRead = jest.fn(), mockSearchWeather = jest.fn(), mockSearchedWeather = jest.fn(), mockFavouriteWeather = jest.fn(), mockUnfavouriteWeather = jest.fn();
jest.mock('../services/operationsBriefApi', () => ({ createOperationsBriefApi: () => ({ read: (...args: any[]) => mockRead(...args), searchWeather: (...args: any[]) => mockSearchWeather(...args), searchedWeather: (...args: any[]) => mockSearchedWeather(...args), favouriteWeather:(...args:any[])=>mockFavouriteWeather(...args), unfavouriteWeather:(...args:any[])=>mockUnfavouriteWeather(...args) }) }));

beforeEach(() => mockRead.mockResolvedValue({
  location: { id: 'loc-1', name: 'Fly The Farm Base' },
  locations: [{ id: 'loc-1', name: 'Fly The Farm Base' }],
  recentWeatherSearches: [{ label: 'Dalby, QLD 4405', latitude: -27.18, longitude: 151.26 }], favouriteWeatherLocations: [],
  weather: {
    state: 'READY',
    timezone: 'Australia/Brisbane', retrievedAt: '2026-08-05T00:55:00.000Z',
    resolvedLocation: { label: 'Molendinar, QLD 4214', latitude: -27.97, longitude: 153.36 },
    sourceLabel: 'Fly The Farm Base',
    current: { temperatureC: 24, windSpeedKmh: 11, windGustKmh: 18, rainProbability: 10, deltaTC: 5.2, inversionPotential:{rating:'high',score:2,label:'High',factors:['Light wind','Clear night']}, sprayCondition: { status: 'GO', label: 'Good' } },
    hourly: Array.from({length:25},(_,index)=>({ time: `2026-08-${index<15?'05':'06'}T${String((9+index)%24).padStart(2,'0')}:00`, temperatureC:24, windSpeedKmh:11+index, windGustKmh:18+index, windDirection:['N','NE','E','SE'][index%4], rainProbability:10, deltaTC:5.2, inversionPotential:{rating:index<4?'high':index<8?'moderate':'low',score:index<4?2:index<8?1:0,label:index<4?'High':index<8?'Medium':'Low',factors:index===0?['Light wind','Clear night']:[]}, sprayCondition:{status:'GO',label:'Good'} })),
    daily: Array.from({length:14},(_,index)=>({ date: `2026-08-${String(5+index).padStart(2,'0')}`, condition:index===1?'Rain':'Partly cloudy', minTemperatureC: 12+index, maxTemperatureC: 27+index, rainProbability:index===1?75:10, rainAmountMm:index===1?4.2:0, rainDurationHours:index===1?3:0, windSpeedKmh:16, windGustKmh:24, windDirection:'E', confidence:index<7?'STANDARD':'EXTENDED', rainWindow:index===1?{certainty:'LIKELY',start:'2026-08-06T14:00',end:'2026-08-06T17:00',peakProbability:75,expectedAmountMm:4.2}:null, bestSprayWindow:index===1?{start:'2026-08-06T06:00',end:'2026-08-06T12:00',status:'GO'}:null })),
    bestSprayWindow: { start: '2026-08-05T09:00', end: '2026-08-05T11:00' },
  },
}));

test('explains advisory weather and presents current, hourly and seven-day views', async () => {
  render(<WeatherCentre />);
  expect(await screen.findByText('Weather Centre')).toBeInTheDocument();
  expect(screen.getByText(/decision support only/i)).toBeInTheDocument();
  expect(screen.getByText('Current conditions')).toBeInTheDocument();
  expect(screen.getByText('Next 24 hours')).toBeInTheDocument();
  expect(screen.getByText('Wind and inversion outlook')).toBeInTheDocument();
  expect(screen.getByText(/Two-hour view from now/i)).toBeInTheDocument();
  expect(screen.getByText('Wind (km/h)')).toBeInTheDocument();
  expect(screen.getAllByText(/Forecast inversion potential:/).length).toBeGreaterThan(0);
  expect(screen.getByText(/Times shown in provider local time/)).toBeInTheDocument();
  expect(screen.getByText(/Australia\/Brisbane/)).toBeInTheDocument();
  expect(screen.getAllByText(/Factors: Light wind, Clear night/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/Next.*09:00/).length).toBeGreaterThanOrEqual(2);
  expect(screen.getAllByText('High').length).toBeGreaterThan(0);
  expect(screen.getByText('14 day spray-planning outlook')).toBeInTheDocument();
  expect(screen.getByText(/Rain likely 14:00–17:00/i)).toBeInTheDocument();
  expect(screen.getByText(/Potential spray window 06:00–12:00/i)).toBeInTheDocument();
  expect(screen.getByText(/Extended outlook/i)).toBeInTheDocument();
  expect(screen.getByText(/09:00.*11:00/)).toBeInTheDocument();
  expect(screen.getByText('Molendinar, QLD 4214')).toBeInTheDocument();
});

test('lets the signed-in user save the current searched location as a favourite',async()=>{
 const user=userEvent.setup(),location={label:'Toowoomba, QLD 4350',latitude:-27.56,longitude:151.95};
 mockSearchWeather.mockResolvedValue({results:[location]});mockSearchedWeather.mockResolvedValue({state:'READY',locationSource:'SEARCH',resolvedLocation:location,sourceLabel:'Searched location',recentSearches:[location],favouriteWeatherLocations:[],current:{temperatureC:21,windSpeedKmh:9,windGustKmh:14,rainProbability:5,deltaTC:4,sprayCondition:{status:'GO',label:'Good'}},hourly:[],daily:[]});mockFavouriteWeather.mockResolvedValue({favouriteWeatherLocations:[location]});
 render(<WeatherCentre/>);await screen.findByText('Weather Centre');await user.type(screen.getByRole('textbox',{name:'Search weather location'}),'Toowoomba');await user.click(screen.getByRole('button',{name:'Search locations'}));await user.click(await screen.findByRole('button',{name:/Toowoomba, QLD 4350/}));await user.click(await screen.findByRole('button',{name:/Add Toowoomba.*to favourites/i}));
 expect(mockFavouriteWeather).toHaveBeenCalledWith(location);expect(await screen.findByText('Favourite locations')).toBeInTheDocument();
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
