import { Box, Card, Stack, Typography } from '@mui/material';

import type { SafetyPlanFieldValue, SafetyPlanSection } from '../../types/safetyPlan';
import SafetyPlanField from './SafetyPlanField';

interface StepSectionListProps {
  sections: SafetyPlanSection[];
  onFieldChange(fieldId: string, value: SafetyPlanFieldValue): void;
}

export default function StepSectionList({ sections, onFieldChange }: StepSectionListProps) {
  return (
    <Stack spacing={2}>
      {sections.map((section) => (
        <Card key={section.id} variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 3 }}>
          {section.title && <Typography variant="h6" fontWeight={850}>{section.title}</Typography>}
          {section.helpText && (
            <Typography color="text.secondary" variant="body2" sx={{ mt: 0.5, mb: 2 }}>
              {section.helpText}
            </Typography>
          )}
          <Box sx={{ display: 'grid', gap: 2 }}>
            {section.fields
              .filter((field) => field.id !== 'editor_last_step')
              .map((field) => (
                <SafetyPlanField key={field.id} field={field} onChange={onFieldChange} />
              ))}
          </Box>
        </Card>
      ))}
    </Stack>
  );
}
