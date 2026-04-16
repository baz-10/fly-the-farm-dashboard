import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Box,
  Container,
  Paper,
  Tab,
  Tabs,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Card,
  CardContent,
  CardActions,
  Grid,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Alert,
  TextField,
  InputAdornment,
  Tooltip,
  alpha,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  FlightTakeoff as AircraftIcon,
  Build as BuildIcon,
  Search as SearchIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Settings as SettingsIcon,
  LocalAirport as LocalAirportIcon,
} from '@mui/icons-material';
import { useAircraft } from '../contexts/AircraftContext';
import { Aircraft, EquipmentKit, AircraftStatus, OperationalStatus } from '../types/aircraft';
import AircraftForm from '../components/AircraftForm';
import EquipmentKitForm from '../components/EquipmentKitForm';
import ErrorBoundary from '../components/ErrorBoundary';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`aircraft-tabpanel-${index}`}
      aria-labelledby={`aircraft-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

// Status chip configuration for aircraft
const aircraftStatusConfig: Record<AircraftStatus, { label: string; color: string; bgColor: string; Icon: typeof CheckCircleIcon }> = {
  operational: {
    label: 'Available',
    color: '#146b45',
    bgColor: '#e8f5ed',
    Icon: CheckCircleIcon,
  },
  maintenance: {
    label: 'Maintenance',
    color: '#a86a08',
    bgColor: '#fef3e0',
    Icon: WarningIcon,
  },
  inspection: {
    label: 'Inspection',
    color: '#a86a08',
    bgColor: '#fef3e0',
    Icon: SettingsIcon,
  },
  retired: {
    label: 'Retired',
    color: '#962d1a',
    bgColor: '#fde8e4',
    Icon: CancelIcon,
  },
};

// Status chip configuration for equipment kits
const kitStatusConfig: Record<OperationalStatus, { label: string; color: string; bgColor: string; Icon: typeof CheckCircleIcon }> = {
  available: {
    label: 'Available',
    color: '#146b45',
    bgColor: '#e8f5ed',
    Icon: CheckCircleIcon,
  },
  assigned: {
    label: 'In Use',
    color: '#2e7d32',
    bgColor: '#e8f5ed',
    Icon: LocalAirportIcon,
  },
  maintenance: {
    label: 'Maintenance',
    color: '#a86a08',
    bgColor: '#fef3e0',
    Icon: WarningIcon,
  },
  calibration: {
    label: 'Calibration',
    color: '#a86a08',
    bgColor: '#fef3e0',
    Icon: SettingsIcon,
  },
};

function AircraftStatusChip({ status }: { status: AircraftStatus }) {
  const config = aircraftStatusConfig[status];
  const IconComp = config.Icon;

  return (
    <Chip
      icon={<IconComp sx={{ fontSize: 16, color: `${config.color} !important` }} />}
      label={config.label}
      size="small"
      sx={{
        fontWeight: 700,
        fontSize: '0.75rem',
        bgcolor: config.bgColor,
        color: config.color,
        border: `1px solid ${alpha(config.color, 0.15)}`,
        '& .MuiChip-icon': {
          color: config.color,
        },
      }}
    />
  );
}

function EquipmentKitStatusChip({ status }: { status: OperationalStatus }) {
  const config = kitStatusConfig[status];
  const IconComp = config.Icon;

  return (
    <Chip
      icon={<IconComp sx={{ fontSize: 16, color: `${config.color} !important` }} />}
      label={config.label}
      size="small"
      sx={{
        fontWeight: 700,
        fontSize: '0.75rem',
        bgcolor: config.bgColor,
        color: config.color,
        border: `1px solid ${alpha(config.color, 0.15)}`,
        '& .MuiChip-icon': {
          color: config.color,
        },
      }}
    />
  );
}

// Optimized Aircraft Table Row Component
const AircraftTableRow = React.memo(({
  aircraft: aircraftItem,
  onEdit,
  onDelete,
  needsMaintenanceAlert,
  formatDate
}: {
  aircraft: Aircraft;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  needsMaintenanceAlert: (aircraft: Aircraft) => boolean;
  formatDate: (date: string) => string;
}) => (
  <TableRow hover>
    <TableCell>
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {aircraftItem.registration}
        </Typography>
        {needsMaintenanceAlert(aircraftItem) && (
          <Tooltip title="Maintenance or inspection due soon">
            <WarningIcon sx={{ ml: 1, fontSize: 16, color: 'warning.main' }} />
          </Tooltip>
        )}
      </Box>
    </TableCell>
    <TableCell>
      <Typography variant="body2">
        {aircraftItem.manufacturer} {aircraftItem.model}
      </Typography>
    </TableCell>
    <TableCell>
      <Typography variant="body2">{aircraftItem.mtow} kg</Typography>
    </TableCell>
    <TableCell>
      <AircraftStatusChip status={aircraftItem.status} />
    </TableCell>
    <TableCell>
      <Typography variant="body2" fontSize="0.8125rem">
        {formatDate(aircraftItem.maintenanceDates.nextInspectionDue)}
      </Typography>
    </TableCell>
    <TableCell>
      <Typography variant="body2" fontSize="0.8125rem">
        {formatDate(aircraftItem.insurance.expiryDate)}
      </Typography>
    </TableCell>
    <TableCell>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <IconButton
          size="small"
          onClick={() => onEdit(aircraftItem.id)}
          sx={{ color: 'primary.main' }}
          aria-label={`Edit aircraft ${aircraftItem.registration}`}
        >
          <EditIcon fontSize="small" />
        </IconButton>
        <IconButton
          size="small"
          onClick={() => onDelete(aircraftItem.id)}
          sx={{ color: 'error.main' }}
          aria-label={`Delete aircraft ${aircraftItem.registration}`}
        >
          <DeleteIcon fontSize="small" />
        </IconButton>
      </Box>
    </TableCell>
  </TableRow>
));

// Optimized Equipment Kit Card Component
const EquipmentKitCard = React.memo(({
  kit,
  onEdit,
  onDelete,
  needsCalibrationAlert,
  formatDate,
  formatCurrency
}: {
  kit: EquipmentKit;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  needsCalibrationAlert: (kit: EquipmentKit) => boolean;
  formatDate: (date: string) => string;
  formatCurrency: (amount: number) => string;
}) => (
  <Card>
    <CardContent>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
        <Typography variant="h6" component="h3" sx={{ fontWeight: 600 }}>
          {kit.name}
        </Typography>
        {needsCalibrationAlert(kit) && (
          <Tooltip title="Calibration or maintenance due soon">
            <WarningIcon sx={{ fontSize: 20, color: 'warning.main' }} />
          </Tooltip>
        )}
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {kit.description}
      </Typography>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Chip
          label={kit.type.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
          size="small"
          color="primary"
          variant="outlined"
        />
        <EquipmentKitStatusChip status={kit.operationalData.status} />
      </Box>
      <Box sx={{ mb: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Weight: <strong>{kit.specifications.weight} kg</strong>
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Value: <strong>{formatCurrency(kit.financialData.currentValue)}</strong>
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Operating Hours: <strong>{kit.operationalData.totalOperatingHours}h</strong>
        </Typography>
      </Box>
      <Typography variant="caption" color="text.secondary">
        Next Calibration: {formatDate(kit.operationalData.nextCalibrationDue)}
      </Typography>
    </CardContent>
    <CardActions>
      <Button
        size="small"
        startIcon={<EditIcon />}
        onClick={() => onEdit(kit.id)}
        aria-label={`Edit equipment kit ${kit.name}`}
      >
        Edit
      </Button>
      <Button
        size="small"
        color="error"
        startIcon={<DeleteIcon />}
        onClick={() => onDelete(kit.id)}
        aria-label={`Delete equipment kit ${kit.name}`}
      >
        Delete
      </Button>
    </CardActions>
  </Card>
));

export default function AircraftManagement() {
  const {
    aircraft,
    equipmentKits,
    isLoading,
    error,
    createAircraft,
    updateAircraft,
    deleteAircraft,
    createEquipmentKit,
    updateEquipmentKit,
    deleteEquipmentKit,
    getAircraftById,
    getEquipmentKitById,
    clearError,
  } = useAircraft();

  // Local error state for managing dismissible errors
  const [localError, setLocalError] = useState<string | null>(null);

  // Sync context error with local error state
  useEffect(() => {
    if (error) {
      setLocalError(error);
    }
  }, [error]);

  const handleErrorDismiss = useCallback(() => {
    setLocalError(null);
    clearError(); // Also clear the context error
  }, [clearError]);

  const [tabValue, setTabValue] = useState(0);
  const [aircraftSearchTerm, setAircraftSearchTerm] = useState('');
  const [debouncedAircraftSearch, setDebouncedAircraftSearch] = useState('');
  const [kitSearchTerm, setKitSearchTerm] = useState('');
  const [debouncedKitSearch, setDebouncedKitSearch] = useState('');
  const [aircraftDialogOpen, setAircraftDialogOpen] = useState(false);
  const [kitDialogOpen, setKitDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedAircraftId, setSelectedAircraftId] = useState<string | null>(null);
  const [selectedKitId, setSelectedKitId] = useState<string | null>(null);
  const [deleteType, setDeleteType] = useState<'aircraft' | 'kit'>('aircraft');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  // Debounce search terms for performance optimization
  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedAircraftSearch(aircraftSearchTerm);
    }, 300);
    return () => clearTimeout(timeout);
  }, [aircraftSearchTerm]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedKitSearch(kitSearchTerm);
    }, 300);
    return () => clearTimeout(timeout);
  }, [kitSearchTerm]);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  // Filter aircraft based on debounced search term for performance
  const filteredAircraft = useMemo(() => {
    if (!debouncedAircraftSearch.trim()) return aircraft;
    const term = debouncedAircraftSearch.toLowerCase();
    return aircraft.filter(
      (a) =>
        a.registration.toLowerCase().includes(term) ||
        a.manufacturer.toLowerCase().includes(term) ||
        a.model.toLowerCase().includes(term) ||
        a.status.toLowerCase().includes(term)
    );
  }, [aircraft, debouncedAircraftSearch]);

  // Filter equipment kits based on debounced search term for performance
  const filteredKits = useMemo(() => {
    if (!debouncedKitSearch.trim()) return equipmentKits;
    const term = debouncedKitSearch.toLowerCase();
    return equipmentKits.filter(
      (k) =>
        k.name.toLowerCase().includes(term) ||
        k.type.toLowerCase().includes(term) ||
        k.description.toLowerCase().includes(term) ||
        k.operationalData.status.toLowerCase().includes(term)
    );
  }, [equipmentKits, debouncedKitSearch]);

  // Check if aircraft needs maintenance alerts
  const needsMaintenanceAlert = (aircraft: Aircraft): boolean => {
    const now = new Date();
    const nextInspection = new Date(aircraft.maintenanceDates.nextInspectionDue);
    const nextMajorService = new Date(aircraft.maintenanceDates.nextMajorServiceDue);
    const insuranceExpiry = new Date(aircraft.insurance.expiryDate);

    const daysUntilInspection = Math.ceil((nextInspection.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const daysUntilService = Math.ceil((nextMajorService.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const daysUntilInsurance = Math.ceil((insuranceExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    return daysUntilInspection <= 30 || daysUntilService <= 30 || daysUntilInsurance <= 30;
  };

  // Check if equipment kit needs calibration
  const needsCalibrationAlert = (kit: EquipmentKit): boolean => {
    const now = new Date();
    const nextCalibration = new Date(kit.operationalData.nextCalibrationDue);
    const nextMaintenance = new Date(kit.operationalData.nextMaintenanceDue);

    const daysUntilCalibration = Math.ceil((nextCalibration.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const daysUntilMaintenance = Math.ceil((nextMaintenance.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    return daysUntilCalibration <= 14 || daysUntilMaintenance <= 30;
  };

  const handleCreateAircraft = () => {
    setSelectedAircraftId(null);
    setAircraftDialogOpen(true);
  };

  const handleEditAircraft = (aircraftId: string) => {
    setSelectedAircraftId(aircraftId);
    setAircraftDialogOpen(true);
  };

  const handleDeleteAircraft = (aircraftId: string) => {
    const aircraft = getAircraftById(aircraftId);
    if (aircraft) {
      setDeleteType('aircraft');
      setDeleteTarget({ id: aircraftId, name: `${aircraft.manufacturer} ${aircraft.model} (${aircraft.registration})` });
      setDeleteDialogOpen(true);
    }
  };

  const handleCreateKit = () => {
    setSelectedKitId(null);
    setKitDialogOpen(true);
  };

  const handleEditKit = (kitId: string) => {
    setSelectedKitId(kitId);
    setKitDialogOpen(true);
  };

  const handleDeleteKit = (kitId: string) => {
    const kit = getEquipmentKitById(kitId);
    if (kit) {
      setDeleteType('kit');
      setDeleteTarget({ id: kitId, name: kit.name });
      setDeleteDialogOpen(true);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;

    try {
      if (deleteType === 'aircraft') {
        await deleteAircraft(deleteTarget.id);
      } else {
        await deleteEquipmentKit(deleteTarget.id);
      }
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
    } catch (error) {
      console.error('Delete failed:', error);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-AU', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
    }).format(amount);
  };

  return (
    <Container maxWidth={false} sx={{ py: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <AircraftIcon sx={{ mr: 2, fontSize: 32, color: 'primary.main' }} />
        <Box>
          <Typography variant="h4" component="h1" gutterBottom>
            Aircraft Management
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage your fleet of aircraft and equipment kits
          </Typography>
        </Box>
      </Box>

      {localError && (
        <Alert
          severity="error"
          sx={{ mb: 3 }}
          onClose={handleErrorDismiss}
        >
          {localError}
        </Alert>
      )}

      <Paper sx={{ bgcolor: 'background.paper' }}>
        <Tabs
          value={tabValue}
          onChange={handleTabChange}
          aria-label="aircraft management tabs"
          sx={{
            borderBottom: 1,
            borderColor: 'divider',
            px: 3,
            pt: 2,
          }}
        >
          <Tab
            label={`Aircraft Fleet (${aircraft.length})`}
            id="aircraft-tab-0"
            aria-controls="aircraft-tabpanel-0"
            icon={<AircraftIcon />}
            iconPosition="start"
            sx={{ textTransform: 'none', fontWeight: 600 }}
          />
          <Tab
            label={`Equipment Kits (${equipmentKits.length})`}
            id="aircraft-tab-1"
            aria-controls="aircraft-tabpanel-1"
            icon={<BuildIcon />}
            iconPosition="start"
            sx={{ textTransform: 'none', fontWeight: 600 }}
          />
        </Tabs>

        <TabPanel value={tabValue} index={0}>
          {/* Aircraft Fleet Tab */}
          <Box sx={{ px: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <TextField
                placeholder="Search aircraft..."
                value={aircraftSearchTerm}
                onChange={(e) => setAircraftSearchTerm(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                }}
                sx={{ minWidth: 300 }}
                aria-label="Search aircraft by registration, manufacturer, model, or status"
                inputProps={{
                  'aria-describedby': 'aircraft-search-help'
                }}
                helperText={
                  <span id="aircraft-search-help" className="sr-only">
                    Search by aircraft registration, manufacturer, model, or status
                  </span>
                }
              />
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleCreateAircraft}
                sx={{ ml: 2 }}
                aria-label="Add new aircraft to fleet"
              >
                Add Aircraft
              </Button>
            </Box>

            <TableContainer component={Paper} variant="outlined">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Registration</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Make/Model</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>MTOW</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Next Inspection</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Insurance Expiry</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredAircraft.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                        <Typography variant="body1" color="text.secondary">
                          No aircraft found
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredAircraft.map((aircraftItem) => (
                      <AircraftTableRow
                        key={aircraftItem.id}
                        aircraft={aircraftItem}
                        onEdit={handleEditAircraft}
                        onDelete={handleDeleteAircraft}
                        needsMaintenanceAlert={needsMaintenanceAlert}
                        formatDate={formatDate}
                      />
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          {/* Equipment Kits Tab */}
          <Box sx={{ px: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <TextField
                placeholder="Search equipment kits..."
                value={kitSearchTerm}
                onChange={(e) => setKitSearchTerm(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                }}
                sx={{ minWidth: 300 }}
                aria-label="Search equipment kits by name, type, description, or status"
                inputProps={{
                  'aria-describedby': 'kit-search-help'
                }}
                helperText={
                  <span id="kit-search-help" className="sr-only">
                    Search by equipment kit name, type, description, or status
                  </span>
                }
              />
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleCreateKit}
                sx={{ ml: 2 }}
                aria-label="Add new equipment kit to inventory"
              >
                Add Equipment Kit
              </Button>
            </Box>

            <Grid container spacing={3}>
              {filteredKits.length === 0 ? (
                <Grid size={{ xs: 12 }}>
                  <Paper variant="outlined" sx={{ py: 6, textAlign: 'center' }}>
                    <Typography variant="body1" color="text.secondary">
                      No equipment kits found
                    </Typography>
                  </Paper>
                </Grid>
              ) : (
                filteredKits.map((kit) => (
                  <Grid size={{ xs: 12, sm: 6, lg: 4 }} key={kit.id}>
                    <EquipmentKitCard
                      kit={kit}
                      onEdit={handleEditKit}
                      onDelete={handleDeleteKit}
                      needsCalibrationAlert={needsCalibrationAlert}
                      formatDate={formatDate}
                      formatCurrency={formatCurrency}
                    />
                  </Grid>
                ))
              )}
            </Grid>
          </Box>
        </TabPanel>
      </Paper>

      {/* Aircraft Dialog */}
      <Dialog
        open={aircraftDialogOpen}
        onClose={() => setAircraftDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {selectedAircraftId ? 'Edit Aircraft' : 'Add New Aircraft'}
        </DialogTitle>
        <DialogContent>
          <ErrorBoundary
            fallbackMessage="There was an error with the aircraft form. Please try closing and reopening the dialog."
            onRetry={() => {
              setSelectedAircraftId(null);
              setAircraftDialogOpen(false);
            }}
          >
            <AircraftForm
              aircraftId={selectedAircraftId}
              onSave={async () => {
                setAircraftDialogOpen(false);
                setSelectedAircraftId(null);
              }}
              onCancel={() => {
                setAircraftDialogOpen(false);
                setSelectedAircraftId(null);
              }}
            />
          </ErrorBoundary>
        </DialogContent>
      </Dialog>

      {/* Equipment Kit Dialog */}
      <Dialog
        open={kitDialogOpen}
        onClose={() => setKitDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {selectedKitId ? 'Edit Equipment Kit' : 'Add New Equipment Kit'}
        </DialogTitle>
        <DialogContent>
          <ErrorBoundary
            fallbackMessage="There was an error with the equipment kit form. Please try closing and reopening the dialog."
            onRetry={() => {
              setSelectedKitId(null);
              setKitDialogOpen(false);
            }}
          >
            <EquipmentKitForm
              kitId={selectedKitId}
              onSave={async () => {
                setKitDialogOpen(false);
                setSelectedKitId(null);
              }}
              onCancel={() => {
                setKitDialogOpen(false);
                setSelectedKitId(null);
              }}
            />
          </ErrorBoundary>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete <strong>{deleteTarget?.name}</strong>?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={confirmDelete} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}