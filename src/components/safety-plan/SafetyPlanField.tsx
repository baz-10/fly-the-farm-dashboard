import {
  Checkbox,
  FormControl,
  FormControlLabel,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  TextField,
} from '@mui/material';

import type { SafetyPlanField as SafetyPlanFieldModel, SafetyPlanFieldValue } from '../../types/safetyPlan';

interface SafetyPlanFieldProps {
  field: SafetyPlanFieldModel;
  onChange(fieldId: string, value: SafetyPlanFieldValue): void;
}

export default function SafetyPlanField({ field, onChange }: SafetyPlanFieldProps) {
  const label = field.required ? `${field.label} (required)` : field.label;
  const disabled = !field.companyEditable;

  if (field.type === 'boolean') {
    return (
      <FormControl disabled={disabled} fullWidth>
        <FormControlLabel
          control={(
            <Checkbox
              checked={field.value === true}
              onChange={(event) => onChange(field.id, event.target.checked)}
            />
          )}
          label={label}
        />
        {field.helpText && <FormHelperText>{field.helpText}</FormHelperText>}
      </FormControl>
    );
  }

  if (field.type === 'select' || field.type === 'multi_select') {
    const value = Array.isArray(field.value) ? field.value : field.value ?? '';
    return (
      <FormControl fullWidth disabled={disabled}>
        <InputLabel id={`${field.id}-label`}>{label}</InputLabel>
        <Select
          labelId={`${field.id}-label`}
          label={label}
          multiple={field.type === 'multi_select'}
          value={value}
          onChange={(event) => onChange(
            field.id,
            event.target.value as SafetyPlanFieldValue
          )}
        >
          {(Array.isArray(value) ? value : value ? [value] : []).map((option) => (
            <MenuItem key={String(option)} value={String(option)}>{String(option)}</MenuItem>
          ))}
        </Select>
        {field.helpText && <FormHelperText>{field.helpText}</FormHelperText>}
      </FormControl>
    );
  }

  const isList = [
    'person_list',
    'asset_list',
    'attachment_list',
  ].includes(field.type);
  const value = Array.isArray(field.value)
    ? field.value.join('\n')
    : typeof field.value === 'boolean'
      ? String(field.value)
      : field.value ?? '';
  const multiline = field.type === 'textarea' || field.type === 'date_range' || isList;

  return (
    <TextField
      fullWidth
      disabled={disabled}
      required={field.required}
      type={field.type === 'date' ? 'date' : 'text'}
      label={label}
      value={value}
      multiline={multiline}
      minRows={multiline ? 3 : undefined}
      helperText={field.helpText}
      onChange={(event) => onChange(
        field.id,
        isList
          ? event.target.value.split('\n').map((entry) => entry.trim()).filter(Boolean)
          : event.target.value
      )}
      slotProps={field.type === 'date' ? { inputLabel: { shrink: true } } : undefined}
    />
  );
}
