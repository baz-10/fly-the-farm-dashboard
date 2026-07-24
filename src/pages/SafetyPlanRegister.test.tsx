import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

import type { User } from '../contexts/AuthContext';
import { makeSafetyPlan, makeSafetyPlanVersion } from '../test/safetyPlanFixtures';
import SafetyPlanRegister from './SafetyPlanRegister';

const useSafetyPlans = vi.fn();
const useAuth = vi.fn();

vi.mock('../contexts/SafetyPlanContext', () => ({
  useSafetyPlans: () => useSafetyPlans(),
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => useAuth(),
}));

const admin: User = {
  id: 'admin-1',
  email: 'admin@example.com',
  name: 'Admin',
  role: 'admin',
  tenantId: 'tenant-1',
  tier: 'pro',
  safetyPlanAuthority: false,
};

function renderRegister(user: User = admin) {
  useAuth.mockReturnValue({ user });
  useSafetyPlans.mockReturnValue({
    plans: [
      makeSafetyPlan({
        id: 'draft-plan',
        jobId: 'Job Alpha',
        status: 'draft',
        versions: [makeSafetyPlanVersion({ status: 'draft' })],
      }),
      makeSafetyPlan({
        id: 'not-required-plan',
        jobId: 'Job Bravo',
        status: 'not_required',
        currentVersionId: undefined,
        versions: [],
      }),
    ],
    pendingRetryPlanIds: [],
  });
  return render(<MemoryRouter><SafetyPlanRegister /></MemoryRouter>);
}

describe('SafetyPlanRegister', () => {
  it('lists plans by status without treating not-required jobs as failures', () => {
    renderRegister();

    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Not required')).toBeInTheDocument();
    expect(screen.queryByText(/mission blocked/i)).not.toBeInTheDocument();
  });

  it('does not expose template editing to a contractor', () => {
    renderRegister({ ...admin, role: 'contractor' });

    expect(screen.queryByRole('link', { name: /manage company template/i })).not.toBeInTheDocument();
  });

  it('shows an administrator the company template action', () => {
    renderRegister();

    expect(screen.getByRole('link', { name: /manage company template/i })).toHaveAttribute(
      'href',
      '/compliance/safety-plans/template',
    );
  });
});
