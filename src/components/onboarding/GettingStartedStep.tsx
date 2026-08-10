import React from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Chip,
  Stack,
  Typography,
} from '@mui/material';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import RadioButtonUncheckedRoundedIcon from '@mui/icons-material/RadioButtonUncheckedRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import { GettingStartedStepModel } from '../../services/gettingStartedApi';

const statePresentation = {
  COMPLETE: { label: 'Complete', colour: '#267447', background: '#e8f4ea', icon: <CheckCircleRoundedIcon fontSize="small" /> },
  NEEDS_ATTENTION: { label: 'Needs attention', colour: '#9a5700', background: '#fff3dc', icon: <WarningAmberRoundedIcon fontSize="small" /> },
  NOT_STARTED: { label: 'Not started', colour: '#58655b', background: '#eef2ee', icon: <RadioButtonUncheckedRoundedIcon fontSize="small" /> },
  OPTIONAL: { label: 'Optional', colour: '#4d5f82', background: '#edf1fb', icon: <RadioButtonUncheckedRoundedIcon fontSize="small" /> },
} as const;

interface GettingStartedStepProps {
  step: GettingStartedStepModel;
  recommended?: boolean;
  onAction: (route: string) => void;
}

export default function GettingStartedStep({ step, recommended = false, onAction }: GettingStartedStepProps) {
  const [expanded, setExpanded] = React.useState(recommended);
  const presentation = statePresentation[step.state];
  const headingId = `getting-started-${step.code.toLowerCase()}-heading`;
  const panelId = `getting-started-${step.code.toLowerCase()}-panel`;

  React.useEffect(() => {
    if (recommended) setExpanded(true);
  }, [recommended]);

  return (
    <Accordion
      id={step.code.toLowerCase()}
      expanded={expanded}
      onChange={(_, next) => setExpanded(next)}
      disableGutters
      elevation={0}
      sx={{
        border: '1px solid',
        borderColor: recommended ? '#7da267' : '#d9e2d9',
        borderRadius: '12px !important',
        overflow: 'hidden',
        bgcolor: '#fff',
        '&::before': { display: 'none' },
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreRoundedIcon />}
        aria-controls={panelId}
        id={headingId}
        sx={{
          minHeight: 68,
          px: { xs: 2, sm: 2.5 },
          '& .MuiAccordionSummary-content': { my: 1.25, minWidth: 0 },
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ minWidth: 0, width: '100%' }}>
          <Box sx={{ color: presentation.colour, display: 'flex' }}>{presentation.icon}</Box>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Stack direction="row" alignItems="center" spacing={1} useFlexGap flexWrap="wrap">
              <Typography fontWeight={850}>{step.label}</Typography>
              {recommended && <Typography variant="caption" sx={{ color: '#416334', fontWeight: 850, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Up next</Typography>}
            </Stack>
          </Box>
          <Chip
            size="small"
            label={presentation.label}
            sx={{ color: presentation.colour, bgcolor: presentation.background, fontWeight: 800, flexShrink: 0 }}
          />
        </Stack>
      </AccordionSummary>
      <AccordionDetails id={panelId} aria-labelledby={headingId} sx={{ px: { xs: 2, sm: 2.5 }, pt: 0, pb: 2.5 }}>
        <Stack spacing={2}>
          <Typography color="text.secondary" sx={{ maxWidth: 720 }}>{step.summary}</Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
            <Button variant={recommended ? 'contained' : 'outlined'} onClick={() => onAction(step.action.route)}>
              {step.action.label}
            </Button>
            {step.optional && (
              <Button color="inherit" onClick={() => setExpanded(false)}>Do this later</Button>
            )}
          </Stack>
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}
