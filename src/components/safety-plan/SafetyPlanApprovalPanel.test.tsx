import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { makeSafetyPlan, makeSafetyPlanVersion } from '../../test/safetyPlanFixtures';
import type { User } from '../../contexts/AuthContext';
import SafetyPlanApprovalPanel from './SafetyPlanApprovalPanel';

const admin: User = {
  id: 'admin-1', email: 'admin@example.com', name: 'Admin', role: 'admin',
  tier: 'pro', safetyPlanAuthority: true,
};
const pilot: User = {
  id: 'pilot-1', email: 'pilot@example.com', name: 'Pilot', role: 'contractor',
  tier: 'pro', safetyPlanAuthority: false,
};

describe('SafetyPlanApprovalPanel', () => {
  it('shows readiness and submits a complete draft', () => {
    const onSubmit = vi.fn();
    render(<SafetyPlanApprovalPanel plan={makeSafetyPlan()} user={pilot} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: /submit for approval/i }));
    expect(screen.getByText(/ready for submission/i)).toBeInTheDocument();
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('shows approval only to an authority', () => {
    const submitted = makeSafetyPlan({
      status: 'submitted',
      versions: [makeSafetyPlanVersion({ status: 'submitted' })],
    });
    const { rerender } = render(
      <SafetyPlanApprovalPanel plan={submitted} user={pilot} onApprove={vi.fn()} />
    );
    expect(screen.queryByRole('button', { name: /^approve$/i })).not.toBeInTheDocument();
    expect(screen.getByText(/nominated operational authority/i)).toBeInTheDocument();
    rerender(<SafetyPlanApprovalPanel plan={submitted} user={admin} onApprove={vi.fn()} />);
    expect(screen.getByRole('button', { name: /^approve$/i })).toBeInTheDocument();
  });

  it('shows source warnings, approval and version history', () => {
    const approved = makeSafetyPlan({
      status: 'approved',
      versions: [makeSafetyPlanVersion({
        status: 'approved',
        approvedAt: '2026-07-24T00:00:00.000Z',
        approvedBy: {
          userId: admin.id, name: admin.name, role: 'admin', operationalAuthority: true,
        },
      })],
    });
    render(<SafetyPlanApprovalPanel plan={approved} user={pilot} sourceChanged />);
    expect(screen.getByText(/source data changed/i)).toBeInTheDocument();
    expect(screen.getByText(/approved by admin/i)).toBeInTheDocument();
    expect(screen.getByText(/version 1.0/i)).toBeInTheDocument();
  });

  it('labels missing acknowledgements as non-blocking attention', () => {
    const approved = makeSafetyPlan({
      status: 'approved',
      versions: [makeSafetyPlanVersion({ status: 'approved' })],
    });
    render(<SafetyPlanApprovalPanel plan={approved} user={pilot} />);
    expect(screen.getByText(/does not block mission authorisation/i)).toBeInTheDocument();
  });

  it('shows each crew acknowledgement with name, role, version and timestamp', () => {
    const version = makeSafetyPlanVersion({
      status: 'approved',
      sourceSnapshot: {
        ...makeSafetyPlanVersion().sourceSnapshot,
        crew: [{ id: pilot.id, name: 'Pilot One', role: 'PIC' }],
      },
      acknowledgements: [{
        id: 'ack-1',
        versionId: 'safety-plan-version-1',
        actor: {
          userId: pilot.id,
          name: 'Pilot One',
          role: 'contractor',
          operationalAuthority: false,
        },
        assignedRole: 'PIC',
        statement: 'Read and understood',
        acknowledgedAt: '2026-07-24T03:15:00.000Z',
      }],
    });
    render(<SafetyPlanApprovalPanel
      plan={makeSafetyPlan({ status: 'approved', versions: [version] })}
      user={pilot}
    />);

    const record = screen.getByRole('listitem', {
      name: /pilot one, pic, acknowledged, version 1\.0/i,
    });
    expect(record).toHaveTextContent('Pilot One');
    expect(record).toHaveTextContent('PIC');
    expect(record).toHaveTextContent('Acknowledged');
    expect(record).toHaveTextContent('Version 1.0');
    expect(record).toHaveTextContent(new Date('2026-07-24T03:15:00.000Z').toLocaleString());
  });

  it('shows pending assigned crew individually in version history', () => {
    const version = makeSafetyPlanVersion({
      status: 'submitted',
      sourceSnapshot: {
        ...makeSafetyPlanVersion().sourceSnapshot,
        crew: [
          { id: pilot.id, name: 'Pilot One', role: 'PIC' },
          { id: 'crew-2', name: 'Observer Two', role: 'Visual observer' },
        ],
      },
      acknowledgements: [],
    });
    render(<SafetyPlanApprovalPanel
      plan={makeSafetyPlan({ status: 'submitted', versions: [version] })}
      user={pilot}
    />);

    expect(screen.getByRole('listitem', {
      name: /pilot one, pic, pending, version 1\.0/i,
    })).toBeInTheDocument();
    expect(screen.getByRole('listitem', {
      name: /observer two, visual observer, pending, version 1\.0/i,
    })).toBeInTheDocument();
  });
});
