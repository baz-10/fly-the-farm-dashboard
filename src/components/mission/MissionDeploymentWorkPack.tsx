import React from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Checkbox,
  FormControl, FormControlLabel, InputLabel, MenuItem, Select, Stack, TextField, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { Aircraft, EquipmentKit } from '../../types/aircraft';
import { CrewRole, DeploymentAsset, MissionWorkPackDraft, WorkPackTemplate } from '../../types/workPack';
import { getCompatibleAvailableKits } from '../../utils/aircraftKitCompatibility';
import { applyWorkPackTemplate } from '../../utils/missionWorkPack';

interface Props {
  assets: DeploymentAsset[];
  templates: WorkPackTemplate[];
  aircraft: Aircraft[];
  equipmentKits: EquipmentKit[];
  value: MissionWorkPackDraft | undefined;
  showFinancials: boolean;
  persistenceWarning?: string;
  onChange: (next: MissionWorkPackDraft | undefined) => void;
}

const newAssignment = (index: number) => ({ id: `mission-slot-${Date.now()}-${index}`, aircraftId: '', kitId: '', label: `Aircraft ${index + 1}` });
const newSupportingEquipment = (index: number) => ({ id: `mission-support-${Date.now()}-${index}`, note: '' });
const crewRoles: Array<{ value: CrewRole; label: string }> = [
  { value: 'pilot', label: 'Pilot' }, { value: 'driver', label: 'Driver' },
  { value: 'field-supervisor', label: 'Field supervisor' }, { value: 'loader-mixer', label: 'Loader / mixer' },
  { value: 'spotter', label: 'Spotter' }, { value: 'support', label: 'Support' },
];
const newCrewRequirement = (index: number) => ({ id: `mission-crew-${Date.now()}-${index}`, role: 'support' as CrewRole, quantity: 1, notes: '' });

