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

export interface PreparedBoundarySourceFile {
  fileName: string;
  fileType: 'kml' | 'kmz' | 'shp';
  sizeBytes: number;
  dataUrl: string;
  sourceCrs: string | null;
}

function bytesToDataUrl(bytes: Uint8Array, contentType: string) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length))));
  }
  return `data:${contentType};base64,${btoa(binary)}`;
}

export async function prepareBoundarySourceFile(files: File[], fileType: 'kml' | 'kmz' | 'shp'): Promise<PreparedBoundarySourceFile> {
  if (!files.length) throw new Error('Select a boundary source file.');
  if (fileType === 'kml' || fileType === 'kmz') {
    const file = files.find((candidate) => candidate.name.toLowerCase().endsWith(`.${fileType}`)) || files[0];
    const bytes = new Uint8Array(await file.arrayBuffer());
    return {
      fileName: file.name, fileType, sizeBytes: bytes.length,
      dataUrl: bytesToDataUrl(bytes, fileType === 'kml' ? 'application/vnd.google-earth.kml+xml' : 'application/vnd.google-earth.kmz'),
      sourceCrs: 'EPSG:4326',
    };
  }

  const { unzipSync, zipSync, strFromU8 } = await import('fflate');
  const suppliedZip = files.find((file) => file.name.toLowerCase().endsWith('.zip'));
  let archiveBytes: Uint8Array;
  let fileName: string;
  if (suppliedZip) {
    archiveBytes = new Uint8Array(await suppliedZip.arrayBuffer());
    fileName = suppliedZip.name;
  } else {
    const entries: Record<string, Uint8Array> = {};
    await Promise.all(files.map(async (file) => { entries[file.name] = new Uint8Array(await file.arrayBuffer()); }));
    archiveBytes = zipSync(entries);
    const shpName = files.find((file) => file.name.toLowerCase().endsWith('.shp'))?.name || 'boundary.shp';
    fileName = `${shpName.replace(/\.shp$/i, '')}.zip`;
  }
  let sourceCrs: string | null = null;
  try {
    const archive = unzipSync(archiveBytes);
    const projectionName = Object.keys(archive).find((name) => name.toLowerCase().endsWith('.prj'));
    if (projectionName) sourceCrs = strFromU8(archive[projectionName]).trim() || null;
  } catch {
    throw new Error('The shapefile source package is invalid or unreadable.');
  }
  return { fileName, fileType: 'shp', sizeBytes: archiveBytes.length, dataUrl: bytesToDataUrl(archiveBytes, 'application/zip'), sourceCrs };
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
  const valid = positions.every((position) => (
    position.length >= 2
    && Number.isFinite(position[0])
    && Number.isFinite(position[1])
    && position[0] >= -180
    && position[0] <= 180
    && position[1] >= -90
    && position[1] <= 90
  ));
  if (!valid) throw new Error('Boundary contains an invalid WGS84 coordinate.');
  const coords = positions.map(([lng, lat]) => [lat, lng] as LatLng);

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

  let importedClosedLineString = false;
  if (rings.length === 0) {
    const lineStrings = Array.from(document.getElementsByTagNameNS('*', 'LineString'));
    lineStrings.forEach((lineString) => {
      const coordinates = firstDescendant(lineString, 'coordinates');
      if (!coordinates?.textContent) return;
      const positions = coordinates.textContent.trim().split(/\s+/).map((point) => point.split(',').map(Number));
      const first = positions[0];
      const last = positions[positions.length - 1];
      if (first?.length >= 2 && last?.length >= 2 && first[0] === last[0] && first[1] === last[1]) {
        rings.push(normaliseRing(positions));
        importedClosedLineString = true;
      }
    });
  }

  const result = buildBoundaryResult(rings);
  return importedClosedLineString
    ? { ...result, warning: 'A closed KML LineString was imported as a polygon boundary.' }
    : result;
}

export async function parseKmzBytes(bytes: Uint8Array): Promise<BoundaryImportResult> {
  const { unzipSync, strFromU8 } = await import('fflate');
  let archive: Record<string,Uint8Array>;
  try { archive=unzipSync(bytes); } catch { throw new Error('The KMZ archive is invalid or unreadable.'); }
  const name=Object.keys(archive).find((entry)=>entry.toLowerCase().endsWith('.kml'));
  if(!name) throw new Error('The KMZ archive does not contain a KML document.');
  return parseKmlBoundary(strFromU8(archive[name]));
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
