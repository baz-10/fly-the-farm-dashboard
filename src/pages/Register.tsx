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
  ToggleButton,
  ToggleButtonGroup,
  alpha,
  useTheme,
} from '@mui/material';
import FlightTakeoffIcon from '@mui/icons-material/FlightTakeoff';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import AgricultureIcon from '@mui/icons-material/Agriculture';
import { useAuth } from '../contexts/AuthContext';
import { UserRole } from '../contexts/AuthContext';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<UserRole>('contractor');
  const [contractorCode, setContractorCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();
  const theme = useTheme();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    const result = await register(email, name, password, role, contractorCode || undefined);
    setLoading(false);
    if (result.success) {
      navigate(result.requiresLogin ? '/login' : '/');
    } else {
      setError(result.error || 'Registration failed.');
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
      <Box
        sx={{
          position: 'absolute',
          width: '60vw',
          height: '60vw',
          borderRadius: '50%',
          background: `radial-gradient(circle, ${alpha(theme.palette.secondary.main, 0.08)} 0%, transparent 70%)`,
          top: '-20vw',
          left: '-10vw',
          pointerEvents: 'none',
        }}
      />

      <Card
        className="ftf-animate-in"
        sx={{
          maxWidth: 480,
          width: '100%',
          position: 'relative',
          zIndex: 1,
          border: `1px solid ${alpha(theme.palette.common.white, 0.06)}`,
          bgcolor: alpha(theme.palette.common.white, 0.97),
          boxShadow: '0 24px 80px rgba(1,26,28,0.4)',
        }}
      >
        <CardContent sx={{ p: { xs: 3, sm: 4.5 } }}>
          <Box sx={{ textAlign: 'center', mb: 3 }}>
            <Box
              component="img"
              src="/logo.png"
              alt="Fly the Farm"
              sx={{ height: 56, width: 'auto', mb: 2 }}
            />
            <Typography variant="h5" sx={{ fontWeight: 700, color: 'primary.dark', mb: 0.5 }}>
              Create Account
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Get started with Fly the Farm
            </Typography>
          </Box>

          {/* Role Selection */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="body2" fontWeight={600} color="text.secondary" sx={{ mb: 1, textAlign: 'center' }}>
              I am a...
            </Typography>
            <ToggleButtonGroup
              value={role}
              exclusive
              onChange={(_e, val) => { if (val) setRole(val); }}
              fullWidth
              sx={{
                '& .MuiToggleButton-root': {
                  py: 1.5,
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  borderRadius: '10px !important',
                  border: `1.5px solid ${alpha(theme.palette.primary.main, 0.15)} !important`,
                  mx: 0.5,
                },
                '& .Mui-selected': {
                  bgcolor: `${alpha(theme.palette.primary.main, 0.08)} !important`,
                  color: `${theme.palette.primary.main} !important`,
                  borderColor: `${alpha(theme.palette.primary.main, 0.4)} !important`,
                },
              }}
            >
              <ToggleButton value="contractor">
                <FlightTakeoffIcon sx={{ mr: 1, fontSize: 20 }} />
                Spray Contractor
              </ToggleButton>
              <ToggleButton value="client">
                <AgricultureIcon sx={{ mr: 1, fontSize: 20 }} />
                Landowner / Client
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {error && <Alert severity="error" sx={{ mb: 2.5 }}>{error}</Alert>}

          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              label={role === 'contractor' ? 'Business / Operator Name' : 'Full Name'}
              fullWidth
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              sx={{ mb: 2 }}
            />
            <TextField
              label="Email"
              type="email"
              fullWidth
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              sx={{ mb: 2 }}
            />

            {role === 'client' && (
              <TextField
                label="Contractor Code"
                fullWidth
                required
                value={contractorCode}
                onChange={(e) => setContractorCode(e.target.value.toUpperCase())}
                placeholder="e.g. ABC123"
                helperText="Ask your spray contractor for their invite code"
                sx={{ mb: 2 }}
                slotProps={{
                  input: { sx: { fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.1em' } },
                }}
              />
            )}

            <TextField
              label="Password"
              type="password"
              fullWidth
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              sx={{ mb: 2 }}
            />
            <TextField
              label="Confirm Password"
              type="password"
              fullWidth
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
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
              {loading ? 'Creating account...' : 'Create Account'}
            </Button>
          </Box>

          <Typography variant="body2" align="center" color="text.secondary" sx={{ mt: 3 }}>
            Already have an account?{' '}
            <Link
              component={RouterLink}
              to="/login"
              sx={{ fontWeight: 700, color: 'primary.main', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
            >
              Sign in
            </Link>
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
