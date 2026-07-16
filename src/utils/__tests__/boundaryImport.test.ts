import {
  boundaryFromGeoJson,
  calculateBoundaryAreaHectares,
  parseKmlBoundary,
} from '../boundaryImport';

describe('boundary imports', () => {
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
