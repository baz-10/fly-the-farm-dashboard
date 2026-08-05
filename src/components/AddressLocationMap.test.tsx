import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import AddressLocationMap from './AddressLocationMap';

let mapClick: ((event: any) => void) | undefined;
const mockSetView = jest.fn();
const mockMap = { setView: mockSetView };
jest.mock('react-leaflet', () => ({
  MapContainer: ({ children }: any) => <div data-testid="map">{children}</div>,
  TileLayer: ({ url }: any) => <div data-testid="tile-layer">{url}</div>,
  Marker: ({ eventHandlers }: any) => <button onClick={() => eventHandlers.dragend({ target: { getLatLng: () => ({ lat: -27.6, lng: 153.2 }) } })}>Drag pin</button>,
  useMap: () => mockMap,
  useMapEvents: (events: any) => { mapClick = events.click; return {}; },
}));

beforeEach(() => { window.localStorage.clear(); mapClick = undefined; mockSetView.mockClear(); });

test('switches Street, Satellite and Hybrid layers and remembers the preference', () => {
  render(<AddressLocationMap lat={-27.5} lng={153.1} height={264} onLocationChange={jest.fn()} />);
  expect(screen.getByRole('button', { name: 'Street map' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Satellite imagery' }));
  expect(window.localStorage.getItem('spray-command.map-layer')).toBe('SATELLITE');
  expect(screen.getByText(/World_Imagery/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Hybrid satellite with labels' }));
  expect(window.localStorage.getItem('spray-command.map-layer')).toBe('HYBRID');
  expect(screen.getAllByTestId('tile-layer')).toHaveLength(2);
});

test('reports draggable pin and map click coordinate adjustments', () => {
  const onLocationChange = jest.fn();
  render(<AddressLocationMap lat={-27.5} lng={153.1} height={264} onLocationChange={onLocationChange} />);
  fireEvent.click(screen.getByRole('button', { name: 'Drag pin' }));
  expect(onLocationChange).toHaveBeenCalledWith(-27.6, 153.2);
  mapClick?.({ latlng: { lat: -27.7, lng: 153.3 } });
  expect(onLocationChange).toHaveBeenCalledWith(-27.7, 153.3);
});

test('preserves the chosen viewport and layer when only the pin coordinates change', () => {
  const { rerender } = render(<AddressLocationMap lat={-27.5} lng={153.1} height={264} onLocationChange={jest.fn()} viewportResetKey={1} />);
  fireEvent.click(screen.getByRole('button', { name: 'Hybrid satellite with labels' }));
  const initialSetViewCalls = mockSetView.mock.calls.length;

  rerender(<AddressLocationMap lat={-27.6} lng={153.2} height={264} onLocationChange={jest.fn()} viewportResetKey={1} />);

  expect(mockSetView).toHaveBeenCalledTimes(initialSetViewCalls);
  expect(screen.getByRole('button', { name: 'Hybrid satellite with labels' })).toHaveAttribute('aria-pressed', 'true');
});

test('recentres only when a new address context explicitly changes the viewport key', () => {
  const { rerender } = render(<AddressLocationMap lat={-27.5} lng={153.1} height={264} onLocationChange={jest.fn()} viewportResetKey={1} />);
  const initialSetViewCalls = mockSetView.mock.calls.length;

  rerender(<AddressLocationMap lat={-28.0} lng={152.5} height={264} onLocationChange={jest.fn()} viewportResetKey={2} />);

  expect(mockSetView).toHaveBeenCalledTimes(initialSetViewCalls + 1);
  expect(mockSetView).toHaveBeenLastCalledWith([-28.0, 152.5], 14, { animate: true });
});
