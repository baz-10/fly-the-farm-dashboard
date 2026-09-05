import React from 'react';
import { Alert, Button, Chip, Divider, LinearProgress, Stack, TextField, Typography } from '@mui/material';
import type { CrpDecision, MissionPackageRevision } from '../../types/missionOperations';
import { missionOperationsApi } from '../../services/missionOperationsApi';

type CrpApi = Pick<typeof missionOperationsApi, 'authorise' | 'reject'>;
const staleCodes = new Set(['MISSION_PACKAGE_VERSION_CONFLICT', 'MISSION_PACKAGE_EVIDENCE_STALE', 'MISSION_PACKAGE_DECISION_CONFLICT']);
const amendmentReasonLabels: Readonly<Record<string, string>> = Object.freeze({
  FIELD_SCOPE_CHANGED: 'Field scope changed',
  TARGET_AREA_CHANGED: 'Target area changed',
  AIRCRAFT_ASSIGNMENT_CHANGED: 'Aircraft assignment changed',
  REGULATED_CREW_CHANGED: 'Regulated crew changed',
  CHEMICAL_PRODUCT_CHANGED: 'Chemical product changed',
  APPLICATION_METHOD_CHANGED: 'Application method changed',
  GOVERNED_RATE_CHANGED: 'Governed rate changed',
  JSA_HAZARDS_CHANGED: 'JSA hazards changed',
  JSA_CONTROLS_CHANGED: 'JSA controls changed',
  SAFETY_MAP_CHANGED: 'Safety map changed',
  OPERATIONAL_PERMISSION_CHANGED: 'Operational permission changed',
  UNRECOGNISED_CHANGE: 'Unrecognised change',
});
const packageStateLabels: Readonly<Record<string, string>> = Object.freeze({
  PREPARING: 'Preparing',
  AWAITING_CRP_APPROVAL: 'Awaiting CRP approval',
  AUTHORISED: 'Authorised',
  REJECTED: 'Rejected',
});

export default function MissionCrpReview({
  missionId,
  packageRevision,
  api = missionOperationsApi,
  canDecide = true,
  decision,
  onDecision,
  onReload,
  amendmentReasons = [],
}: {
  missionId: string;
  packageRevision: MissionPackageRevision;
  api?: CrpApi;
  canDecide?: boolean;
  decision?: CrpDecision | null;
  onDecision?: (decision: CrpDecision) => void;
  onReload?: () => void;
  amendmentReasons?: string[];
}) {
  const [authorisationDeclaration, setAuthorisationDeclaration] = React.useState('I confirm I have reviewed this exact Mission package and authorise it to proceed.');
  const [rejectionReason, setRejectionReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [stale, setStale] = React.useState(false);
  const [ineligible, setIneligible] = React.useState(false);
  const eligibleState = packageRevision.state === 'AWAITING_CRP_APPROVAL';
  const packageIdentity = `${packageRevision.id}\u0000${packageRevision.revisionNumber}\u0000${packageRevision.evidenceDigest}\u0000${packageRevision.state}`;

  React.useEffect(() => {
    setError('');
    setStale(false);
    setIneligible(false);
    setRejectionReason('');
  }, [packageIdentity]);

  const decide = async (kind: 'AUTHORISE' | 'REJECT') => {
    setBusy(true);
    setError('');
    try {
      const saved = kind === 'AUTHORISE'
        ? await api.authorise(missionId, packageRevision.id, packageRevision.revisionNumber, packageRevision.evidenceDigest, authorisationDeclaration.trim())
        : await api.reject(missionId, packageRevision.id, packageRevision.revisionNumber, packageRevision.evidenceDigest, rejectionReason.trim());
      onDecision?.(saved);
    } catch (caught) {
      const code = caught && typeof caught === 'object' ? (caught as { code?: string }).code : undefined;
      if (code && staleCodes.has(code)) {
        setStale(true);
        setError('Package changed. Reload before deciding.');
      } else if (code === 'CRP_INELIGIBLE') {
        setIneligible(true);
      } else {
        setError(caught instanceof Error ? caught.message : 'CRP decision could not be saved.');
      }
    } finally {
      setBusy(false);
    }
  };

  return <Stack spacing={1.5} aria-label="CRP package review">
    {busy && <LinearProgress />}
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}>
      <Stack spacing={0.25}><Typography variant="h6" fontWeight={900}>CRP package review</Typography><Typography variant="body2" color="text.secondary">Review and decide on this immutable revision only.</Typography></Stack>
      <Chip label={`Revision ${packageRevision.revisionNumber}`} color="primary" variant="outlined" />
    </Stack>
    {amendmentReasons.length > 0 && <Alert severity="warning">
      <Stack spacing={0.5}>
        <Typography variant="body2">Further operating-day starts are on hold pending CRP approval.</Typography>
        <Typography variant="body2">Completed and already-started days retain their governing package and JSA revisions.</Typography>
        <Typography variant="caption">{amendmentReasons.map((reason) => amendmentReasonLabels[reason] ?? amendmentReasonLabels.UNRECOGNISED_CHANGE).join(' · ')}</Typography>
      </Stack>
    </Alert>}
    <Stack spacing={0.5} divider={<Divider flexItem />}>
      <Typography variant="body2"><strong>Package state:</strong> {packageStateLabels[packageRevision.state] ?? 'Unknown package state'}</Typography>
      <Typography variant="body2"><strong>JSA revision:</strong> {packageRevision.jsaRevisionId}</Typography>
      <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}><strong>Evidence digest:</strong> {packageRevision.evidenceDigest}</Typography>
      <Typography variant="body2"><strong>Included Fields:</strong> {packageRevision.fieldIds.length}</Typography>
    </Stack>
    {error && <Alert severity="error">{error}</Alert>}
    {decision ? <Alert severity={decision.decision === 'AUTHORISED' ? 'success' : 'warning'}>CRP decision: {decision.decision} · {new Date(decision.decidedAt).toLocaleString()}</Alert>
      : !eligibleState ? <Alert severity="info">This package is not ready for a CRP decision.</Alert>
        : !canDecide || ineligible ? <Alert severity="warning">Only an eligible CRP can decide this Mission package.</Alert>
          : <><TextField fullWidth multiline minRows={2} label="CRP declaration" value={authorisationDeclaration} onChange={(event) => setAuthorisationDeclaration(event.target.value)} disabled={busy || stale} />
            <TextField fullWidth multiline minRows={2} label="Reason for rejecting package" value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} disabled={busy || stale} required />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button variant="contained" disabled={busy || stale || !authorisationDeclaration.trim()} onClick={() => void decide('AUTHORISE')}>Authorise Mission</Button>
              <Button variant="outlined" color="warning" disabled={busy || stale || !rejectionReason.trim()} onClick={() => void decide('REJECT')}>Reject Mission</Button>
              {stale && onReload && <Button variant="text" onClick={onReload}>Reload package</Button>}
            </Stack></>}
  </Stack>;
}
