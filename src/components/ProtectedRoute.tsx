import React, { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { setCurrentUser } from '../services/fieldManagementStore';
import { UserRole } from '../contexts/AuthContext';

export default function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: UserRole[] }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const userScopeKey = user
    ? [user.id, user.role, user.contractorId || '', user.clientRecordId || ''].join(':')
    : 'signed-out';
  const [appliedUserScopeKey, setAppliedUserScopeKey] = React.useState('');

  useEffect(() => {
    if (user) {
      setCurrentUser({
        id: user.id,
        role: user.role,
        contractorId: user.contractorId,
        clientRecordId: user.clientRecordId,
      });
    } else {
      setCurrentUser(null);
    }
    setAppliedUserScopeKey(userScopeKey);
  }, [user, userScopeKey]);

  if (isLoading || (isAuthenticated && appliedUserScopeKey !== userScopeKey)) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <CircularProgress aria-label="Checking your session" />
      </Box>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (allowedRoles && (!user || !allowedRoles.includes(user.role))) return <Navigate to="/" replace />;
  return <>{children}</>;
}
