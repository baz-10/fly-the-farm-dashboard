import React from 'react';
import { Navigate } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';

export default function PlatformProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  if (isLoading) return <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.identityPlane !== 'platform' || user.role !== 'platform') return <Navigate to="/" replace />;
  return <>{children}</>;
}
