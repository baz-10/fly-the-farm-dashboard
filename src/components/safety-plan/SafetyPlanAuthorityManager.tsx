import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  CircularProgress,
  FormControlLabel,
  List,
  ListItem,
  ListItemText,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import type { User } from '../../contexts/AuthContext';

export interface SafetyPlanAuthorityUser {
  id: string;
  name: string;
  email?: string;
  role: 'admin' | 'contractor';
  safetyPlanAuthority: boolean;
}

async function requestAuthority(body: Record<string, unknown>) {
  const response = await fetch('/api/auth', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Safety Plan authority could not be updated.');
  return result;
}

export async function listSafetyPlanTenantUsers(): Promise<SafetyPlanAuthorityUser[]> {
  const result = await requestAuthority({ action: 'listSafetyPlanAuthorities' });
  return result.users || [];
}

export async function setSafetyPlanAuthority(userId: string, enabled: boolean): Promise<void> {
  await requestAuthority({ action: 'setSafetyPlanAuthority', userId, enabled });
}

interface Props {
  user: User;
  listTenantUsers?: () => Promise<SafetyPlanAuthorityUser[]>;
  setSafetyPlanAuthority?: (userId: string, enabled: boolean) => Promise<void>;
}

export default function SafetyPlanAuthorityManager({
  user,
  listTenantUsers = listSafetyPlanTenantUsers,
  setSafetyPlanAuthority: updateAuthority = setSafetyPlanAuthority,
}: Props) {
  const [users, setUsers] = useState<SafetyPlanAuthorityUser[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    listTenantUsers()
      .then((result) => { if (active) setUsers(result); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Authorities could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [listTenantUsers]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((candidate) => !term
      || candidate.name.toLowerCase().includes(term)
      || candidate.email?.toLowerCase().includes(term));
  }, [search, users]);

  const changeAuthority = async (candidate: SafetyPlanAuthorityUser, enabled: boolean) => {
    setBusyId(candidate.id);
    setError(undefined);
    try {
      await updateAuthority(candidate.id, enabled);
      setUsers((current) => current.map((item) =>
        item.id === candidate.id ? { ...item, safetyPlanAuthority: enabled } : item));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Authority nomination could not be saved.');
    } finally {
      setBusyId(undefined);
    }
  };

  if (loading) return <CircularProgress size={24} aria-label="Loading approving authorities" />;

  return (
    <Box>
      <Typography variant="h6" fontWeight={800}>
        {user.role === 'admin' ? 'Operational approving authorities' : 'Your approving authorities'}
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
        {user.role === 'admin'
          ? 'Nominate trusted operational staff who may approve controlled Safety Plans.'
          : 'These people can review and approve your submitted Safety Plans.'}
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {user.role === 'admin' && (
        <TextField
          fullWidth
          size="small"
          label="Search company users"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          sx={{ mb: 1 }}
        />
      )}
      <List disablePadding>
        {visible.map((candidate) => (
          <ListItem key={candidate.id} divider disableGutters>
            <ListItemText
              primary={candidate.name}
              secondary={candidate.email || (candidate.role === 'admin' ? 'Company administrator' : 'Operational authority')}
            />
            {user.role === 'admin' ? (
              <FormControlLabel
                label=""
                control={(
                  <Switch
                    checked={candidate.role === 'admin' || candidate.safetyPlanAuthority}
                    disabled={candidate.role === 'admin' || busyId === candidate.id}
                    onChange={(_, checked) => void changeAuthority(candidate, checked)}
                    inputProps={{ 'aria-label': `Nominate ${candidate.name}` }}
                  />
                )}
              />
            ) : null}
          </ListItem>
        ))}
      </List>
      {visible.length === 0 && (
        <Typography color="text.secondary" sx={{ py: 2 }}>
          {user.role === 'admin' ? 'No company users match this search.' : 'No approving authority is currently nominated.'}
        </Typography>
      )}
    </Box>
  );
}
