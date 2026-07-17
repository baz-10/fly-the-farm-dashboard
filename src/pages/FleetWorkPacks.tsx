import React from 'react';
import {
  Box, Button, Chip, Container, Dialog, DialogContent, DialogTitle, Divider, IconButton,
  Paper, Stack, Tab, Tabs, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import EditIcon from '@mui/icons-material/Edit';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import TruckProfileForm from '../components/TruckProfileForm';
import WorkPackTemplateForm from '../components/WorkPackTemplateForm';
import { useAircraft } from '../contexts/AircraftContext';
import { useAuth } from '../contexts/AuthContext';
import { useWorkPacks } from '../contexts/WorkPackContext';
import { TruckProfile, TruckProfileInput, WorkPackTemplate, WorkPackTemplateInput } from '../types/workPack';

const money = (value: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 2 }).format(value);

export default function FleetWorkPacks() {
  const { user } = useAuth();
  const { aircraft, equipmentKits } = useAircraft();
  const {
    trucks, templates, createTruck, updateTruck, createTemplate, updateTemplate, duplicateTemplate,
  } = useWorkPacks();
  const [tab, setTab] = React.useState(0);
  const [truckDialog, setTruckDialog] = React.useState(false);
  const [templateDialog, setTemplateDialog] = React.useState(false);
  const [editingTruck, setEditingTruck] = React.useState<TruckProfile | undefined>();
  const [editingTemplate, setEditingTemplate] = React.useState<WorkPackTemplate | undefined>();
  const showFinancials = user?.role === 'admin';

  const saveTruck = async (input: TruckProfileInput) => {
    if (editingTruck) await updateTruck(editingTruck.id, input);
    else await createTruck(input);
    setTruckDialog(false); setEditingTruck(undefined);
  };
  const saveTemplate = async (input: WorkPackTemplateInput) => {
    if (editingTemplate) await updateTemplate(editingTemplate.id, input);
    else await createTemplate(input);
    setTemplateDialog(false); setEditingTemplate(undefined);
  };
  const activeTrucks = trucks.filter((truck) => truck.status !== 'retired');
  const activeTemplates = templates.filter((template) => template.status !== 'archived');

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 3, md: 5 } }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2} mb={3}>
        <Box>
          <Typography variant="overline" sx={{ color: '#377542', fontWeight: 900, letterSpacing: '0.14em' }}>Deployment backbone</Typography>
          <Typography variant="h3" sx={{ color: '#0b3217', fontWeight: 900, letterSpacing: '-0.035em' }}>Fleet & work packs</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.75 }}>Build the repeatable truck, aircraft, kit and crew setups taken to each job.</Typography>
        </Box>
        <Paper elevation={0} sx={{ display: 'flex', alignSelf: { md: 'center' }, border: '1px solid #d6e1d7', overflow: 'hidden' }}>
          <Box sx={{ px: 2.5, py: 1.25, bgcolor: '#0b3217', color: 'white' }}><Typography variant="caption">READY TRUCKS</Typography><Typography variant="h5" fontWeight={900}>{activeTrucks.filter((truck) => truck.status === 'available').length}</Typography></Box>
          <Box sx={{ px: 2.5, py: 1.25 }}><Typography variant="caption" color="text.secondary">ACTIVE PACKS</Typography><Typography variant="h5" fontWeight={900}>{activeTemplates.length}</Typography></Box>
        </Paper>
      </Stack>

      <Paper elevation={0} sx={{ border: '1px solid #d9e4da', borderRadius: 3, overflow: 'hidden' }}>
        <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ px: 2, borderBottom: '1px solid #e2e9e2' }}>
          <Tab icon={<LocalShippingIcon />} iconPosition="start" label={`Trucks (${activeTrucks.length})`} />
          <Tab icon={<Inventory2Icon />} iconPosition="start" label={`Work-pack templates (${activeTemplates.length})`} />
        </Tabs>
        <Box sx={{ p: { xs: 2, md: 3 } }}>
          {tab === 0 ? (
            <>
              <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2.5}>
                <Box><Typography variant="h5" fontWeight={850}>Truck profiles</Typography><Typography variant="body2" color="text.secondary">Operational readiness and whole-of-life vehicle costs.</Typography></Box>
                <Button startIcon={<AddIcon />} variant="contained" onClick={() => { setEditingTruck(undefined); setTruckDialog(true); }}>Add truck</Button>
              </Stack>
              {activeTrucks.length === 0 ? (
                <Paper variant="outlined" sx={{ p: 5, textAlign: 'center', bgcolor: '#fafcfa' }}><LocalShippingIcon sx={{ fontSize: 44, color: '#7d9a82' }} /><Typography variant="h6">Add the first deployment truck</Typography><Typography color="text.secondary">Capture the vehicle profile before building a reusable work pack.</Typography></Paper>
              ) : (
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
                  {activeTrucks.map((truck) => (
                    <Paper key={truck.id} variant="outlined" sx={{ p: 2.5, borderLeft: `6px solid ${truck.status === 'available' ? '#2f8d46' : '#c68818'}` }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                        <Box><Typography variant="h5" fontWeight={900}>{truck.name}</Typography><Typography color="text.secondary">{truck.registration} · {truck.year} {truck.manufacturer} {truck.model}</Typography></Box>
                        <Stack direction="row"><Chip size="small" label={truck.status} color={truck.status === 'available' ? 'success' : 'warning'} /><IconButton aria-label={`Edit ${truck.name}`} onClick={() => { setEditingTruck(truck); setTruckDialog(true); }}><EditIcon /></IconButton></Stack>
                      </Stack>
                      <Divider sx={{ my: 2 }} />
                      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.5 }}>
                        <Box><Typography variant="caption" color="text.secondary">PAYLOAD</Typography><Typography fontWeight={800}>{truck.payloadCapacityKg || 0} kg</Typography></Box>
                        <Box><Typography variant="caption" color="text.secondary">OWNERSHIP</Typography><Typography fontWeight={800}>{truck.ownershipType}</Typography></Box>
                        <Box><Typography variant="caption" color="text.secondary">VIN</Typography><Typography fontWeight={800} noWrap>{truck.vin || '—'}</Typography></Box>
                      </Box>
                      {truck.operationalNotes && <Typography variant="body2" sx={{ mt: 2, p: 1.5, bgcolor: '#f3f7f3' }}>{truck.operationalNotes}</Typography>}
                      {showFinancials && <Stack direction="row" spacing={3} mt={2}><Typography variant="body2"><b>{money(truck.costs.costPerDay)}</b> / day</Typography><Typography variant="body2"><b>{money(truck.costs.costPerKm)}</b> / km</Typography><Typography variant="body2"><b>{money(truck.costs.costPerHour)}</b> / hour</Typography></Stack>}
                    </Paper>
                  ))}
                </Box>
              )}
            </>
          ) : (
            <>
              <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2.5}>
                <Box><Typography variant="h5" fontWeight={850}>Reusable setups</Typography><Typography variant="body2" color="text.secondary">Start from the same proven deployment pack, then customise it for each job.</Typography></Box>
                <Button startIcon={<AddIcon />} variant="contained" disabled={!activeTrucks.length} onClick={() => { setEditingTemplate(undefined); setTemplateDialog(true); }}>New template</Button>
              </Stack>
              {!activeTrucks.length ? <Typography color="text.secondary">Add a truck before creating a work-pack template.</Typography> : activeTemplates.length === 0 ? (
                <Paper variant="outlined" sx={{ p: 5, textAlign: 'center', bgcolor: '#fafcfa' }}><Inventory2Icon sx={{ fontSize: 44, color: '#7d9a82' }} /><Typography variant="h6">Build the first repeatable setup</Typography><Typography color="text.secondary">Choose a truck, aircraft, compatible kits and crew requirements.</Typography></Paper>
              ) : (
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
                  {activeTemplates.map((template) => {
                    const truck = trucks.find((item) => item.id === template.truckId);
                    const crew = template.crewRequirements.reduce((total, item) => total + item.quantity, 0);
                    return <Paper key={template.id} variant="outlined" sx={{ p: 2.5 }}>
                      <Stack direction="row" justifyContent="space-between"><Box><Typography variant="h5" fontWeight={900}>{template.name}</Typography><Typography color="text.secondary">{truck?.name || 'Truck unavailable'}</Typography></Box><Stack direction="row"><IconButton aria-label={`Duplicate ${template.name}`} onClick={() => duplicateTemplate(template.id)}><ContentCopyIcon /></IconButton><IconButton aria-label={`Edit ${template.name}`} onClick={() => { setEditingTemplate(template); setTemplateDialog(true); }}><EditIcon /></IconButton></Stack></Stack>
                      <Typography variant="body2" sx={{ my: 2 }}>{template.description || 'No usage notes set.'}</Typography>
                      <Stack direction="row" spacing={1}><Chip label={`${template.aircraftAssignments.length} aircraft`} /><Chip label={`${crew} crew positions`} /><Chip label={`${template.checklist.length} checks`} /></Stack>
                      <Stack spacing={0.75} mt={2}>{template.aircraftAssignments.map((slot, index) => { const ac = aircraft.find((item) => item.id === slot.aircraftId); const kit = equipmentKits.find((item) => item.id === slot.kitId); return <Typography key={slot.id} variant="body2"><b>{index + 1}. {ac?.registration || 'Aircraft unavailable'}</b> · {kit?.name || 'Kit unavailable'}</Typography>; })}</Stack>
                    </Paper>;
                  })}
                </Box>
              )}
            </>
          )}
        </Box>
      </Paper>

      <Dialog open={truckDialog} onClose={() => setTruckDialog(false)} fullWidth maxWidth="md"><DialogTitle>{editingTruck ? 'Edit truck profile' : 'Add truck profile'}</DialogTitle><DialogContent dividers><TruckProfileForm truck={editingTruck} showFinancials={showFinancials} onSave={saveTruck} onCancel={() => setTruckDialog(false)} /></DialogContent></Dialog>
      <Dialog open={templateDialog} onClose={() => setTemplateDialog(false)} fullWidth maxWidth="lg"><DialogTitle>{editingTemplate ? 'Edit work-pack template' : 'Create work-pack template'}</DialogTitle><DialogContent dividers><WorkPackTemplateForm template={editingTemplate} trucks={activeTrucks} aircraft={aircraft} equipmentKits={equipmentKits} onSave={saveTemplate} onCancel={() => setTemplateDialog(false)} /></DialogContent></Dialog>
    </Container>
  );
}
