import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  LinearProgress,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import FlightTakeoffRoundedIcon from '@mui/icons-material/FlightTakeoffRounded';
import GettingStartedStep from '../components/onboarding/GettingStartedStep';
import { gettingStartedApi, GettingStartedProjection } from '../services/gettingStartedApi';

export default function GettingStarted() {
  const navigate = useNavigate();
  const theme = useTheme();
  const isDesktopSummary = useMediaQuery(theme.breakpoints.up('md'));
  const [projection, setProjection] = React.useState<GettingStartedProjection | null>(null);
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setProjection(await gettingStartedApi.read());
    } catch (requestError) {
      setProjection(null);
      setError(requestError instanceof Error ? requestError.message : 'Getting Started progress could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const openAction = React.useCallback((route: string) => {
    navigate(route);
    if (route !== '/getting-started#base') return;
    const heading = document.getElementById('getting-started-base-heading');
    const reducedMotion = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    heading?.scrollIntoView?.({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' });
    heading?.focus();
  }, [navigate]);

  if (loading && !projection) {
    return (
      <Stack alignItems="center" justifyContent="center" spacing={2} sx={{ minHeight: 360 }} aria-live="polite">
        <CircularProgress size={32} />
        <Typography color="text.secondary">Loading Getting Started…</Typography>
      </Stack>
    );
  }

  if (error || !projection) {
    return (
      <Alert severity="error" action={<Button color="inherit" onClick={() => void load()}>Try again</Button>}>
        {error || 'Getting Started progress could not be loaded.'}
      </Alert>
    );
  }

  const progress = projection.operationalReadiness.requiredSteps > 0
    ? Math.round((projection.operationalReadiness.completedSteps / projection.operationalReadiness.requiredSteps) * 100)
    : 0;

  return (
    <Box sx={{ width: '100%', maxWidth: 1120, minWidth: 0, boxSizing: 'border-box', overflowWrap: 'anywhere', mx: 'auto', pb: 7 }}>
      <Box
        component="header"
        sx={{
          position: 'relative',
          overflow: 'hidden',
          mb: 3,
          p: { xs: 2.5, sm: 4, md: 5 },
          borderRadius: 3,
          color: 'white',
          bgcolor: '#0b3715',
          backgroundImage: 'linear-gradient(112deg, #0b3715 0%, #15552a 64%, #557b35 100%)',
          '&::after': {
            content: '""', position: 'absolute', right: { xs: -72, md: 40 }, top: -86,
            width: 250, height: 250, border: '1px solid rgba(255,255,255,0.16)', borderRadius: '50%',
            boxShadow: '0 0 0 34px rgba(255,255,255,0.035), 0 0 0 68px rgba(255,255,255,0.025)',
          },
        }}
      >
        <Stack spacing={1.5} sx={{ position: 'relative', zIndex: 1, maxWidth: 760 }}>
          <Typography variant="overline" sx={{ color: '#d3e8ae', fontWeight: 850, letterSpacing: '0.14em' }}>Your first flight path</Typography>
          <Typography component="h1" variant="h3" sx={{ fontWeight: 900, letterSpacing: '-0.035em', fontSize: { xs: '2rem', md: '3rem' } }}>
            Getting Started
          </Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.82)', fontSize: { xs: '1rem', md: '1.12rem' }, maxWidth: 650 }}>
            Welcome to {projection.organisation.displayName}. Follow this path from your Base to your first Mission. Every result comes from the records your team already uses.
          </Typography>
        </Stack>
      </Box>

      <Stack
        direction={isDesktopSummary ? 'row' : 'column'}
        spacing={2.5}
        alignItems="stretch"
        sx={{ width: '100%', minWidth: 0, mb: 3, '& > *': { minWidth: 0, maxWidth: '100%' } }}
      >
        <Card variant="outlined" sx={{ flex: 1, borderColor: '#d6e3d3', borderRadius: 3 }}>
          <CardContent sx={{ p: { xs: 2.5, sm: 3 }, '&:last-child': { pb: { xs: 2.5, sm: 3 } } }}>
            <Stack spacing={1.5}>
              <Stack direction="row" justifyContent="space-between" alignItems="baseline" spacing={2}>
                <Box>
                  <Typography variant="overline" color="text.secondary" fontWeight={850}>Workspace progress</Typography>
                  <Typography variant="h5" fontWeight={900}>{projection.operationalReadiness.completedSteps} of {projection.operationalReadiness.requiredSteps} essentials ready</Typography>
                </Box>
                <Typography variant="h4" color="primary.dark" fontWeight={900}>{progress}%</Typography>
              </Stack>
              <LinearProgress variant="determinate" value={progress} aria-label={`${progress}% Getting Started progress`} sx={{ height: 9, borderRadius: 99, bgcolor: '#e5ede4' }} />
              <Typography variant="body2" color="text.secondary">Progress updates when authoritative records change. Optional Personnel is shown separately.</Typography>
            </Stack>
          </CardContent>
        </Card>

        {projection.nextAction && (
          <Card
            component="section"
            aria-label="Recommended next action"
            sx={{ flex: 1, borderRadius: 3, bgcolor: '#eff7e8', border: '1px solid #bdd29f', boxShadow: 'none' }}
          >
            <CardContent sx={{ p: { xs: 2.5, sm: 3 }, '&:last-child': { pb: { xs: 2.5, sm: 3 } } }}>
              <Stack direction="row" spacing={2} alignItems="flex-start">
                <Box sx={{ width: 44, height: 44, borderRadius: '50%', bgcolor: '#d8e9bd', color: '#2e5d24', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  <FlightTakeoffRoundedIcon />
                </Box>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="overline" sx={{ color: '#49693b', fontWeight: 900 }}>Recommended next action</Typography>
                  <Typography variant="h5" fontWeight={900} sx={{ mb: 1 }}>{projection.nextAction.label}</Typography>
                  <Button variant="contained" endIcon={<ArrowForwardRoundedIcon />} onClick={() => openAction(projection.nextAction!.route)}>
                    {projection.nextAction.label}
                  </Button>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        )}
      </Stack>

      <Box component="section" aria-labelledby="getting-started-checklist-heading">
        <Typography id="getting-started-checklist-heading" variant="h5" fontWeight={900} sx={{ mb: 0.5 }}>Your setup path</Typography>
        <Typography color="text.secondary" sx={{ mb: 2.5 }}>Open any section at any time, including steps you have already completed.</Typography>
        <Stack spacing={1.25}>
          {projection.steps.map((step) => (
            <GettingStartedStep
              key={step.code}
              step={step}
              recommended={projection.nextAction?.stepCode === step.code}
              onAction={openAction}
            />
          ))}
        </Stack>
      </Box>
    </Box>
  );
}
