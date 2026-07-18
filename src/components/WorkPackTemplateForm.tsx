import React from 'react';
import { Alert, Box, Button, Checkbox, FormControlLabel, IconButton, MenuItem, Stack, TextField, Typography } from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { Aircraft, EquipmentKit } from '../types/aircraft';
import { CrewRole, DeploymentAsset, TruckProfile, WorkPackTemplate, WorkPackTemplateInput } from '../types/workPack';
import { getCompatibleAvailableKits } from '../utils/aircraftKitCompatibility';

interface WorkPackTemplateFormProps {
  template?: WorkPackTemplate;
  trucks: TruckProfile[];
  assets?: DeploymentAsset[];
  aircraft: Aircraft[];
  equipmentKits: EquipmentKit[];
  onSave: (input: WorkPackTemplateInput) => void | Promise<void>;
  onCancel: () => void;
}

type TemplateFormInput = Omit<WorkPackTemplateInput, 'assetIds'> & {
  assetIds: string[];
};

const CREW: Array<{ role: CrewRole; label: string }> = [
  { role: 'pilot', label: 'Pilots' }, { role: 'driver', label: 'Drivers' },
  { role: 'field-supervisor', label: 'Field supervisors' }, { role: 'loader-mixer', label: 'Loaders / mixers' },
  { role: 'spotter', label: 'Spotters' }, { role: 'support', label: 'Support crew' },
];
const id = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

function emptyTemplate(): TemplateFormInput {
  return {
    name: '', description: '', status: 'active', truckId: '', assetIds: [], aircraftAssignments: [],
    crewRequirements: CREW.map(({ role }) => ({ id: id('crew'), role, quantity: 0 })), checklist: [], notes: '',
  };
}

