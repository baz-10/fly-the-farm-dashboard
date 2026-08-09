import React from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent,
  DialogContentText, DialogTitle, Divider, Grid, Skeleton, Stack, TextField, Typography,
} from '@mui/material';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ForwardToInboxRoundedIcon from '@mui/icons-material/ForwardToInboxRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import {
  CommercialInvitationEvidence, CommercialOnboardingApplication, decideCommercialApplication,
  issueCommercialInvitation, listCommercialApplications, revokeCommercialInvitation,
} from '../../services/commercialOnboardingApi';

type Confirmation = {
  kind: 'approve' | 'decline' | 'issue' | 'resend' | 'revoke';
  application: CommercialOnboardingApplication;
  invitation?: CommercialInvitationEvidence;
} | null;

const statusColour: Record<string, 'default' | 'info' | 'success' | 'error' | 'warning'> = {
  SUBMITTED: 'info', UNDER_REVIEW: 'warning', APPROVED: 'success', DECLINED: 'error',
  SENT: 'info', PENDING: 'warning', ACCEPTED: 'success', EXPIRED: 'warning', REVOKED: 'error',
};
const formatStatus = (value: string) => value.toLowerCase().replace(/_/g, ' ').replace(/^./, (letter) => letter.toUpperCase());
const formatTime = (value?: string | null) => value ? new Date(value).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Australia/Brisbane' }) : 'Not recorded';
const effectiveInvitationStatus = (invitation: CommercialInvitationEvidence) =>
  (invitation.status === 'SENT' || invitation.status === 'PENDING') && new Date(invitation.expiresAt).getTime() <= Date.now()
    ? 'EXPIRED' : invitation.status;

function EvidenceLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return <Box><Typography variant="overline" color="text.secondary">{label}</Typography><Typography variant="body2">{children}</Typography></Box>;
}

function InvitationEvidence({ invitation, onRevoke }: { invitation: CommercialInvitationEvidence; onRevoke?: () => void }) {
  const effectiveStatus = effectiveInvitationStatus(invitation);
  return <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2 }}>
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Chip size="small" color={statusColour[effectiveStatus] || 'default'} label={formatStatus(effectiveStatus)} />
        <Typography variant="body2">Issued by {invitation.issuedBy?.name || 'Platform user'}</Typography>
      </Stack>
      {onRevoke && (effectiveStatus === 'SENT' || effectiveStatus === 'PENDING') && <Button size="small" color="error" variant="outlined" onClick={onRevoke}>Revoke invitation</Button>}
    </Stack>
    <Grid container spacing={2} sx={{ mt: 0.5 }}>
      <Grid size={{ xs: 12, sm: 4 }}><EvidenceLabel label={invitation.status === 'PENDING' ? 'Prepared' : 'Sent'}>{formatTime(invitation.status === 'PENDING' ? invitation.createdAt : invitation.sentAt)}</EvidenceLabel></Grid>
      <Grid size={{ xs: 12, sm: 4 }}><EvidenceLabel label="Auth link expires">{formatTime(invitation.expiresAt)}</EvidenceLabel></Grid>
      <Grid size={{ xs: 12, sm: 4 }}><EvidenceLabel label="Accepted">{formatTime(invitation.acceptedAt)}</EvidenceLabel></Grid>
    </Grid>
    {invitation.issuanceNotes && <Typography variant="body2" sx={{ mt: 1.5 }}>{invitation.issuanceNotes}</Typography>}
    {invitation.deliveryProvider && <Typography variant="caption" color="text.secondary">Delivery provider: {formatStatus(invitation.deliveryProvider)}</Typography>}
    {invitation.events.length > 0 && <Stack spacing={0.5} sx={{ mt: 1.5 }}>
      {invitation.events.map((event) => <Typography key={event.id} variant="caption" color="text.secondary">
        {formatStatus(event.type)} · {formatTime(event.createdAt)}{event.actor ? ` · ${event.actor.name}` : ''}
      </Typography>)}
    </Stack>}
    {invitation.revocationReason && <Alert severity="warning" sx={{ mt: 1.5 }}>Revoked by {invitation.revokedBy?.name || 'Platform user'}: {invitation.revocationReason}</Alert>}
    {invitation.status === 'ACCEPTED' && invitation.resultingOrganisation && <Alert severity="success" sx={{ mt: 1.5 }}>
      Resulting organisation: {invitation.resultingOrganisation.reference}
    </Alert>}
  </Box>;
}

