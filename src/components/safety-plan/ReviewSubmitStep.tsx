import { Stack } from '@mui/material';

import type { User } from '../../contexts/AuthContext';
import type { SafetyPlan, SafetyPlanFieldValue, SafetyPlanSection } from '../../types/safetyPlan';
import SafetyPlanApprovalPanel from './SafetyPlanApprovalPanel';
import StepSectionList from './StepSectionList';

export default function ReviewSubmitStep(props: {
  plan: SafetyPlan;
  user: User;
  sections: SafetyPlanSection[];
  onFieldChange(fieldId: string, value: SafetyPlanFieldValue): void;
  sourceChanged?: boolean;
  busy?: boolean;
  onSubmit?(): void;
  onApprove?(): void;
  onAcknowledge?(): void;
  onRevise?(): void;
}) {
  return (
    <Stack spacing={2}>
      <SafetyPlanApprovalPanel
        plan={props.plan}
        user={props.user}
        sourceChanged={props.sourceChanged}
        busy={props.busy}
        onSubmit={props.onSubmit}
        onApprove={props.onApprove}
        onAcknowledge={props.onAcknowledge}
        onRevise={props.onRevise}
      />
      <StepSectionList sections={props.sections} onFieldChange={props.onFieldChange} />
    </Stack>
  );
}
