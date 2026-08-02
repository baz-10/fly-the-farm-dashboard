import React, { useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  Link,
  alpha,
  useTheme,
} from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const theme = useTheme();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await login(email, password);
    setLoading(false);
    if (result.success) {
      navigate('/');
    } else {
      setError(result.error || 'Authentication request failed.');
    }
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
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Ambient glow */}
      <Box
        sx={{
          position: 'absolute',
          width: '60vw',
          height: '60vw',
          borderRadius: '50%',
          background: `radial-gradient(circle, ${alpha(theme.palette.secondary.main, 0.08)} 0%, transparent 70%)`,
          top: '-20vw',
          right: '-10vw',
          pointerEvents: 'none',
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          width: '40vw',
          height: '40vw',
          borderRadius: '50%',
          background: `radial-gradient(circle, ${alpha('#4cb85a', 0.05)} 0%, transparent 70%)`,
          bottom: '-15vw',
          left: '-5vw',
          pointerEvents: 'none',
        }}
      />

      <Card
        className="ftf-animate-in"
        sx={{
          maxWidth: 440,
          width: '100%',
          position: 'relative',
          zIndex: 1,
          border: `1px solid ${alpha(theme.palette.common.white, 0.06)}`,
          bgcolor: alpha(theme.palette.common.white, 0.97),
          boxShadow: '0 24px 80px rgba(1,26,28,0.4)',
        }}
      >
        <CardContent sx={{ p: { xs: 3, sm: 4.5 } }}>
          {/* Logo */}
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            <Box
              component="img"
              src="/logo.png"
              alt="Fly the Farm"
              sx={{ height: 56, width: 'auto', mb: 2 }}
            />
            <Typography variant="h5" sx={{ fontWeight: 700, color: 'primary.dark', mb: 0.5 }}>
              Drone Chemical Reference
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Sign in to access your account
            </Typography>
          </Box>

          {error && <Alert severity="error" sx={{ mb: 2.5 }}>{error}</Alert>}

          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              label="Email"
              type="email"
              fullWidth
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              sx={{ mb: 2 }}
            />
            <TextField
              label="Password"
              type="password"
              fullWidth
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              sx={{ mb: 3 }}
            />
            <Button
              type="submit"
              variant="contained"
              fullWidth
              size="large"
              disabled={loading}
              endIcon={!loading && <ArrowForwardIcon />}
              sx={{
                py: 1.5,
                fontSize: '1rem',
                background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.primary.light})`,
                '&:hover': {
                  background: `linear-gradient(135deg, ${theme.palette.primary.dark}, ${theme.palette.primary.main})`,
                },
              }}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </Box>

          <Typography variant="body2" align="right" sx={{ mt: -2, mb: 2.5 }}>
            <Link component={RouterLink} to="/forgot-password" sx={{ fontWeight: 600 }}>Forgot Password?</Link>
          </Typography>

          <Typography variant="body2" align="center" color="text.secondary" sx={{ mt: 3 }}>
            Don't have an account?{' '}
            <Link
              component={RouterLink}
              to="/register"
              sx={{ fontWeight: 700, color: 'primary.main', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
            >
              Create one
            </Link>
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