const hasPermission = (permissions: string[], permission: string) => permissions.includes(permission);

export default function CommercialOnboardingReview({ permissions }: { permissions: string[] }) {
  const canRead = hasPermission(permissions, 'platform.onboarding.application.read');
  const canReview = hasPermission(permissions, 'platform.onboarding.application.review');
  const canIssue = hasPermission(permissions, 'platform.onboarding.invitation.issue');
  const canRevoke = hasPermission(permissions, 'platform.onboarding.invitation.revoke');
  const [applications, setApplications] = React.useState<CommercialOnboardingApplication[]>([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(canRead);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [error, setError] = React.useState('');
  const [confirmation, setConfirmation] = React.useState<Confirmation>(null);
  const [notes, setNotes] = React.useState('');
  const [working, setWorking] = React.useState(false);
  const [deliverySuccess, setDeliverySuccess] = React.useState(false);

  const load = React.useCallback(async (cursor?: string, append = false) => {
    if (append) setLoadingMore(true);
    try {
      const page = await listCommercialApplications(cursor);
      setApplications((current) => append ? [...current, ...page.items] : page.items);
      setNextCursor(page.nextCursor);
      setError('');
    }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Applications could not be loaded.'); }
    finally { setLoading(false); setLoadingMore(false); }
  }, []);
  React.useEffect(() => { if (canRead) void load(); }, [canRead, load]);

  const open = (next: NonNullable<Confirmation>) => { setNotes(''); setConfirmation(next); };
  const beginReview = async (application: CommercialOnboardingApplication) => {
    setWorking(true); setError('');
    try { await decideCommercialApplication({ applicationId: application.id, expectedVersion: application.rowVersion, decision: 'UNDER_REVIEW', notes: 'Platform review started.' }); await load(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Review could not be started.'); }
    finally { setWorking(false); }
  };
  const confirm = async () => {
    if (!confirmation || notes.trim().length < 3) return;
    setWorking(true); setError('');
    try {
      if (confirmation.kind === 'approve' || confirmation.kind === 'decline') {
        await decideCommercialApplication({ applicationId: confirmation.application.id, expectedVersion: confirmation.application.rowVersion, decision: confirmation.kind === 'approve' ? 'APPROVE' : 'DECLINE', notes: notes.trim() });
      } else if (confirmation.kind === 'issue' || confirmation.kind === 'resend') {
        await issueCommercialInvitation({ applicationId: confirmation.application.id, expectedVersion: confirmation.application.rowVersion, notes: notes.trim(), resend: confirmation.kind === 'resend' });
        setDeliverySuccess(true);
      } else if (confirmation.invitation) {
        await revokeCommercialInvitation({ invitationId: confirmation.invitation.id, expectedVersion: confirmation.invitation.rowVersion, reason: notes.trim() });
      }
      setConfirmation(null); setNotes(''); await load();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Onboarding action could not be completed.'); }
    finally { setWorking(false); }
  };

  const dialogTitle = confirmation?.kind === 'approve' ? 'Confirm application approval'
    : confirmation?.kind === 'decline' ? 'Confirm application decline'
    : confirmation?.kind === 'revoke' ? 'Confirm invitation revocation' : 'Confirm invitation';
  const dialogLabel = confirmation?.kind === 'approve' || confirmation?.kind === 'decline' ? 'Decision notes'
    : confirmation?.kind === 'revoke' ? 'Revocation reason' : 'Invitation notes';
  const dialogAction = confirmation?.kind === 'approve' ? 'Confirm approval'
    : confirmation?.kind === 'decline' ? 'Confirm decline'
    : confirmation?.kind === 'revoke' ? 'Confirm revocation'
    : confirmation?.kind === 'resend' ? 'Confirm and send invitation' : 'Confirm and send invitation';

  return <Stack spacing={2.5} sx={{ mt: 4 }}>
    <Box>
      <Typography component="h2" variant="h5" fontWeight={850}>Commercial onboarding</Typography>
      <Typography color="text.secondary">Review applicant evidence, record the decision, then manage the invitation as a separate event.</Typography>
    </Box>
    {error && <Alert severity="error">{error}</Alert>}
    {deliverySuccess && <Alert severity="success" onClose={() => setDeliverySuccess(false)}>
      <Typography fontWeight={750}>Invitation delivered by Supabase Auth</Typography>
      <Typography variant="body2">The invitation is recorded as sent only after the provider confirms delivery.</Typography>
    </Alert>}
    {!canRead ? <Alert severity="info">You do not have permission to view commercial applications.</Alert>
      : loading ? <Stack spacing={1}><Skeleton height={120} /><Skeleton height={120} /></Stack>
      : applications.length === 0 ? <Alert severity="info">No commercial applications are waiting.</Alert>
      : applications.map((application) => {
        const activeInvitation = application.invitations.find((item) => effectiveInvitationStatus(item) === 'SENT' || effectiveInvitationStatus(item) === 'PENDING');
        const mayResend = application.invitations.some((item) => ['REVOKED', 'EXPIRED'].includes(effectiveInvitationStatus(item))) && !activeInvitation;
        return <Card key={application.id} variant="outlined" sx={{ borderLeft: '5px solid', borderLeftColor: application.status === 'APPROVED' ? 'success.main' : application.status === 'DECLINED' ? 'error.main' : 'warning.main' }}>
          <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
            <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2}>
              <Box>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  <Typography component="h3" variant="h6" fontWeight={800}>{application.businessName}</Typography>
                  <Chip size="small" color={statusColour[application.status] || 'default'} label={formatStatus(application.status)} />
                </Stack>
                <Typography variant="body2" sx={{ fontFamily: 'ui-monospace, monospace', mt: 0.5 }}>{application.applicationReference}</Typography>
              </Box>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
                {canReview && application.status === 'SUBMITTED' && <Button variant="contained" disabled={working} onClick={() => void beginReview(application)}>Start review</Button>}
                {canReview && application.status === 'UNDER_REVIEW' && <>
                  <Button variant="contained" color="success" startIcon={<CheckRoundedIcon />} onClick={() => open({ kind: 'approve', application })}>Approve application</Button>
                  <Button variant="outlined" color="error" startIcon={<CloseRoundedIcon />} onClick={() => open({ kind: 'decline', application })}>Decline application</Button>
                  <Button variant="outlined" disabled startIcon={<ForwardToInboxRoundedIcon />}>Send invitation</Button>
                </>}
                {canIssue && application.status === 'APPROVED' && !activeInvitation && <Button variant="contained" startIcon={<ForwardToInboxRoundedIcon />} onClick={() => open({ kind: mayResend ? 'resend' : 'issue', application })}>{mayResend ? 'Send another invitation' : 'Send invitation'}</Button>}
              </Stack>
            </Stack>

            <Divider sx={{ my: 2.5 }} />
            <Grid container spacing={2.5}>
              <Grid size={{ xs: 12, md: 4 }}>
                <Typography variant="overline" color="text.secondary">Applicant request</Typography>
                <Stack spacing={1.3}>
                  <EvidenceLabel label="Administrator">{application.administrator.name}<br />{application.administrator.email}<br />{application.administrator.phone}</EvidenceLabel>
                  <EvidenceLabel label="Submitted">{formatTime(application.submittedAt)}</EvidenceLabel>
                  <EvidenceLabel label="Consent evidence">{application.consentVersion}</EvidenceLabel>
                </Stack>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <Typography variant="overline" color="text.secondary">Base evidence</Typography>
                {application.base ? <Stack spacing={1.3}>
                  <EvidenceLabel label="Base">{application.base.name}<br />{application.base.address}</EvidenceLabel>
                  <EvidenceLabel label="Confirmed coordinates">{application.base.latitude}, {application.base.longitude}</EvidenceLabel>
                  <EvidenceLabel label="Provenance">{formatStatus(application.base.addressSource)} · confirmed {formatTime(application.base.locationConfirmedAt)} · {application.base.timezone}</EvidenceLabel>
                </Stack> : <Typography variant="body2">Base evidence unavailable.</Typography>}
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <Typography variant="overline" color="text.secondary">Decision evidence</Typography>
                <Stack spacing={1.3}>
                  <EvidenceLabel label="Reviewed by">{application.reviewedBy?.name || 'Not yet reviewed'}</EvidenceLabel>
                  <EvidenceLabel label="Reviewed">{formatTime(application.reviewedAt)}</EvidenceLabel>
                  {application.decisionNotes && <EvidenceLabel label="Decision notes">{application.decisionNotes}</EvidenceLabel>}
                  {application.applicationNotes && <EvidenceLabel label="Request notes">{application.applicationNotes}</EvidenceLabel>}
                </Stack>
              </Grid>
            </Grid>

            {application.events.length > 0 && <Box sx={{ mt: 2.5, bgcolor: 'action.hover', borderRadius: 2, p: 2 }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}><HistoryRoundedIcon fontSize="small" /><Typography fontWeight={750}>Application history</Typography></Stack>
              <Stack spacing={1}>{application.events.map((event) => <Box key={event.id}>
                <Typography variant="body2" fontWeight={700}>{formatStatus(event.toStatus)} · {formatTime(event.createdAt)} · {event.actor?.name || 'Public applicant'}</Typography>
                {event.notes && event.notes !== application.decisionNotes && <Typography variant="body2" color="text.secondary">{event.notes}</Typography>}
              </Box>)}</Stack>
            </Box>}

            {application.invitations.length > 0 && <Stack spacing={1.5} sx={{ mt: 2.5 }}>
              <Typography fontWeight={750}>Invitation evidence</Typography>
              {application.invitations.map((invitation) => <InvitationEvidence key={invitation.id} invitation={invitation} onRevoke={canRevoke ? () => open({ kind: 'revoke', application, invitation }) : undefined} />)}
            </Stack>}
          </CardContent>
        </Card>;
      })}
    {!loading && nextCursor && <Button variant="outlined" disabled={loadingMore} onClick={() => void load(nextCursor, true)}>
      {loadingMore ? 'Loading more…' : 'Load more applications'}
    </Button>}

    <Dialog open={Boolean(confirmation)} onClose={() => !working && setConfirmation(null)} aria-labelledby="commercial-confirmation-title" fullWidth maxWidth="sm">
      <DialogTitle id="commercial-confirmation-title">{dialogTitle}</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          {confirmation?.kind === 'approve' ? 'Approval records an authoritative decision. It does not create or send an invitation.'
            : confirmation?.kind === 'decline' ? 'Declining closes this application without creating an organisation or invitation.'
            : confirmation?.kind === 'revoke' ? 'Revocation immediately prevents this invitation from being accepted.'
            : 'Supabase Auth sends the link. The Supabase Auth link and onboarding invitation expire together at the authoritative recorded time. Resend creates a new link after expiry.'}
        </DialogContentText>
        {confirmation && <Typography variant="body2" sx={{ mb: 2 }}>
          {confirmation.kind === 'revoke' && confirmation.invitation
            ? `${confirmation.invitation.id} · ${confirmation.application.businessName} · ${confirmation.application.administrator.email}`
            : `${confirmation.application.businessName} · ${confirmation.application.applicationReference} · ${confirmation.application.administrator.email}`}
        </Typography>}
        <TextField autoFocus required fullWidth multiline minRows={3} label={dialogLabel} value={notes} onChange={(event) => setNotes(event.target.value)} inputProps={{ maxLength: confirmation?.kind === 'revoke' ? 2000 : 4000 }} />
      </DialogContent>
      <DialogActions>
        <Button disabled={working} onClick={() => setConfirmation(null)}>Cancel</Button>
        <Button disabled={working || notes.trim().length < 3} color={confirmation?.kind === 'decline' || confirmation?.kind === 'revoke' ? 'error' : 'primary'} variant="contained" onClick={() => void confirm()}>{dialogAction}</Button>
      </DialogActions>
    </Dialog>
  </Stack>;
}
