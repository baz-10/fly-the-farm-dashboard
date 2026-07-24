import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { makeSafetyPlan, makeSafetyPlanVersion } from '../../test/safetyPlanFixtures';
import JobSafetyPlanCard from './JobSafetyPlanCard';

describe('JobSafetyPlanCard', () => {
  it('offers an optional Safety Plan without changing mission readiness', () => {
    const setMissionStatus = vi.fn();
    render(
      <MemoryRouter>
        <JobSafetyPlanCard
          jobId="job-1"
          jobName="Western paddock"
          plan={undefined}
          missionStatusLabel="Mission authorised"
          onCreate={vi.fn()}
          onMarkNotRequired={vi.fn()}
          onMissionStatusChange={setMissionStatus}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('Safety Plan optional')).toBeVisible();
    expect(screen.getByText('Mission authorised')).toBeVisible();
    expect(screen.getByRole('button', { name: /create safety plan/i })).toBeEnabled();
    expect(setMissionStatus).not.toHaveBeenCalled();
  });

  it('records not required against the exact job without changing mission state', async () => {
    const user = userEvent.setup();
    const markNotRequired = vi.fn().mockResolvedValue(undefined);
    const setMissionStatus = vi.fn();
    render(
      <MemoryRouter>
        <JobSafetyPlanCard
          jobId="job-1"
          jobName="Western paddock"
          plan={undefined}
          onCreate={vi.fn()}
          onMarkNotRequired={markNotRequired}
          onMissionStatusChange={setMissionStatus}
        />
      </MemoryRouter>
    );

    await user.click(screen.getByRole('button', { name: /not required/i }));
    await user.type(screen.getByLabelText(/reason/i), 'JSA and risk assessment sufficient');
    await user.click(screen.getByRole('button', { name: /confirm/i }));

    expect(markNotRequired).toHaveBeenCalledWith(
      'job-1',
      'JSA and risk assessment sufficient'
    );
    expect(setMissionStatus).not.toHaveBeenCalled();
  });

  it('only exposes client-copy export to administrators on an approved version', () => {
    const version = makeSafetyPlanVersion({
      status: 'approved',
      approvedAt: '2026-07-24T02:00:00.000Z',
      contentDigest: 'digest-1',
    });
    const plan = makeSafetyPlan({
      jobId: 'job-1',
      status: 'approved',
      currentVersionId: version.id,
      versions: [version],
    });
    const common = {
      jobId: 'job-1',
      jobName: 'Western paddock',
      plan,
      onCreate: vi.fn(),
      onMarkNotRequired: vi.fn(),
      onExport: vi.fn(),
      onPrint: vi.fn(),
      onExportClientCopy: vi.fn(),
    };
    const { rerender } = render(
      <MemoryRouter><JobSafetyPlanCard {...common} isAdmin={false} /></MemoryRouter>
    );
    expect(screen.queryByRole('button', { name: /export client copy/i })).not.toBeInTheDocument();

    rerender(<MemoryRouter><JobSafetyPlanCard {...common} isAdmin /></MemoryRouter>);
    expect(screen.getByRole('button', { name: /export client copy/i })).toBeEnabled();
  });

  it('ignores a plan associated with another job', () => {
    render(
      <MemoryRouter>
        <JobSafetyPlanCard
          jobId="job-1"
          jobName="Western paddock"
          plan={makeSafetyPlan({ jobId: 'job-2' })}
          onCreate={vi.fn()}
          onMarkNotRequired={vi.fn()}
        />
      </MemoryRouter>
    );
    expect(screen.getByText('Safety Plan optional')).toBeVisible();
    expect(screen.getByRole('button', { name: /create safety plan/i })).toBeEnabled();
  });

  it('offers acknowledgement and controlled revision actions without mission callbacks', async () => {
    const user = userEvent.setup();
    const version = makeSafetyPlanVersion({
      status: 'approved',
      approvedAt: '2026-07-24T02:00:00.000Z',
      contentDigest: 'digest',
    });
    const plan = makeSafetyPlan({
      status: 'approved',
      currentVersionId: version.id,
      versions: [version],
    });
    const acknowledge = vi.fn();
    const revise = vi.fn();
    const missionChange = vi.fn();
    render(
      <MemoryRouter>
        <JobSafetyPlanCard
          jobId="job-1"
          jobName="Western paddock"
          plan={plan}
          onCreate={vi.fn()}
          onMarkNotRequired={vi.fn()}
          onAcknowledge={acknowledge}
          onRevise={revise}
          onMissionStatusChange={missionChange}
        />
      </MemoryRouter>
    );
    await user.click(screen.getByRole('button', { name: /acknowledge/i }));
    await user.click(screen.getByRole('button', { name: /create revision/i }));
    expect(acknowledge).toHaveBeenCalledWith(plan);
    expect(revise).toHaveBeenCalledWith(plan);
    expect(missionChange).not.toHaveBeenCalled();
  });
});
