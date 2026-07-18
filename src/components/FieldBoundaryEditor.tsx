import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
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
import { upsertMapFeature } from '../utils/missionMapAnnotations';
import { MAP_FEATURE_COLORS, MAP_FEATURE_LABELS } from './MissionMapLegend';
import MissionMapFeatureRegister from './MissionMapFeatureRegister';
import {
  calculateBoundaryAreaHectares,
  parseKmlBoundary,
  parseShapefileBoundary,
} from '../utils/boundaryImport';
import { appendDraftVertex, canFinishDrawing, DrawingMode, finishDrawing } from '../utils/missionMapDrawing';

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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    try {
      setImportNotice(null);
      const kml = files.find((file) => file.name.toLowerCase().endsWith('.kml'));
      const result = kml
        ? parseKmlBoundary(await kml.text())
        : await parseShapefileBoundary(files);
      const primaryFile = kml || files.find((file) => file.name.toLowerCase().endsWith('.zip')) || files[0];

      onCoordsChange(result.coords);
      onPolygonsChange?.(result.polygons);
      onBoundaryMetadataChange?.(result.polygons.map((_, index) => ({ name: `Boundary ${index + 1}`, notes: '' })));
      const importedCoords = result.polygons.flat();
      onBoundaryFile?.({
        fileName: files.length === 1 ? primaryFile.name : files.map((file) => file.name).join(', '),
        fileType: kml ? 'kml' : 'shp',
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
      setImportNotice({
        severity: result.warning ? 'warning' : 'success',
        message: `${result.areaHa.toFixed(1)} ha imported across ${result.polygonCount} paddock${result.polygonCount === 1 ? '' : 's'}. ${result.warning || ''}`.trim(),
      });
    } catch (error) {
      setImportNotice({
        severity: 'error',
        message: error instanceof Error ? error.message : 'The selected boundary could not be imported.',
      });
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
            <Button
              variant="outlined"
              component="label"
              size="small"
              startIcon={<UploadFileIcon />}
              sx={{ borderRadius: '8px', fontWeight: 600, fontSize: '0.75rem' }}
            >
              KML / SHP / ZIP
              <input type="file" hidden multiple accept=".kml,.zip,.shp,.dbf,.prj,.cpg" onChange={handleFileUpload} />
            </Button>
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
          {boundaryPolygons.map((polygonCoords, polygonIndex) => polygonCoords.length >= 3 && (
            <Polygon
              key={`boundary-polygon-${polygonIndex}`}
              positions={polygonCoords}
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
            return <Marker key={feature.id} position={[lat, lng]} icon={icon} />;
          })}

          {/* Boundary points — draggable in edit mode */}
          {boundaryPolygons.flatMap((polygon, polygonIndex) => polygon.map((c, vertexIndex) => (
            <Marker
              key={`${polygonIndex}-${vertexIndex}`}
              position={c}
              icon={boundaryPointIcon}
              draggable={!readOnly}
              eventHandlers={{
                dragend: (e) => {
                  const { lat, lng } = e.target.getLatLng();
                  const updatedPolygons = boundaryPolygons.map((value, index) => index === polygonIndex ? value.map((point, pointIndex) => pointIndex === vertexIndex ? [lat, lng] as LatLng : point) : value);
                  onCoordsChange(updatedPolygons[0] || []);
                  onPolygonsChange?.(updatedPolygons);
                },
              }}
            />
          )))}

          {/* Auto-fit when coords load and return to the neutral view when cleared. */}
          <FitBounds coords={allBoundaryCoords} emptyCenter={defaultCenter} emptyZoom={defaultZoom} />
          <FocusBounds coords={focusTarget.coords} token={focusTarget.token} />
        </MapContainer>
      </Box>
      {!readOnly && onFeaturesChange && <MissionMapFeatureRegister polygons={boundaryPolygons} boundaryMetadata={boundaryMetadata} onBoundaryMetadataChange={onBoundaryMetadataChange} features={features} onFeaturesChange={onFeaturesChange} onPolygonsChange={(next) => { onPolygonsChange?.(next); onCoordsChange(next[0] || []); if (next.length === 0) onBoundaryFile?.(null); }} onZoom={(kind, target) => {
        const selected = kind === 'boundary' ? boundaryPolygons[Number(target)] || [] : (() => { const feature = features.find((item) => item.id === target); if (!feature) return []; if (feature.geometry.type === 'Point') { const [lng, lat] = feature.geometry.coordinates; return [[lat, lng] as LatLng]; } const source = feature.geometry.type === 'Polygon' ? feature.geometry.coordinates[0] : feature.geometry.coordinates; return source.map(([lng, lat]) => [lat, lng] as LatLng); })();
        setFocusTarget({ coords: selected, token: Date.now() });
      }} />}
    </Box>
  );
}
