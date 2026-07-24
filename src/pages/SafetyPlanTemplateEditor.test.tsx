import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

import type { User } from '../contexts/AuthContext';
import { AU_REOC_SAFETY_PLAN_STANDARD } from '../data/safetyPlanStandard';
import SafetyPlanTemplateEditor from './SafetyPlanTemplateEditor';

const useAuth = vi.fn();
const loadCompanySafetyPlanTemplate = vi.fn();
const publishCompanySafetyPlanTemplate = vi.fn();

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => useAuth(),
}));

vi.mock('../services/safetyPlanTemplateRepository', () => ({
  loadCompanySafetyPlanTemplate: (...args: unknown[]) => loadCompanySafetyPlanTemplate(...args),
  publishCompanySafetyPlanTemplate: (...args: unknown[]) => publishCompanySafetyPlanTemplate(...args),
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

describe('SafetyPlanTemplateEditor', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({ user: admin });
    loadCompanySafetyPlanTemplate.mockResolvedValue({
      ...AU_REOC_SAFETY_PLAN_STANDARD,
      id: 'company-template-1',
      isPlatformStandard: false,
      version: '1.0',
    });
    publishCompanySafetyPlanTemplate.mockResolvedValue({
      ...AU_REOC_SAFETY_PLAN_STANDARD,
      id: 'company-template-2',
      isPlatformStandard: false,
      version: '1.1',
    });
  });

  it('denies direct contractor access to company template controls', async () => {
    useAuth.mockReturnValue({ user: { ...admin, role: 'contractor' } });

    render(<MemoryRouter><SafetyPlanTemplateEditor /></MemoryRouter>);

    expect(screen.getByRole('heading', { name: /access restricted/i })).toBeInTheDocument();
    expect(loadCompanySafetyPlanTemplate).not.toHaveBeenCalled();
  });

  it('clones the protected standard on first use and publishes a new frozen master', async () => {
    render(<MemoryRouter><SafetyPlanTemplateEditor /></MemoryRouter>);

    expect(await screen.findByText(/AU-REOC-1.0/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /publish company master/i }));

    await waitFor(() => {
      expect(publishCompanySafetyPlanTemplate).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'tenant-1', userId: 'admin-1' }),
        expect.objectContaining({ id: 'company-template-1' }),
      );
    });
  });
});
