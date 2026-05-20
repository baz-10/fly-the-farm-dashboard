import React from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  FormControl,
  Grid,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  TextField,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ForestIcon from '@mui/icons-material/Forest';
import HistoryIcon from '@mui/icons-material/History';
import MapIcon from '@mui/icons-material/Map';
import SaveIcon from '@mui/icons-material/Save';
import SearchIcon from '@mui/icons-material/Search';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { GeoJSON, LayersControl, MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  getFeatureCategory,
  lookupVegetationByLotPlan,
  sanitizeLotPlan,
  VEGETATION_CATEGORY_DETAILS,
} from '../services/pmavService';
import {
  getSavedVegetationChecks,
  loadSavedVegetationChecks,
  saveVegetationCheckAsync,
} from '../services/pmavCheckStore';
import {
  getFieldsByProperty,
  getProperties,
} from '../services/fieldManagementStore';
import {
  SavedVegetationCheck,
  VegetationCategory,
  VegetationLookupResult,
} from '../types/pmav';
import { Field, Property } from '../types/fieldManagement';

const EXAMPLE_LOT_PLANS = ['2RP884818', '22SP241556', '10PN141'];
const DEFAULT_CENTER: [number, number] = [-22.5, 144.5];
type NoticeSeverity = 'success' | 'info' | 'warning' | 'error';

function formatCheckedAt(value: string): string {
  return new Date(value).toLocaleString('en-AU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function visibleCategoryEntries(categories: Record<VegetationCategory, number>) {
  return (Object.entries(categories) as Array<[VegetationCategory, number]>)
    .filter(([, count]) => count > 0);
}

function getLookupTone(result: VegetationLookupResult | null): 'success' | 'warning' | 'info' {
  if (!result) return 'info';
  const categories = result.summary.categories;
  if (categories.A || categories.B || categories.C || categories.R) return 'warning';
  if (categories.X) return 'success';
  return 'info';
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function FitVegetationBounds({ data }: { data: VegetationLookupResult['data'] | null }) {
  const map = useMap();

  React.useEffect(() => {
    if (!data || data.features.length === 0) return;

    const layer = L.geoJSON(data as any);
    const bounds = layer.getBounds();

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [32, 32], maxZoom: 15 });
    }
  }, [data, map]);

  return null;
}

function VegetationMap({ result }: { result: VegetationLookupResult | null }) {
  const theme = useTheme();
  const data = result?.data || null;
  const geoJsonKey = result
    ? `${result.summary.dataset}-${result.summary.checkedAt}-${result.summary.featureCount}`
    : 'empty';

  return (
    <Box
      sx={{
        height: { xs: 430, md: 620 },
        borderRadius: '8px',
        overflow: 'hidden',
        border: `1px solid ${alpha(theme.palette.primary.main, 0.16)}`,
        position: 'relative',
        '& .leaflet-container': {
          height: '100%',
          width: '100%',
          fontFamily: 'inherit',
        },
      }}
    >
      <MapContainer center={DEFAULT_CENTER} zoom={5} scrollWheelZoom>
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="Satellite">
            <TileLayer
              attribution="&copy; Esri, Maxar, Earthstar Geographics"
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Street">
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
          </LayersControl.BaseLayer>
        </LayersControl>

        {data && data.features.length > 0 && (
          <GeoJSON
            key={geoJsonKey}
            data={data as any}
            style={(feature: any) => {
              const category = getFeatureCategory(feature);
              const color = VEGETATION_CATEGORY_DETAILS[category].color;
              return {
                color,
                weight: 2,
                fillColor: color,
                fillOpacity: category === 'X' ? 0.28 : 0.38,
              };
            }}
            onEachFeature={(feature: any, layer) => {
              const category = getFeatureCategory(feature);
              const props = feature.properties || {};
              const lotPlan = escapeHtml(props.lotplan || result?.summary.lotPlan || 'Unknown');
              const source = result?.summary.dataset === 'pmav' ? 'PMAV' : 'RVM';
              const pmavNumber = props.pmav_no ? `<br><strong>PMAV:</strong> ${escapeHtml(props.pmav_no)}` : '';
              const status = props.pmav_stat ? `<br><strong>Status:</strong> ${escapeHtml(props.pmav_stat)}` : '';

              layer.bindPopup(`
                <strong>${source} vegetation mapping</strong><br>
                <strong>Lot/Plan:</strong> ${lotPlan}<br>
                <strong>Category:</strong> ${escapeHtml(category)}
                ${pmavNumber}
                ${status}
              `);
            }}
          />
        )}

        <FitVegetationBounds data={data} />
      </MapContainer>

      {!result && (
        <Box
          sx={{
            position: 'absolute',
            inset: 16,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'flex-start',
          }}
        >
          <Chip
            icon={<MapIcon />}
            label="Search a Queensland lot/plan to draw PMAV or RVM categories"
            sx={{
              bgcolor: 'rgba(255,255,255,0.94)',
              boxShadow: '0 8px 22px rgba(0,0,0,0.16)',
              fontWeight: 700,
            }}
          />
        </Box>
      )}
    </Box>
  );
}

