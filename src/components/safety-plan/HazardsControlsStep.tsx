import { Box, Card, Chip, Stack, TextField, Typography } from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

import type {
  SafetyPlanFieldValue,
  SafetyPlanSection,
  SafetyPlanSourceSnapshot,
} from '../../types/safetyPlan';
import StepSectionList from './StepSectionList';

export default function HazardsControlsStep(props: {
  sections: SafetyPlanSection[];
  sourceSnapshot: SafetyPlanSourceSnapshot;
  onFieldChange(fieldId: string, value: SafetyPlanFieldValue): void;
}) {
  const missionById = new Map(props.sourceSnapshot.missions.map((mission) => [mission.id, mission.name]));
  return (
    <Stack spacing={2}>
      {(props.sourceSnapshot.hazards ?? []).map((hazard) => {
        const riskMatch = /risk score\s*(\d+)/i.exec(hazard.value);
        const mitigation = hazard.value.replace(/risk score\s*\d+\s*[·:—-]?\s*/i, '');
        return (
          <Card
            key={hazard.id}
            variant="outlined"
            sx={{ p: 2, borderRadius: 3, borderLeft: 5, borderLeftColor: 'warning.main' }}
          >
            <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} justifyContent="space-between">
              <Box>
                <Stack direction="row" gap={1} alignItems="center">
                  <WarningAmberIcon color="warning" fontSize="small" />
                  <Typography fontWeight={850}>{hazard.label}</Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  Source mission: <strong>{missionById.get(hazard.sourceId) ?? hazard.sourceId}</strong>
                  {' · '}JSA item: {hazard.sourceItemId}
                </Typography>
              </Box>
              {riskMatch && <Chip color="warning" label={`Original risk score ${riskMatch[1]}`} />}
            </Stack>
            <Typography variant="body2" sx={{ mt: 1.5 }}>
              <strong>Source mitigation:</strong> {mitigation || hazard.value}
            </Typography>
            <TextField
              fullWidth
              multiline
              minRows={2}
              sx={{ mt: 1.5 }}
              label={`Company control for ${hazard.label}`}
              value={hazard.companyValue}
              onChange={(event) => props.onFieldChange(hazard.id, event.target.value)}
            />
          </Card>
        );
      })}
      <StepSectionList sections={props.sections} onFieldChange={props.onFieldChange} />
    </Stack>
  );
}
