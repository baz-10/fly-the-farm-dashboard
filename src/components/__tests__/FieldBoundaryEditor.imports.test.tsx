import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import FieldBoundaryEditor from '../FieldBoundaryEditor';

const { mockParseRailwayCorridorKml } = vi.hoisted(() => ({
  mockParseRailwayCorridorKml: vi.fn(),
}));

vi.mock('../../utils/boundaryImport', () => ({
  calculateBoundaryAreaHectares: vi.fn(() => 0),
  parseKmlBoundary: vi.fn(),
  parseKmzBoundary: vi.fn(),
  parseShapefileBoundary: vi.fn(),
  parseRailwayCorridorKml: mockParseRailwayCorridorKml,
  parseRailwayCorridorKmz: vi.fn(),
}));
vi.mock('leaflet/dist/leaflet.css', () => ({}));
vi.mock('leaflet', () => ({
  default: {
    Icon: {
      Default: {
        prototype: {},
        mergeOptions: vi.fn(),
      },
    },
    divIcon: vi.fn(() => ({})),
    latLngBounds: vi.fn(() => ({})),
  },
}));
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TileLayer: () => null,
  Polygon: () => null,
  Polyline: () => null,
  Marker: () => null,
  LayersControl: Object.assign(
    ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    { BaseLayer: ({ children }: { children: React.ReactNode }) => <>{children}</> }
  ),
  useMap: () => ({
    flyTo: vi.fn(),
    fitBounds: vi.fn(),
    setView: vi.fn(),
  }),
  useMapEvents: vi.fn(),
}));

function renderEditor() {
  const onCoordsChange = vi.fn();
  const onPolygonsChange = vi.fn();
  const onBoundaryMetadataChange = vi.fn();
  const onBoundaryFile = vi.fn();
  return render(
    <FieldBoundaryEditor
      coords={[]}
      onCoordsChange={onCoordsChange}
      onPolygonsChange={onPolygonsChange}
      onBoundaryMetadataChange={onBoundaryMetadataChange}
      onAreaChange={vi.fn()}
      onBoundaryFile={onBoundaryFile}
    />
  );
}

describe('FieldBoundaryEditor imports', () => {
  beforeEach(() => {
    mockParseRailwayCorridorKml.mockReset();
    mockParseRailwayCorridorKml.mockReturnValue({
      coords: [[-27, 151], [-27, 151.01], [-27.001, 151.01]],
      polygons: [[[-27, 151], [-27, 151.01], [-27.001, 151.01]]],
      areaHa: 0.7,
      polygonCount: 1,
      warning: 'Railway corridor created with 3.5 m each side (7 m total width).',
    });
  });

  test('separates normal boundary and railway corridor uploads with KMZ support', async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole('button', { name: /upload/i }));

    expect(screen.getByRole('button', { name: /boundary file/i })).toBeVisible();
    expect(screen.getByRole('button', { name: /railway corridor/i })).toBeVisible();
    const inputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
    expect(inputs).toHaveLength(2);
    expect(inputs[0].accept).toContain('.kmz');
    expect(inputs[1].accept).toBe('.kml,.kmz');
  });

  test('defaults the railway buffer to 3.5 m and allows an edited width', async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole('button', { name: /upload/i }));
    const inputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');

    await user.upload(inputs[1], new File([
      '<kml><Placemark><LineString><coordinates>151,-27 151.01,-27</coordinates></LineString></Placemark></kml>',
    ], 'railway centre.kml', { type: 'application/vnd.google-earth.kml+xml' }));

    expect(screen.getByRole('dialog', { name: /import railway corridor/i })).toBeVisible();
    const buffer = screen.getByLabelText('Buffer each side (m)');
    expect(buffer).toHaveValue(3.5);
    expect(screen.getByText('7 m total corridor width')).toBeVisible();

    await user.clear(buffer);
    await user.type(buffer, '4');
    expect(screen.getByText('8 m total corridor width')).toBeVisible();
    await user.click(screen.getByRole('button', { name: /create corridor boundary/i }));

    expect(mockParseRailwayCorridorKml).toHaveBeenCalledWith(expect.stringContaining('<LineString>'), 4);
  });
});
