import React from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Checkbox,
  FormControl, FormControlLabel, InputLabel, MenuItem, Select, Stack, TextField, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { Aircraft, EquipmentKit } from '../../types/aircraft';
import { DeploymentAsset, MissionWorkPackDraft, WorkPackTemplate } from '../../types/workPack';
import { getCompatibleAvailableKits } from '../../utils/aircraftKitCompatibility';
import { applyWorkPackTemplate } from '../../utils/missionWorkPack';

interface Props {
  assets: DeploymentAsset[];
  templates: WorkPackTemplate[];
  aircraft: Aircraft[];
  equipmentKits: EquipmentKit[];
  value: MissionWorkPackDraft | undefined;
  onChange: (next: MissionWorkPackDraft | undefined) => void;
}

const newAssignment = (index: number) => ({ id: `mission-slot-${Date.now()}-${index}`, aircraftId: '', kitId: '', label: `Aircraft ${index + 1}` });

export default function MissionDeploymentWorkPack({ assets, templates, aircraft, equipmentKits, value, onChange }: Props) {
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
    update({ ...draft, assets: nextAssets, aircraftAssignments: nextAssignments });
  };

  const patchAssignment = (index: number, patch: Partial<typeof assignments[number]>) => {
    const next = assignments.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item);
    update({ ...draft, aircraftAssignments: next });
  };

  return (
    <Accordion disableGutters elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '8px !important' }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="subtitle2" color="primary.dark">Deployment Work Pack (Optional)</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={2}>
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
              const next = applyWorkPackTemplate(template, templateAssets);
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
              return (
                <Stack key={assignment.id} data-testid={`aircraft-assignment-${index}`} spacing={1} sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                  <FormControl size="small" fullWidth>
                    <InputLabel id={`aircraft-${index}-label`}>Aircraft</InputLabel>
                    <Select labelId={`aircraft-${index}-label`} label="Aircraft" value={assignment.aircraftId} onChange={(event) => patchAssignment(index, { aircraftId: event.target.value, kitId: '' })}>
                      {aircraft.map((item) => <MenuItem key={item.id} value={item.id}>{item.registration} — {item.model}</MenuItem>)}
                    </Select>
                  </FormControl>
                  <FormControl size="small" fullWidth disabled={!selectedAircraft}>
                    <InputLabel id={`kit-${index}-label`}>Equipment kit</InputLabel>
                    <Select labelId={`kit-${index}-label`} label="Equipment kit" value={assignment.kitId} onChange={(event) => patchAssignment(index, { kitId: event.target.value })}>
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
                  <Button size="small" color="error" startIcon={<DeleteOutlineIcon />} onClick={() => update({ ...draft, aircraftAssignments: assignments.filter((_, itemIndex) => itemIndex !== index) })}>Remove aircraft</Button>
                </Stack>
              );
            })}
            <Button startIcon={<AddIcon />} disabled={assignments.length >= 3} onClick={() => update({ ...draft, aircraftAssignments: [...assignments, newAssignment(assignments.length)] })}>Add aircraft</Button>
          </Stack>

          {appliedTemplate && (
            <Box>
              <Typography variant="subtitle2">Crew and checklist</Typography>
              {draft.crewRequirements?.map((item) => <Typography key={item.id} variant="body2">{item.quantity} × {item.role}{item.notes ? ` — ${item.notes}` : ''}</Typography>)}
              {draft.checklist?.map((item) => <Typography key={item} variant="body2">• {item}</Typography>)}
            </Box>
          )}
          <Button color="inherit" onClick={() => { setDraft({}); setTemplateId(''); onChange(undefined); }}>Skip for now</Button>
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}
