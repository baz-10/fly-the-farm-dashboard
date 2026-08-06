import React from 'react';
import {
  Box,
  Breadcrumbs,
  Button,
  Card,
  CardContent,
  Chip,
  Link,
  Stack,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import RadioButtonCheckedIcon from '@mui/icons-material/RadioButtonChecked';
import type { MissionWorkspaceStage, MissionWorkspaceStageId } from '../../types/missionWorkspace';

type ParentContext = { label: string; href?: string };

export function MissionContextBar({
  client,
  property,
  field,
  missionNumber,
  missionTitle,
  operatingLocation,
  scheduledTime,
  status,
  savedLabel,
  onNavigate,
}: {
  client: ParentContext;
  property: ParentContext;
  field: ParentContext;
  missionNumber: string;
  missionTitle: string;
  operatingLocation?: string;
  scheduledTime?: string;
  status: string;
  savedLabel?: string;
  onNavigate: (href: string) => void;
}) {
  const parent = (item: ParentContext) => item.href
    ? <Link component="button" type="button" underline="hover" color="inherit" onClick={() => onNavigate(item.href!)}>{item.label}</Link>
    : <Typography color="text.secondary">{item.label}</Typography>;
  return <Card variant="outlined" sx={{ borderRadius: 2.5, mb: 2 }} data-testid="mission-context-bar">
    <CardContent sx={{ py: '16px !important' }}>
      <Stack spacing={1.25}>
        <Breadcrumbs aria-label="Mission context" separator=">" sx={{ '& .MuiBreadcrumbs-ol': { flexWrap: 'nowrap', overflowX: 'auto' } }}>
          {parent(client)}{parent(property)}{parent(field)}
          <Typography color="text.primary" fontWeight={700}>{missionNumber || 'Mission'}</Typography>
        </Breadcrumbs>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}>
          <Box>
            <Typography variant="h6" fontWeight={800}>{missionTitle || missionNumber || 'Mission'}</Typography>
            <Typography variant="body2" color="text.secondary">
              {[operatingLocation, scheduledTime].filter(Boolean).join(' · ')}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            {savedLabel && <Typography variant="caption" color="text.secondary">{savedLabel}</Typography>}
            <Chip label={status} size="small" color={status.toLowerCase().includes('complete') ? 'success' : 'warning'} variant="outlined" />
          </Stack>
        </Stack>
      </Stack>
    </CardContent>
  </Card>;
}

const iconFor = (stage: MissionWorkspaceStage, active: boolean) => {
  if (active) return <RadioButtonCheckedIcon fontSize="small" />;
  if (stage.state === 'COMPLETE') return <CheckCircleOutlineIcon fontSize="small" />;
  if (stage.state === 'NEEDS_REVIEW') return <ErrorOutlineIcon fontSize="small" />;
  return undefined;
};

export function MissionWorkspaceStepper({ stages, activeStage, onStageSelect }: {
  stages: MissionWorkspaceStage[];
  activeStage: MissionWorkspaceStageId;
  onStageSelect: (stage: MissionWorkspaceStageId) => void;
}) {
  const theme = useTheme();
  return <Box component="nav" aria-label="Mission lifecycle" sx={{ overflowX: 'auto', pb: 1, mb: 2 }}>
    <Stack direction="row" spacing={1} sx={{ minWidth: 'max-content' }}>
      {stages.map((stage) => {
        const active = stage.id === activeStage;
        const stateLabel = active ? 'Current' : stage.state === 'NEEDS_REVIEW' ? 'Needs Review' : stage.state.charAt(0) + stage.state.slice(1).toLowerCase();
        const accessibleState = stage.available ? stateLabel : stage.reason;
        return <Button
          key={stage.id}
          type="button"
          aria-current={active ? 'step' : undefined}
          aria-label={`${stage.label} — ${accessibleState}`}
          startIcon={iconFor(stage, active)}
          onClick={() => onStageSelect(stage.id)}
          variant={active ? 'contained' : 'outlined'}
          color={stage.state === 'NEEDS_REVIEW' ? 'warning' : 'primary'}
          sx={{
            minHeight: 58,
            px: 1.75,
            borderColor: active ? undefined : alpha(theme.palette.primary.main, stage.available ? 0.35 : 0.16),
            color: active ? undefined : stage.available ? 'text.primary' : 'text.secondary',
            bgcolor: active ? undefined : stage.state === 'COMPLETE' ? alpha(theme.palette.success.main, 0.06) : 'background.paper',
          }}
        >
          <Stack alignItems="flex-start" spacing={0}>
            <Typography component="span" variant="body2" fontWeight={800} textTransform="none">{stage.label}</Typography>
            <Typography component="span" variant="caption" textTransform="none" sx={{ opacity: 0.82, maxWidth: 170, textAlign: 'left' }}>
              {stage.available ? stateLabel : stage.reason}
            </Typography>
          </Stack>
        </Button>;
      })}
    </Stack>
  </Box>;
}
