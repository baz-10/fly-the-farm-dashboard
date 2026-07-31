import React, { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
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
import MarkEmailReadOutlinedIcon from '@mui/icons-material/MarkEmailReadOutlined';
import { useAuth } from '../contexts/AuthContext';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { requestPasswordReset } = useAuth();
  const theme = useTheme();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    const result = await requestPasswordReset(email.trim());
    setLoading(false);
    if (result.success) setSent(true);
    else setError(result.error || 'Password recovery email could not be sent.');
  };

  return (
    <Box
      className="ftf-topo-bg"
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'primary.dark',
        p: 2,
      }}
    >
      <Card
        className="ftf-animate-in"
        sx={{
          maxWidth: 440,
          width: '100%',
          border: `1px solid ${alpha(theme.palette.common.white, 0.08)}`,
          bgcolor: alpha(theme.palette.common.white, 0.98),
          boxShadow: '0 24px 80px rgba(1,26,28,0.4)',
          borderTop: `4px solid ${theme.palette.primary.main}`,
        }}
      >
        <CardContent sx={{ p: { xs: 3, sm: 4.5 } }}>
          <Box sx={{ textAlign: 'center', mb: 3 }}>
            <Box component="img" src="/logo.png" alt="Fly the Farm" sx={{ height: 52, width: 'auto', mb: 2 }} />
            <Typography component="h1" variant="h5" sx={{ fontWeight: 800, color: 'primary.dark', mb: 1 }}>
              Reset your password
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Enter your account email and we’ll send you a secure recovery link.
            </Typography>
          </Box>

          {error && <Alert severity="error" sx={{ mb: 2.5 }}>{error}</Alert>}

          {sent ? (
            <>
              <Alert icon={<MarkEmailReadOutlinedIcon />} severity="success" sx={{ mb: 2.5 }}>
                If an account exists for that email, a recovery link has been sent. Check your inbox and spam folder.
              </Alert>
              <Button fullWidth variant="outlined" onClick={() => setSent(false)} sx={{ mb: 2 }}>
                Send another email
              </Button>
            </>
          ) : (
            <Box component="form" onSubmit={handleSubmit}>
              <TextField
                label="Email"
                type="email"
                autoComplete="email"
                fullWidth
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                sx={{ mb: 2.5 }}
              />
              <Button type="submit" variant="contained" fullWidth size="large" disabled={loading} sx={{ py: 1.4, mb: 2 }}>
                {loading ? 'Sending...' : 'Send recovery email'}
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
