import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CommercialOnboardingReview from '../CommercialOnboardingReview';
import {
  decideCommercialApplication, issueCommercialInvitation, listCommercialApplications,
  revokeCommercialInvitation,
} from '../../../services/commercialOnboardingApi';

jest.mock('../../../services/commercialOnboardingApi', () => ({
  listCommercialApplications: jest.fn(), decideCommercialApplication: jest.fn(),
  issueCommercialInvitation: jest.fn(), revokeCommercialInvitation: jest.fn(),
}));

const list = listCommercialApplications as jest.MockedFunction<typeof listCommercialApplications>;
const decide = decideCommercialApplication as jest.MockedFunction<typeof decideCommercialApplication>;
const issue = issueCommercialInvitation as jest.MockedFunction<typeof issueCommercialInvitation>;
const revoke = revokeCommercialInvitation as jest.MockedFunction<typeof revokeCommercialInvitation>;
const allPermissions = [
  'platform.onboarding.application.read', 'platform.onboarding.application.review',
  'platform.onboarding.invitation.issue', 'platform.onboarding.invitation.revoke',
];

const application = (overrides: Record<string, unknown> = {}) => ({
  id: 'application-1', applicationReference: 'SC-APP-A1B2C3D4E5F6',
  businessName: 'Western Downs Aerial Application',
  administrator: { name: 'Alex Morgan', email: 'alex@example.com', phone: '07 4000 0000' },
  base: { name: 'Dalby Base', address: '1 Farm Road, Dalby QLD 4405', latitude: -27.1817, longitude: 151.2621, timezone: 'Australia/Brisbane', addressSource: 'GEOCODED', locationConfirmedAt: '2026-08-09T00:00:00.000Z' },
  consentVersion: 'commercial-application-2026-08-09', applicationNotes: 'Western Downs launch programme.',
  status: 'UNDER_REVIEW', rowVersion: 2, submittedAt: '2026-08-09T00:00:00.000Z', updatedAt: '2026-08-09T00:30:00.000Z',
  reviewedAt: '2026-08-09T00:30:00.000Z', reviewedBy: { id: 'platform-1', name: 'Platform Reviewer' }, decisionNotes: 'Initial evidence check started.',
  events: [{ id: 'event-1', type: 'APPLICATION_UNDER_REVIEW', fromStatus: 'SUBMITTED', toStatus: 'UNDER_REVIEW', actor: { id: 'platform-1', name: 'Platform Reviewer' }, notes: 'Initial evidence check started.', createdAt: '2026-08-09T00:30:00.000Z' }],
  invitations: [],
  clients: [{ id: 'client-secret', name: 'Customer Secret' }], missions: [{ id: 'mission-secret' }], financials: { revenue: 1000 },
  ...overrides,
} as any);

beforeEach(() => {
  jest.clearAllMocks();
  list.mockResolvedValue({ items: [application()], nextCursor: null });
  decide.mockResolvedValue({ reviewed: true, application_id: 'application-1', status: 'APPROVED', row_version: 3 } as any);
  issue.mockResolvedValue({ delivered: true, invitation_id: 'invitation-1', status: 'SENT', row_version: 2, sent_at: '2026-08-09T02:00:00.000Z' } as any);
  revoke.mockResolvedValue({ revoked: true, invitation_id: 'invitation-1', status: 'REVOKED', row_version: 2 } as any);
});

test('keeps application approval separate from invitation sending', async () => {
  const user = userEvent.setup();
  render(<CommercialOnboardingReview permissions={allPermissions} />);
  expect(await screen.findByRole('heading', { name: 'Commercial onboarding' })).toBeVisible();
  expect(await screen.findByRole('button', { name: 'Approve application' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Send invitation' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: /approve.*send|send.*approve/i })).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Approve application' }));
  expect(screen.getByRole('dialog', { name: 'Confirm application approval' })).toBeVisible();
  expect(decide).not.toHaveBeenCalled();
  await user.type(screen.getByLabelText(/^Decision notes/), 'Business and Base evidence verified.');
  await user.click(screen.getByRole('button', { name: 'Confirm approval' }));
  await waitFor(() => expect(decide).toHaveBeenCalledWith({ applicationId: 'application-1', expectedVersion: 2, decision: 'APPROVE', notes: 'Business and Base evidence verified.' }));
  expect(issue).not.toHaveBeenCalled();
});

