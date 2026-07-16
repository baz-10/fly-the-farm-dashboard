import turfArea from '@turf/area';
import { polygon } from '@turf/helpers';
import { LatLng } from '../types/fieldManagement';

type Position = number[];

interface GeoJsonGeometry {
  type: string;
  coordinates?: unknown;
  geometries?: GeoJsonGeometry[];
}

interface GeoJsonObject {
  type?: string;
  geometry?: GeoJsonGeometry | null;
  features?: GeoJsonObject[];
  coordinates?: unknown;
  geometries?: GeoJsonGeometry[];
}

export interface BoundaryImportResult {
  coords: LatLng[];
  polygons: LatLng[][];
  areaHa: number;
  polygonCount: number;
  warning?: string;
}

export function toClosedGeoJsonRing(coords: LatLng[]): number[][] {
  const ring = coords.map(([lat, lng]) => [lng, lat]);
  if (coords.length > 0 && !samePosition(coords[0], coords[coords.length - 1])) {
    ring.push([...ring[0]]);
  }
  return ring;
}

function samePosition(first: LatLng, second: LatLng) {
  return first[0] === second[0] && first[1] === second[1];
}

function normaliseRing(positions: Position[]): LatLng[] {
  const coords = positions
    .filter((position) => (
      position.length >= 2
      && Number.isFinite(position[0])
      && Number.isFinite(position[1])
      && position[0] >= -180
      && position[0] <= 180
      && position[1] >= -90
      && position[1] <= 90
    ))
    .map(([lng, lat]) => [lat, lng] as LatLng);

  if (coords.length > 1 && samePosition(coords[0], coords[coords.length - 1])) {
    coords.pop();
  }

  return coords;
}

export function calculateBoundaryAreaHectares(coords: LatLng[]): number {
  if (coords.length < 3) return 0;

  return turfArea(polygon([toClosedGeoJsonRing(coords)])) / 10000;
}

function buildBoundaryResult(rings: LatLng[][]): BoundaryImportResult {
  const candidates = rings
    .filter((ring) => ring.length >= 3)
    .map((coords) => ({ coords, areaHa: calculateBoundaryAreaHectares(coords) }))
    .filter(({ areaHa }) => areaHa > 0)
    .sort((a, b) => b.areaHa - a.areaHa);

  if (candidates.length === 0) {
    throw new Error('No valid WGS84 polygon was found. Include the shapefile .prj sidecar if its coordinates are projected.');
  }

  return {
    coords: candidates[0].coords,
    polygons: candidates.map((candidate) => candidate.coords),
    areaHa: candidates.reduce((total, candidate) => total + candidate.areaHa, 0),
    polygonCount: candidates.length,
  };
}

function parseCoordinateText(value: string): LatLng[] {
  const positions = value
    .trim()
    .split(/\s+/)
    .map((point) => point.split(',').map(Number));

  return normaliseRing(positions);
}

function firstDescendant(element: Element, localName: string): Element | null {
  return element.getElementsByTagNameNS('*', localName)[0]
    || element.getElementsByTagName(localName)[0]
    || null;
}

export function parseKmlBoundary(kmlText: string): BoundaryImportResult {
  const document = new DOMParser().parseFromString(kmlText, 'application/xml');
  if (document.getElementsByTagName('parsererror').length > 0) {
    throw new Error('The KML file is not valid XML.');
  }

  const polygons = Array.from(document.getElementsByTagNameNS('*', 'Polygon'));
  const rings: LatLng[][] = [];

  polygons.forEach((polygonElement) => {
    const outerBoundary = firstDescendant(polygonElement, 'outerBoundaryIs');
    const coordinates = outerBoundary && firstDescendant(outerBoundary, 'coordinates');
    if (coordinates?.textContent) rings.push(parseCoordinateText(coordinates.textContent));
  });

  if (rings.length === 0) {
    const linearRings = Array.from(document.getElementsByTagNameNS('*', 'LinearRing'));
    linearRings.forEach((ring) => {
      const coordinates = firstDescendant(ring, 'coordinates');
      if (coordinates?.textContent) rings.push(parseCoordinateText(coordinates.textContent));
    });
  }

  return buildBoundaryResult(rings);
}

function collectGeometryRings(geometry: GeoJsonGeometry | null | undefined, rings: LatLng[][]) {
  if (!geometry) return;

  if (geometry.type === 'Polygon') {
    const polygonCoordinates = geometry.coordinates as Position[][];
    if (polygonCoordinates?.[0]) rings.push(normaliseRing(polygonCoordinates[0]));
    return;
  }

  if (geometry.type === 'MultiPolygon') {
    const multiPolygonCoordinates = geometry.coordinates as Position[][][];
    multiPolygonCoordinates?.forEach((polygonCoordinates) => {
      if (polygonCoordinates[0]) rings.push(normaliseRing(polygonCoordinates[0]));
    });
    return;
  }

  if (geometry.type === 'GeometryCollection') {
    geometry.geometries?.forEach((child) => collectGeometryRings(child, rings));
  }
}

function collectGeoJsonRings(value: unknown, rings: LatLng[][]) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectGeoJsonRings(item, rings));
    return;
  }

  if (!value || typeof value !== 'object') return;
  const geoJson = value as GeoJsonObject;

  if (geoJson.type === 'FeatureCollection') {
    geoJson.features?.forEach((feature) => collectGeoJsonRings(feature, rings));
  } else if (geoJson.type === 'Feature') {
    collectGeometryRings(geoJson.geometry, rings);
  } else if (geoJson.type) {
    collectGeometryRings(geoJson as GeoJsonGeometry, rings);
  }
}

export function boundaryFromGeoJson(value: unknown): BoundaryImportResult {
  const rings: LatLng[][] = [];
  collectGeoJsonRings(value, rings);
  return buildBoundaryResult(rings);
}

export async function parseShapefileBoundary(files: File[]): Promise<BoundaryImportResult> {
  const { default: shp } = await import('shpjs');
  const zip = files.find((file) => file.name.toLowerCase().endsWith('.zip'));
  let parsed: unknown;

  if (zip) {
    parsed = await shp(await zip.arrayBuffer());
  } else {
    const parts: Record<string, ArrayBuffer> = {};
    await Promise.all(files.map(async (file) => {
      const extension = file.name.split('.').pop()?.toLowerCase();
      if (extension && ['shp', 'dbf', 'prj', 'cpg'].includes(extension)) {
        parts[extension] = await file.arrayBuffer();
      }
    }));

    if (!parts.shp) {
      throw new Error('Select a zipped shapefile or include the .shp file with its .dbf and .prj sidecars.');
    }
    parsed = await shp(parts);
  }

  return boundaryFromGeoJson(parsed);
}
