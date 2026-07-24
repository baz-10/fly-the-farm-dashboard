import { Alert, Box, Chip, Stack } from '@mui/material';

import type {
  SafetyPlanFieldValue,
  SafetyPlanSection,
  SafetyPlanSourceSnapshot,
} from '../../types/safetyPlan';
import StepSectionList from './StepSectionList';

export default function PeopleAssetsStep(props: {
  sections: SafetyPlanSection[];
  sourceSnapshot: SafetyPlanSourceSnapshot;
  onFieldChange(fieldId: string, value: SafetyPlanFieldValue): void;
}) {
  return (
    <Stack spacing={2}>
      {(props.sourceSnapshot.crew?.length || props.sourceSnapshot.assets?.length) ? (
        <Alert severity="info">
          Linked job snapshot: {props.sourceSnapshot.crew?.length ?? 0} people and{' '}
          {props.sourceSnapshot.assets?.length ?? 0} operational assets.
        </Alert>
      ) : null}
      <Stack direction="row" gap={1} flexWrap="wrap">
        {props.sourceSnapshot.crew?.map((person) => (
          <Chip key={person.id} label={`${person.name} · ${person.role}`} />
        ))}
        {props.sourceSnapshot.assets?.map((asset) => (
          <Chip key={asset.id} variant="outlined" label={`${asset.name} · ${asset.type}`} />
        ))}
      </Stack>
      <Box
        component="span"
        sx={{
          position: 'absolute',
          width: 1,
          height: 1,
          p: 0,
          m: -1,
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
        }}
      >
        People and asset details
      </Box>
      <StepSectionList sections={props.sections} onFieldChange={props.onFieldChange} />
    </Stack>
  );
}
