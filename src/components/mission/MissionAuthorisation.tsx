import React from 'react';
import { Alert, Button, Divider, LinearProgress, Stack, Typography } from '@mui/material';
import { missionOperationsApi } from '../../services/missionOperationsApi';
import type { CrpDecision, MissionPackageHistory, MissionPackageRevision } from '../../types/missionOperations';
import MissionCrpReview from './MissionCrpReview';
import MissionFieldScope, { MissionScopePropertyGroup } from './MissionFieldScope';

type Api = Pick<typeof missionOperationsApi, 'readPackageHistory' | 'saveScope' | 'submitForApproval' | 'authorise' | 'reject'>;
const conflictCodes = new Set(['VERSION_CONFLICT', 'MISSION_PACKAGE_EVIDENCE_STALE', 'MISSION_PACKAGE_DECISION_CONFLICT']);

function latestPackage(history: MissionPackageHistory | null): MissionPackageRevision | null {
  if (!history?.packages.length) return null;
  return [...history.packages].sort((left, right) => right.revisionNumber - left.revisionNumber)[0];
}

function decisionFor(history: MissionPackageHistory | null, packageRevisionId: string | undefined): CrpDecision | null {
  return history?.decisions.find((decision) => decision.packageRevisionId === packageRevisionId) || null;
}

export default function MissionAuthorisation({
  missionId,
  jobFieldIds = [],
  fieldsByProperty = [],
  refreshToken = 0,
  api = missionOperationsApi,
  crpEligible = true,
  onLifecycleChanged,
}: {
  missionId: string;
  jobFieldIds?: string[];
  fieldsByProperty?: MissionScopePropertyGroup[];
  refreshToken?: number;
  api?: Api;
  crpEligible?: boolean;
  onReadinessChanged?: (readiness: unknown) => void;
  onLifecycleChanged?: () => void;
}) {
  const [history, setHistory] = React.useState<MissionPackageHistory | null>(null);
  const [selectedFieldIds, setSelectedFieldIds] = React.useState<string[]>(jobFieldIds);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [stale, setStale] = React.useState(false);
  const jobFieldKey = jobFieldIds.join('\u0000');
  const availableJobFieldIds = React.useMemo(() => new Set(fieldsByProperty
    .flatMap((group) => group.fields.map((field) => field.id))
    .filter((fieldId) => jobFieldIds.includes(fieldId))), [fieldsByProperty, jobFieldIds]);

  const reload = React.useCallback(async () => {
    setBusy(true);
    setError('');
    setStale(false);
    try {
      setHistory(await api.readPackageHistory(missionId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Mission package history could not be loaded.');
    } finally {
      setBusy(false);
    }
  }, [api, missionId]);

  React.useEffect(() => { void reload(); }, [reload, refreshToken]);
  React.useEffect(() => {
    setSelectedFieldIds((current) => current.length === jobFieldIds.length
      && current.every((fieldId, index) => fieldId === jobFieldIds[index]) ? current : [...jobFieldIds]);
  }, [missionId, jobFieldKey, jobFieldIds]);

  const currentPackage = latestPackage(history);
  const currentDecision = decisionFor(history, currentPackage?.id);
  const hasJobFieldContext = availableJobFieldIds.size > 0;
  const scopeCanBeSaved = hasJobFieldContext && selectedFieldIds.length > 0
    && selectedFieldIds.every((fieldId) => availableJobFieldIds.has(fieldId)) && !busy && !stale;

  const handleFailure = (caught: unknown, fallback: string) => {
    const code = caught && typeof caught === 'object' ? (caught as { code?: string }).code : undefined;
    if (code && conflictCodes.has(code)) {
      setStale(true);
      setError('Package changed. Reload before deciding.');
      return;
    }
    setError(caught instanceof Error ? caught.message : fallback);
  };

  const saveScope = async () => {
    if (!scopeCanBeSaved) return;
    setBusy(true);
    setError('');
    try {
      const saved = await api.saveScope(missionId, history?.currentRevision || 0, selectedFieldIds);
      setHistory((current) => current ? { ...current, currentRevision: saved.revisionNumber, packages: [...current.packages, saved] } : {
        missionId, currentRevision: saved.revisionNumber, packages: [saved], decisions: [],
      });
    } catch (caught) {
      handleFailure(caught, 'Mission Field scope could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!currentPackage || busy || stale) return;
    setBusy(true);
    setError('');
    try {
      const saved = await api.submitForApproval(missionId, currentPackage.id, currentPackage.revisionNumber, currentPackage.evidenceDigest);
      setHistory((current) => current ? {
        ...current,
        currentRevision: saved.revisionNumber,
        packages: current.packages.map((item) => item.id === saved.id ? saved : item),
      } : current);
    } catch (caught) {
      handleFailure(caught, 'Mission package could not be submitted for CRP review.');
    } finally {
      setBusy(false);
    }
  };

  const acceptDecision = (decision: CrpDecision) => {
    setHistory((current) => current ? { ...current, decisions: [...current.decisions.filter((item) => item.packageRevisionId !== decision.packageRevisionId), decision] } : current);
    onLifecycleChanged?.();
  };

  return <Stack spacing={1.5}>
    {busy && <LinearProgress />}
    <Typography variant="h6" fontWeight={900}>Mission scope and CRP review</Typography>
    <Typography variant="body2" color="text.secondary">A Job does not approve a Mission. Save the proposed Job-Field subset, submit the immutable package, then an eligible CRP decides the exact revision.</Typography>
    {error && <Alert severity="error" action={stale ? <Button color="inherit" size="small" onClick={() => void reload()}>Reload</Button> : undefined}>{error}</Alert>}
    {!history && !error && <Alert severity="info">Loading Mission package history…</Alert>}
    {!hasJobFieldContext ? <Alert severity="warning">Open this review from an authoritative Job with at least one selected Field.</Alert> : <>
      {(!currentPackage || currentPackage.state === 'PREPARING' || currentPackage.state === 'REJECTED') && <>
        <MissionFieldScope jobFieldIds={jobFieldIds} selectedFieldIds={selectedFieldIds} fieldsByProperty={fieldsByProperty} onSelectedFieldIdsChange={setSelectedFieldIds} disabled={busy || stale} />
        <Button variant="contained" disabled={!scopeCanBeSaved} onClick={() => void saveScope()}>Save Mission Field scope</Button>
      </>}
      {currentPackage?.state === 'PREPARING' && <>
        <Divider />
        <Typography variant="body2">Package revision {currentPackage.revisionNumber} is prepared with {currentPackage.fieldIds.length} Field{currentPackage.fieldIds.length === 1 ? '' : 's'}.</Typography>
        <Button variant="contained" disabled={busy || stale} onClick={() => void submit()}>Submit exact package for CRP review</Button>
      </>}
      {currentPackage && currentPackage.state !== 'PREPARING' && <MissionCrpReview missionId={missionId} packageRevision={currentPackage} api={api} canDecide={crpEligible} decision={currentDecision} onDecision={acceptDecision} onReload={() => void reload()} />}
    </>}
  </Stack>;
}
