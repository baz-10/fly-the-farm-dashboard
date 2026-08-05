import React from 'react';
import { Box, ToggleButton, ToggleButtonGroup, alpha, useTheme } from '@mui/material';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function MapRecenter({ lat, lng, viewportResetKey }: { lat: number; lng: number; viewportResetKey: number }) {
  const map = useMap();
  const target = React.useRef<[number, number]>([lat, lng]);
  target.current = [lat, lng];
  React.useEffect(() => { map.setView(target.current, 14, { animate: true }); }, [map, viewportResetKey]);
  return null;
}

type MapLayer = 'STREET' | 'SATELLITE' | 'HYBRID';
const MAP_LAYER_KEY = 'spray-command.map-layer';

function MapClickHandler({ onLocationChange }: { onLocationChange: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (event) => onLocationChange(event.latlng.lat, event.latlng.lng) });
  return null;
}

export default function AddressLocationMap({ lat, lng, height, onLocationChange, viewportResetKey = 0 }: { lat: number; lng: number; height: number; onLocationChange: (lat: number, lng: number) => void; viewportResetKey?: number }) {
  const theme = useTheme();
  const [layer, setLayer] = React.useState<MapLayer>(() => {
    try {
      const saved = window.localStorage.getItem(MAP_LAYER_KEY);
      return saved === 'SATELLITE' || saved === 'HYBRID' ? saved : 'STREET';
    } catch { return 'STREET'; }
  });
  const chooseLayer = (_: React.MouseEvent<HTMLElement>, next: MapLayer | null) => {
    if (!next) return;
    setLayer(next);
    try { window.localStorage.setItem(MAP_LAYER_KEY, next); } catch { /* preference only */ }
  };
  return <Box sx={{
    mt: 1.5, borderRadius: '12px',
    border: `1px solid ${alpha(theme.palette.primary.main, 0.12)}`,
    overflow: 'hidden',
  }}>
    <Box sx={{ p: 1, bgcolor: alpha(theme.palette.background.paper, 0.96) }}>
      <ToggleButtonGroup exclusive value={layer} onChange={chooseLayer} size="small" fullWidth>
        <ToggleButton value="STREET" aria-label="Street map">Street</ToggleButton>
        <ToggleButton value="SATELLITE" aria-label="Satellite imagery">Satellite</ToggleButton>
        <ToggleButton value="HYBRID" aria-label="Hybrid satellite with labels">Hybrid</ToggleButton>
      </ToggleButtonGroup>
    </Box>
    <Box sx={{ height, '& .leaflet-container': { height: '100%', width: '100%' } }}>
      <MapContainer center={[lat, lng]} zoom={14} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
        {layer === 'STREET' && <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />}
        {(layer === 'SATELLITE' || layer === 'HYBRID') && <TileLayer attribution="Tiles &copy; Esri" url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />}
        {layer === 'HYBRID' && <TileLayer attribution="Labels &copy; Esri" url="https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}" />}
        <Marker position={[lat, lng]} draggable eventHandlers={{ dragend: (event) => {
          const point = event.target.getLatLng();
          onLocationChange(point.lat, point.lng);
        } }} />
        <MapClickHandler onLocationChange={onLocationChange} />
        <MapRecenter lat={lat} lng={lng} viewportResetKey={viewportResetKey} />
      </MapContainer>
    </Box>
  </Box>;
}
