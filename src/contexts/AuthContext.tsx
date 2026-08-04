import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { getPersistenceMode } from '../services/persistence';

export type UserRole = 'admin' | 'contractor' | 'client' | 'platform';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  tenantId?: string;
  contractorId?: string;
  clientRecordId?: string;
  inviteCode?: string;
  tier: 'free' | 'pro';
  entitlements?: string[];
  identityPlane?: 'organisation' | 'platform';
  platformUserId?: string;
  platformRoles?: string[];
  permissions?: string[];
}

interface StoredUser {
  id: string;
  email: string;
  name: string;
  password?: string;
  role: UserRole;
  tenantId?: string;
  contractorId?: string;
  clientRecordId?: string;
  inviteCode?: string;
  entitlements?: string[];
}

interface RegistrationResult {
  success: boolean;
  error?: string;
  requiresLogin?: boolean;
}

interface LoginResult {
  success: boolean;
  error?: string;
}

interface AuthActionResult {
  success: boolean;
  error?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  register: (email: string, name: string, password: string, role: UserRole, contractorCode?: string) => Promise<RegistrationResult>;
  completeSession: (accessToken: string, refreshToken: string, expiresIn: number) => Promise<AuthActionResult>;
  requestPasswordReset: (email: string) => Promise<AuthActionResult>;
  resetPassword: (password: string, accessToken: string, refreshToken: string, expiresIn: number) => Promise<AuthActionResult>;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const STORAGE_KEY = 'ftf_users';
const SESSION_KEY = 'ftf_session';

function getStoredUsers(): Record<string, StoredUser> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveStoredUsers(users: Record<string, StoredUser>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
}

function cacheUser(user: User | null, cacheLocalAccount: boolean): void {
  if (!user) {
    localStorage.removeItem(SESSION_KEY);
    return;
  }

  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  if (!cacheLocalAccount) return;

  const users = getStoredUsers();
  users[user.email] = {
    ...users[user.email],
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    tenantId: user.tenantId,
    contractorId: user.contractorId,
    clientRecordId: user.clientRecordId,
    inviteCode: user.inviteCode,
    entitlements: user.entitlements,
  };
  saveStoredUsers(users);
}

function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `user_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function genInviteCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function ensureLocalAdminExists(): void {
  const users = getStoredUsers();
  const hasAdmin = Object.values(users).some((storedUser) => storedUser.role === 'admin');
  if (hasAdmin) return;

  const id = genId();
  users['admin@flythefarm.com.au'] = {
    id,
    email: 'admin@flythefarm.com.au',
    name: 'Fly the Farm',
    password: 'ftfadmin',
    role: 'admin',
    tenantId: id,
  };
  saveStoredUsers(users);
}

async function requestRemoteAuth(body?: Record<string, unknown>): Promise<any> {
  const response = await fetch('/api/auth', {
    method: body ? 'POST' : 'GET',
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Authentication request failed.');
  return result;
}

function migrateContractorClients(stored: StoredUser): void {
  if (stored.role !== 'contractor') return;
  try {
    const clientsKey = 'ftf_clients';
    const clients = JSON.parse(localStorage.getItem(clientsKey) || '[]');
    let changed = false;
    for (const client of clients) {
      if (!client.contractorUserId) {
        client.contractorUserId = stored.id;
        changed = true;
      }
    }
    if (changed) localStorage.setItem(clientsKey, JSON.stringify(clients));
  } catch {
    // Legacy migration should not block sign-in.
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const remoteMode = getPersistenceMode() === 'remote';
  if (!remoteMode) ensureLocalAdminExists();

  const [user, setUser] = useState<User | null>(() => {
    if (remoteMode) return null;
    try {
      const session = localStorage.getItem(SESSION_KEY);
      return session ? JSON.parse(session) : null;
    } catch {
      return null;
    }
  });
  const [isLoading, setIsLoading] = useState(remoteMode);

  useEffect(() => {
    if (!remoteMode) return;
    let cancelled = false;

    requestRemoteAuth()
      .then((result) => {
        if (cancelled) return;
        const authenticatedUser = result.user || null;
        setUser(authenticatedUser);
        cacheUser(authenticatedUser, false);
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null);
          cacheUser(null, false);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [remoteMode]);

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    if (remoteMode) {
      try {
        const result = await requestRemoteAuth({ action: 'login', email, password });
        setUser(result.user);
        cacheUser(result.user, false);
        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Authentication request failed.' };
      }
    }

    const users = getStoredUsers();
    const stored = users[email.trim().toLowerCase()];
    if (!stored || stored.password !== password) return { success: false, error: 'Invalid email or password.' };

    if (!stored.id) {
      stored.id = genId();
      stored.role = 'contractor';
      stored.inviteCode = genInviteCode();
      stored.tenantId = stored.id;
      users[stored.email] = stored;
      saveStoredUsers(users);
    }
    migrateContractorClients(stored);

    const authenticatedUser: User = {
      id: stored.id,
      email: stored.email,
      name: stored.name,
      role: stored.role || 'contractor',
      tenantId: stored.tenantId || stored.contractorId || stored.id,
      contractorId: stored.contractorId,
      clientRecordId: stored.clientRecordId,
      inviteCode: stored.inviteCode,
      tier: 'free',
      entitlements: stored.entitlements || [],
    };
    setUser(authenticatedUser);
    cacheUser(authenticatedUser, true);
    return { success: true };
  }, [remoteMode]);

  const register = useCallback(async (
    email: string,
    name: string,
    password: string,
    role: UserRole,
    contractorCode?: string,
  ): Promise<RegistrationResult> => {
    if (remoteMode) {
      try {
        const result = await requestRemoteAuth({ action: 'register', email, name, password, role, contractorCode });
        if (result.user) {
          setUser(result.user);
          cacheUser(result.user, false);
        }
        return { success: true, requiresLogin: Boolean(result.requiresEmailConfirmation) };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Registration failed.' };
      }
    }

    const normalizedEmail = email.trim().toLowerCase();
    const users = getStoredUsers();
    if (users[normalizedEmail]) return { success: false, error: 'An account with this email already exists.' };

    let contractorId: string | undefined;
    if (role === 'client') {
      if (!contractorCode) return { success: false, error: 'Contractor code is required.' };
      const contractor = Object.values(users).find(
        (storedUser) => storedUser.role === 'contractor' && storedUser.inviteCode === contractorCode.toUpperCase()
      );
      if (!contractor) return { success: false, error: 'Invalid contractor code. Check with your spray contractor.' };
      contractorId = contractor.id;
    }
    if (role === 'admin') return { success: false, error: 'Admin accounts cannot be registered.' };

    const id = genId();
    const inviteCode = role === 'contractor' ? genInviteCode() : undefined;
    const stored: StoredUser = {
      id,
      email: normalizedEmail,
      name,
      password,
      role,
      tenantId: contractorId || id,
      contractorId,
      inviteCode,
    };
    users[normalizedEmail] = stored;
    saveStoredUsers(users);

    let clientRecordId: string | undefined;
    if (role === 'client' && contractorId) {
      const clientsKey = 'ftf_clients';
      const clients = JSON.parse(localStorage.getItem(clientsKey) || '[]');
      const clientRecord = {
        id: genId(),
        contractorUserId: contractorId,
        linkedUserId: id,
        name,
        phone: '',
        email: normalizedEmail,
        notes: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      clients.push(clientRecord);
      localStorage.setItem(clientsKey, JSON.stringify(clients));
      clientRecordId = clientRecord.id;
      stored.clientRecordId = clientRecordId;
      users[normalizedEmail] = stored;
      saveStoredUsers(users);
    }

    const registeredUser: User = {
      id,
      email: normalizedEmail,
      name,
      role,
      tenantId: contractorId || id,
      contractorId,
      clientRecordId,
      inviteCode,
      tier: 'free',
    };
    setUser(registeredUser);
    cacheUser(registeredUser, true);
    return { success: true };
  }, [remoteMode]);

  const logout = useCallback(() => {
    setUser(null);
    cacheUser(null, false);
    if (remoteMode) void requestRemoteAuth({ action: 'logout' });
  }, [remoteMode]);

  const completeSession = useCallback(async (
    accessToken: string,
    refreshToken: string,
    expiresIn: number,
  ): Promise<AuthActionResult> => {
    if (!remoteMode) return { success: false, error: 'Email confirmation is only available with remote persistence.' };
    try {
      const result = await requestRemoteAuth({ action: 'complete-session', accessToken, refreshToken, expiresIn });
      setUser(result.user);
      cacheUser(result.user, false);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Email confirmation failed.' };
    }
  }, [remoteMode]);

  const requestPasswordReset = useCallback(async (email: string): Promise<AuthActionResult> => {
    if (!remoteMode) return { success: false, error: 'Password recovery is only available with remote persistence.' };
    try {
      await requestRemoteAuth({ action: 'forgot-password', email });
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Password recovery failed.' };
    }
  }, [remoteMode]);

  const resetPassword = useCallback(async (
    password: string,
    accessToken: string,
    refreshToken: string,
    expiresIn: number,
  ): Promise<AuthActionResult> => {
    if (!remoteMode) return { success: false, error: 'Password reset is only available with remote persistence.' };
    try {
      const result = await requestRemoteAuth({
        action: 'reset-password', password, accessToken, refreshToken, expiresIn,
      });
      setUser(result.user);
      cacheUser(result.user, false);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Password reset failed.' };
    }
  }, [remoteMode]);

  const updateUser = useCallback((updates: Partial<User>) => {
    setUser((previous) => {
      if (!previous) return null;
      const updated = { ...previous, ...updates };
      cacheUser(updated, !remoteMode);
      return updated;
    });
  }, [remoteMode]);

  return (
    <AuthContext.Provider value={{
      user, isAuthenticated: Boolean(user), isLoading, login, register, completeSession,
      requestPasswordReset, resetPassword, logout, updateUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
