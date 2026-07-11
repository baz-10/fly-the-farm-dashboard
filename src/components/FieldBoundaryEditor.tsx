import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Box,
  Button,
  Typography,
  Stack,
  Chip,
  IconButton,
  alpha,
  useTheme,
  ToggleButtonGroup,
  ToggleButton,
  Tooltip,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DeleteIcon from '@mui/icons-material/Delete';
import UndoIcon from '@mui/icons-material/Undo';
import PolylineIcon from '@mui/icons-material/Polyline';
import TouchAppIcon from '@mui/icons-material/TouchApp';
import SquareFootIcon from '@mui/icons-material/SquareFoot';
import { MapContainer, TileLayer, Polygon, Marker, useMapEvents, useMap, LayersControl } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LatLng, BoundaryFileRef } from '../types/fieldManagement';

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

// ─── Area Calculation ───────────────────────────────────────

function calculateAreaHectares(coords: LatLng[]): number {
  if (coords.length < 3) return 0;
  // Shoelace formula on projected coordinates (approximate for small areas)
  // Convert lat/lng to metres using the mean latitude
  const meanLat = coords.reduce((s, c) => s + c[0], 0) / coords.length;
  const latRad = (meanLat * Math.PI) / 180;
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos(latRad);

  let area = 0;
  for (let i = 0; i < coords.length; i++) {
    const j = (i + 1) % coords.length;
    const xi = coords[i][1] * mPerDegLng;
    const yi = coords[i][0] * mPerDegLat;
    const xj = coords[j][1] * mPerDegLng;
    const yj = coords[j][0] * mPerDegLat;
    area += xi * yj - xj * yi;
  }
  return Math.abs(area / 2) / 10000; // m² to hectares
}

// ─── KML Parser ─────────────────────────────────────────────

