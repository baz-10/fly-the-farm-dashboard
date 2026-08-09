import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, CircularProgress, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import ResetPassword from './ResetPassword';
import AcceptOrganisationInvitation from './AcceptOrganisationInvitation';
import PlatformBrand from '../brand/PlatformBrand';

function ConfirmationCallback() {
  const { completeSession } = useAuth();
  const [state, setState] = useState<{ loading: boolean; success: boolean; message: string }>({
    loading: true, success: false, message: 'Confirming your Spray Command account…',
  });

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const callbackError = parameters.get('error_description');
    const accessToken = parameters.get('access_token') || '';
    const refreshToken = parameters.get('refresh_token') || '';
    const expiresIn = Number(parameters.get('expires_in') || 3600);
    window.history.replaceState({}, document.title, window.location.pathname);

    if (callbackError || !accessToken || !refreshToken) {
      setState({ loading: false, success: false, message: callbackError || 'This confirmation link is incomplete or expired.' });
      return;
    }

    void completeSession(accessToken, refreshToken, expiresIn).then((result) => {
      setState({
        loading: false,
        success: result.success,
        message: result.success
          ? 'Your email is confirmed and your Spray Command account is ready.'
          : result.error || 'Your email could not be confirmed.',
      });
    });
  }, [completeSession]);

  return (
    <Box className="ftf-topo-bg" sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: 'primary.dark', p: 2 }}>
      <Card sx={{ maxWidth: 460, width: '100%' }}><CardContent sx={{ p: 4, textAlign: 'center' }}>
        <Box sx={{ mb: 2.5 }}><PlatformBrand /></Box>
        <Typography variant="h5" fontWeight={700} color="primary.dark" gutterBottom>Email confirmation</Typography>
        {state.loading ? <><CircularProgress sx={{ my: 2 }} /><Typography>{state.message}</Typography></> : (
          <>
            <Alert severity={state.success ? 'success' : 'error'} sx={{ my: 2, textAlign: 'left' }}>{state.message}</Alert>
            <Button component={RouterLink} to={state.success ? '/' : '/login'} variant="contained" fullWidth>
              {state.success ? 'Continue to Spray Command' : 'Return to Sign In'}
            </Button>
          </>
        )}
      </CardContent></Card>
    </Box>
  );
}

export default function AuthCallback() {
  const parameters = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const callbackType = parameters.get('type');
  const hasOnboardingInvitation = new URLSearchParams(window.location.search).has('invitation');
  if (hasOnboardingInvitation && ['invite', 'magiclink'].includes(callbackType || '')) return <AcceptOrganisationInvitation />;
  if (parameters.get('type') === 'recovery') return <ResetPassword />;
  return <ConfirmationCallback />;
}
