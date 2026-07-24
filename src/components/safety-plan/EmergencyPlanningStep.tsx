import { Alert, Stack } from '@mui/material';

import type {
  SafetyPlanFieldValue,
  SafetyPlanSection,
  SafetyPlanSourceSnapshot,
} from '../../types/safetyPlan';
import StepSectionList from './StepSectionList';

export default function EmergencyPlanningStep(props: {
  sections: SafetyPlanSection[];
  sourceSnapshot: SafetyPlanSourceSnapshot;
  onFieldChange(fieldId: string, value: SafetyPlanFieldValue): void;
}) {
  return (
    <Stack spacing={2}>
      <Alert severity="warning">
        Confirm contacts, communications, lost contact, incident, fire, first aid,
        spill and environmental response before field deployment.
      </Alert>
      <StepSectionList sections={props.sections} onFieldChange={props.onFieldChange} />
    </Stack>
  );
}
