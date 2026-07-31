import { describe, expect, test } from 'vitest';

import {
  boundaryFromGeoJson,
  calculateBoundaryAreaHectares,
  parseKmlBoundary,
  parseRailwayCorridorKml,
  toClosedGeoJsonRing,
} from '../boundaryImport';

describe('boundary imports', () => {
  test('closes GeoJSON rings without duplicating an existing closing point', () => {
    expect(toClosedGeoJsonRing([[-27, 153], [-27, 154], [-28, 154]])).toEqual([
      [153, -27], [154, -27], [154, -28], [153, -27],
    ]);
    expect(toClosedGeoJsonRing([[-27, 153], [-27, 154], [-27, 153]])).toHaveLength(3);
  });

  test('uses the KML outer boundary instead of flattening the inner hole', () => {
    const kml = `<?xml version="1.0"?>
      <kml xmlns="http://www.opengis.net/kml/2.2"><Placemark><Polygon>
        <outerBoundaryIs><LinearRing><coordinates>
          153.0000,-27.0000 153.0085,-27.0000 153.0085,-27.0075 153.0000,-27.0075 153.0000,-27.0000
        </coordinates></LinearRing></outerBoundaryIs>
        <innerBoundaryIs><LinearRing><coordinates>
          153.0020,-27.0020 153.0030,-27.0020 153.0030,-27.0030 153.0020,-27.0030 153.0020,-27.0020
        </coordinates></LinearRing></innerBoundaryIs>
      </Polygon></Placemark></kml>`;

    const result = parseKmlBoundary(kml);

    expect(result.coords).toHaveLength(4);
    expect(result.areaHa).toBeGreaterThan(60);
    expect(result.areaHa).toBeLessThan(80);
    expect(result.polygonCount).toBe(1);
  });

  test('imports and totals every KML polygon', () => {
    const kml = `<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
      <Placemark><Polygon><outerBoundaryIs><LinearRing><coordinates>
        153,-27 153.01,-27 153.01,-27.01 153,-27.01 153,-27
      </coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
      <Placemark><Polygon><outerBoundaryIs><LinearRing><coordinates>
        153,-27 153.001,-27 153.001,-27.001 153,-27.001 153,-27
      </coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
    </Document></kml>`;

    const result = parseKmlBoundary(kml);

    expect(result.polygonCount).toBe(2);
    expect(result.polygons).toHaveLength(2);
    expect(result.areaHa).toBeGreaterThan(100);
  });

  test('directs line-only KML to the explicit railway corridor importer', () => {
    const kml = `<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
      <Placemark><LineString><coordinates>
        151.2668,-27.8748,0 151.2672,-27.8749,0 151.2676,-27.8750,0
      </coordinates></LineString></Placemark>
    </Document></kml>`;

    expect(() => parseKmlBoundary(kml)).toThrow(
      'This KML contains linework but no closed boundary polygon. Use Railway corridor to create a buffered spray boundary.'
    );
  });

  test('buffers railway centre lines by the configured distance on each side', () => {
    const kml = `<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
      <Placemark><MultiGeometry><LineString><coordinates>
        151.0000,-27.0000,0 151.0100,-27.0000,0
      </coordinates></LineString></MultiGeometry></Placemark>
    </Document></kml>`;

    const result = parseRailwayCorridorKml(kml, 3.5);

    expect(result.polygonCount).toBeGreaterThan(0);
    expect(result.polygons[0].length).toBeGreaterThan(3);
    expect(result.areaHa).toBeGreaterThan(0.65);
    expect(result.areaHa).toBeLessThan(0.8);
    expect(result.warning).toContain('3.5 m each side');
  });

  test('validates railway buffers and requires linework', () => {
    const lineKml = `<kml><Placemark><LineString><coordinates>
      151,-27 151.001,-27
    </coordinates></LineString></Placemark></kml>`;
    const polygonKml = `<kml><Placemark><Polygon><outerBoundaryIs><LinearRing><coordinates>
      151,-27 151.001,-27 151.001,-27.001 151,-27
    </coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></kml>`;

    expect(() => parseRailwayCorridorKml(lineKml, 0)).toThrow(
      'Buffer each side must be greater than 0 m and no more than 100 m.'
    );
    expect(() => parseRailwayCorridorKml(lineKml, 101)).toThrow(
      'Buffer each side must be greater than 0 m and no more than 100 m.'
    );
    expect(() => parseRailwayCorridorKml(polygonKml, 3.5)).toThrow(
      'This file contains a polygon but no railway centre line. Use Boundary file instead.'
    );
  });

  test('does not double-count duplicate railway line segments', () => {
    const single = `<kml><Placemark><LineString><coordinates>
      151,-27 151.01,-27
    </coordinates></LineString></Placemark></kml>`;
    const duplicate = `<kml><Document>
      <Placemark><LineString><coordinates>151,-27 151.01,-27</coordinates></LineString></Placemark>
      <Placemark><LineString><coordinates>151,-27 151.01,-27</coordinates></LineString></Placemark>
    </Document></kml>`;

    const singleResult = parseRailwayCorridorKml(single, 3.5);
    const duplicateResult = parseRailwayCorridorKml(duplicate, 3.5);

    expect(duplicateResult.areaHa).toBeCloseTo(singleResult.areaHa, 6);
  });

  test('extracts every polygon from shapefile GeoJSON output', () => {
    const result = boundaryFromGeoJson({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Polygon', coordinates: [[[153, -27], [153.002, -27], [153.002, -27.002], [153, -27.002], [153, -27]]] },
        },
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'MultiPolygon', coordinates: [[[[153, -27], [153.01, -27], [153.01, -27.01], [153, -27.01], [153, -27]]]] },
        },
      ],
    });

    expect(result.polygonCount).toBe(2);
    expect(result.polygons).toHaveLength(2);
    expect(result.coords).toHaveLength(4);
    expect(result.areaHa).toBeGreaterThan(100);
  });

  test('calculates zero for an incomplete boundary', () => {
    expect(calculateBoundaryAreaHectares([[-27, 153], [-27, 153.01]])).toBe(0);
  });
});
