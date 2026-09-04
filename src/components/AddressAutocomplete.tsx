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
  Button,
  Stack,
  MenuItem,
} from '@mui/material';
import PlaceIcon from '@mui/icons-material/Place';
import SearchIcon from '@mui/icons-material/Search';
import { ALL_STATES, AustralianState } from '../types/chemical';
import { composeAddress, invalidateAddressConfirmation, StructuredAddress } from './address/structuredLocation';

const AddressLocationMap = React.lazy(() => import('./AddressLocationMap'));

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
  coordinateSource?: 'GEOCODED' | 'MANUALLY_ADJUSTED';
  locationConfirmedAt?: string;
}

interface Props {
  onSelect: (result: AddressResult) => void;
  onInputChange?: (value: string) => void;
  initialValue?: string;
  initialLocality?: string;
  initialState?: AustralianState;
  initialPostcode?: string;
  label?: string;
  size?: 'small' | 'medium';
  showMap?: boolean;
  mapHeight?: number;
  lat?: number;
  lng?: number;
  coordinateSource?: 'GEOCODED' | 'MANUALLY_ADJUSTED';
  locationConfirmedAt?: string;
}

// ─── Component ──────────────────────────────────────────────

export default function AddressAutocomplete({
  onSelect,
  onInputChange,
  initialValue = '',
  initialLocality = '',
  initialState = 'NSW',
  initialPostcode = '',
  label = 'Search Address',
  size = 'small',
  showMap = true,
  mapHeight = 220,
  lat,
  lng,
  coordinateSource,
  locationConfirmedAt,
}: Props) {
  const theme = useTheme();
  const [query, setQuery] = useState(initialValue);
  const [manual, setManual] = useState(false);
  const [structured, setStructured] = useState<StructuredAddress>({
    address: initialValue, locality: initialLocality, state: initialState, postcode: initialPostcode,
  });
  const [results, setResults] = useState<AddressResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(
    Number.isFinite(lat) && Number.isFinite(lng) ? { lat: lat as number, lng: lng as number } : null
  );
  const [selected, setSelected] = useState<AddressResult | null>(() => Number.isFinite(lat) && Number.isFinite(lng) ? {
    address: initialValue, locality: initialLocality, state: initialState, postcode: initialPostcode, displayName: initialValue,
    lat: lat as number, lng: lng as number, coordinateSource: coordinateSource || 'GEOCODED', locationConfirmedAt,
  } : null);
  const [viewportResetKey, setViewportResetKey] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Update map center when external lat/lng props change
  useEffect(() => {
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      setMapCenter({ lat: lat as number, lng: lng as number });
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
            address: String(item.address || item.label || ''), locality: String(item.locality || ''),
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
    if (selected) {
      const staleSelection = {
        ...selected,
        address: val,
        displayName: val,
        locationConfirmedAt: undefined,
      };
      setSelected(staleSelection);
      onSelect(staleSelection);
    }
    setFeedback('');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => searchAddress(val), 350);
  };

  const handleSelect = (result: AddressResult) => {
    const located = { ...result, coordinateSource: 'GEOCODED' as const, locationConfirmedAt: undefined };
    setQuery(result.displayName);
    setStructured({ address: result.address, locality: result.locality, state: result.state, postcode: result.postcode });
    setMapCenter({ lat: result.lat, lng: result.lng });
    setViewportResetKey((current) => current + 1);
    setSelected(located);
    setOpen(false);
    setResults([]);
    onSelect(located);
  };

  const updateStructured = (updates: Partial<StructuredAddress>) => {
    requestRef.current += 1;
    const next = { ...structured, ...updates };
    setStructured(next);
    setQuery(composeAddress(next));
    const base: AddressResult = selected
      ? invalidateAddressConfirmation(selected, updates)
      : { ...next, lat: Number.NaN, lng: Number.NaN, displayName: composeAddress(next) };
    const changed = { ...base, ...next, displayName: composeAddress(next), locationConfirmedAt: undefined };
    if (selected) setSelected(changed);
    onInputChange?.(changed.displayName);
    onSelect(changed);
  };

  const locateManualAddress = async () => {
    const description = composeAddress(structured);
    if (!structured.address.trim() || !structured.locality.trim() || !structured.postcode.trim()) {
      setFeedback('Enter the street or property, locality or region, state and postcode before showing it on the map.');
      return;
    }
    const requestNumber = ++requestRef.current;
    setLoading(true);
    setFeedback('');
    try {
      const response = await fetch(`/api/geocode?${new URLSearchParams({ q: description }).toString()}`, { credentials: 'same-origin' });
      if (!response.ok) throw new Error('Address search failed');
      const data = await response.json();
      if (requestNumber !== requestRef.current) return;
      const result = Array.isArray(data.results) ? data.results[0] : undefined;
      const nextLat = Number(result?.lat);
      const nextLng = Number(result?.lng);
      if (!Number.isFinite(nextLat) || !Number.isFinite(nextLng)) {
        setFeedback('This address could not be placed automatically. Check the locality and postcode, then try again.');
        return;
      }
      const located: AddressResult = {
        ...structured, lat: nextLat, lng: nextLng, displayName: description,
        coordinateSource: 'GEOCODED', locationConfirmedAt: undefined,
      };
      setSelected(located);
      setMapCenter({ lat: nextLat, lng: nextLng });
      setViewportResetKey((current) => current + 1);
      onSelect(located);
    } catch {
      if (requestNumber !== requestRef.current) return;
      setFeedback('The address could not be placed automatically. Your typed address has been retained.');
    } finally {
      if (requestNumber === requestRef.current) setLoading(false);
    }
  };

  const handleLocationChange = (nextLat: number, nextLng: number) => {
    const adjusted: AddressResult = {
      ...(selected || { address: query, locality: '', state: 'NSW' as AustralianState, postcode: '', displayName: query }),
      lat: nextLat, lng: nextLng, coordinateSource: 'MANUALLY_ADJUSTED', locationConfirmedAt: undefined,
    };
    setMapCenter({ lat: nextLat, lng: nextLng });
    setSelected(adjusted);
    onSelect(adjusted);
  };

  const confirmLocation = () => {
    if (!selected || !mapCenter) return;
    const confirmed = { ...selected, lat: mapCenter.lat, lng: mapCenter.lng, locationConfirmedAt: new Date().toISOString() };
    setSelected(confirmed);
    onSelect(confirmed);
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
            <List dense disablePadding role="listbox" aria-label="Address search results">
              {results.map((r, idx) => (
                <ListItemButton
                  key={idx}
                  role="option"
                  aria-selected="false"
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

      <Button size="small" onClick={() => setManual((current) => !current)} sx={{ mt: 0.75 }}>
        {manual ? 'Use address search' : 'Enter address manually'}
      </Button>

      {manual && (
        <Stack spacing={1.25} sx={{ mt: 1 }}>
          <TextField label="Street number and road" value={structured.address} onChange={(event) => updateStructured({ address: event.target.value })} size={size} fullWidth />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
            <TextField label="Town / locality / region" value={structured.locality} onChange={(event) => updateStructured({ locality: event.target.value })} size={size} fullWidth />
            <TextField label="State" select value={structured.state} onChange={(event) => updateStructured({ state: event.target.value as AustralianState })} size={size} sx={{ minWidth: 100 }}>
              {ALL_STATES.map((state) => <MenuItem key={state} value={state}>{state}</MenuItem>)}
            </TextField>
            <TextField label="Postcode" value={structured.postcode} onChange={(event) => updateStructured({ postcode: event.target.value })} size={size} inputProps={{ inputMode: 'numeric', maxLength: 4 }} sx={{ minWidth: 120 }} />
          </Stack>
          <Button variant="outlined" size="small" onClick={() => void locateManualAddress()} disabled={loading} sx={{ alignSelf: 'flex-start' }}>Show address on map</Button>
        </Stack>
      )}

      {feedback && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
          {feedback}
        </Typography>
      )}

      {/* Map Display */}
      {showMap && mapCenter && (
        <React.Suspense fallback={<Box sx={{ mt: 1.5, height: mapHeight }} />}>
          <AddressLocationMap lat={mapCenter.lat} lng={mapCenter.lng} height={mapHeight} onLocationChange={handleLocationChange} viewportResetKey={viewportResetKey} />
        </React.Suspense>
      )}
      {showMap && mapCenter && (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} sx={{ mt: 1 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="body2" fontWeight={700} color={selected?.locationConfirmedAt ? 'success.main' : 'warning.main'}>
              {selected?.locationConfirmedAt ? 'Location confirmed' : 'Location not confirmed'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {selected?.coordinateSource === 'MANUALLY_ADJUSTED' ? 'Manually adjusted location' : 'Address-derived location'} · {mapCenter.lat.toFixed(6)}, {mapCenter.lng.toFixed(6)}
            </Typography>
          </Box>
          <Button variant={selected?.locationConfirmedAt ? 'outlined' : 'contained'} size="small" onClick={confirmLocation}>
            {selected?.locationConfirmedAt ? 'Location confirmed' : 'Confirm location'}
          </Button>
        </Stack>
      )}
    </Box>
  );
}
