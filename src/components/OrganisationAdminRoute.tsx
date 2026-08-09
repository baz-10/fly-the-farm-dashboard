import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function OrganisationAdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const isOrganisationAdmin = user?.role === 'admin' && user.identityPlane !== 'platform';

  if (!isOrganisationAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}
