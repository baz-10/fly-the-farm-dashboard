import React, { useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Link, TextField, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const SAFE_MESSAGE = 'If an account exists for that email, a password reset link has been sent.';

export default function ForgotPassword() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setLoading(true); setError(''); setMessage('');
    const result = await requestPasswordReset(email);
    setLoading(false);
    if (result.success) setMessage(SAFE_MESSAGE);
    else setError(result.error || 'Password recovery is temporarily unavailable.');
  };

  return (
    <Box className="ftf-topo-bg" sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: 'primary.dark', p: 2 }}>
      <Card sx={{ maxWidth: 440, width: '100%' }}><CardContent sx={{ p: 4 }}>
        <Box sx={{ textAlign: 'center', mb: 3 }}>
          <Box component="img" src="/logo.png" alt="Fly the Farm" sx={{ height: 56, mb: 2 }} />
          <Typography variant="h5" fontWeight={700} color="primary.dark">Reset your password</Typography>
          <Typography variant="body2" color="text.secondary">We’ll email a secure recovery link.</Typography>
        </Box>
        {message && <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert>}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Box component="form" onSubmit={submit}>
          <TextField label="Email" type="email" required fullWidth value={email} onChange={(event) => setEmail(event.target.value)} sx={{ mb: 2 }} />
          <Button type="submit" variant="contained" fullWidth size="large" disabled={loading}>{loading ? 'Sending…' : 'Send Reset Link'}</Button>
        </Box>
        <Typography align="center" variant="body2" sx={{ mt: 3 }}><Link component={RouterLink} to="/login">Return to Sign In</Link></Typography>
      </CardContent></Card>
    </Box>
  );
}