test('renders only controls allowed by the exact Platform permissions', async () => {
  list.mockResolvedValue({ items: [
    application(),
    application({ id: 'application-2', businessName: 'Approved Business', status: 'APPROVED', rowVersion: 3, invitations: [{
      id: 'invitation-active', status: 'SENT', rowVersion: 2, deliveryStatus: 'SENT', deliveryProvider: 'SUPABASE_AUTH',
      issuedBy: { id: 'platform-1', name: 'Platform Reviewer' }, issuanceNotes: 'Sent invitation.',
      createdAt: '2026-08-09T02:00:00.000Z', sentAt: '2026-08-09T02:00:00.000Z', expiresAt: '2099-08-16T02:00:00.000Z',
      revokedAt: null, revokedBy: null, revocationReason: null, acceptedAt: null, resultingOrganisation: null, events: [],
    }] }),
  ], nextCursor: null });
  render(<CommercialOnboardingReview permissions={['platform.onboarding.application.read']} />);
  expect(await screen.findByText('Western Downs Aerial Application')).toBeVisible();
  expect(screen.queryByRole('button', { name: /Start review|Approve application|Decline application|Send invitation|Revoke invitation/i })).not.toBeInTheDocument();
});

test('shows request and decision evidence without rendering customer operational data', async () => {
  list.mockResolvedValue({ items: [application({
    status: 'APPROVED', rowVersion: 3, decisionNotes: 'Business and Base evidence verified.',
    reviewedAt: '2026-08-09T01:00:00.000Z', reviewedBy: { id: 'platform-2', name: 'Jordan Reviewer' },
    events: [{ id: 'event-2', type: 'APPLICATION_APPROVED', fromStatus: 'UNDER_REVIEW', toStatus: 'APPROVED', actor: { id: 'platform-2', name: 'Jordan Reviewer' }, notes: 'Business and Base evidence verified.', createdAt: '2026-08-09T01:00:00.000Z' }],
    invitations: [{ id: 'invitation-1', status: 'ACCEPTED', rowVersion: 2, issuedBy: { id: 'platform-2', name: 'Jordan Reviewer' }, issuanceNotes: 'Approved launch.', createdAt: '2026-08-09T02:00:00.000Z', sentAt: '2026-08-09T02:00:00.000Z', expiresAt: '2026-08-16T02:00:00.000Z', revokedAt: null, revokedBy: null, revocationReason: null, acceptedAt: '2026-08-10T02:00:00.000Z', resultingOrganisation: { id: 'organisation-1', reference: 'WDAA' }, events: [] }],
  })], nextCursor: null });
  render(<CommercialOnboardingReview permissions={allPermissions} />);

  expect(await screen.findByText('Western Downs launch programme.')).toBeVisible();
  expect(screen.getByText('Business and Base evidence verified.')).toBeVisible();
  expect(screen.getAllByText('Jordan Reviewer').length).toBeGreaterThan(0);
  expect(screen.getByText(/WDAA/)).toBeVisible();
  expect(screen.getByText(/Expires/)).toBeVisible();
  expect(screen.queryByText(/Customer Secret|client-secret|mission-secret|revenue/i)).not.toBeInTheDocument();
});

test('requires confirmation and reports only authoritative provider delivery', async () => {
  const user = userEvent.setup();
  list.mockResolvedValue({ items: [application({ status: 'APPROVED', rowVersion: 3, invitations: [] })], nextCursor: null });
  render(<CommercialOnboardingReview permissions={allPermissions} />);
  const send = await screen.findByRole('button', { name: 'Send invitation' });
  expect(send).toBeEnabled();
  await user.click(send);
  expect(screen.getByRole('dialog', { name: 'Confirm invitation' })).toBeVisible();
  expect(screen.getByText(/Western Downs Aerial Application.*SC-APP-A1B2C3D4E5F6.*alex@example.com/i)).toBeVisible();
  expect(issue).not.toHaveBeenCalled();
  await user.type(screen.getByLabelText(/^Invitation notes/), 'Approved launch invitation.');
  await user.click(screen.getByRole('button', { name: 'Confirm and send invitation' }));
  await waitFor(() => expect(issue).toHaveBeenCalledWith(expect.objectContaining({ applicationId: 'application-1', expectedVersion: 3, notes: 'Approved launch invitation.' })));
  expect(await screen.findByText(/Invitation delivered by Supabase Auth/i)).toBeVisible();
  expect(screen.queryByText(/token=|acceptance path|copy this path/i)).not.toBeInTheDocument();
});

