import React from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import { Outlet } from 'react-router-dom';
import PlatformBrand from '../brand/PlatformBrand';
import { useAuth } from '../contexts/AuthContext';

export default function PlatformShell() {
  const { user, logout } = useAuth();
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#edf1ee' }}>
      <Stack component="header" direction="row" alignItems="center" justifyContent="space-between" sx={{ px: { xs: 2, md: 4 }, py: 1.5, bgcolor: '#071d12', color: 'white' }}>
        <PlatformBrand inverse />
        <Stack direction="row" alignItems="center" spacing={2}>
          <Typography variant="caption" sx={{ display: { xs: 'none', sm: 'block' }, opacity: 0.78 }}>{user?.email}</Typography>
          <Button color="inherit" onClick={logout}>Sign out</Button>
        </Stack>
      </Stack>
      <Box component="main" sx={{ p: { xs: 2, md: 4 }, maxWidth: 1440, mx: 'auto' }}><Outlet /></Box>
    </Box>
  );
}
