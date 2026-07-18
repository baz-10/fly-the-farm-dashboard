import { HourlyWeatherPoint } from '../services/weatherService';

export interface WeatherLocation { name: string; latitude: number; longitude: number; }
export interface WeatherPreferences { selected?: WeatherLocation; recent: WeatherLocation[]; }
export interface CachedOperationalForecast {
  location: WeatherLocation;
  fetchedAt: string;
  timezone: string;
  sunrise?: string;
  sunset?: string;
  hourly: HourlyWeatherPoint[];
}

