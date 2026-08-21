import React from 'react';
import {
  Alert, Box, Button, Chip, Container, Dialog, DialogContent, DialogTitle, IconButton,
  Paper, Stack, Tab, Tabs, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArchiveIcon from '@mui/icons-material/Archive';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import EditIcon from '@mui/icons-material/Edit';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import FleetAssetForm from '../components/FleetAssetForm';
import { FleetMaintenanceSummary } from '../components/maintenance/FleetMaintenanceSummary';
import WorkPackTemplateForm from '../components/WorkPackTemplateForm';
import { useAircraft } from '../contexts/AircraftContext';
import { useAuth } from '../contexts/AuthContext';
import { useFleetAssets } from '../contexts/FleetAssetContext';
import { useOperationalData } from '../contexts/OperationalDataContext';
import { useWorkPacks } from '../contexts/WorkPackContext';
import { FleetAsset, FleetAssetCreateInput } from '../types/fleetAsset';
import { WorkPackTemplate, WorkPackTemplateInput } from '../types/workPack';
import { fleetAssetToDeploymentAsset } from '../utils/fleetAssetCompatibility';

export default function FleetWorkPacks() {
  const { user } = useAuth();
  const { aircraft, equipmentKits } = useAircraft();
  const { operatingLocations, status: operationalStatus } = useOperationalData();
  const { assets, loading, error, createAsset, updateAsset, archiveAsset } = useFleetAssets();
  const { templates, createTemplate, updateTemplate, duplicateTemplate } = useWorkPacks();
  const [tab, setTab] = React.useState(0);
  const [assetDialog, setAssetDialog] = React.useState(false);
  const [templateDialog, setTemplateDialog] = React.useState(false);
  const [editingAsset, setEditingAsset] = React.useState<FleetAsset>();
  const [editingTemplate, setEditingTemplate] = React.useState<WorkPackTemplate>();
  const [actionError, setActionError] = React.useState('');
  const currentAssets = React.useMemo(() => assets.map(fleetAssetToDeploymentAsset), [assets]);
  const activeTemplates = templates.filter((template) => template.status !== 'archived');
  const permissions = new Set(user?.permissions || []);
  const maintenanceScope = `${user?.id || 'anonymous'}:${user?.tenantId || ''}:${user?.delegatedSupport?.organisationId || ''}:${user?.delegatedSupport?.sessionId || ''}`;
  const maintenanceAsOfRef = React.useRef<{ scope: string; value: string } | null>(null);
  if (!maintenanceAsOfRef.current || maintenanceAsOfRef.current.scope !== maintenanceScope) {
    maintenanceAsOfRef.current = { scope: maintenanceScope, value: new Date().toISOString() };
  }
  const has = (action: string) => permissions.has('*') || permissions.has('fleet_assets.*') || permissions.has(`fleet_assets.${action}`);
  const canCreate = has('create');
  const canUpdate = has('update');
  const canArchive = has('archive');
  const canManageWorkPacks = user?.role === 'admin';
  const canReadMaintenance = permissions.has('*') || permissions.has('maintenance_requirements.*') || permissions.has('maintenance_requirements.read');

  const saveAsset = async (input: FleetAssetCreateInput) => {
    if (editingAsset) await updateAsset(editingAsset, input); else await createAsset(input);
    setAssetDialog(false); setEditingAsset(undefined);
  };
  const saveTemplate = async (input: WorkPackTemplateInput) => {
    if (editingTemplate) await updateTemplate(editingTemplate.id, input); else await createTemplate(input);
    setTemplateDialog(false); setEditingTemplate(undefined);
  };
  const archive = async (asset: FleetAsset) => {
    setActionError('');
    try { await archiveAsset(asset); }
    catch (caught) { setActionError(caught instanceof Error ? caught.message : 'Fleet asset could not be archived.'); }
  };

  return <Container maxWidth="xl" sx={{ py: { xs: 3, md: 5 } }}>
    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2} mb={3}>
      <Box><Typography variant="overline" sx={{ color: '#377542', fontWeight: 900 }}>Fleet &amp; Equipment</Typography>
        <Typography variant="h3" sx={{ color: '#0b3217', fontWeight: 900 }}>Ready assets. Repeatable setups.</Typography>
        <Typography color="text.secondary">Manage authoritative ground assets and compose them into operational Work Packs.</Typography></Box>
      {canCreate && <Button startIcon={<AddIcon />} variant="contained" onClick={() => { setEditingAsset(undefined); setAssetDialog(true); }}>Add Fleet asset</Button>}
    </Stack>
    {(error || actionError) && <Alert severity="error" sx={{ mb: 2 }}>{actionError || error}</Alert>}
    <Paper elevation={0} sx={{ border: '1px solid #d9e4da', borderRadius: 3, overflow: 'hidden' }}>
      <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ px: 2, borderBottom: '1px solid #e2e9e2' }}>
        <Tab icon={<LocalShippingIcon />} iconPosition="start" label={`Fleet assets (${assets.length})`} />
        <Tab icon={<Inventory2Icon />} iconPosition="start" label={`Work Packs (${activeTemplates.length})`} />
      </Tabs>
      <Box sx={{ p: { xs: 2, md: 3 } }}>
        {tab === 0 ? <>
          <Typography variant="h5" fontWeight={850}>Fleet register</Typography>
          <Typography variant="body2" color="text.secondary" mb={2.5}>Vehicles and independent support assets, scoped to their current Base.</Typography>
          {loading ? <Typography>Loading authoritative Fleet assets…</Typography> : assets.length === 0 ?
            <Paper variant="outlined" sx={{ p: 5, textAlign: 'center' }}><Typography variant="h6">Add the first Fleet asset</Typography><Typography color="text.secondary">Generators remain independent assets; registration and VIN are only requested where applicable.</Typography></Paper> :
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
              {assets.map((asset) => <Paper key={asset.id} variant="outlined" sx={{ p: 2.5 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                  <Box><Typography variant="h5" fontWeight={900}>{asset.assetIdentifier}</Typography>
                    <Typography color="text.secondary">{operatingLocations.find((base) => base.id === asset.operatingLocationId)?.name || 'Authorised Base'} · {asset.registration || asset.serialNumber || 'No registration required'}</Typography></Box>
                  <Stack direction="row"><Chip size="small" label={asset.assetType} variant="outlined" /><Chip size="small" label={asset.status} />
                    {canUpdate && <IconButton aria-label={`Edit ${asset.assetIdentifier}`} onClick={() => { setEditingAsset(asset); setAssetDialog(true); }}><EditIcon /></IconButton>}
                    {canArchive && <IconButton aria-label={`Archive ${asset.assetIdentifier}`} onClick={() => void archive(asset)}><ArchiveIcon /></IconButton>}</Stack>
                </Stack>
                <Stack direction="row" spacing={3} mt={2}><Typography variant="body2"><b>Maker:</b> {asset.manufacturer || '—'} {asset.model || ''}</Typography><Typography variant="body2"><b>Version:</b> {asset.rowVersion}</Typography></Stack>
              </Paper>)}
            </Box>}
          {canReadMaintenance && (
            <FleetMaintenanceSummary
              asOf={maintenanceAsOfRef.current.value}
              bases={operatingLocations.map((base) => ({ id: base.id, name: base.name }))}
            />
          )}
        </> : <>
          <Stack direction="row" justifyContent="space-between" mb={2.5}><Box><Typography variant="h5" fontWeight={850}>Reusable Work Packs</Typography><Typography variant="body2" color="text.secondary">Current templates reference canonical Fleet IDs; historical snapshots remain unchanged.</Typography></Box>
            {canManageWorkPacks && <Button startIcon={<AddIcon />} variant="contained" onClick={() => { setEditingTemplate(undefined); setTemplateDialog(true); }}>New Work Pack</Button>}</Stack>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
            {activeTemplates.map((template) => { const ids = template.assetIds || (template.truckId ? [template.truckId] : []); const selected = currentAssets.filter((asset) => ids.includes(asset.id)); return <Paper key={template.id} variant="outlined" sx={{ p: 2.5 }}>
              <Stack direction="row" justifyContent="space-between"><Box><Typography variant="h5" fontWeight={900}>{template.name}</Typography><Typography color="text.secondary">{selected.map((asset) => asset.name).join(' · ') || 'No Fleet assets'}</Typography></Box>{canManageWorkPacks && <Stack direction="row"><IconButton aria-label={`Duplicate ${template.name}`} onClick={() => void duplicateTemplate(template.id)}><ContentCopyIcon /></IconButton><IconButton aria-label={`Edit ${template.name}`} onClick={() => { setEditingTemplate(template); setTemplateDialog(true); }}><EditIcon /></IconButton></Stack>}</Stack>
            </Paper>; })}
          </Box>
        </>}
      </Box>
    </Paper>
    <Dialog open={assetDialog} onClose={() => setAssetDialog(false)} fullWidth maxWidth="md"><DialogTitle>{editingAsset ? 'Edit Fleet asset' : 'Add Fleet asset'}</DialogTitle><DialogContent dividers><FleetAssetForm asset={editingAsset} locations={operatingLocations} locationsReady={operationalStatus === 'ready'} onSave={saveAsset} onCancel={() => setAssetDialog(false)} /></DialogContent></Dialog>
    <Dialog open={templateDialog} onClose={() => setTemplateDialog(false)} fullWidth maxWidth="lg"><DialogTitle>{editingTemplate ? 'Edit Work Pack' : 'Create Work Pack'}</DialogTitle><DialogContent dividers><WorkPackTemplateForm template={editingTemplate} assets={currentAssets} trucks={currentAssets.filter((asset) => asset.assetType === 'truck')} aircraft={aircraft} equipmentKits={equipmentKits} onSave={saveTemplate} onCancel={() => setTemplateDialog(false)} /></DialogContent></Dialog>
  </Container>;
}
