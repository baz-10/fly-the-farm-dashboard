import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  TextField,
  Paper,
  List,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Box,
  Typography,
  CircularProgress,
  alpha,
  useTheme,
  InputAdornment,
} from '@mui/material';
import PlaceIcon from '@mui/icons-material/Place';
import SearchIcon from '@mui/icons-material/Search';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AustralianState } from '../types/chemical';

// Fix Leaflet default marker icon issue with bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// ─── Types ──────────────────────────────────────────────────

export interface AddressResult {
  address: string;
  locality: string;
  state: AustralianState;
  postcode: string;
  lat: number;
  lng: number;
  displayName: string;
  type?: string;
}

interface Props {
  onSelect: (result: AddressResult) => void;
  onInputChange?: (value: string) => void;
  initialValue?: string;
  label?: string;
  size?: 'small' | 'medium';
  showMap?: boolean;
  mapHeight?: number;
  lat?: number;
  lng?: number;
}

// ─── Map Recenter Component ─────────────────────────────────

function MapRecenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], 14, { animate: true });
  }, [map, lat, lng]);
  return null;
}

// ─── Component ──────────────────────────────────────────────

export default function AddressAutocomplete({
  onSelect,
  onInputChange,
  initialValue = '',
  label = 'Search Address',
  size = 'small',
  showMap = true,
  mapHeight = 220,
  lat,
  lng,
}: Props) {
  const theme = useTheme();
  const [query, setQuery] = useState(initialValue);
  const [results, setResults] = useState<AddressResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(
    lat && lng ? { lat, lng } : null
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Update map center when external lat/lng props change
  useEffect(() => {
    if (lat && lng) {
      setMapCenter({ lat, lng });
    }
  }, [lat, lng]);

  const searchAddress = useCallback(async (q: string) => {
    if (q.length < 3) {
      setResults([]);
      setFeedback('');
      return;
    }
    const requestNumber = ++requestRef.current;
    setLoading(true);
    setFeedback('');
    try {
      const params = new URLSearchParams({ q });
      const resp = await fetch(`/api/geocode?${params.toString()}`, { credentials: 'same-origin' });
      if (!resp.ok) throw new Error('Address search failed');
      const data = await resp.json();
      if (requestNumber !== requestRef.current) return;
      const limited: AddressResult[] = Array.isArray(data.results)
        ? data.results.slice(0, 5).map((item: any) => ({
            address: String(item.address || ''), locality: String(item.locality || ''),
            state: item.state as AustralianState, postcode: String(item.postcode || ''),
            lat: Number(item.lat), lng: Number(item.lng), displayName: String(item.label || ''),
            type: item.type ? String(item.type) : undefined,
          }))
        : [];
      setResults(limited);
      setOpen(limited.length > 0);
      setFeedback(limited.length ? '' : 'No matches—keep typing or enter the address manually.');
    } catch (err) {
      console.error('Address search error:', err);
      if (requestNumber !== requestRef.current) return;
      setResults([]);
      setOpen(false);
      setFeedback('Address search is unavailable. Try again or enter the address manually.');
    } finally {
      if (requestNumber === requestRef.current) setLoading(false);
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    onInputChange?.(val);
    setFeedback('');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => searchAddress(val), 350);
  };

  const handleSelect = (result: AddressResult) => {
    setQuery(result.displayName);
    setMapCenter({ lat: result.lat, lng: result.lng });
    setOpen(false);
    setResults([]);
    onSelect(result);
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <Box ref={containerRef}>
      <Box sx={{ position: 'relative' }}>
        <TextField
          label={label}
          value={query}
          onChange={handleInputChange}
          onFocus={() => results.length > 0 && setOpen(true)}
          size={size}
          fullWidth
          placeholder="Start typing an address..."
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: 'text.disabled', fontSize: 20 }} />
                </InputAdornment>
              ),
              endAdornment: loading ? (
                <InputAdornment position="end">
                  <CircularProgress size={18} />
                </InputAdornment>
              ) : undefined,
            },
          }}
        />

        {open && results.length > 0 && (
          <Paper
            elevation={8}
            sx={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              zIndex: 1300,
              mt: 0.5,
              borderRadius: '12px',
              maxHeight: 280,
              overflow: 'auto',
            }}
          >
            <List dense disablePadding>
              {results.map((r, idx) => (
                <ListItemButton
                  key={idx}
                  onClick={() => handleSelect(r)}
                  sx={{
                    py: 1.5,
                    px: 2,
                    '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.06) },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <PlaceIcon sx={{ color: 'primary.main', fontSize: 20 }} />
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Typography variant="body2" fontWeight={600} noWrap>
                        {r.address || r.locality}
                      </Typography>
                    }
                    secondary={
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {[r.locality, r.state, r.postcode].filter(Boolean).join(', ')}
                      </Typography>
                    }
                  />
                </ListItemButton>
              ))}
            </List>
          </Paper>
        )}
      </Box>

      {feedback && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
          {feedback}
        </Typography>
      )}

      {/* Map Display */}
      {showMap && mapCenter && (
        <Box
          sx={{
            mt: 1.5,
            borderRadius: '12px',
            overflow: 'hidden',
            border: `1px solid ${alpha(theme.palette.primary.main, 0.12)}`,
            height: mapHeight,
            '& .leaflet-container': { height: '100%', width: '100%', borderRadius: '12px' },
          }}
        >
          <MapContainer
            center={[mapCenter.lat, mapCenter.lng]}
            zoom={14}
            style={{ height: '100%', width: '100%' }}
            scrollWheelZoom={false}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <Marker position={[mapCenter.lat, mapCenter.lng]} />
            <MapRecenter lat={mapCenter.lat} lng={mapCenter.lng} />
          </MapContainer>
        </Box>
      )}
    </Box>
  );
}