function parseKMLCoordinates(kmlText: string): LatLng[] {
  const coords: LatLng[] = [];
  // Find <coordinates> tags
  const coordRegex = /<coordinates[^>]*>([\s\S]*?)<\/coordinates>/gi;
  let match;
  while ((match = coordRegex.exec(kmlText)) !== null) {
    const raw = match[1].trim();
    const points = raw.split(/\s+/);
    for (const pt of points) {
      const parts = pt.split(',');
      if (parts.length >= 2) {
        const lng = parseFloat(parts[0]);
        const lat = parseFloat(parts[1]);
        if (!isNaN(lat) && !isNaN(lng)) {
          coords.push([lat, lng]);
        }
      }
    }
  }
  // Remove duplicate closing point if present
  if (coords.length > 1) {
    const first = coords[0];
    const last = coords[coords.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) {
      coords.pop();
    }
  }
  return coords;
}

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
  const flown = useRef(false);
  useEffect(() => {
    if (lat && lng && !flown.current) {
      map.flyTo([lat, lng], 16, { duration: 1.2 });
      flown.current = true;
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

// ─── Props ──────────────────────────────────────────────────

interface Props {
  coords: LatLng[];
  onCoordsChange: (coords: LatLng[]) => void;
  onAreaChange: (hectares: number) => void;
  onBoundaryFile?: (ref: BoundaryFileRef | null) => void;
  propertyLat?: number;
  propertyLng?: number;
  onPropertyPinMove?: (lat: number, lng: number) => void;
  mapHeight?: number;
  readOnly?: boolean;
}

// ─── Component ──────────────────────────────────────────────

export default function FieldBoundaryEditor({
  coords,
  onCoordsChange,
  onAreaChange,
  onBoundaryFile,
  propertyLat,
  propertyLng,
  onPropertyPinMove,
  mapHeight = 350,
  readOnly = false,
}: Props) {
  const theme = useTheme();
  const [drawing, setDrawing] = useState(false);
  const [mode, setMode] = useState<'draw' | 'upload'>('draw');
  const [pinPos, setPinPos] = useState<{ lat: number; lng: number } | null>(
    propertyLat && propertyLng ? { lat: propertyLat, lng: propertyLng } : null
  );
  const markerRef = useRef<L.Marker | null>(null);

  // Sync if parent props change
  useEffect(() => {
    if (propertyLat && propertyLng) {
      setPinPos({ lat: propertyLat, lng: propertyLng });
    }
  }, [propertyLat, propertyLng]);

  const defaultCenter = React.useMemo<[number, number]>(() => [
    propertyLat || -25.2744,
    propertyLng || 133.7751,
  ], [propertyLat, propertyLng]);
  const defaultZoom = propertyLat ? 14 : 5;

  const area = calculateAreaHectares(coords);

  useEffect(() => {
    onAreaChange(Math.round(area * 100) / 100);
  }, [area]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMapClick = useCallback((lat: number, lng: number) => {
    const updated = [...coords, [lat, lng] as LatLng];
    onCoordsChange(updated);
  }, [coords, onCoordsChange]);

  const handleUndo = () => {
    if (coords.length > 0) {
      onCoordsChange(coords.slice(0, -1));
    }
  };

  const handleClear = () => {
    onCoordsChange([]);
    onBoundaryFile?.(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();

    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result as string;
      let parsed: LatLng[] = [];

      if (ext === 'kml' || ext === 'kmz') {
        parsed = parseKMLCoordinates(content);
      } else if (ext === 'shp') {
        // SHP is binary — for now just store the file reference
        // Full SHP parsing would need a library like shapefile.js
      }

      if (parsed.length > 0) {
        onCoordsChange(parsed);
      }

      // Store the file reference
      const dataUrlReader = new FileReader();
      dataUrlReader.onload = () => {
        onBoundaryFile?.({
          fileName: file.name,
          fileType: (ext as 'kml' | 'shp' | 'kmz') || 'kml',
          sizeBytes: file.size,
          dataUrl: dataUrlReader.result as string,
          boundingBox: parsed.length > 0 ? {
            north: Math.max(...parsed.map(c => c[0])),
            south: Math.min(...parsed.map(c => c[0])),
            east: Math.max(...parsed.map(c => c[1])),
            west: Math.min(...parsed.map(c => c[1])),
          } : undefined,
          uploadedAt: new Date().toISOString(),
        });
      };
      dataUrlReader.readAsDataURL(file);
    };

    if (ext === 'shp') {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
    e.target.value = '';
  };

  return (
    <Box>
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
              KML / SHP
              <input type="file" hidden accept=".kml,.kmz,.shp" onChange={handleFileUpload} />
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
              label={`${area.toFixed(1)} ha`}
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

      {/* Drawing instructions */}
      {!readOnly && mode === 'draw' && drawing && (
        <Typography variant="caption" color="primary.main" sx={{ display: 'block', mb: 1, fontWeight: 600 }}>
          Click on the map to place boundary points. Minimum 3 points to form a paddock.
        </Typography>
      )}

      {/* Map */}
      <Box
        sx={{
          borderRadius: '12px',
          overflow: 'hidden',
          border: `1.5px solid ${alpha(theme.palette.primary.main, drawing ? 0.4 : 0.12)}`,
          height: mapHeight,
          cursor: !readOnly && drawing ? 'crosshair' : 'grab',
          transition: 'border-color 0.2s',
          '& .leaflet-container': { height: '100%', width: '100%', borderRadius: '12px' },
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
          {coords.length === 0 && <FlyToProperty lat={propertyLat} lng={propertyLng} />}

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
          {coords.length >= 3 && (
            <Polygon
              positions={coords}
              pathOptions={{
                color: '#ffffff',
                fillColor: theme.palette.primary.main,
                fillOpacity: 0.25,
                weight: 2.5,
              }}
            />
          )}

          {/* Boundary points — draggable in edit mode */}
          {coords.map((c, idx) => (
            <Marker
              key={idx}
              position={c}
              icon={boundaryPointIcon}
              draggable={!readOnly}
              eventHandlers={{
                dragend: (e) => {
                  const { lat, lng } = e.target.getLatLng();
                  const updated = coords.map((pt, i) => i === idx ? [lat, lng] as LatLng : pt);
                  onCoordsChange(updated);
                },
              }}
            />
          ))}

          {/* Auto-fit when coords load and return to the neutral view when cleared. */}
          <FitBounds coords={coords} emptyCenter={defaultCenter} emptyZoom={defaultZoom} />
        </MapContainer>
      </Box>
    </Box>
  );
}
