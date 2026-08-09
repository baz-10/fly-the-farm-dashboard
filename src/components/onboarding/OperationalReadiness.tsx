import React from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
  Typography,
} from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import FlightTakeoffRoundedIcon from '@mui/icons-material/FlightTakeoffRounded';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import { OperationalReadinessModel } from '../../services/gettingStartedApi';

interface OperationalReadinessProps {
  readiness: OperationalReadinessModel;
  onAction: (route: string) => void;
}

const statePresentation = {
  GETTING_STARTED: {
    label: 'Getting started',
    colour: '#49693b',
    background: '#eff7e8',
    border: '#bdd29f',
    icon: <FlightTakeoffRoundedIcon />,
  },
  READY_TO_PLAN: {
    label: 'Ready to plan',
    colour: '#267447',
    background: '#e8f4ea',
    border: '#9ec7a9',
    icon: <CheckCircleRoundedIcon />,
  },
  NEEDS_OPERATIONAL_ATTENTION: {
    label: 'Needs attention',
    colour: '#8a4f00',
    background: '#fff5e2',
    border: '#e8c179',
    icon: <WarningAmberRoundedIcon />,
  },
} as const;

export default function OperationalReadiness({ readiness, onAction }: OperationalReadinessProps) {
  const presentation = statePresentation[readiness.state];
  const outstanding = readiness.requiredActions;
  const attention = readiness.advisories.filter((item) => item.requiresAttention);
  const advisoryLabel = attention.length > 0 ? 'Operational attention' : 'Compliance advisory';

  return (
    <Card
      component="section"
      aria-labelledby="operational-readiness-heading"
      sx={{
        mt: 3.5,
        borderRadius: 3,
        border: '1px solid',
        borderColor: presentation.border,
        bgcolor: presentation.background,
        boxShadow: 'none',
      }}
    >
      <CardContent sx={{ p: { xs: 2.5, sm: 3.5 }, '&:last-child': { pb: { xs: 2.5, sm: 3.5 } } }}>
        <Stack spacing={2.5}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'flex-start' }}>
            <Box sx={{ color: presentation.colour, display: 'flex', mt: 0.25 }}>{presentation.icon}</Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center" sx={{ mb: 0.75 }}>
                <Typography id="operational-readiness-heading" component="h2" variant="h5" fontWeight={900}>
                  {readiness.headline}
                </Typography>
                <Chip size="small" label={presentation.label} sx={{ color: presentation.colour, bgcolor: 'rgba(255,255,255,0.72)', fontWeight: 850 }} />
              </Stack>
              <Typography color="text.secondary">{readiness.summary}</Typography>
              {readiness.primaryAction && (
                <Button
                  variant="contained"
                  endIcon={<ArrowForwardRoundedIcon />}
                  onClick={() => onAction(readiness.primaryAction!.route)}
                  sx={{ mt: 2 }}
                >
                  {readiness.primaryAction.label}
                </Button>
              )}
            </Box>
          </Stack>

          {outstanding.length > 0 && (
            <Box component="section" aria-label="Outstanding setup" sx={{ bgcolor: 'rgba(255,255,255,0.72)', borderRadius: 2, p: 2 }}>
              <Typography fontWeight={850} sx={{ mb: 1 }}>Still to complete</Typography>
              <Stack spacing={1.25}>
                {outstanding.map((item) => (
                  <Stack key={item.code} direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ sm: 'center' }}>
                    <Typography variant="body2" color="text.secondary">{item.reason}</Typography>
                    <Button size="small" variant="outlined" onClick={() => onAction(item.route)}>{item.label}</Button>
                  </Stack>
                ))}
              </Stack>
            </Box>
          )}

          {readiness.advisories.length > 0 && (
            <Box component="section" role="region" aria-label={advisoryLabel}>
              <Typography fontWeight={850} sx={{ mb: 1 }}>{advisoryLabel}</Typography>
              <Stack spacing={1}>
                {readiness.advisories.map((item, index) => (
                  <Alert
                    key={`${item.code}:${item.route}:${index}`}
                    severity={item.requiresAttention ? 'warning' : 'info'}
                    action={<Button color="inherit" size="small" onClick={() => onAction(item.route)}>Review {item.label}</Button>}
                  >
                    <Typography fontWeight={800}>{item.label}</Typography>
                    <Typography variant="body2">{item.reason}</Typography>
                  </Alert>
                ))}
              </Stack>
            </Box>
          )}

          <Box component="section" role="region" aria-label="Personnel readiness" sx={{ bgcolor: 'rgba(255,255,255,0.72)', borderRadius: 2, p: 2 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
              <GroupsRoundedIcon sx={{ color: '#49693b' }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography fontWeight={850}>{readiness.personnel.headline}</Typography>
                <Typography variant="body2" color="text.secondary">{readiness.personnel.reason}</Typography>
              </Box>
              {readiness.personnel.state === 'NOT_RECORDED' && (
                <Button variant="outlined" onClick={() => onAction(readiness.personnel.route)}>Add Personnel</Button>
              )}
            </Stack>
          </Box>

          <Typography variant="body2" color="text.secondary" sx={{ pt: 0.5 }}>
            Each Mission must still satisfy Weather, JSA, Personnel, compliance, readiness and authorisation requirements before flight.
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}