export default function MissionDeploymentWorkPack({ assets, templates, aircraft, equipmentKits, value, showFinancials, persistenceWarning, onChange }: Props) {
  const [draft, setDraft] = React.useState<MissionWorkPackDraft>(value ?? {});
  const [templateId, setTemplateId] = React.useState(value?.sourceTemplateId ?? '');

  React.useEffect(() => setDraft(value ?? {}), [value]);
  React.useEffect(() => {
    const sourceTemplateId = value?.sourceTemplateId;
    setTemplateId(sourceTemplateId && templates.some((item) => item.id === sourceTemplateId && item.status === 'active')
      ? sourceTemplateId
      : '');
  }, [templates, value?.sourceTemplateId]);

  const update = (next: MissionWorkPackDraft) => {
    setDraft(next);
    onChange(next);
  };
  const selectedAssets = draft.assets ?? [];
  const selectedAssetIds = new Set(selectedAssets.map((asset) => asset.id));
  const activeTemplates = templates.filter((item) => item.status === 'active');
  const assignments = draft.aircraftAssignments ?? [];
  const appliedTemplate = templates.find((item) => item.id === draft.sourceTemplateId);

  const toggleAsset = (asset: DeploymentAsset) => {
    const removing = selectedAssetIds.has(asset.id);
    const nextAssets = removing
      ? selectedAssets.filter((item) => item.id !== asset.id)
      : [...selectedAssets, asset];
    const nextAssignments = removing
      ? assignments.map((assignment) => assignment.carryingAssetId === asset.id
        ? { ...assignment, carryingAssetId: undefined }
        : assignment)
      : assignments;
    const nextSupportingEquipment = removing
      ? (draft.supportingEquipment ?? []).map((item) => item.carryingAssetId === asset.id ? { ...item, carryingAssetId: undefined } : item)
      : draft.supportingEquipment;
    update({ ...draft, assets: nextAssets, aircraftAssignments: nextAssignments, supportingEquipment: nextSupportingEquipment });
  };

  const patchAssignment = (index: number, patch: Partial<typeof assignments[number]>) => {
    const assignmentId = assignments[index]?.id;
    const next = assignments.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item);
    update({
      ...draft,
      aircraftAssignments: next,
      ...(Object.prototype.hasOwnProperty.call(patch, 'aircraftId') ? {
        unavailableAircraftReferences: (draft.unavailableAircraftReferences ?? []).filter((item) => item.assignmentId !== assignmentId),
        unavailableKitReferences: (draft.unavailableKitReferences ?? []).filter((item) => item.assignmentId !== assignmentId),
      } : Object.prototype.hasOwnProperty.call(patch, 'kitId') ? {
        unavailableKitReferences: (draft.unavailableKitReferences ?? []).filter((item) => item.assignmentId !== assignmentId),
      } : {}),
    });
  };

  return (
    <Accordion disableGutters elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '8px !important' }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="subtitle2" color="primary.dark">Deployment Work Pack (Optional)</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={2}>
          {persistenceWarning && <Alert severity="warning">{persistenceWarning} You can continue planning and try saving again.</Alert>}
          {draft.sourceTemplateId && !appliedTemplate && (
            <Alert severity="warning">The source template is missing. This mission copy is retained; remove or replace unavailable items before use.</Alert>
          )}
          {appliedTemplate?.status === 'archived' && (
            <Alert severity="warning">The source template is archived. This mission copy is retained; choose an active replacement when ready.</Alert>
          )}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
            <FormControl size="small" fullWidth>
              <InputLabel id="work-pack-template-label">Saved template</InputLabel>
              <Select labelId="work-pack-template-label" label="Saved template" value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
                {activeTemplates.map((item) => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}
              </Select>
            </FormControl>
            <Button variant="outlined" disabled={!templateId} onClick={() => {
              const template = templates.find((item) => item.id === templateId);
              if (!template) return;
              const templateAssetIds = template.assetIds || (template.truckId ? [template.truckId] : []);
              const templateAssets = assets.filter((asset) => templateAssetIds.includes(asset.id));
              const next = applyWorkPackTemplate(template, templateAssets, aircraft, equipmentKits);
              setDraft(next);
              onChange(next);
            }}>Apply template</Button>
          </Stack>

          <Box>
            <Typography variant="caption" color="text.secondary">Deployment assets</Typography>
            {assets.length === 0 ? (
              <Alert severity="info" sx={{ mt: 1 }}>No deployment assets added — continue without one.</Alert>
            ) : (
              <Stack>
                {assets.filter((asset) => asset.status === 'available' || selectedAssetIds.has(asset.id)).map((asset) => (
                  <FormControlLabel key={asset.id} control={<Checkbox checked={selectedAssetIds.has(asset.id)} onChange={() => toggleAsset(asset)} />} label={asset.name || asset.registration} />
                ))}
              </Stack>
            )}
          </Box>

          {(draft.unavailableAssetReferences ?? []).map((reference) => (
            <Alert key={reference.sourceAssetId} severity="warning" action={<Button size="small" onClick={() => update({ ...draft, unavailableAssetReferences: (draft.unavailableAssetReferences ?? []).filter((item) => item.sourceAssetId !== reference.sourceAssetId) })}>Remove</Button>}>
              {reference.label} — {reference.reason === 'missing' ? 'no longer exists' : reference.reason}. Replace or remove this source reference.
            </Alert>
          ))}
          {(draft.unavailableAircraftReferences ?? []).map((reference) => (
            <Alert key={`aircraft-${reference.assignmentId}`} severity="warning" action={<Button size="small" onClick={() => {
              const index = assignments.findIndex((item) => item.id === reference.assignmentId);
              if (index >= 0) patchAssignment(index, { aircraftId: '', kitId: '' });
            }}>Remove reference</Button>}>
              {reference.label} — {reference.reason === 'missing' ? 'no longer exists' : reference.reason}. Replace or remove this unavailable aircraft.
            </Alert>
          ))}
          {(draft.unavailableKitReferences ?? []).map((reference) => (
            <Alert key={`kit-${reference.assignmentId}`} severity="warning" action={<Button size="small" onClick={() => {
              const index = assignments.findIndex((item) => item.id === reference.assignmentId);
              if (index >= 0) patchAssignment(index, { kitId: '' });
            }}>Remove reference</Button>}>
              {reference.label} — {reference.reason === 'missing' ? 'no longer exists' : reference.reason}. Replace or remove this unavailable kit.
            </Alert>
          ))}

          {selectedAssets.some((asset) => asset.assetType === 'trailer') && (
            <Stack spacing={1}>
              <TextField size="small" label="Tow vehicle registration" value={draft.towVehicle?.registration ?? ''} onChange={(event) => update({ ...draft, towVehicle: { ...draft.towVehicle, registration: event.target.value } })} />
              <TextField size="small" label="Tow vehicle driver" value={draft.towVehicle?.driver ?? ''} onChange={(event) => update({ ...draft, towVehicle: { ...draft.towVehicle, driver: event.target.value } })} />
              <TextField size="small" label="Tow notes" multiline value={draft.towVehicle?.notes ?? ''} onChange={(event) => update({ ...draft, towVehicle: { ...draft.towVehicle, notes: event.target.value } })} />
            </Stack>
          )}

          <Stack spacing={1.5}>
            {assignments.map((assignment, index) => {
              const selectedAircraft = aircraft.find((item) => item.id === assignment.aircraftId);
              const compatibleKits = selectedAircraft ? getCompatibleAvailableKits(selectedAircraft, equipmentKits) : [];
              const unavailableAircraft = draft.unavailableAircraftReferences?.find((item) => item.assignmentId === assignment.id);
              const unavailableKit = draft.unavailableKitReferences?.find((item) => item.assignmentId === assignment.id);
              return (
                <Stack key={assignment.id} data-testid={`aircraft-assignment-${index}`} spacing={1} sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                  <FormControl size="small" fullWidth>
                    <InputLabel id={`aircraft-${index}-label`}>Aircraft</InputLabel>
                    <Select labelId={`aircraft-${index}-label`} label="Aircraft" value={assignment.aircraftId} onChange={(event) => patchAssignment(index, { aircraftId: event.target.value, kitId: '' })}>
                      {unavailableAircraft && <MenuItem value={assignment.aircraftId} disabled>Unavailable — {unavailableAircraft.label}</MenuItem>}
                      {aircraft.filter((item) => item.status === 'operational').map((item) => <MenuItem key={item.id} value={item.id}>{item.registration} — {item.model}</MenuItem>)}
                    </Select>
                  </FormControl>
                  <FormControl size="small" fullWidth disabled={!selectedAircraft}>
                    <InputLabel id={`kit-${index}-label`}>Equipment kit</InputLabel>
                    <Select labelId={`kit-${index}-label`} label="Equipment kit" value={assignment.kitId} onChange={(event) => patchAssignment(index, { kitId: event.target.value })}>
                      <MenuItem value="">No kit assigned</MenuItem>
                      {unavailableKit && <MenuItem value={assignment.kitId} disabled>Unavailable — {unavailableKit.label}</MenuItem>}
                      {compatibleKits.map((kit) => <MenuItem key={kit.id} value={kit.id}>{kit.name}</MenuItem>)}
                    </Select>
                  </FormControl>
                  <FormControl size="small" fullWidth>
                    <InputLabel id={`carrying-${index}-label`}>Carrying asset</InputLabel>
                    <Select labelId={`carrying-${index}-label`} label="Carrying asset" value={assignment.carryingAssetId ?? ''} onChange={(event) => patchAssignment(index, { carryingAssetId: event.target.value || undefined })}>
                      <MenuItem value="">None</MenuItem>
                      {selectedAssets.map((asset) => <MenuItem key={asset.id} value={asset.id}>{asset.name || asset.registration}</MenuItem>)}
                    </Select>
                  </FormControl>
                  <Button size="small" color="error" startIcon={<DeleteOutlineIcon />} onClick={() => update({
                    ...draft,
                    aircraftAssignments: assignments.filter((_, itemIndex) => itemIndex !== index),
                    unavailableAircraftReferences: (draft.unavailableAircraftReferences ?? []).filter((item) => item.assignmentId !== assignment.id),
                    unavailableKitReferences: (draft.unavailableKitReferences ?? []).filter((item) => item.assignmentId !== assignment.id),
                  })}>Remove aircraft</Button>
                </Stack>
              );
            })}
            <Button startIcon={<AddIcon />} disabled={assignments.length >= 3} onClick={() => update({ ...draft, aircraftAssignments: [...assignments, newAssignment(assignments.length)] })}>Add aircraft</Button>
          </Stack>

          <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
              <Typography variant="subtitle2">Crew requirements</Typography>
              <Button onClick={() => update({ ...draft, crewRequirements: [...(draft.crewRequirements ?? []), newCrewRequirement((draft.crewRequirements ?? []).length)] })}>Add crew requirement</Button>
            </Stack>
            <Stack spacing={1}>
              {(draft.crewRequirements ?? []).map((item, index) => <Box key={item.id} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '160px 140px 1fr auto' }, gap: 1 }}>
                <TextField size="small" select label={`Crew role ${index + 1}`} value={item.role} onChange={(event) => update({ ...draft, crewRequirements: (draft.crewRequirements ?? []).map((entry) => entry.id === item.id ? { ...entry, role: event.target.value as CrewRole } : entry) })}>
                  {crewRoles.map((role) => <MenuItem key={role.value} value={role.value}>{role.label}</MenuItem>)}
                </TextField>
                <TextField size="small" type="number" label={`Crew quantity: ${item.role}`} value={item.quantity} inputProps={{ min: 0 }} onChange={(event) => update({ ...draft, crewRequirements: (draft.crewRequirements ?? []).map((entry) => entry.id === item.id ? { ...entry, quantity: Math.max(0, Number(event.target.value)) } : entry) })} />
                <TextField size="small" label={`Crew notes: ${item.role}`} value={item.notes ?? ''} onChange={(event) => update({ ...draft, crewRequirements: (draft.crewRequirements ?? []).map((entry) => entry.id === item.id ? { ...entry, notes: event.target.value } : entry) })} />
                <Button color="error" onClick={() => update({ ...draft, crewRequirements: (draft.crewRequirements ?? []).filter((entry) => entry.id !== item.id) })}>Remove</Button>
              </Box>)}
            </Stack>
          </Box>

          <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="subtitle2">Supporting equipment</Typography>
              <Button startIcon={<AddIcon />} onClick={() => update({ ...draft, supportingEquipment: [...(draft.supportingEquipment ?? []), newSupportingEquipment((draft.supportingEquipment ?? []).length)] })}>Add supporting equipment</Button>
            </Stack>
            <Stack spacing={1} mt={1}>
              {(draft.supportingEquipment ?? []).map((item, index) => <Box key={item.id} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '2fr 1fr auto' }, gap: 1 }}>
                <TextField size="small" label={`Supporting equipment ${index + 1}`} value={item.note} onChange={(event) => update({ ...draft, supportingEquipment: (draft.supportingEquipment ?? []).map((entry) => entry.id === item.id ? { ...entry, note: event.target.value } : entry) })} />
                <TextField size="small" select label={`Carrying asset for supporting equipment ${index + 1}`} value={item.carryingAssetId ?? ''} onChange={(event) => update({ ...draft, supportingEquipment: (draft.supportingEquipment ?? []).map((entry) => entry.id === item.id ? { ...entry, carryingAssetId: event.target.value || undefined } : entry) })}>
                  <MenuItem value="">None</MenuItem>
                  {selectedAssets.map((asset) => <MenuItem key={asset.id} value={asset.id}>{asset.name || asset.registration}</MenuItem>)}
                </TextField>
                <Button color="error" onClick={() => update({ ...draft, supportingEquipment: (draft.supportingEquipment ?? []).filter((entry) => entry.id !== item.id) })}>Remove</Button>
              </Box>)}
            </Stack>
          </Box>

          <TextField size="small" label="Work-pack checklist" helperText="One item per line" multiline minRows={3} value={(draft.checklist ?? []).join('\n')} onChange={(event) => update({ ...draft, checklist: event.target.value ? event.target.value.split('\n') : [] })} />
          <TextField size="small" label="Operational work-pack notes" multiline minRows={2} value={draft.notes ?? ''} onChange={(event) => update({ ...draft, notes: event.target.value })} />
          {showFinancials && (
            <Box>
              {draft.estimatedDeploymentCost !== undefined && (
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2">Estimated deployment cost</Typography>
                  <Typography variant="body2">{draft.estimatedDeploymentCost.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' })}</Typography>
                </Stack>
              )}
              <Typography variant="caption" color={draft.costingComplete ? 'success.main' : 'warning.main'}>
                {draft.costingComplete ? 'Costing complete' : 'Costing incomplete'}
              </Typography>
            </Box>
          )}
          <Button color="inherit" onClick={() => { setDraft({}); setTemplateId(''); onChange(undefined); }}>Skip for now</Button>
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}
