import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
  Stack,
  Chip,
  IconButton,
  alpha,
  useTheme,
  ToggleButtonGroup,
  ToggleButton,
  Tooltip,
  TextField,
  MenuItem,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DeleteIcon from '@mui/icons-material/Delete';
import UndoIcon from '@mui/icons-material/Undo';
import PolylineIcon from '@mui/icons-material/Polyline';
import TouchAppIcon from '@mui/icons-material/TouchApp';
import SquareFootIcon from '@mui/icons-material/SquareFoot';
import SearchIcon from '@mui/icons-material/Search';
import { MapContainer, TileLayer, Polygon, Polyline, Marker, useMapEvents, useMap, LayersControl } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LatLng, BoundaryFileRef } from '../types/fieldManagement';
import { MissionBoundaryMetadata, MissionMapFeature, MissionMapFeatureType } from '../types/missionMap';
import { MissionBoundaryPolygon } from '../types/missionBoundary';
import { moveMapFeatureVertex as moveStoredFeatureVertex, upsertMapFeature } from '../utils/missionMapAnnotations';
import { MAP_FEATURE_COLORS, MAP_FEATURE_LABELS } from './MissionMapLegend';
import MissionMapFeatureRegister from './MissionMapFeatureRegister';
import {
  BoundaryImportResult,
  calculateBoundaryAreaHectares,
  parseKmzBoundary,
  parseKmlBoundary,
  parseRailwayCorridorKml,
  parseRailwayCorridorKmz,
  parseShapefileBoundary,
} from '../utils/boundaryImport';
import { appendDraftVertex, canFinishDrawing, DrawingMode, finishDrawing } from '../utils/missionMapDrawing';
import { moveBoundaryVertex, normaliseBoundaryPolygons } from '../utils/missionBoundaryEditing';

const TILE_LAYERS = {
  street: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri, Maxar, Earthstar Geographics',
  },
  hybrid: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri, Maxar, Earthstar Geographics',
    labels: 'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
  },
};
const MAX_SPATIAL_FILE_BYTES = 25 * 1024 * 1024;

