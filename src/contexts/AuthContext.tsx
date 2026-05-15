import React, { createContext, useContext, useState, useCallback } from 'react';

export type UserRole = 'admin' | 'contractor' | 'client';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  contractorId?: string;    // For client users — which contractor they belong to
  clientRecordId?: string;  // For client users — linked Client business record
  inviteCode?: string;      // For contractors — shareable code for client registration
  tier: 'free' | 'pro';
}

interface StoredUser {
  id: string;
  email: string;
  name: string;
  password: string;
  role: UserRole;
  contractorId?: string;
  clientRecordId?: string;
  inviteCode?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, name: string, password: string, role: UserRole, contractorCode?: string) => Promise<{ success: boolean; error?: string }>;
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

function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `user_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function genInviteCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Seed the Fly the Farm admin account on first load
function ensureAdminExists(): void {
  const users = getStoredUsers();
  const hasAdmin = Object.values(users).some((u) => u.role === 'admin');
  if (!hasAdmin) {
    const id = genId();
    users['admin@flythefarm.com.au'] = {
      id,
      email: 'admin@flythefarm.com.au',
      name: 'Fly the Farm',
      password: 'ftfadmin',
      role: 'admin',
    };
    saveStoredUsers(users);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Ensure admin exists on mount
  ensureAdminExists();

  const [user, setUser] = useState<User | null>(() => {
    try {
      const session = localStorage.getItem(SESSION_KEY);
      return session ? JSON.parse(session) : null;
    } catch {
      return null;
    }
  });

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    const users = getStoredUsers();
    const stored = users[email];
    if (stored && stored.password === password) {
      // Migrate old users that don't have id/role
      if (!stored.id) {
        stored.id = genId();
        stored.role = 'contractor'; // Default legacy users to contractor
        stored.inviteCode = genInviteCode();
        users[email] = stored;
        saveStoredUsers(users);
      }
      // Migrate orphan Client records (no contractorUserId) to this contractor
      if (stored.role === 'contractor') {
        try {
          const clientsKey = 'ftf_clients';
          const clients = JSON.parse(localStorage.getItem(clientsKey) || '[]');
          let changed = false;
          for (const c of clients) {
            if (!c.contractorUserId) {
              c.contractorUserId = stored.id;
              changed = true;
            }
          }
          if (changed) localStorage.setItem(clientsKey, JSON.stringify(clients));
        } catch { /* ignore */ }
      }

      const u: User = {
        id: stored.id,
        email: stored.email,
        name: stored.name,
        role: stored.role || 'contractor',
        contractorId: stored.contractorId,
        clientRecordId: stored.clientRecordId,
        inviteCode: stored.inviteCode,
        tier: 'free',
      };
      setUser(u);
      localStorage.setItem(SESSION_KEY, JSON.stringify(u));
      return true;
    }
    return false;
  }, []);

  const register = useCallback(async (
    email: string,
    name: string,
    password: string,
    role: UserRole,
    contractorCode?: string,
  ): Promise<{ success: boolean; error?: string }> => {
    const users = getStoredUsers();
    if (users[email]) return { success: false, error: 'An account with this email already exists.' };

    // Validate contractor code for client registrations
    let contractorId: string | undefined;
    if (role === 'client') {
      if (!contractorCode) return { success: false, error: 'Contractor code is required.' };
      const contractor = Object.values(users).find(
        (u) => u.role === 'contractor' && u.inviteCode === contractorCode.toUpperCase()
      );
      if (!contractor) return { success: false, error: 'Invalid contractor code. Check with your spray contractor.' };
      contractorId = contractor.id;
    }

    // Prevent registering as admin
    if (role === 'admin') return { success: false, error: 'Admin accounts cannot be registered.' };

    const id = genId();
    const inviteCode = role === 'contractor' ? genInviteCode() : undefined;

    const stored: StoredUser = { id, email, name, password, role, contractorId, inviteCode };
    users[email] = stored;
    saveStoredUsers(users);

    // For client users, auto-create a Client business record linked to this user
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
        email,
        notes: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      clients.push(clientRecord);
      localStorage.setItem(clientsKey, JSON.stringify(clients));
      clientRecordId = clientRecord.id;

      // Update stored user with clientRecordId
      stored.clientRecordId = clientRecordId;
      users[email] = stored;
      saveStoredUsers(users);
    }

    const u: User = { id, email, name, role, contractorId, clientRecordId, inviteCode, tier: 'free' };
    setUser(u);
    localStorage.setItem(SESSION_KEY, JSON.stringify(u));
    return { success: true };
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem(SESSION_KEY);
  }, []);

  const updateUser = useCallback((updates: Partial<User>) => {
    setUser((prev) => {
      if (!prev) return null;
      const updated = { ...prev, ...updates };
      localStorage.setItem(SESSION_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
