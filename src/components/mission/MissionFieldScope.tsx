import React from 'react';
import { Alert, Checkbox, FormControlLabel, Stack, Typography } from '@mui/material';

export type MissionScopeField = { id: string; name: string; sizeHa?: number };
export type MissionScopePropertyGroup = { propertyId: string; propertyName: string; fields: MissionScopeField[] };

export default function MissionFieldScope({
  jobFieldIds,
  selectedFieldIds,
  fieldsByProperty,
  onSelectedFieldIdsChange,
  disabled = false,
}: {
  jobFieldIds: string[];
  selectedFieldIds: string[];
  fieldsByProperty: MissionScopePropertyGroup[];
  onSelectedFieldIdsChange: (fieldIds: string[]) => void;
  disabled?: boolean;
}) {
  const [minimumSelectionError, setMinimumSelectionError] = React.useState(false);
  const jobFieldIdSet = React.useMemo(() => new Set(jobFieldIds), [jobFieldIds]);
  const groups = React.useMemo(() => fieldsByProperty.map((group) => ({
    ...group,
    fields: group.fields.filter((field) => jobFieldIdSet.has(field.id)),
  })).filter((group) => group.fields.length > 0), [fieldsByProperty, jobFieldIdSet]);

  const toggle = (fieldId: string) => {
    if (selectedFieldIds.includes(fieldId)) {
      if (selectedFieldIds.length === 1) {
        setMinimumSelectionError(true);
        return;
      }
      onSelectedFieldIdsChange(selectedFieldIds.filter((id) => id !== fieldId));
    } else {
      onSelectedFieldIdsChange([...selectedFieldIds, fieldId]);
    }
    setMinimumSelectionError(false);
  };

  return <Stack spacing={1.5} aria-label="Mission field scope">
    <Typography variant="subtitle1" fontWeight={800}>Mission Field scope</Typography>
    <Typography variant="body2" color="text.secondary">Start with the Job Fields, then choose the non-empty subset this Mission will operate in. Fields outside this Job are never available here.</Typography>
    {minimumSelectionError && <Alert severity="error">Select at least one Job Field for this Mission.</Alert>}
    {groups.map((group) => <Stack key={group.propertyId} spacing={0.25} sx={{ pl: 0.5 }}>
      <Typography component="h3" variant="subtitle2" fontWeight={800}>{group.propertyName}</Typography>
      {group.fields.map((field) => <FormControlLabel key={field.id} control={<Checkbox
        checked={selectedFieldIds.includes(field.id)}
        onChange={() => toggle(field.id)}
        disabled={disabled}
      />} label={field.sizeHa === undefined ? field.name : `${field.name} · ${field.sizeHa.toFixed(4)} ha`} />)}
    </Stack>)}
  </Stack>;
}
