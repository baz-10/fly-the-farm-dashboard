import React from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  Stack,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { MissionStatusGroups, MissionStatusItem, MissionWorkspaceStageId } from '../../types/missionWorkspace';

function StatusSection({ title, items, empty, onStageSelect }: {
  title: string;
  items: MissionStatusItem[];
  empty: string;
  onStageSelect: (stage: MissionWorkspaceStageId) => void;
}) {
  return <Box>
    <Typography component="h3" variant="subtitle2" fontWeight={900} sx={{ mb: 1 }}>{title}</Typography>
    {items.length === 0 ? <Typography variant="body2" color="text.secondary">{empty}</Typography> : <Stack spacing={1}>
      {items.map((item) => <Box key={item.stageId}>
        <Typography variant="body2" fontWeight={800}>{item.label}</Typography>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>{item.reason}</Typography>
        <Button size="small" variant="text" onClick={() => onStageSelect(item.stageId)} sx={{ px: 0 }}>
          {title === 'Complete' ? `Open ${item.label}` : `Fix ${item.label}`}
        </Button>
      </Box>)}
    </Stack>}
  </Box>;
}

export default function MissionStatusPanel({ groups, onStageSelect }: {
  groups: MissionStatusGroups;
  onStageSelect: (stage: MissionWorkspaceStageId) => void;
}) {
  const content = <Stack spacing={2} divider={<Divider flexItem />}>
    <StatusSection title="Needs Attention" items={groups.needsAttention} empty="Nothing needs immediate attention." onStageSelect={onStageSelect} />
    <StatusSection title="Needs Review" items={groups.needsReview} empty="Nothing needs review." onStageSelect={onStageSelect} />
    <StatusSection title="Complete" items={groups.complete} empty="No stages are complete yet." onStageSelect={onStageSelect} />
  </Stack>;
  return <>
    <Card variant="outlined" sx={{ display: { xs: 'none', lg: 'block' }, borderRadius: 2.5, position: 'sticky', top: 88 }}>
      <CardContent><Typography component="h2" variant="h6" fontWeight={900} sx={{ mb: 2 }}>Mission Status</Typography>{content}</CardContent>
    </Card>
    <Accordion variant="outlined" sx={{ display: { xs: 'block', lg: 'none' }, borderRadius: '12px !important', mb: 2 }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />} aria-controls="mission-status-content">
        <Typography component="h2" variant="h6" fontWeight={900}>Mission Status</Typography>
      </AccordionSummary>
      <AccordionDetails id="mission-status-content">{content}</AccordionDetails>
    </Accordion>
  </>;
}