export default function ComplianceVegetation() {
  const theme = useTheme();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialLotPlan = React.useRef(sanitizeLotPlan(searchParams.get('lotPlan') || ''));
  const [properties] = React.useState<Property[]>(() => getProperties());
  const [selectedPropertyId, setSelectedPropertyId] = React.useState(searchParams.get('propertyId') || '');
  const [selectedFieldId, setSelectedFieldId] = React.useState(searchParams.get('fieldId') || '');
  const [lotPlan, setLotPlan] = React.useState(initialLotPlan.current);
  const [result, setResult] = React.useState<VegetationLookupResult | null>(null);
  const [savedChecks, setSavedChecks] = React.useState<SavedVegetationCheck[]>(() => getSavedVegetationChecks());
  const [loading, setLoading] = React.useState(false);
  const initialLookupComplete = React.useRef(false);
  const [notice, setNotice] = React.useState<{ open: boolean; severity: NoticeSeverity; message: string }>({
    open: false,
    severity: 'info',
    message: '',
  });

  const selectedProperty = properties.find((property) => property.id === selectedPropertyId);
  const fields = React.useMemo<Field[]>(
    () => selectedPropertyId ? getFieldsByProperty(selectedPropertyId) : [],
    [selectedPropertyId]
  );
  const categoryEntries = result ? visibleCategoryEntries(result.summary.categories) : [];
  const lookupTone = getLookupTone(result);

  const showNotice = React.useCallback((severity: NoticeSeverity, message: string) => {
    setNotice({ open: true, severity, message });
  }, []);

  const handlePropertyChange = (propertyId: string) => {
    const property = properties.find((item) => item.id === propertyId);
    setSelectedPropertyId(propertyId);
    setSelectedFieldId('');
    if (property?.lotPlan) {
      setLotPlan(property.lotPlan);
    }
  };

  const handleSearch = React.useCallback(async (overrideLotPlan?: string) => {
    const cleanLotPlan = sanitizeLotPlan(overrideLotPlan || lotPlan);
    setLotPlan(cleanLotPlan);

    if (cleanLotPlan.length < 4) {
      showNotice('warning', 'Enter a valid lot/plan before searching.');
      return;
    }

    setLoading(true);
    try {
      const lookup = await lookupVegetationByLotPlan(cleanLotPlan);
      setResult(lookup);
      showNotice(
        lookup.summary.dataset === 'pmav' ? 'success' : 'info',
        lookup.summary.dataset === 'pmav'
          ? 'PMAV mapping found for this property.'
          : 'No PMAV found. Showing RVM mapping instead.'
      );
    } catch (error) {
      setResult(null);
      showNotice('error', error instanceof Error ? error.message : 'Vegetation lookup failed.');
    } finally {
      setLoading(false);
    }
  }, [lotPlan, showNotice]);

  React.useEffect(() => {
    if (initialLookupComplete.current || !initialLotPlan.current) return;
    initialLookupComplete.current = true;
    void handleSearch(initialLotPlan.current);
  }, [handleSearch]);

  React.useEffect(() => {
    let cancelled = false;

    loadSavedVegetationChecks().then((checks) => {
      if (!cancelled) {
        setSavedChecks(checks);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSaveCheck = async () => {
    if (!result) return;

    const saved = await saveVegetationCheckAsync(result.summary, {
      propertyId: selectedPropertyId || undefined,
      fieldId: selectedFieldId || undefined,
    });
    setSavedChecks(await loadSavedVegetationChecks());
    showNotice('success', `Vegetation check saved for ${saved.lotPlan}.`);
  };

  return (
    <Box sx={{ p: 3, maxWidth: 1500, mx: 'auto' }}>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate('/compliance')}
        sx={{ mb: 2, color: 'text.secondary', fontWeight: 700 }}
      >
        Compliance
      </Button>

      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 3 }}>
        <Box>
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: '12px',
                bgcolor: alpha(theme.palette.primary.main, 0.1),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'primary.main',
              }}
            >
              <ForestIcon />
            </Box>
            <Box>
              <Typography variant="h3" sx={{ fontWeight: 850, color: 'primary.dark', fontSize: { xs: '1.75rem', md: '2.15rem' } }}>
                Vegetation / PMAV
              </Typography>
              <Typography color="text.secondary">
                Check Queensland PMAV and regulated vegetation mapping before planning clearing-sensitive work.
              </Typography>
            </Box>
          </Stack>
        </Box>
        {result && (
          <Chip
            color={lookupTone}
            icon={lookupTone === 'success' ? <CheckCircleIcon /> : <WarningAmberIcon />}
            label={`${result.summary.sourceLabel} - ${result.summary.featureCount} mapped feature${result.summary.featureCount === 1 ? '' : 's'}`}
            sx={{ fontWeight: 800, alignSelf: { xs: 'flex-start', md: 'center' } }}
          />
        )}
      </Stack>

      <Alert severity="warning" sx={{ mb: 3, borderRadius: '8px' }}>
        PMAV and RVM results are operational decision support only. Verify against official Queensland Government sources before clearing or compliance decisions.
      </Alert>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Stack spacing={3}>
            <Card elevation={0} sx={{ borderRadius: '8px', border: `1px solid ${alpha(theme.palette.primary.main, 0.12)}` }}>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h6" sx={{ fontWeight: 800, mb: 2 }}>
                  Property Lookup
                </Typography>

                <Stack spacing={2}>
                  <FormControl size="small" fullWidth>
                    <InputLabel>Use saved property</InputLabel>
                    <Select
                      value={selectedPropertyId}
                      label="Use saved property"
                      onChange={(event) => handlePropertyChange(event.target.value)}
                    >
                      <MenuItem value="">
                        <em>Manual lookup</em>
                      </MenuItem>
                      {properties.map((property) => (
                        <MenuItem key={property.id} value={property.id}>
                          {property.name} {property.lotPlan ? `- ${property.lotPlan}` : ''}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  {selectedProperty && selectedProperty.state !== 'QLD' && (
                    <Alert severity="info" sx={{ borderRadius: '8px' }}>
                      PMAV data is Queensland-specific. This saved property is marked as {selectedProperty.state}.
                    </Alert>
                  )}

                  {fields.length > 0 && (
                    <FormControl size="small" fullWidth>
                      <InputLabel>Attach to field</InputLabel>
                      <Select
                        value={selectedFieldId}
                        label="Attach to field"
                        onChange={(event) => setSelectedFieldId(event.target.value)}
                      >
                        <MenuItem value="">
                          <em>Property-level check</em>
                        </MenuItem>
                        {fields.map((field) => (
                          <MenuItem key={field.id} value={field.id}>
                            {field.name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}

                  <TextField
                    label="Lot/Plan"
                    value={lotPlan}
                    onChange={(event) => setLotPlan(sanitizeLotPlan(event.target.value))}
                    placeholder="e.g. 2RP884818"
                    size="small"
                    fullWidth
                    inputProps={{ spellCheck: false }}
                    helperText="Enter lot and plan without spaces. PMAV is currently Queensland-only."
                  />

                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {EXAMPLE_LOT_PLANS.map((example) => (
                      <Chip
                        key={example}
                        label={example}
                        onClick={() => void handleSearch(example)}
                        variant="outlined"
                        size="small"
                        sx={{ fontWeight: 700 }}
                      />
                    ))}
                  </Stack>

                  <Button
                    variant="contained"
                    startIcon={<SearchIcon />}
                    onClick={() => void handleSearch()}
                    disabled={loading}
                    sx={{ minHeight: 44, fontWeight: 800 }}
                  >
                    {loading ? 'Checking Mapping...' : 'Check Vegetation Mapping'}
                  </Button>

                  {loading && <LinearProgress sx={{ borderRadius: 8 }} />}
                </Stack>
              </CardContent>
            </Card>

            <Card elevation={0} sx={{ borderRadius: '8px', border: `1px solid ${alpha(theme.palette.primary.main, 0.12)}` }}>
              <CardContent sx={{ p: 3 }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                  <HistoryIcon color="primary" />
                  <Typography variant="h6" sx={{ fontWeight: 800 }}>
                    Saved Checks
                  </Typography>
                </Stack>

                {savedChecks.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No vegetation checks have been saved yet.
                  </Typography>
                ) : (
                  <Stack spacing={1.25}>
                    {savedChecks.slice(0, 6).map((check) => (
                      <Box
                        key={check.id}
                        sx={{
                          p: 1.5,
                          borderRadius: '8px',
                          border: `1px solid ${alpha(theme.palette.divider, 0.8)}`,
                          bgcolor: alpha(theme.palette.primary.main, 0.025),
                        }}
                      >
                        <Stack direction="row" justifyContent="space-between" spacing={1}>
                          <Typography variant="body2" sx={{ fontWeight: 800 }}>
                            {check.lotPlan}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {formatCheckedAt(check.checkedAt)}
                          </Typography>
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                          {check.sourceLabel} - {check.featureCount} mapped features
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                )}
              </CardContent>
            </Card>
          </Stack>
        </Grid>

        <Grid size={{ xs: 12, lg: 8 }}>
          <Stack spacing={3}>
            <VegetationMap result={result} />

            {result && (
              <Card elevation={0} sx={{ borderRadius: '8px', border: `1px solid ${alpha(theme.palette.primary.main, 0.12)}` }}>
                <CardContent sx={{ p: 3 }}>
                  <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 2 }}>
                    <Box>
                      <Typography variant="h5" sx={{ fontWeight: 850, color: 'primary.dark' }}>
                        {result.summary.headline}
                      </Typography>
                      <Typography color="text.secondary">
                        {result.summary.lotPlan}
                        {result.summary.pmavNumber ? ` - PMAV ${result.summary.pmavNumber}` : ''}
                        {result.summary.pmavStatus ? ` - ${result.summary.pmavStatus}` : ''}
                      </Typography>
                    </Box>
                    <Button
                      variant="outlined"
                      startIcon={<SaveIcon />}
                      onClick={handleSaveCheck}
                      sx={{ alignSelf: { xs: 'stretch', md: 'center' }, minHeight: 42, fontWeight: 800 }}
                    >
                      Save Check
                    </Button>
                  </Stack>

                  <Alert severity={lookupTone} sx={{ mb: 2, borderRadius: '8px' }}>
                    {result.summary.interpretation}
                  </Alert>

                  <Grid container spacing={1.5} sx={{ mb: 2 }}>
                    <Grid size={{ xs: 6, sm: 3 }}>
                      <Typography variant="h4" sx={{ fontWeight: 900, color: 'primary.main', lineHeight: 1 }}>
                        {result.summary.featureCount}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Mapped features
                      </Typography>
                    </Grid>
                    <Grid size={{ xs: 6, sm: 3 }}>
                      <Typography variant="h4" sx={{ fontWeight: 900, color: 'secondary.main', lineHeight: 1 }}>
                        {result.summary.propertyCount}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Lot/plans returned
                      </Typography>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Typography variant="body2" sx={{ fontWeight: 800, mb: 0.5 }}>
                        Checked
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {new Date(result.summary.checkedAt).toLocaleString('en-AU')}
                      </Typography>
                    </Grid>
                  </Grid>

                  <Divider sx={{ my: 2 }} />

                  <Typography variant="subtitle2" sx={{ fontWeight: 850, mb: 1 }}>
                    Category Breakdown
                  </Typography>
                  {categoryEntries.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      No category features were returned for this lot/plan.
                    </Typography>
                  ) : (
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {categoryEntries.map(([category, count]) => {
                        const details = VEGETATION_CATEGORY_DETAILS[category];
                        return (
                          <Chip
                            key={category}
                            label={`${details.label}: ${count}`}
                            sx={{
                              bgcolor: alpha(details.color, 0.12),
                              color: details.color,
                              border: `1px solid ${alpha(details.color, 0.35)}`,
                              fontWeight: 800,
                            }}
                          />
                        );
                      })}
                    </Stack>
                  )}
                </CardContent>
              </Card>
            )}

            <Card elevation={0} sx={{ borderRadius: '8px', border: `1px solid ${alpha(theme.palette.primary.main, 0.12)}` }}>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h6" sx={{ fontWeight: 850, mb: 1.5 }}>
                  Category Legend
                </Typography>
                <Grid container spacing={1.5}>
                  {(Object.entries(VEGETATION_CATEGORY_DETAILS) as Array<[VegetationCategory, typeof VEGETATION_CATEGORY_DETAILS[VegetationCategory]]>)
                    .filter(([category]) => category !== 'Unknown')
                    .map(([category, details]) => (
                      <Grid size={{ xs: 12, sm: 6 }} key={category}>
                        <Stack direction="row" spacing={1.25} alignItems="flex-start">
                          <Box
                            sx={{
                              width: 16,
                              height: 16,
                              borderRadius: '4px',
                              bgcolor: details.color,
                              mt: 0.25,
                              flex: '0 0 auto',
                            }}
                          />
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 800 }}>
                              {details.label}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {details.description}
                            </Typography>
                          </Box>
                        </Stack>
                      </Grid>
                    ))}
                </Grid>
              </CardContent>
            </Card>
          </Stack>
        </Grid>
      </Grid>

      <Snackbar
        open={notice.open}
        autoHideDuration={4200}
        onClose={() => setNotice((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert severity={notice.severity} variant="filled" sx={{ borderRadius: '8px' }}>
          {notice.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