test('treats a time-expired SENT row as expired and offers a replacement invitation', async () => {
  list.mockResolvedValue({ items: [application({ status: 'APPROVED', rowVersion: 3, invitations: [{
    id: 'invitation-expired', status: 'SENT', rowVersion: 1,
    issuedBy: { id: 'platform-1', name: 'Platform Reviewer' }, issuanceNotes: 'Original invitation.',
    createdAt: '2026-07-01T00:00:00.000Z', sentAt: '2026-07-01T00:00:00.000Z', expiresAt: '2026-07-08T00:00:00.000Z',
    revokedAt: null, revokedBy: null, revocationReason: null, acceptedAt: null, resultingOrganisation: null, events: [],
  }] })], nextCursor: null });
  render(<CommercialOnboardingReview permissions={allPermissions} />);
  expect(await screen.findByRole('button', { name: 'Send another invitation' })).toBeEnabled();
  expect(screen.getByText('Expired')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Revoke invitation' })).not.toBeInTheDocument();
});

test('loads subsequent cursor pages without replacing current applications', async () => {
  const user = userEvent.setup();
  list.mockResolvedValueOnce({ items: [application()], nextCursor: 'cursor-2' });
  list.mockResolvedValueOnce({ items: [application({ id: 'application-2', applicationReference: 'SC-APP-SECOND', businessName: 'Second Aerial Business' })], nextCursor: null });
  render(<CommercialOnboardingReview permissions={allPermissions} />);
  expect(await screen.findByText('Western Downs Aerial Application')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Load more applications' }));
  expect(await screen.findByText('Second Aerial Business')).toBeVisible();
  expect(screen.getByText('Western Downs Aerial Application')).toBeVisible();
  expect(list).toHaveBeenNthCalledWith(2, 'cursor-2');
  expect(screen.queryByRole('button', { name: 'Load more applications' })).not.toBeInTheDocument();
});

test('executes resend and revoke from confirmations with target evidence', async () => {
  const user = userEvent.setup();
  const expiredInvitation = {
    id: 'invitation-expired', status: 'EXPIRED', rowVersion: 2, issuedBy: { id: 'platform-1', name: 'Platform Reviewer' },
    issuanceNotes: 'Original invitation.', createdAt: '2026-07-01T00:00:00.000Z', sentAt: '2026-07-01T00:00:00.000Z', expiresAt: '2026-07-08T00:00:00.000Z',
    revokedAt: null, revokedBy: null, revocationReason: null, acceptedAt: null, resultingOrganisation: null, events: [],
  };
  list.mockResolvedValueOnce({ items: [application({ status: 'APPROVED', rowVersion: 3, invitations: [expiredInvitation] })], nextCursor: null });
  list.mockResolvedValue({ items: [], nextCursor: null });
  const firstRender = render(<CommercialOnboardingReview permissions={allPermissions} />);
  await user.click(await screen.findByRole('button', { name: 'Send another invitation' }));
  expect(screen.getByText(/Western Downs Aerial Application.*SC-APP-A1B2C3D4E5F6.*alex@example.com/i)).toBeVisible();
  await user.type(screen.getByLabelText(/^Invitation notes/), 'Replacement after expiry.');
  await user.click(screen.getByRole('button', { name: 'Confirm and send invitation' }));
  await waitFor(() => expect(issue).toHaveBeenCalledWith(expect.objectContaining({ resend: true, notes: 'Replacement after expiry.' })));
  firstRender.unmount();

  list.mockReset();
  list.mockResolvedValue({ items: [application({ status: 'APPROVED', rowVersion: 3, invitations: [{ ...expiredInvitation, id: 'invitation-active', status: 'SENT', expiresAt: '2099-08-16T00:00:00.000Z' }] })], nextCursor: null });
  render(<CommercialOnboardingReview permissions={allPermissions} />);
  await user.click(await screen.findByRole('button', { name: 'Revoke invitation' }));
  expect(screen.getByText(/invitation-active.*Western Downs Aerial Application.*alex@example.com/i)).toBeVisible();
  await user.type(screen.getByLabelText(/^Revocation reason/), 'Administrator address changed.');
  await user.click(screen.getByRole('button', { name: 'Confirm revocation' }));
  await waitFor(() => expect(revoke).toHaveBeenCalledWith({ invitationId: 'invitation-active', expectedVersion: 2, reason: 'Administrator address changed.' }));
});
