import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Divider, Stack, TextField, Typography, alpha, useTheme } from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import PlatformBrand from '../brand/PlatformBrand';

type LinkDetails = {
  invitationId: string;
  accessToken: string;
  expiresIn: number;
  callbackError: string;
};

function readLinkDetails(): LinkDetails {
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return {
    invitationId: query.get('invitation') || '',
    accessToken: hash.get('access_token') || '',
    expiresIn: Number(hash.get('expires_in') || 3600),
    callbackError: hash.get('error_description') || '',
  };
}

export default function AcceptOrganisationInvitation() {
  const theme = useTheme();
  const navigate = useNavigate();
  const { acceptOrganisationInvitation } = useAuth();
  const [link] = useState(readLinkDetails);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{
    kind: 'authentication' | 'onboarding' | 'validation'; message: string;
  } | null>(() => {
    if (link.callbackError) return { kind: 'authentication', message: link.callbackError };
    if (!link.invitationId) {
      return { kind: 'onboarding', message: 'This invitation link is incomplete or expired.' };
    }
    if (!link.accessToken) {
      return { kind: 'authentication', message: 'This authentication link is incomplete or expired.' };
    }
    return null;
  });
  const linkIsUsable = Boolean(link.invitationId && link.accessToken && !link.callbackError);

  useEffect(() => {
    window.history.replaceState({}, document.title, window.location.pathname);
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError({ kind: 'validation', message: 'Password must be at least 8 characters.' });
      return;
    }
    if (password !== confirmation) {
      setError({ kind: 'validation', message: 'Passwords do not match.' });
      return;
    }
    if (!linkIsUsable) return;

    setLoading(true);
    const result = await acceptOrganisationInvitation(
      password, link.invitationId, link.accessToken, link.expiresIn,
    );
    setLoading(false);
    if (result.success) {
      navigate('/getting-started', { replace: true });
      return;
    }
    setError({
      kind: result.errorKind || 'onboarding',
      message: result.error || 'This invitation could not be accepted.',
    });
  };

  const errorTitle = error?.kind === 'authentication'
    ? 'Authentication link problem'
    : error?.kind === 'onboarding'
      ? 'Invitation problem'
      : '';

  return (
    <Box className="ftf-topo-bg" sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: 'primary.dark', p: 2 }}>
      <Card sx={{ maxWidth: 760, width: '100%', overflow: 'hidden', border: `1px solid ${alpha(theme.palette.common.white, 0.08)}`, boxShadow: '0 28px 80px rgba(1,26,28,0.38)' }}>
        <Box sx={{ height: 6, background: `linear-gradient(90deg, ${theme.palette.secondary.main}, ${theme.palette.accent.main})` }} />
        <CardContent sx={{ p: { xs: 3, sm: 4.5 } }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 3, md: 4 }} divider={<Divider orientation="vertical" flexItem />}>
            <Box sx={{ flex: '0 0 245px' }}>
              <PlatformBrand />
              <Typography variant="overline" color="secondary.dark" sx={{ display: 'block', mt: 3 }}>
                Approved organisation access
              </Typography>
              <Typography variant="h4" color="primary.dark" sx={{ mt: 0.5 }}>
                Activate your organisation
              </Typography>
              <Typography color="text.secondary" sx={{ mt: 1.5 }}>
                Create your secure sign-in before Spray Command provisions your approved organisation workspace.
              </Typography>
              <Stack spacing={1.25} sx={{ mt: 3 }}>
                {['Secure your account', 'Provision the organisation', 'Begin guided setup'].map((label, index) => (
                  <Stack key={label} direction="row" spacing={1} alignItems="center">
                    <CheckCircleOutlineIcon color={index === 0 ? 'secondary' : 'disabled'} fontSize="small" />
                    <Typography variant="body2" color={index === 0 ? 'text.primary' : 'text.secondary'}>{label}</Typography>
                  </Stack>
                ))}
              </Stack>
            </Box>

            <Box component="form" onSubmit={submit} sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="h6" color="primary.dark" gutterBottom>Create your password</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
                Use at least 8 characters. You can reset this password later from the sign-in page.
              </Typography>

              {error && (
                <Alert severity="error" sx={{ mb: 2.5 }}>
                  {errorTitle && <Typography component="div" variant="subtitle2" sx={{ mb: 0.5 }}>{errorTitle}</Typography>}
                  {error.message}
                  {error.kind === 'onboarding' && /incomplete|expired|revoked/i.test(error.message) && !/ask your reviewer/i.test(error.message) && (
                    <Typography component="div" variant="body2" sx={{ mt: 0.75 }}>Ask your reviewer to send a new invitation.</Typography>
                  )}
                </Alert>
              )}

              <TextField
                label="Create password" type="password" required fullWidth autoComplete="new-password"
                value={password} onChange={(event) => setPassword(event.target.value)} sx={{ mb: 2 }}
              />
              <TextField
                label="Confirm password" type="password" required fullWidth autoComplete="new-password"
                value={confirmation} onChange={(event) => setConfirmation(event.target.value)} sx={{ mb: 3 }}
              />
              <Button type="submit" variant="contained" size="large" fullWidth disabled={loading || !linkIsUsable}>
                {loading ? 'Activating organisation…' : 'Activate organisation'}
              </Button>
            </Box>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
