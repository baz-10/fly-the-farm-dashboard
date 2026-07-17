import React from 'react';
import { Alert, FormControl, InputLabel, MenuItem, Select, Stack } from '@mui/material';
import { Aircraft, EquipmentKit } from '../../types/aircraft';
import { getCompatibleAvailableKits } from '../../utils/aircraftKitCompatibility';

interface MissionEquipmentSelectorProps {
  aircraft: Aircraft[];
  equipmentKits: EquipmentKit[];
  selectedAircraftId: string;
  selectedKitId: string;
  onAircraftChange: (aircraftId: string) => void;
  onKitChange: (kitId: string) => void;
}

export default function MissionEquipmentSelector({
  aircraft,
  equipmentKits,
  selectedAircraftId,
  selectedKitId,
  onAircraftChange,
  onKitChange,
}: MissionEquipmentSelectorProps) {
  const selectedAircraft = aircraft.find((item) => item.id === selectedAircraftId);
  const compatibleKits = selectedAircraft
    ? getCompatibleAvailableKits(selectedAircraft, equipmentKits)
    : [];

  return (
    <Stack spacing={1.5}>
      <FormControl fullWidth size="small">
        <InputLabel id="mission-aircraft-label">Aircraft</InputLabel>
        <Select
          labelId="mission-aircraft-label"
          value={selectedAircraftId}
          label="Aircraft"
          onChange={(event) => onAircraftChange(event.target.value)}
        >
          {aircraft.map((item) => (
            <MenuItem key={item.id} value={item.id}>
              {item.registration} - {item.model}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <FormControl fullWidth size="small">
        <InputLabel id="mission-kit-label">Equipment Kit</InputLabel>
        <Select
          labelId="mission-kit-label"
          value={compatibleKits.some((kit) => kit.id === selectedKitId) ? selectedKitId : ''}
          label="Equipment Kit"
          onChange={(event) => onKitChange(event.target.value)}
        >
          {compatibleKits.map((kit) => (
            <MenuItem key={kit.id} value={kit.id}>{kit.name}</MenuItem>
          ))}
        </Select>
      </FormControl>
      {selectedAircraft && compatibleKits.length === 0 && (
        <Alert severity="warning">
          No available kits match this aircraft model and payload limit.
        </Alert>
      )}
    </Stack>
  );
}
