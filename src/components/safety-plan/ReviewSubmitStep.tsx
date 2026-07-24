import { Alert, Button, Card, Stack, Typography } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';

import type { SafetyPlan, SafetyPlanFieldValue, SafetyPlanSection } from '../../types/safetyPlan';
import { canSubmitPlan } from '../../utils/safetyPlanRules';
import StepSectionList from './StepSectionList';

export default function ReviewSubmitStep(props: {
  plan: SafetyPlan;
  sections: SafetyPlanSection[];
  onFieldChange(fieldId: string, value: SafetyPlanFieldValue): void;
}) {
  const submission = canSubmitPlan(props.plan);
  return (
    <Stack spacing={2}>
      <Card variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
        <Typography variant="h6" fontWeight={850}>Final field check</Typography>
        <Typography color="text.secondary" sx={{ mt: 0.5 }}>
          Review the controlled plan before sending it to the nominated operational authority.
        </Typography>
        {!submission.ok && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            Complete {submission.missing.length} required section{submission.missing.length === 1 ? '' : 's'} before submission.
          </Alert>
        )}
        <Button
          disabled={!submission.ok}
          variant="contained"
          startIcon={<SendIcon />}
          sx={{ mt: 2, minHeight: 44 }}
        >
          Send for approval
        </Button>
      </Card>
      <StepSectionList sections={props.sections} onFieldChange={props.onFieldChange} />
    </Stack>
  );
}
