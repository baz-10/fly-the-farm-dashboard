import React, { useState } from 'react';
import { Alert, Box, Button, Card, CardContent, TextField, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function ResetPassword() {
  const { resetPassword } = useAuth();
  const parameters = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const accessToken = parameters.get('access_token') || '';
  const refreshToken = parameters.get('refresh_token') || '';
  const expiresIn = Number(parameters.get('expires_in') || 3600);
  const callbackError = parameters.get('error_description');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(callbackError || (!accessToken || !refreshToken ? 'This recovery link is incomplete or expired.' : ''));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirmation) { setError('Passwords do not match.'); return; }
    setLoading(true);
    const result = await resetPassword(password, accessToken, refreshToken, expiresIn);
    setLoading(false);
    if (result.success) {
      window.history.replaceState({}, document.title, window.location.pathname);
      setSuccess(true);
    } else setError(result.error || 'Password could not be updated.');
  };

  return (
    <Box className="ftf-topo-bg" sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: 'primary.dark', p: 2 }}>
      <Card sx={{ maxWidth: 440, width: '100%' }}><CardContent sx={{ p: 4 }}>
        <Box sx={{ textAlign: 'center', mb: 3 }}>
          <Box component="img" src="/logo.png" alt="Fly the Farm" sx={{ height: 56, mb: 2 }} />
          <Typography variant="h5" fontWeight={700} color="primary.dark">Choose a new password</Typography>
        </Box>
        {success ? (
          <><Alert severity="success" sx={{ mb: 2 }}>Your password has been updated. You can now continue to Spray Command.</Alert>
          <Button component={RouterLink} to="/" variant="contained" fullWidth>Continue to Spray Command</Button></>
        ) : (
          <>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            <Box component="form" onSubmit={submit}>
              <TextField label="New Password" type="password" required fullWidth value={password} onChange={(event) => setPassword(event.target.value)} sx={{ mb: 2 }} />
              <TextField label="Confirm New Password" type="password" required fullWidth value={confirmation} onChange={(event) => setConfirmation(event.target.value)} sx={{ mb: 2 }} />
              <Button type="submit" variant="contained" fullWidth size="large" disabled={loading || Boolean(callbackError) || !accessToken || !refreshToken}>
                {loading ? 'Updating…' : 'Update Password'}
              </Button>
            </Box>
          </>
        )}
      </CardContent></Card>
    </Box>
  );
}
