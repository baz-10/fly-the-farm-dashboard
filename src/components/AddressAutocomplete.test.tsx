import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AddressAutocomplete from './AddressAutocomplete';

jest.mock('./AddressLocationMap', () => (props: any) => <button onClick={() => props.onLocationChange(-27.5002, 153.1003)}>Move pin</button>);
jest.mock('react-leaflet', () => ({ MapContainer: ({ children }: any) => <div>{children}</div>, TileLayer: () => null, Marker: () => null, useMap: () => ({ setView: jest.fn() }) }));
jest.mock('leaflet', () => ({ __esModule: true, default: { Icon: { Default: { prototype: {}, mergeOptions: jest.fn() } } } }));

const apiResult = { label: '1 Queen Street, Brisbane City, Queensland, Australia', address: '1 Queen Street', locality: 'Brisbane City', state: 'QLD', postcode: '4000', lat: -27.4698, lng: 153.0251, type: 'commercial' };

describe('AddressAutocomplete', () => {
  const originalFetch = global.fetch;
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => { jest.useRealTimers(); global.fetch = originalFetch; jest.restoreAllMocks(); });

  test('uses the trusted same-origin API and emits the selected structured address', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ results: [apiResult] }) })) as any;
    const onSelect = jest.fn(), onInputChange = jest.fn();
    render(<AddressAutocomplete onSelect={onSelect} onInputChange={onInputChange} showMap={false} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Search Address' }), { target: { value: '1 Queen Street' } });
    await act(async () => { jest.advanceTimersByTime(350); });
    expect(screen.getByRole('listbox', { name: 'Address search results' })).toBeVisible();
    expect(String((global.fetch as jest.Mock).mock.calls[0][0])).toBe('/api/geocode?q=1+Queen+Street');
    await userEvent.setup({ advanceTimers: jest.advanceTimersByTime }).click(screen.getByText('1 Queen Street'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ address: '1 Queen Street', locality: 'Brisbane City', state: 'QLD', postcode: '4000', coordinateSource: 'GEOCODED' }));
    expect(onInputChange).toHaveBeenCalledWith('1 Queen Street');
  });

  test('uses the geocoded display label as the address for a town-level result', async () => {
    const town = { ...apiResult, label: 'Tara, Queensland, 4421, Australia', address: '', locality: 'Tara', postcode: '4421', lat: -27.27693, lng: 150.456956 };
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ results: [town] }) })) as any;
    const onSelect = jest.fn(); render(<AddressAutocomplete onSelect={onSelect} showMap={false} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Search Address' }), { target: { value: 'Tara, Queensland' } });
    await act(async () => { jest.advanceTimersByTime(350); });
    await userEvent.setup({ advanceTimers: jest.advanceTimersByTime }).click(await screen.findByRole('option', { name: /Tara/ }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ address: 'Tara, Queensland, 4421, Australia', locality: 'Tara', postcode: '4421' }));
  });

  test('does not search until at least three characters are entered', async () => {
    global.fetch = jest.fn() as any; render(<AddressAutocomplete onSelect={jest.fn()} showMap={false} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Search Address' }), { target: { value: '12' } });
    await act(async () => { jest.advanceTimersByTime(350); }); expect(global.fetch).not.toHaveBeenCalled();
  });

  test('marks a moved confirmed pin stale and allows reconfirmation', async () => {
    const onSelect = jest.fn(); render(<AddressAutocomplete onSelect={onSelect} initialValue="1 Queen Street" lat={-27.4698} lng={153.0251} coordinateSource="GEOCODED" locationConfirmedAt="2026-08-06T01:00:00.000Z" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Move pin' }));
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ lat: -27.5002, lng: 153.1003, coordinateSource: 'MANUALLY_ADJUSTED', locationConfirmedAt: undefined }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm location' }));
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ locationConfirmedAt: expect.any(String) }));
  });

  test('marks confirmed coordinates stale when address text changes', async () => {
    const onSelect = jest.fn(); render(<AddressAutocomplete onSelect={onSelect} initialValue="1 Queen Street" lat={-27.4698} lng={153.0251} coordinateSource="GEOCODED" locationConfirmedAt="2026-08-06T01:00:00.000Z" />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Search Address' }), { target: { value: '2 Queen Street' } });
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ address: '2 Queen Street', lat: -27.4698, lng: 153.0251, locationConfirmedAt: undefined }));
  });

  test('keeps manual text and explains when no match is found', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ results: [] }) })) as any;
    render(<AddressAutocomplete onSelect={jest.fn()} showMap={false} />);
    const input = screen.getByRole('textbox', { name: 'Search Address' }); fireEvent.change(input, { target: { value: 'Unnamed Farm Track' } });
    await act(async () => { jest.advanceTimersByTime(350); }); await waitFor(() => expect(screen.getByText(/No matches/i)).toBeInTheDocument());
    expect(input).toHaveValue('Unnamed Farm Track');
  });

  test('keeps manual text and displays a retry message when search fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    global.fetch = jest.fn(async () => ({ ok: false })) as any; render(<AddressAutocomplete onSelect={jest.fn()} showMap={false} />);
    const input = screen.getByRole('textbox', { name: 'Search Address' }); fireEvent.change(input, { target: { value: '1 Farm Road' } });
    await act(async () => { jest.advanceTimersByTime(350); }); await waitFor(() => expect(screen.getByText(/search is unavailable/i)).toBeInTheDocument());
    expect(input).toHaveValue('1 Farm Road');
  });

  test('supports a complete manual address without selecting a result', () => {
    const onSelect = jest.fn(); render(<AddressAutocomplete onSelect={onSelect} showMap={false} />);
    fireEvent.click(screen.getByRole('button', { name: /enter address manually/i }));
    fireEvent.change(screen.getByLabelText(/street number and road/i), { target: { value: '304A Glasshouse Mountains Road' } });
    fireEvent.change(screen.getByLabelText(/town.*region/i), { target: { value: 'Beerburrum' } });
    fireEvent.mouseDown(screen.getByRole('combobox', { name: /^state/i })); fireEvent.click(screen.getByRole('option', { name: 'QLD' }));
    fireEvent.change(screen.getByLabelText(/postcode/i), { target: { value: '4517' } });
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ address: '304A Glasshouse Mountains Road', locality: 'Beerburrum', state: 'QLD', postcode: '4517' }));
  });

  test('places a manual rural address on the map without replacing typed detail', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ results: [{ ...apiResult, lat: -26.96, lng: 152.96 }] }) })) as any;
    const onSelect = jest.fn(); render(<AddressAutocomplete onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /enter address manually/i }));
    fireEvent.change(screen.getByLabelText(/street number and road/i), { target: { value: '304A Glasshouse Mountains Road' } });
    fireEvent.change(screen.getByLabelText(/town.*region/i), { target: { value: 'Beerburrum' } });
    fireEvent.mouseDown(screen.getByRole('combobox', { name: /^state/i })); fireEvent.click(screen.getByRole('option', { name: 'QLD' }));
    fireEvent.change(screen.getByLabelText(/postcode/i), { target: { value: '4517' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /show address on map/i })); });
    expect(await screen.findByRole('button', { name: 'Move pin' })).toBeInTheDocument();
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ address: '304A Glasshouse Mountains Road', locality: 'Beerburrum', lat: -26.96, lng: 152.96, coordinateSource: 'GEOCODED' }));
  });
});
