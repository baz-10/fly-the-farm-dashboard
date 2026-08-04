import React from 'react';
import { Box, alpha, useTheme } from '@mui/material';
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function MapRecenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  React.useEffect(() => { map.setView([lat, lng], 14, { animate: true }); }, [map, lat, lng]);
  return null;
}

export default function AddressLocationMap({ lat, lng, height }: { lat: number; lng: number; height: number }) {
  const theme = useTheme();
  return <Box sx={{
    mt: 1.5, borderRadius: '12px', overflow: 'hidden',
    border: `1px solid ${alpha(theme.palette.primary.main, 0.12)}`,
    height, '& .leaflet-container': { height: '100%', width: '100%', borderRadius: '12px' },
  }}>
    <MapContainer center={[lat, lng]} zoom={14} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Marker position={[lat, lng]} />
      <MapRecenter lat={lat} lng={lng} />
    </MapContainer>
  </Box>;
}
