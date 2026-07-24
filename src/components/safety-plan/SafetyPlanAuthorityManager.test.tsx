import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import type { User } from '../../contexts/AuthContext';
import SafetyPlanAuthorityManager from './SafetyPlanAuthorityManager';

const admin: User = {
  id: 'admin-1',
  email: 'admin@example.com',
  name: 'Admin',
  role: 'admin',
  tenantId: 'tenant-1',
  tier: 'pro',
  safetyPlanAuthority: false,
};

describe('SafetyPlanAuthorityManager', () => {
  it('allows an administrator to nominate a tenant contractor', async () => {
    const listTenantUsers = vi.fn().mockResolvedValue([
      { id: 'pilot-1', name: 'Pat Pilot', email: 'pat@example.com', role: 'contractor', safetyPlanAuthority: false },
    ]);
    const setSafetyPlanAuthority = vi.fn().mockResolvedValue(undefined);

    render(
      <SafetyPlanAuthorityManager
        user={admin}
        listTenantUsers={listTenantUsers}
        setSafetyPlanAuthority={setSafetyPlanAuthority}
      />,
    );

    expect(await screen.findByText('Pat Pilot')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: /nominate Pat Pilot/i }));

    await waitFor(() => expect(setSafetyPlanAuthority).toHaveBeenCalledWith('pilot-1', true));
  });

  it('shows a contractor the current authority without nomination controls', async () => {
    render(
      <SafetyPlanAuthorityManager
        user={{ ...admin, role: 'contractor' }}
        listTenantUsers={vi.fn().mockResolvedValue([
          { id: 'authority-1', name: 'Alex Authority', email: 'alex@example.com', role: 'contractor', safetyPlanAuthority: true },
        ])}
        setSafetyPlanAuthority={vi.fn()}
      />,
    );

    expect(await screen.findByText('Alex Authority')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});
