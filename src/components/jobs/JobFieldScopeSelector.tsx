import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Divider,
  FormControlLabel,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

type ScopeClient = { id: string; name: string };
type ScopeProperty = { id: string; clientId: string; name: string };
type ScopeField = { id: string; propertyId: string; name: string; sizeHa: number };

export interface JobFieldScopeSelectorProps {
  clients: ScopeClient[];
  properties: ScopeProperty[];
  fields: ScopeField[];
  selectedClientId: string;
  selectedFieldIds: string[];
  onScopeChange: (scope: { clientId: string; fieldIds: string[] }) => void;
}

const hectares = (fields: ScopeField[]) => fields.reduce((total, field) => total + (field.sizeHa || 0), 0);
const fieldIdsKey = (fieldIds: string[]) => fieldIds.join('|');

export default function JobFieldScopeSelector({
  clients,
  properties,
  fields,
  selectedClientId,
  selectedFieldIds,
  onScopeChange,
}: JobFieldScopeSelectorProps) {
  const [activeFieldIds, setActiveFieldIds] = useState(selectedFieldIds);
  const [additionalPropertiesVisible, setAdditionalPropertiesVisible] = useState(false);
  const [query, setQuery] = useState('');
  const previousSelectedFieldIds = useRef(fieldIdsKey(selectedFieldIds));

  useEffect(() => {
    const nextKey = fieldIdsKey(selectedFieldIds);
    if (nextKey !== previousSelectedFieldIds.current) {
      previousSelectedFieldIds.current = nextKey;
      setActiveFieldIds(selectedFieldIds);
    }
  }, [selectedFieldIds]);

  const clientProperties = useMemo(
    () => properties.filter((property) => property.clientId === selectedClientId),
    [properties, selectedClientId],
  );
  const propertyById = useMemo(() => new Map(properties.map((property) => [property.id, property])), [properties]);
  const fieldsByProperty = useMemo(() => {
    const grouped = new Map<string, ScopeField[]>();
    fields.forEach((field) => {
      const values = grouped.get(field.propertyId) || [];
      values.push(field);
      grouped.set(field.propertyId, values);
    });
    return grouped;
  }, [fields]);
  const selectedFields = activeFieldIds
    .map((id) => fields.find((field) => field.id === id))
    .filter((field): field is ScopeField => Boolean(field));
  const selectedPropertyIds = Array.from(new Set(selectedFields.map((field) => field.propertyId)));
  const primaryPropertyId = selectedPropertyIds[0] || clientProperties[0]?.id || '';
  const propertyIdsToShow = additionalPropertiesVisible
    ? clientProperties.map((property) => property.id)
    : Array.from(new Set([primaryPropertyId, ...selectedPropertyIds])).filter(Boolean);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleProperties = clientProperties.filter((property) => propertyIdsToShow.includes(property.id)).filter((property) => {
    if (!normalizedQuery) return true;
    return property.name.toLowerCase().includes(normalizedQuery)
      || (fieldsByProperty.get(property.id) || []).some((field) => field.name.toLowerCase().includes(normalizedQuery));
  });

  const changeClient = (clientId: string) => {
    previousSelectedFieldIds.current = '';
    setActiveFieldIds([]);
    setAdditionalPropertiesVisible(false);
    onScopeChange({ clientId, fieldIds: [] });
  };

  const toggleField = (fieldId: string) => {
    setActiveFieldIds((currentFieldIds) => {
      const nextFieldIds = currentFieldIds.includes(fieldId)
        ? currentFieldIds.filter((id) => id !== fieldId)
        : [...currentFieldIds, fieldId];
      previousSelectedFieldIds.current = fieldIdsKey(nextFieldIds);
      onScopeChange({ clientId: selectedClientId, fieldIds: nextFieldIds });
      return nextFieldIds;
    });
  };

  return <Stack spacing={2} aria-label="Job field scope">
    <TextField
      select
      SelectProps={{ native: true }}
      label="Client"
      value={selectedClientId}
      onChange={(event) => changeClient(event.target.value)}
      inputProps={{ 'aria-label': 'Client' }}
      fullWidth
      required
    >
      <option value="">Select Client</option>
      {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
    </TextField>

    {selectedClientId && <>
      <TextField
        label="Search Fields"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        inputProps={{ 'aria-label': 'Search Fields' }}
        fullWidth
      />

      {visibleProperties.map((property) => {
        const propertyFields = (fieldsByProperty.get(property.id) || []).filter((field) => !normalizedQuery
          || property.name.toLowerCase().includes(normalizedQuery)
          || field.name.toLowerCase().includes(normalizedQuery));
        const selectedInProperty = propertyFields.filter((field) => activeFieldIds.includes(field.id));
        return <Paper key={property.id} variant="outlined" sx={{ p: 1.5 }}>
          <Stack spacing={0.5}>
            <Typography variant="subtitle2" fontWeight={800}>{property.name}</Typography>
            <Typography variant="caption" color="text.secondary">
              {selectedInProperty.length} {selectedInProperty.length === 1 ? 'Field' : 'Fields'} selected · {hectares(selectedInProperty).toFixed(4)} ha
            </Typography>
          </Stack>
          <Divider sx={{ my: 1 }} />
          <Stack spacing={0.25}>
            {propertyFields.map((field) => <FormControlLabel
              key={field.id}
              control={<Checkbox checked={activeFieldIds.includes(field.id)} onChange={() => toggleField(field.id)} />}
              label={field.name}
            />)}
            {!propertyFields.length && <Typography variant="body2" color="text.secondary">No matching Fields.</Typography>}
          </Stack>
        </Paper>;
      })}

      {!additionalPropertiesVisible && clientProperties.some((property) => !propertyIdsToShow.includes(property.id)) && <Button
        variant="outlined"
        onClick={() => setAdditionalPropertiesVisible(true)}
        sx={{ alignSelf: 'flex-start' }}
      >
        Add fields from another Property
      </Button>}

      <Box aria-live="polite">
        <Typography variant="body2" fontWeight={800}>
          {selectedPropertyIds.length} {selectedPropertyIds.length === 1 ? 'Property' : 'Properties'} · {selectedFields.length} {selectedFields.length === 1 ? 'Field' : 'Fields'} · {hectares(selectedFields).toFixed(4)} ha
        </Typography>
        {selectedPropertyIds.length > 0 && <Typography variant="caption" color="text.secondary">
          {selectedPropertyIds.map((id) => propertyById.get(id)?.name).filter(Boolean).join(' · ')}
        </Typography>}
      </Box>
    </>}
  </Stack>;
}
