import turfArea from '@turf/area';
import turfBuffer from '@turf/buffer';
import { strFromU8, unzip } from 'fflate';
import { multiLineString, polygon } from '@turf/helpers';
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

const MAX_SPATIAL_FILE_BYTES = 25 * 1024 * 1024;
const MAX_KMZ_ENTRIES = 250;

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

function collectKmlLineStrings(document: Document): LatLng[][] {
  return Array.from(document.getElementsByTagNameNS('*', 'LineString'))
    .map((line) => firstDescendant(line, 'coordinates')?.textContent || '')
    .map(parseCoordinateText)
    .filter((coords) => coords.length >= 2);
}

function firstDescendant(element: Element, localName: string): Element | null {
  return element.getElementsByTagNameNS('*', localName)[0]
    || element.getElementsByTagName(localName)[0]
    || null;
}

function parseKmlDocument(kmlText: string): Document {
  const document = new DOMParser().parseFromString(kmlText, 'application/xml');
  if (document.getElementsByTagName('parsererror').length > 0) {
    throw new Error('The KML file is not valid XML.');
  }
  return document;
}

export function parseKmlBoundary(kmlText: string): BoundaryImportResult {
  const document = parseKmlDocument(kmlText);

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

  if (
    rings.length === 0
    && document.getElementsByTagNameNS('*', 'LineString').length > 0
  ) {
    throw new Error(
      'This KML contains linework but no closed boundary polygon. Use Railway corridor to create a buffered spray boundary.'
    );
  }

  return buildBoundaryResult(rings);
}

export function parseRailwayCorridorKml(
  kmlText: string,
  bufferMetresEachSide: number
): BoundaryImportResult {
  if (
    !Number.isFinite(bufferMetresEachSide)
    || bufferMetresEachSide <= 0
    || bufferMetresEachSide > 100
  ) {
    throw new Error('Buffer each side must be greater than 0 m and no more than 100 m.');
  }

  const document = parseKmlDocument(kmlText);
  const lines = collectKmlLineStrings(document);
  if (lines.length === 0) {
    if (document.getElementsByTagNameNS('*', 'Polygon').length > 0) {
      throw new Error('This file contains a polygon but no railway centre line. Use Boundary file instead.');
    }
    throw new Error('No valid railway centre line was found in this KML.');
  }

  const linework = multiLineString(lines.map((line) => (
    line.map(([lat, lng]) => [lng, lat])
  )));
  const buffered = turfBuffer(linework, bufferMetresEachSide, {
    units: 'meters',
    steps: 16,
  });
  if (!buffered) {
    throw new Error('The railway centre line could not be converted into a corridor boundary.');
  }

  return {
    ...boundaryFromGeoJson(buffered),
    warning: `Railway corridor created with ${bufferMetresEachSide} m each side (${bufferMetresEachSide * 2} m total width).`,
  };
}

async function extractKmlFromKmz(file: File): Promise<string> {
  if (file.size > MAX_SPATIAL_FILE_BYTES) {
    throw new Error('KMZ files must be 25 MB or smaller.');
  }

  const input = new Uint8Array(await file.arrayBuffer());
  let entryCount = 0;
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
      unzip(input, {
        filter: (entry) => {
          entryCount += 1;
          if (entryCount > MAX_KMZ_ENTRIES) {
            throw new Error('The KMZ contains more than 250 archive entries.');
          }
          if (
            entry.name.startsWith('/')
            || entry.name.split(/[\\/]/).includes('..')
          ) {
            throw new Error('The KMZ contains an unsafe archive path.');
          }
          const isKml = entry.name.toLowerCase().endsWith('.kml');
          if (isKml && entry.originalSize > MAX_SPATIAL_FILE_BYTES) {
            throw new Error('The KML document inside this KMZ is larger than 25 MB.');
          }
          return isKml;
        },
      }, (error, data) => {
        if (error) reject(error);
        else resolve(data);
      });
    });
  } catch (error) {
    if (
      error instanceof Error
      && (
        error.message.includes('250 archive entries')
        || error.message.includes('unsafe archive path')
        || error.message.includes('larger than 25 MB')
      )
    ) {
      throw error;
    }
    throw new Error('The KMZ archive is corrupt or unsupported.');
  }

  const kmlNames = Object.keys(unzipped)
    .filter((name) => name.toLowerCase().endsWith('.kml'))
    .sort((first, second) => first.localeCompare(second));
  if (kmlNames.length === 0) {
    throw new Error('This KMZ does not contain a KML document.');
  }
  const selected = kmlNames.find((name) => (
    name.split(/[\\/]/).pop()?.toLowerCase() === 'doc.kml'
  )) || kmlNames[0];
  const bytes = unzipped[selected];
  if (bytes.byteLength > MAX_SPATIAL_FILE_BYTES) {
    throw new Error('The KML document inside this KMZ is larger than 25 MB.');
  }
  return strFromU8(bytes);
}

export async function parseKmzBoundary(file: File): Promise<BoundaryImportResult> {
  return parseKmlBoundary(await extractKmlFromKmz(file));
}

export async function parseRailwayCorridorKmz(
  file: File,
  bufferMetresEachSide: number
): Promise<BoundaryImportResult> {
  return parseRailwayCorridorKml(
    await extractKmlFromKmz(file),
    bufferMetresEachSide
  );
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
