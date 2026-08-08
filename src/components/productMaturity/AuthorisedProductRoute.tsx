import React, { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { UserRole } from '../../contexts/AuthContext';
import ProtectedRoute from '../ProtectedRoute';
import { ProductMaturitySurface } from './ProductMaturitySurface';

interface ProductRouteSurfaceProps {
  children: ReactNode;
}

interface AuthorisedProductRouteProps extends ProductRouteSurfaceProps {
  allowedRoles?: UserRole[];
  requiredEntitlement?: string;
}

export function ProductRouteSurface({ children }: ProductRouteSurfaceProps) {
  const location = useLocation();

  return (
    <ProductMaturitySurface pathname={location.pathname} search={location.search}>
      {children}
    </ProductMaturitySurface>
  );
}

export function AuthorisedProductRoute({ children, allowedRoles, requiredEntitlement }: AuthorisedProductRouteProps) {
  return (
    <ProtectedRoute allowedRoles={allowedRoles} requiredEntitlement={requiredEntitlement}>
      <ProductRouteSurface>{children}</ProductRouteSurface>
    </ProtectedRoute>
  );
}
