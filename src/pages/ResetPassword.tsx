import React, { useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Link,
  TextField,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import LockResetOutlinedIcon from '@mui/icons-material/LockResetOutlined';
import { useAuth } from '../contexts/AuthContext';
import { clearRecoveryUrl, parseRecoveryFragment } from '../utils/passwordRecovery';

export default function ResetPassword() {
  const [recovery] = useState(() => parseRecoveryFragment(window.location.hash));
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { updatePassword } = useAuth();
  const navigate = useNavigate();
  const theme = useTheme();

  useEffect(() => {
    clearRecoveryUrl();
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmation) {
      setError('Passwords do not match.');
      return;
    }
    if (!recovery.accessToken) {
      setError('This password recovery link is invalid or has expired.');
      return;
    }

    setLoading(true);
    const result = await updatePassword(recovery.accessToken, password);
    setLoading(false);
    if (!result.success) {
      setError(result.error || 'This password recovery link is invalid or has expired.');
      return;
    }
    clearRecoveryUrl();
    navigate('/login', { replace: true, state: { passwordReset: true } });
  };

  const linkError = !recovery.isRecovery || !recovery.accessToken;

  return (
    <Box
      className="ftf-topo-bg"
      sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'primary.dark', p: 2 }}
    >
      <Card
        className="ftf-animate-in"
        sx={{
          maxWidth: 440,
          width: '100%',
          border: `1px solid ${alpha(theme.palette.common.white, 0.08)}`,
          borderTop: `4px solid ${theme.palette.primary.main}`,
          bgcolor: alpha(theme.palette.common.white, 0.98),
          boxShadow: '0 24px 80px rgba(1,26,28,0.4)',
        }}
      >
        <CardContent sx={{ p: { xs: 3, sm: 4.5 } }}>
          <Box sx={{ textAlign: 'center', mb: 3 }}>
            <Box
              sx={{
                width: 54,
                height: 54,
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                bgcolor: alpha(theme.palette.primary.main, 0.1),
                color: 'primary.main',
                mx: 'auto',
                mb: 2,
              }}
            >
              <LockResetOutlinedIcon fontSize="large" />
            </Box>
            <Typography component="h1" variant="h5" sx={{ fontWeight: 800, color: 'primary.dark', mb: 1 }}>
              Choose a new password
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Use at least six characters and keep it somewhere secure.
            </Typography>
          </Box>

          {linkError ? (
            <>
              <Alert severity="error" sx={{ mb: 2.5 }}>
                {recovery.error || 'This password recovery link is invalid or has expired.'}
              </Alert>
              <Button component={RouterLink} to="/forgot-password" fullWidth variant="contained" sx={{ mb: 2 }}>
                Request a new recovery email
              </Button>
            </>
          ) : (
            <Box component="form" onSubmit={handleSubmit}>
              {error && <Alert severity="error" sx={{ mb: 2.5 }}>{error}</Alert>}
              <TextField
                label="New password"
                type="password"
                autoComplete="new-password"
                fullWidth
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                sx={{ mb: 2 }}
              />
              <TextField
                label="Confirm new password"
                type="password"
                autoComplete="new-password"
                fullWidth
                required
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                sx={{ mb: 2.5 }}
              />
              <Button type="submit" variant="contained" fullWidth size="large" disabled={loading} sx={{ py: 1.4, mb: 2 }}>
                {loading ? 'Updating...' : 'Update password'}
              </Button>
            </Box>
          )}

          <Typography variant="body2" align="center">
            <Link component={RouterLink} to="/login" sx={{ fontWeight: 700, textDecoration: 'none' }}>
              Back to sign in
            </Link>
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