// Fix Leaflet marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Small red dot for boundary points
const boundaryPointIcon = L.divIcon({
  className: '',
  html: '<div style="width:12px;height:12px;background:#d32f2f;border:2px solid white;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

// ─── Map Click Handler ─────────────────────────────────────

function MapClickHandler({ onMapClick, drawing }: { onMapClick: (lat: number, lng: number) => void; drawing: boolean }) {
  useMapEvents({
    click(e) {
      if (drawing) {
        onMapClick(e.latlng.lat, e.latlng.lng);
      }
    },
  });
  return null;
}

// ─── Fly to Property Location ───────────────────────────────

function FlyToProperty({ lat, lng }: { lat?: number; lng?: number }) {
  const map = useMap();
  useEffect(() => {
    if (typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)) {
      map.flyTo([lat, lng], 16, { duration: 1.2 });
    }
  }, [lat, lng, map]);
  return null;
}

// ─── Fit Bounds Component ───────────────────────────────────

function FitBounds({
  coords,
  emptyCenter,
  emptyZoom,
}: {
  coords: LatLng[];
  emptyCenter: [number, number];
  emptyZoom: number;
}) {
  const map = useMap();
  useEffect(() => {
    if (coords.length >= 2) {
      const bounds = L.latLngBounds(coords.map(([lat, lng]) => [lat, lng]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    } else if (coords.length === 0) {
      map.setView(emptyCenter, emptyZoom);
    }
  }, [coords, emptyCenter, emptyZoom, map]);

  return null;
}

function FocusBounds({ coords, token }: { coords: LatLng[]; token: number }) {
  const map = useMap();
  useEffect(() => {
    if (coords.length === 1) map.flyTo(coords[0], 17);
    else if (coords.length > 1) map.fitBounds(L.latLngBounds(coords), { padding: [50, 50], maxZoom: 17 });
  }, [coords, map, token]);
  return null;
}

// ─── Props ──────────────────────────────────────────────────

interface Props {
  coords: LatLng[];
  onCoordsChange: (coords: LatLng[]) => void;
  polygons?: LatLng[][];
  onPolygonsChange?: (polygons: LatLng[][]) => void;
  boundaryMetadata?: MissionBoundaryMetadata[];
  onBoundaryMetadataChange?: (metadata: MissionBoundaryMetadata[]) => void;
  onAreaChange: (hectares: number) => void;
  onBoundaryFile?: (ref: BoundaryFileRef | null) => void;
  propertyLat?: number;
  propertyLng?: number;
  onPropertyPinMove?: (lat: number, lng: number) => void;
  initialAddress?: string;
  onAddressSelect?: (address: string, lat: number, lng: number) => void;
  mapHeight?: number;
  readOnly?: boolean;
  features?: MissionMapFeature[];
  onFeaturesChange?: (features: MissionMapFeature[]) => void;
}

// ─── Component ──────────────────────────────────────────────

export default function FieldBoundaryEditor({
  coords,
  onCoordsChange,
  polygons,
  onPolygonsChange,
  boundaryMetadata = [],
  onBoundaryMetadataChange,
  onAreaChange,
  onBoundaryFile,
  propertyLat,
  propertyLng,
  onPropertyPinMove,
  initialAddress = '',
  onAddressSelect,
  mapHeight = 350,
  readOnly = false,
  features = [],
  onFeaturesChange,
}: Props) {
  const theme = useTheme();
  const [drawing, setDrawing] = useState(false);
  const [mode, setMode] = useState<'draw' | 'upload'>('draw');
  const [activeFeatureType, setActiveFeatureType] = useState<'boundary' | MissionMapFeatureType>('boundary');
  const [drawingMode, setDrawingMode] = useState<DrawingMode>('point');
  const [draftFeatureVertices, setDraftFeatureVertices] = useState<Array<[number, number]>>([]);
  const [focusTarget, setFocusTarget] = useState<{ coords: LatLng[]; token: number }>({ coords: [], token: 0 });
  const [addressQuery, setAddressQuery] = useState(initialAddress);
  const [addressResults, setAddressResults] = useState<Array<{ label: string; lat: number; lng: number }>>([]);
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressError, setAddressError] = useState('');
  const [importNotice, setImportNotice] = useState<{ severity: 'success' | 'warning' | 'error'; message: string } | null>(null);
  const [railwayFile, setRailwayFile] = useState<File | null>(null);
  const [railwayBuffer, setRailwayBuffer] = useState('3.5');
  const [railwayImporting, setRailwayImporting] = useState(false);
  const [pinPos, setPinPos] = useState<{ lat: number; lng: number } | null>(
    propertyLat && propertyLng ? { lat: propertyLat, lng: propertyLng } : null
  );
  const markerRef = useRef<L.Marker | null>(null);
  const onAreaChangeRef = useRef(onAreaChange);

  useEffect(() => {
    onAreaChangeRef.current = onAreaChange;
  }, [onAreaChange]);

  // Sync if parent props change
  useEffect(() => {
    if (propertyLat && propertyLng) {
      setPinPos({ lat: propertyLat, lng: propertyLng });
    }
  }, [propertyLat, propertyLng]);

  useEffect(() => {
    setAddressQuery(initialAddress);
  }, [initialAddress]);

  const defaultCenter = React.useMemo<[number, number]>(() => [
    propertyLat || -25.2744,
    propertyLng || 133.7751,
  ], [propertyLat, propertyLng]);
  const defaultZoom = propertyLat ? 14 : 5;

  const boundaryPolygons = React.useMemo(
    () => polygons?.length ? polygons : coords.length ? [coords] : [],
    [coords, polygons],
  );
  const boundaryModels = React.useMemo<MissionBoundaryPolygon[]>(() => normaliseBoundaryPolygons(boundaryPolygons).map((boundary, index) => ({
    ...boundary,
    id: boundaryMetadata[index]?.id || boundary.id,
    sourceFileId: boundaryMetadata[index]?.sourceFileId,
    name: boundaryMetadata[index]?.name || boundary.name,
    notes: boundaryMetadata[index]?.notes || boundary.notes,
  })), [boundaryMetadata, boundaryPolygons]);
  const applyBoundaryModels = (next: MissionBoundaryPolygon[]) => {
    const nextPolygons = next.map((boundary) => boundary.coordinates);
    onPolygonsChange?.(nextPolygons);
    onCoordsChange(nextPolygons[0] || []);
    onBoundaryMetadataChange?.(next.map(({ id, sourceFileId, name, notes }) => ({ id, sourceFileId, name, notes })));
    if (next.length === 0) onBoundaryFile?.(null);
  };
  const allBoundaryCoords = React.useMemo(() => boundaryPolygons.flat(), [boundaryPolygons]);
  const area = React.useMemo(
    () => boundaryPolygons.reduce(
      (total, polygonCoords) => total + calculateBoundaryAreaHectares(polygonCoords),
      0,
    ),
    [boundaryPolygons],
  );

  useEffect(() => {
    onAreaChangeRef.current(Math.round(area * 100) / 100);
  }, [area]);

  const handleMapClick = useCallback((lat: number, lng: number) => {
    if (activeFeatureType !== 'boundary' && onFeaturesChange) {
      const nextVertices = appendDraftVertex(draftFeatureVertices, [lng, lat]);
      if (drawingMode === 'point') {
        const geometry = finishDrawing('point', nextVertices)!;
        const label = MAP_FEATURE_LABELS[activeFeatureType].replace(/s$/, '');
        onFeaturesChange(upsertMapFeature(features, { id: `${activeFeatureType}-${Date.now()}`, type: activeFeatureType, label, name: label, notes: '', geometry }));
        setDraftFeatureVertices([]);
      } else setDraftFeatureVertices(nextVertices);
      return;
    }
    const updated = [...coords, [lat, lng] as LatLng];
    onCoordsChange(updated);
    onPolygonsChange?.([updated, ...boundaryPolygons.slice(1)]);
  }, [activeFeatureType, boundaryPolygons, coords, draftFeatureVertices, drawingMode, features, onCoordsChange, onFeaturesChange, onPolygonsChange]);

  const finishFeature = () => {
    if (activeFeatureType === 'boundary' || !onFeaturesChange) return;
    const geometry = finishDrawing(drawingMode, draftFeatureVertices);
    if (!geometry) return;
    const label = MAP_FEATURE_LABELS[activeFeatureType].replace(/s$/, '');
    onFeaturesChange(upsertMapFeature(features, { id: `${activeFeatureType}-${Date.now()}`, type: activeFeatureType, label, name: label, notes: '', geometry }));
    setDraftFeatureVertices([]);
  };

  const moveFeatureVertex = (featureId: string, vertexIndex: number, lng: number, lat: number) => {
    if (!onFeaturesChange) return;
    onFeaturesChange(features.map((feature) => feature.id === featureId ? moveStoredFeatureVertex(feature, vertexIndex, [lng, lat]) : feature));
  };

  const handleUndo = () => {
    if (coords.length > 0) {
      const updated = coords.slice(0, -1);
      onCoordsChange(updated);
      onPolygonsChange?.(updated.length ? [updated, ...boundaryPolygons.slice(1)] : boundaryPolygons.slice(1));
    }
  };

  const handleClear = () => {
    if (!window.confirm('Clear the entire mission boundary? The mission and other map items will be preserved.')) return;
    onCoordsChange([]);
    onPolygonsChange?.([]);
    onBoundaryFile?.(null);
  };

  const applyImportedBoundary = async (
    result: BoundaryImportResult,
    files: File[],
    primaryFile: File,
    fileType: BoundaryFileRef['fileType'],
    boundaryName: (index: number) => string,
  ) => {
    onCoordsChange(result.coords);
    onPolygonsChange?.(result.polygons);
    const sourceFileId = `import-${Date.now()}`;
    const importedBoundaries = normaliseBoundaryPolygons(result.polygons);
    onBoundaryMetadataChange?.(importedBoundaries.map((boundary, index) => ({
      id: boundary.id,
      sourceFileId,
      name: boundaryName(index),
      notes: '',
    })));
    const importedCoords = result.polygons.flat();
    onBoundaryFile?.({
      fileName: files.length === 1 ? primaryFile.name : files.map((file) => file.name).join(', '),
      fileType,
      sizeBytes: files.reduce((total, file) => total + file.size, 0),
      dataUrl: await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Could not read the selected boundary file.'));
        reader.readAsDataURL(primaryFile);
      }),
      boundingBox: {
        north: Math.max(...importedCoords.map((coord) => coord[0])),
        south: Math.min(...importedCoords.map((coord) => coord[0])),
        east: Math.max(...importedCoords.map((coord) => coord[1])),
        west: Math.min(...importedCoords.map((coord) => coord[1])),
      },
      uploadedAt: new Date().toISOString(),
    });
    const importedLabel = result.polygonCount === 1
      ? (fileType === 'shp' ? 'paddock' : 'boundary')
      : (fileType === 'shp' ? 'paddocks' : 'boundaries');
    setImportNotice({
      severity: result.warning ? 'warning' : 'success',
      message: `${result.areaHa.toFixed(1)} ha imported across ${result.polygonCount} ${importedLabel}. ${result.warning || ''}`.trim(),
    });
  };

  const handleBoundaryFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    try {
      setImportNotice(null);
      const kml = files.find((file) => file.name.toLowerCase().endsWith('.kml'));
      const kmz = files.find((file) => file.name.toLowerCase().endsWith('.kmz'));
      const primaryFile = kml || kmz || files.find((file) => file.name.toLowerCase().endsWith('.zip')) || files[0];
      if (primaryFile.size > MAX_SPATIAL_FILE_BYTES) {
        throw new Error('Boundary files must be 25 MB or smaller.');
      }
      const fileType: BoundaryFileRef['fileType'] = kml ? 'kml' : kmz ? 'kmz' : 'shp';
      const result = kml
        ? parseKmlBoundary(await kml.text())
        : kmz
          ? await parseKmzBoundary(kmz)
          : await parseShapefileBoundary(files);
      await applyImportedBoundary(result, files, primaryFile, fileType, (index) => `Boundary ${index + 1}`);
    } catch (error) {
      setImportNotice({
        severity: 'error',
        message: error instanceof Error ? error.message : 'The selected boundary could not be imported.',
      });
    }
  };

  const handleRailwayFileSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_SPATIAL_FILE_BYTES) {
      setImportNotice({ severity: 'error', message: 'Railway corridor files must be 25 MB or smaller.' });
      return;
    }
    setImportNotice(null);
    setRailwayBuffer('3.5');
    setRailwayFile(file);
  };

  const confirmRailwayImport = async () => {
    if (!railwayFile) return;
    const bufferMetres = Number(railwayBuffer);
    setRailwayImporting(true);
    try {
      const isKmz = railwayFile.name.toLowerCase().endsWith('.kmz');
      const result = isKmz
        ? await parseRailwayCorridorKmz(railwayFile, bufferMetres)
        : parseRailwayCorridorKml(await railwayFile.text(), bufferMetres);
      await applyImportedBoundary(
        result,
        [railwayFile],
        railwayFile,
        isKmz ? 'kmz' : 'kml',
        (index) => `Railway corridor${result.polygonCount > 1 ? ` ${index + 1}` : ''} - ${bufferMetres} m each side`,
      );
      setRailwayFile(null);
    } catch (error) {
      setImportNotice({
        severity: 'error',
        message: error instanceof Error ? error.message : 'The railway corridor could not be imported.',
      });
    } finally {
      setRailwayImporting(false);
    }
  };

  const handleAddressSearch = async () => {
    const query = addressQuery.trim();
    if (query.length < 3) {
      setAddressError('Enter at least 3 characters.');
      return;
    }

    setAddressLoading(true);
    setAddressError('');
    setAddressResults([]);
    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Address search failed.');
      setAddressResults(data.results || []);
      if (!data.results?.length) setAddressError('No Australian addresses matched that search.');
    } catch (error) {
      setAddressError(error instanceof Error ? error.message : 'Address search failed.');
    } finally {
      setAddressLoading(false);
    }
  };

  const selectAddress = (result: { label: string; lat: number; lng: number }) => {
    setAddressQuery(result.label);
    setAddressResults([]);
    setPinPos({ lat: result.lat, lng: result.lng });
    onAddressSelect?.(result.label, result.lat, result.lng);
  };

  return (
    <Box>
      {!readOnly && (
        <Box sx={{ mb: 1.5 }}>
          <Stack direction="row" spacing={1} alignItems="flex-start">
            <TextField
              value={addressQuery}
              onChange={(event) => setAddressQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void handleAddressSearch();
                }
              }}
              label="Search Australian address"
              size="small"
              fullWidth
              error={Boolean(addressError)}
              helperText={addressError || undefined}
            />
            <Tooltip title="Search address">
              <span>
                <IconButton
                  aria-label="Search address"
                  color="primary"
                  onClick={() => void handleAddressSearch()}
                  disabled={addressLoading}
                  sx={{ width: 40, height: 40, border: `1px solid ${alpha(theme.palette.primary.main, 0.25)}` }}
                >
                  {addressLoading ? <CircularProgress size={18} /> : <SearchIcon />}
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
          {addressResults.length > 0 && (
            <Stack sx={{ mt: 0.75, border: `1px solid ${alpha(theme.palette.primary.main, 0.14)}`, borderRadius: '8px', overflow: 'hidden' }}>
              {addressResults.map((result, index) => (
                <Button
                  key={`${result.lat}-${result.lng}-${index}`}
                  onClick={() => selectAddress(result)}
                  sx={{ justifyContent: 'flex-start', textAlign: 'left', borderRadius: 0, px: 1.25, py: 0.8, fontSize: '0.75rem' }}
                >
                  {result.label}
                </Button>
              ))}
            </Stack>
          )}
        </Box>
      )}

      {!readOnly && onFeaturesChange && (
        <TextField
          select
          fullWidth
          size="small"
          label="Map drawing tool"
          value={activeFeatureType}
          onChange={(event) => { setActiveFeatureType(event.target.value as 'boundary' | MissionMapFeatureType); setDraftFeatureVertices([]); setDrawing(true); }}
          sx={{ mb: 1.5 }}
        >
          <MenuItem value="boundary">Field boundary</MenuItem>
          {(Object.keys(MAP_FEATURE_LABELS) as MissionMapFeatureType[]).map((type) => <MenuItem key={type} value={type}>{MAP_FEATURE_LABELS[type]}</MenuItem>)}
        </TextField>
      )}

      {!readOnly && onFeaturesChange && activeFeatureType !== 'boundary' && (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
          <ToggleButtonGroup value={drawingMode} exclusive onChange={(_, value) => { if (value) { setDrawingMode(value); setDraftFeatureVertices([]); } }} size="small" aria-label="Feature geometry">
            <ToggleButton value="point">Point</ToggleButton><ToggleButton value="line">Line</ToggleButton><ToggleButton value="shape">Shape</ToggleButton>
          </ToggleButtonGroup>
          {drawingMode !== 'point' && <Button size="small" variant="contained" disabled={!canFinishDrawing(drawingMode, draftFeatureVertices)} onClick={finishFeature}>Finish {drawingMode}</Button>}
          {draftFeatureVertices.length > 0 && <Button size="small" onClick={() => setDraftFeatureVertices([])}>Cancel drawing</Button>}
        </Stack>
      )}

      {/* Mode toggle + controls */}
      {!readOnly && (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
          <ToggleButtonGroup
            value={mode}
            exclusive
            onChange={(_, v) => { if (v) { setMode(v); setDrawing(v === 'draw'); } }}
            size="small"
            sx={{ '& .MuiToggleButton-root': { borderRadius: '8px', px: 1.5, py: 0.5, fontWeight: 600, fontSize: '0.75rem' } }}
          >
            <ToggleButton value="draw">
              <TouchAppIcon sx={{ fontSize: 16, mr: 0.5 }} /> Draw
            </ToggleButton>
            <ToggleButton value="upload">
              <UploadFileIcon sx={{ fontSize: 16, mr: 0.5 }} /> Upload
            </ToggleButton>
          </ToggleButtonGroup>

          {mode === 'upload' && (
            <>
              <Button
                variant="outlined"
                component="label"
                size="small"
                startIcon={<UploadFileIcon />}
                sx={{ borderRadius: '8px', fontWeight: 600, fontSize: '0.75rem' }}
              >
                Boundary file
                <input type="file" hidden multiple accept=".kml,.kmz,.zip,.shp,.shx,.dbf,.prj,.cpg" onChange={handleBoundaryFileUpload} />
              </Button>
              <Button
                variant="outlined"
                component="label"
                size="small"
                startIcon={<PolylineIcon />}
                sx={{ borderRadius: '8px', fontWeight: 600, fontSize: '0.75rem' }}
              >
                Railway corridor
                <input type="file" hidden accept=".kml,.kmz" onChange={handleRailwayFileSelection} />
              </Button>
            </>
          )}

          {mode === 'draw' && (
            <>
              <Button
                variant={drawing ? 'contained' : 'outlined'}
                size="small"
                startIcon={<PolylineIcon />}
                onClick={() => setDrawing(!drawing)}
                sx={{ borderRadius: '8px', fontWeight: 600, fontSize: '0.75rem' }}
              >
                {drawing ? 'Placing Points...' : 'Start Drawing'}
              </Button>
              <Tooltip title="Undo last point">
                <span>
                  <IconButton size="small" onClick={handleUndo} disabled={coords.length === 0}>
                    <UndoIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </>
          )}

          {coords.length > 0 && (
            <Tooltip title="Clear boundary">
              <IconButton size="small" onClick={handleClear} sx={{ color: 'error.main' }}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}

          <Box sx={{ flex: 1 }} />

          {coords.length >= 3 && (
            <Chip
              icon={<SquareFootIcon />}
              label={`${area.toFixed(1)} ha${boundaryPolygons.length > 1 ? ` / ${boundaryPolygons.length} paddocks` : ''}`}
              color="primary"
              sx={{ fontWeight: 700, fontSize: '0.85rem' }}
            />
          )}

          {coords.length > 0 && coords.length < 3 && (
            <Typography variant="caption" color="text.secondary">
              {3 - coords.length} more point{3 - coords.length !== 1 ? 's' : ''} needed
            </Typography>
          )}
        </Stack>
      )}

      {importNotice && (
        <Alert severity={importNotice.severity} onClose={() => setImportNotice(null)} sx={{ mb: 1, borderRadius: '8px' }}>
          {importNotice.message}
        </Alert>
      )}

      <Dialog open={Boolean(railwayFile)} onClose={() => !railwayImporting && setRailwayFile(null)} fullWidth maxWidth="xs">
        <DialogTitle>Import railway corridor</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {railwayFile?.name}
            </Typography>
            <TextField
              label="Buffer each side (m)"
              type="number"
              value={railwayBuffer}
              onChange={(event) => setRailwayBuffer(event.target.value)}
              inputProps={{ min: 0.1, max: 100, step: 0.1 }}
              helperText={`${Number(railwayBuffer) > 0 ? Number(railwayBuffer) * 2 : 0} m total corridor width`}
              fullWidth
            />
            <Alert severity="info">
              The centre line will be converted into the mission spray boundary. This is only for railway corridor jobs.
            </Alert>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRailwayFile(null)} disabled={railwayImporting}>Cancel</Button>
          <Button variant="contained" onClick={() => void confirmRailwayImport()} disabled={railwayImporting}>
            {railwayImporting ? 'Creating...' : 'Create corridor boundary'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Drawing instructions */}
      {!readOnly && mode === 'draw' && drawing && (
        <Typography variant="caption" color="primary.main" sx={{ display: 'block', mb: 1, fontWeight: 600 }}>
          Click on the map to place boundary points. Minimum 3 points to form a paddock.
        </Typography>
      )}

      {/* Map */}
      <Box
        sx={{
          borderRadius: '8px',
          overflow: 'hidden',
          border: `1.5px solid ${alpha(theme.palette.primary.main, drawing ? 0.4 : 0.12)}`,
          height: mapHeight,
          cursor: !readOnly && drawing ? 'crosshair' : 'grab',
          transition: 'border-color 0.2s',
          '& .leaflet-container': { height: '100%', width: '100%', borderRadius: '8px' },
        }}
      >
        <MapContainer
          center={defaultCenter}
          zoom={defaultZoom}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom
        >
          <LayersControl position="topright">
            <LayersControl.BaseLayer name="Street" checked>
              <TileLayer attribution={TILE_LAYERS.street.attribution} url={TILE_LAYERS.street.url} />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="Satellite">
              <TileLayer attribution={TILE_LAYERS.satellite.attribution} url={TILE_LAYERS.satellite.url} maxZoom={19} />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="Hybrid">
              <TileLayer attribution={TILE_LAYERS.hybrid.attribution} url={TILE_LAYERS.hybrid.url} maxZoom={19} />
            </LayersControl.BaseLayer>
          </LayersControl>

          <MapClickHandler onMapClick={handleMapClick} drawing={!readOnly && drawing} />

          {/* Fly to property address on open */}
          <FlyToProperty lat={pinPos?.lat || propertyLat} lng={pinPos?.lng || propertyLng} />

          {/* Property address pin — draggable */}
          {pinPos && (
            <Marker
              position={[pinPos.lat, pinPos.lng]}
              draggable={!readOnly}
              ref={markerRef}
              eventHandlers={{
                dragend: () => {
                  const m = markerRef.current;
                  if (m) {
                    const { lat, lng } = m.getLatLng();
                    setPinPos({ lat, lng });
                    onPropertyPinMove?.(lat, lng);
                  }
                },
              }}
            />
          )}

          {/* Boundary polygon */}
          {boundaryModels.map((boundary) => boundary.coordinates.length >= 3 && (
            <Polygon
              key={`boundary-polygon-${boundary.id}`}
              positions={boundary.coordinates}
              pathOptions={{
                color: '#ffffff',
                fillColor: theme.palette.primary.main,
                fillOpacity: 0.25,
                weight: 2.5,
              }}
            />
          ))}

          {features.filter((feature) => feature.geometry.type === 'Polygon').map((feature) => (
            <Polygon
              key={feature.id}
              positions={feature.geometry.type === 'Polygon' ? feature.geometry.coordinates[0].map(([lng, lat]) => [lat, lng] as LatLng) : []}
              pathOptions={{ color: MAP_FEATURE_COLORS[feature.type], fillColor: MAP_FEATURE_COLORS[feature.type], fillOpacity: 0.45, weight: 2 }}
            />
          ))}

          {features.filter((feature) => feature.geometry.type === 'LineString').map((feature) => (
            <Polyline key={feature.id} positions={feature.geometry.type === 'LineString' ? feature.geometry.coordinates.map(([lng, lat]) => [lat, lng] as LatLng) : []} pathOptions={{ color: MAP_FEATURE_COLORS[feature.type], weight: 4 }} />
          ))}

          {draftFeatureVertices.length >= 2 && drawingMode === 'line' && <Polyline positions={draftFeatureVertices.map(([lng, lat]) => [lat, lng] as LatLng)} pathOptions={{ color: activeFeatureType === 'boundary' ? theme.palette.primary.main : MAP_FEATURE_COLORS[activeFeatureType], dashArray: '6 6' }} />}
          {draftFeatureVertices.length >= 3 && drawingMode === 'shape' && <Polygon positions={draftFeatureVertices.map(([lng, lat]) => [lat, lng] as LatLng)} pathOptions={{ color: activeFeatureType === 'boundary' ? theme.palette.primary.main : MAP_FEATURE_COLORS[activeFeatureType], dashArray: '6 6' }} />}

          {features.filter((feature) => feature.geometry.type === 'Point').map((feature) => {
            if (feature.geometry.type !== 'Point') return null;
            const [lng, lat] = feature.geometry.coordinates;
            const icon = L.divIcon({ className: '', html: `<div style="width:18px;height:18px;background:${MAP_FEATURE_COLORS[feature.type]};border:3px solid white;border-radius:50%;box-shadow:0 1px 5px rgba(0,0,0,.45)"></div>`, iconSize: [18, 18], iconAnchor: [9, 9] });
            return <Marker key={feature.id} position={[lat, lng]} icon={icon} draggable={!readOnly} eventHandlers={{ dragend: (event) => { const next = event.target.getLatLng(); moveFeatureVertex(feature.id, 0, next.lng, next.lat); } }} />;
          })}

          {!readOnly && features.filter((feature) => feature.geometry.type !== 'Point').flatMap((feature) => {
            if (feature.geometry.type === 'Point') return [];
            const coordinates: Array<[number, number]> = feature.geometry.type === 'Polygon' ? feature.geometry.coordinates[0] : feature.geometry.coordinates;
            return coordinates.map(([lng, lat], vertexIndex) => <Marker
              key={`${feature.id}-vertex-${vertexIndex}`}
              position={[lat, lng]}
              icon={boundaryPointIcon}
              draggable
              eventHandlers={{ dragend: (event) => { const next = event.target.getLatLng(); moveFeatureVertex(feature.id, vertexIndex, next.lng, next.lat); } }}
            />);
          })}

          {/* Boundary points — draggable in edit mode */}
          {boundaryModels.flatMap((boundary) => boundary.coordinates.map((c, vertexIndex) => (
            <Marker
              key={`${boundary.id}-${vertexIndex}`}
              position={c}
              icon={boundaryPointIcon}
              draggable={!readOnly}
              eventHandlers={{
                dragend: (e) => {
                  const { lat, lng } = e.target.getLatLng();
                  applyBoundaryModels(moveBoundaryVertex(boundaryModels, boundary.id, vertexIndex, [lat, lng]));
                },
              }}
            />
          )))}

          {/* Auto-fit when coords load and return to the neutral view when cleared. */}
          <FitBounds coords={allBoundaryCoords} emptyCenter={defaultCenter} emptyZoom={defaultZoom} />
          <FocusBounds coords={focusTarget.coords} token={focusTarget.token} />
        </MapContainer>
      </Box>
      {!readOnly && onFeaturesChange && <MissionMapFeatureRegister boundaries={boundaryModels} onBoundariesChange={applyBoundaryModels} features={features} onFeaturesChange={onFeaturesChange} onZoom={(kind, target) => {
        const selected = kind === 'boundary' ? boundaryModels.find((boundary) => boundary.id === target)?.coordinates || [] : (() => { const feature = features.find((item) => item.id === target); if (!feature) return []; if (feature.geometry.type === 'Point') { const [lng, lat] = feature.geometry.coordinates; return [[lat, lng] as LatLng]; } const source = feature.geometry.type === 'Polygon' ? feature.geometry.coordinates[0] : feature.geometry.coordinates; return source.map(([lng, lat]) => [lat, lng] as LatLng); })();
        setFocusTarget({ coords: selected, token: Date.now() });
      }} />}
    </Box>
  );
}
