import { Box, Divider, LinearProgress, Stack, Typography } from '@mui/material';
import TaskAltIcon from '@mui/icons-material/TaskAlt';

import type { SafetyPlanSection } from '../../types/safetyPlan';

function present(value: SafetyPlanSection['fields'][number]['value']) {
  return value != null
    && value !== ''
    && (!Array.isArray(value) || value.length > 0);
}

interface SafetyPlanReadinessProps {
  sections: SafetyPlanSection[];
  stepSections: SafetyPlanSection[][];
}

export default function SafetyPlanReadiness({
  sections,
  stepSections,
}: SafetyPlanReadinessProps) {
  const required = sections.flatMap((section) => section.fields.filter((field) => field.required));
  const complete = required.filter((field) => present(field.value)).length;
  const percent = required.length === 0 ? 100 : Math.round((complete / required.length) * 100);

  return (
    <Box
      data-testid="safety-plan-readiness"
      component="aside"
      aria-label="Safety Plan readiness"
      sx={{
        width: { xs: '100%', lg: 300 },
        maxWidth: '100%',
        alignSelf: 'start',
        position: { lg: 'sticky' },
        top: { lg: 88 },
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 3,
        bgcolor: 'background.paper',
        p: 2.25,
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Box>
          <Typography variant="overline" color="text.secondary" fontWeight={800}>
            Field readiness
          </Typography>
          <Typography variant="h4" fontWeight={900} color="primary.dark">
            {percent}%
          </Typography>
        </Box>
        <TaskAltIcon color={percent === 100 ? 'success' : 'disabled'} sx={{ fontSize: 40 }} />
      </Stack>
      <LinearProgress
        variant="determinate"
        value={percent}
        aria-label={`${percent}% Safety Plan complete`}
        sx={{ mt: 1, mb: 2, height: 8, borderRadius: 8 }}
      />
      <Typography variant="body2" color="text.secondary">
        {complete} of {required.length} required responses complete
      </Typography>
      <Divider sx={{ my: 2 }} />
      <Stack spacing={1}>
        {stepSections.map((group, index) => {
          const fields = group.flatMap((section) => section.fields.filter((field) => field.required));
          const done = fields.length > 0 && fields.every((field) => present(field.value));
          return (
            <Stack key={index} direction="row" justifyContent="space-between" gap={1}>
              <Typography variant="body2">{index + 1}. {['Job', 'People', 'Hazards', 'Emergency', 'Review'][index]}</Typography>
              <Typography variant="caption" color={done ? 'success.main' : 'text.secondary'} fontWeight={800}>
                {done ? 'Ready' : `${fields.filter((field) => present(field.value)).length}/${fields.length}`}
              </Typography>
            </Stack>
          );
        })}
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
        This optional plan does not block mission authorisation.
      </Typography>
    </Box>
  );
}
