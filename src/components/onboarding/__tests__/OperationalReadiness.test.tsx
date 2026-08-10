import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OperationalReadiness from '../OperationalReadiness';

const navigate = jest.fn();

const ready = {
  state: 'READY_TO_PLAN' as const,
  headline: 'Your Spray Command workspace is ready',
  summary: 'Your first operational records are in place.',
  missionAuthorisationClaim: false,
  completedSteps: 9,
  requiredSteps: 9,
  requiredActions: [],
  advisories: [],
  personnel: {
    state: 'NOT_RECORDED' as const,
    headline: 'Personnel is not recorded yet',
    reason: 'Add eligible Personnel before a Mission can be authorised or operated.',
    route: '/personnel?onboarding=personnel&returnTo=%2Fgetting-started',
  },
  primaryAction: { code: 'OPEN_MISSION', label: 'Open your first Mission', route: '/missions/mission-1' },
};

beforeEach(() => jest.clearAllMocks());

test('celebrates planning readiness while preserving every Mission gate', async () => {
  const user = userEvent.setup();
  render(<OperationalReadiness readiness={ready} onAction={navigate} />);

  expect(screen.getByRole('heading', { name: 'Your Spray Command workspace is ready' })).toBeVisible();
  expect(screen.getByText('Each Mission must still satisfy Weather, JSA, Personnel, compliance, readiness and authorisation requirements before flight.')).toBeVisible();
  expect(screen.queryByText(/ready to fly/i)).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Open your first Mission' }));
  expect(navigate).toHaveBeenCalledWith('/missions/mission-1');
});

test('keeps Personnel separate from workspace readiness and opens the existing workflow', async () => {
  const user = userEvent.setup();
  render(<OperationalReadiness readiness={ready} onAction={navigate} />);

  const personnel = screen.getByRole('region', { name: 'Personnel readiness' });
  expect(within(personnel).getByText('Personnel is not recorded yet')).toBeVisible();
  await user.click(within(personnel).getByRole('button', { name: 'Add Personnel' }));
  expect(navigate).toHaveBeenCalledWith('/personnel?onboarding=personnel&returnTo=%2Fgetting-started');
});

test('explains operational attention in plain language with an authoritative action', async () => {
  const user = userEvent.setup();
  render(<OperationalReadiness readiness={{
    ...ready,
    state: 'NEEDS_OPERATIONAL_ATTENTION',
    headline: 'Your workspace needs operational attention',
    advisories: [{
      code: 'REOC_MISSING',
      label: 'ReOC certificate missing',
      reason: 'Upload your current ReOC certificate before relying on the organisation’s operating authority.',
      route: '/compliance/reoc',
      requiresAttention: true,
    }],
  }} onAction={navigate} />);

  const attention = screen.getByRole('region', { name: 'Operational attention' });
  expect(within(attention).getByText('ReOC certificate missing')).toBeVisible();
  await user.click(within(attention).getByRole('button', { name: 'Review ReOC certificate missing' }));
  expect(navigate).toHaveBeenCalledWith('/compliance/reoc');
});

test('keeps non-blocking compliance advice visible without changing planning readiness', () => {
  render(<OperationalReadiness readiness={{
    ...ready,
    advisories: [{
      code: 'COMPLIANCE_REVIEW_RECOMMENDED',
      label: 'Review your compliance position',
      reason: 'CASA Compliance contains items worth reviewing before operations.',
      route: '/compliance',
      requiresAttention: false,
    }],
  }} onAction={navigate} />);

  expect(screen.getByRole('region', { name: 'Compliance advisory' })).toBeVisible();
  expect(screen.getByText('Review your compliance position')).toBeVisible();
  expect(screen.getByText('Ready to plan')).toBeVisible();
});

test('renders distinct source advisories sharing one rule code without duplicate React keys', () => {
  const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    render(<OperationalReadiness readiness={{
      ...ready,
      state: 'NEEDS_OPERATIONAL_ATTENTION',
      advisories: [
        {
          code: 'AIRCRAFT_NOT_SERVICEABLE',
          label: 'Aircraft compliance needs attention',
          reason: 'Aircraft One is not serviceable.',
          route: '/aircraft',
          requiresAttention: true,
        },
        {
          code: 'AIRCRAFT_NOT_SERVICEABLE',
          label: 'Aircraft compliance needs attention',
          reason: 'Aircraft Two is not serviceable.',
          route: '/aircraft',
          requiresAttention: true,
        },
      ],
    }} onAction={navigate} />);

    expect(screen.getByText('Aircraft One is not serviceable.')).toBeVisible();
    expect(screen.getByText('Aircraft Two is not serviceable.')).toBeVisible();
    expect(consoleError.mock.calls.flat().join(' ')).not.toMatch(/same key/i);
  } finally {
    consoleError.mockRestore();
  }
});