export default function WorkPackTemplateForm({ template, trucks, assets, aircraft, equipmentKits, onSave, onCancel }: WorkPackTemplateFormProps) {
  const availableAssets = assets || trucks.map((truck) => ({ ...truck, assetType: 'truck' as const }));
  const [form, setForm] = React.useState<TemplateFormInput>(() => template
    ? (({ id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...input }) => ({
        ...input,
        assetIds: input.assetIds || (input.truckId ? [input.truckId] : []),
        aircraftAssignments: input.aircraftAssignments.map((item) => ({ ...item })),
        crewRequirements: input.crewRequirements.map((item) => ({ ...item })),
        checklist: [...input.checklist],
      }))(template)
    : emptyTemplate());
  const [error, setError] = React.useState('');

  const addAircraft = () => {
    if (form.aircraftAssignments.length >= 3) return;
    const nextAircraft = aircraft.find((item) => !form.aircraftAssignments.some((slot) => slot.aircraftId === item.id));
    if (!nextAircraft) return setError('Add another available aircraft before adding a slot.');
    const nextKit = getCompatibleAvailableKits(nextAircraft, equipmentKits)[0];
    setForm((current) => ({
      ...current,
      aircraftAssignments: [...current.aircraftAssignments, {
        id: id('slot'), aircraftId: nextAircraft.id, kitId: nextKit?.id || '', label: '',
      }],
    }));
  };

  const updateSlot = (index: number, updates: Partial<TemplateFormInput['aircraftAssignments'][number]>) => {
    setForm((current) => ({
      ...current,
      aircraftAssignments: current.aircraftAssignments.map((slot, slotIndex) => slotIndex === index ? { ...slot, ...updates } : slot),
    }));
  };
  const removeSlot = (index: number) => setForm((current) => ({
    ...current, aircraftAssignments: current.aircraftAssignments.filter((_, slotIndex) => slotIndex !== index),
  }));
  const updateCrew = (role: CrewRole, quantity: number) => setForm((current) => ({
    ...current,
    crewRequirements: current.crewRequirements.map((item) => item.role === role ? { ...item, quantity: Math.max(0, quantity) } : item),
  }));

  const save = () => {
    if (!form.name.trim()) return setError('Enter a template name.');
    if (!form.aircraftAssignments.length) return setError('Add at least one aircraft.');
    if (form.aircraftAssignments.some((slot) => !slot.kitId)) return setError('Select a compatible kit for every aircraft.');
    setError('');
    const firstTruck = availableAssets.find((asset) => asset.assetType === 'truck' && form.assetIds.includes(asset.id));
    onSave({ ...form, truckId: firstTruck?.id || '', name: form.name.trim() });
  };

  return (
    <Stack spacing={3}>
      {error && <Alert severity="error">{error}</Alert>}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1fr' }, gap: 2 }}>
        <TextField required label="Template name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Box>
          <Typography variant="subtitle2">Deployment assets</Typography>
          <Stack>
            {availableAssets.filter((asset) => asset.status !== 'retired').map((asset) => (
              <FormControlLabel key={asset.id} control={<Checkbox checked={form.assetIds.includes(asset.id)} onChange={(event) => setForm((current) => ({
                ...current,
                assetIds: event.target.checked ? [...current.assetIds, asset.id] : current.assetIds.filter((id) => id !== asset.id),
                aircraftAssignments: event.target.checked
                  ? current.aircraftAssignments
                  : current.aircraftAssignments.map((assignment) => assignment.carryingAssetId === asset.id
                    ? { ...assignment, carryingAssetId: undefined }
                    : assignment),
              }))} />} label={`${asset.name} · ${asset.registration} (${asset.assetType})`} />
            ))}
          </Stack>
        </Box>
        <TextField label="When to use this setup" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} multiline minRows={2} sx={{ gridColumn: { md: '1 / -1' } }} />
      </Box>

      <Box>
        <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1.5}>
          <Box><Typography variant="h6">Aircraft loadout</Typography><Typography variant="body2" color="text.secondary">Add up to three aircraft. Kits follow model compatibility.</Typography></Box>
          <Button variant="outlined" onClick={addAircraft} disabled={form.aircraftAssignments.length >= 3}>Add aircraft</Button>
        </Stack>
        <Stack spacing={1.5}>
          {form.aircraftAssignments.map((slot, index) => {
            const selectedAircraft = aircraft.find((item) => item.id === slot.aircraftId);
            const compatibleKits = selectedAircraft ? getCompatibleAvailableKits(selectedAircraft, equipmentKits) : [];
            return (
              <Box key={slot.id} sx={{ p: 2, border: '1px solid #d8e3d9', borderLeft: '5px solid #1f6b37', borderRadius: 2, bgcolor: '#fbfdfb' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5}>
                  <Typography fontWeight={800}>Aircraft {index + 1}</Typography>
                  <IconButton aria-label={`Remove aircraft ${index + 1}`} onClick={() => removeSlot(index)}><DeleteOutlineIcon /></IconButton>
                </Stack>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 1.5 }}>
                  <TextField select label={`Aircraft for slot ${index + 1}`} value={slot.aircraftId} onChange={(e) => {
                    const selected = aircraft.find((item) => item.id === e.target.value);
                    const compatible = selected ? getCompatibleAvailableKits(selected, equipmentKits)[0] : undefined;
                    updateSlot(index, { aircraftId: e.target.value, kitId: compatible?.id || '' });
                  }}>
                    {aircraft.filter((item) => item.status === 'operational').map((item) => <MenuItem key={item.id} value={item.id}>{item.registration} · {item.model}</MenuItem>)}
                  </TextField>
                  <TextField select label={`Equipment kit for slot ${index + 1}`} value={slot.kitId} onChange={(e) => updateSlot(index, { kitId: e.target.value })}>
                    {compatibleKits.map((kit) => <MenuItem key={kit.id} value={kit.id}>{kit.name}</MenuItem>)}
                  </TextField>
                  <TextField select label={`Carrying asset for slot ${index + 1}`} value={slot.carryingAssetId || ''} onChange={(e) => updateSlot(index, { carryingAssetId: e.target.value || undefined })}>
                    <MenuItem value="">Not assigned</MenuItem>
                    {availableAssets.filter((asset) => form.assetIds.includes(asset.id)).map((asset) => <MenuItem key={asset.id} value={asset.id}>{asset.name} · {asset.registration}</MenuItem>)}
                  </TextField>
                  <TextField label="Role in setup" placeholder="Lead, backup…" value={slot.label} onChange={(e) => updateSlot(index, { label: e.target.value })} />
                </Box>
              </Box>
            );
          })}
        </Stack>
      </Box>

      <Box>
        <Typography variant="h6">Crew requirements</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3, 1fr)' }, gap: 1.5, mt: 1.5 }}>
          {CREW.map(({ role, label }) => (
            <TextField key={role} label={label} type="number" value={form.crewRequirements.find((item) => item.role === role)?.quantity || 0} onChange={(e) => updateCrew(role, Number(e.target.value))} inputProps={{ min: 0 }} />
          ))}
        </Box>
      </Box>
      <TextField label="Pack checklist" helperText="One item per line" multiline minRows={3} value={form.checklist.join('\n')} onChange={(e) => setForm({ ...form, checklist: e.target.value.split('\n').filter(Boolean) })} />
      <TextField label="Setup notes" multiline minRows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      <Stack direction="row" justifyContent="flex-end" spacing={1.5}><Button onClick={onCancel}>Cancel</Button><Button variant="contained" onClick={save}>Save template</Button></Stack>
    </Stack>
  );
}
