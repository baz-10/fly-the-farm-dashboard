import { Box, Button, Stack, Typography } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

export interface SafetyPlanStep {
  label: string;
  shortLabel: string;
}

interface SafetyPlanStepperProps {
  steps: SafetyPlanStep[];
  activeStep: number;
  completedSteps: Set<number>;
  onChange(step: number): void;
}

export default function SafetyPlanStepper({
  steps,
  activeStep,
  completedSteps,
  onChange,
}: SafetyPlanStepperProps) {
  const moveFocus = (current: number, direction: number) => {
    const next = (current + direction + steps.length) % steps.length;
    onChange(next);
    requestAnimationFrame(() => {
      document.getElementById(`safety-plan-step-${next}`)?.focus();
    });
  };

  return (
    <Stack
      data-testid="safety-plan-stepper"
      component="nav"
      aria-label="Safety Plan steps"
      direction="column"
      sx={{
        overflowX: 'visible',
        gap: 0.75,
      }}
    >
      {steps.map((step, index) => (
        <Button
          id={`safety-plan-step-${index}`}
          key={step.label}
          aria-current={activeStep === index ? 'step' : undefined}
          onClick={() => onChange(index)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
              event.preventDefault();
              moveFocus(index, 1);
            } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
              event.preventDefault();
              moveFocus(index, -1);
            }
          }}
          startIcon={completedSteps.has(index) ? <CheckCircleIcon /> : (
            <Box
              component="span"
              sx={{
                display: 'grid',
                placeItems: 'center',
                width: 24,
                height: 24,
                borderRadius: '50%',
                bgcolor: activeStep === index ? 'primary.main' : 'grey.200',
                color: activeStep === index ? 'primary.contrastText' : 'text.secondary',
                fontSize: 12,
                fontWeight: 900,
              }}
            >
              {index + 1}
            </Box>
          )}
          sx={{
            minHeight: 48,
            minWidth: 0,
            justifyContent: 'flex-start',
            px: 1.5,
            borderRadius: 2,
            color: activeStep === index ? 'primary.dark' : 'text.secondary',
            bgcolor: activeStep === index ? 'rgba(27, 94, 32, 0.09)' : 'transparent',
            borderLeft: { md: activeStep === index ? '4px solid' : '4px solid transparent' },
            borderLeftColor: { md: activeStep === index ? 'primary.main' : 'transparent' },
          }}
        >
          <Typography component="span" variant="body2" fontWeight={activeStep === index ? 800 : 650}>
            {step.shortLabel}
          </Typography>
        </Button>
      ))}
    </Stack>
  );
}
