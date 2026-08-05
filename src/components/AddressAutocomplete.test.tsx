import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AddressAutocomplete from './AddressAutocomplete';

jest.mock('react-leaflet', () => ({
  MapContainer: ({ children }: any) => <div>{children}</div>,
  TileLayer: () => null,
  Marker: () => null,
  useMap: () => ({ setView: jest.fn() }),
}));
jest.mock('leaflet', () => ({
  __esModule: true,
  default: { Icon: { Default: { prototype: {}, mergeOptions: jest.fn() } } },
}));

const apiResult = {
  label: '1 Queen Street, Brisbane City, Queensland, Australia',
  address: '1 Queen Street',
  locality: 'Brisbane City',
  state: 'QLD',
  postcode: '4000',
  lat: -27.4698,
  lng: 153.0251,
  type: 'commercial',
};
const selectedResult = {
  address: apiResult.address, locality: apiResult.locality, state: apiResult.state,
  postcode: apiResult.postcode, lat: apiResult.lat, lng: apiResult.lng,
  displayName: apiResult.label, type: apiResult.type,
  coordinateSource: 'GEOCODED', locationConfirmedAt: undefined,
};

describe('AddressAutocomplete', () => {
  const originalFetch = global.fetch;

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test('uses the trusted same-origin API and emits the selected structured address', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ results: [apiResult] }) })) as any;
    const onSelect = jest.fn();
    const onInputChange = jest.fn();
    render(<AddressAutocomplete onSelect={onSelect} onInputChange={onInputChange} showMap={false} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Search Address' }), { target: { value: '1 Queen Street' } });
    await act(async () => { jest.advanceTimersByTime(350); });

    await screen.findByText('1 Queen Street');
    const url = String((global.fetch as jest.Mock).mock.calls[0][0]);
    expect(url).toBe('/api/geocode?q=1+Queen+Street');
    expect(url).not.toMatch(/photon|nominatim/i);
    await userEvent.setup({ advanceTimers: jest.advanceTimersByTime }).click(screen.getByText('1 Queen Street'));
    expect(onSelect).toHaveBeenCalledWith(selectedResult);
    expect(onInputChange).toHaveBeenCalledWith('1 Queen Street');
  });

  test('does not search until at least three characters are entered', async () => {
    global.fetch = jest.fn() as any;
    render(<AddressAutocomplete onSelect={jest.fn()} showMap={false} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Search Address' }), { target: { value: '12' } });
    await act(async () => { jest.advanceTimersByTime(350); });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('keeps manual text and explains when no matching address is found', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ results: [] }) })) as any;
    render(<AddressAutocomplete onSelect={jest.fn()} showMap={false} />);

    const input = screen.getByRole('textbox', { name: 'Search Address' });
    fireEvent.change(input, { target: { value: 'Unnamed Farm Track' } });
    await act(async () => { jest.advanceTimersByTime(350); });

    await waitFor(() => expect(screen.getByText(/No matches/i)).toBeInTheDocument());
    expect(input).toHaveValue('Unnamed Farm Track');
  });

  test('keeps manual text and displays a retry message when search fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    global.fetch = jest.fn(async () => ({ ok: false, status: 502, json: async () => ({ error: 'Unavailable' }) })) as any;
    render(<AddressAutocomplete onSelect={jest.fn()} showMap={false} />);

    const input = screen.getByRole('textbox', { name: 'Search Address' });
    fireEvent.change(input, { target: { value: '1 Farm Road' } });
    await act(async () => { jest.advanceTimersByTime(350); });

    await waitFor(() => expect(screen.getByText(/search is unavailable/i)).toBeInTheDocument());
    expect(input).toHaveValue('1 Farm Road');
  });
});
