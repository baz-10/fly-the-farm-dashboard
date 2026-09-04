import { useState } from 'react';
import { Alert, Button, Stack, TextField, Typography } from '@mui/material';
import type { MissionFinalSignoffReadiness } from '../../types/missionOperations';

interface Props {
  readiness: MissionFinalSignoffReadiness;
  onFinalSignoff: (input: { expectedRevision: number; declaration: string }) => Promise<void>;
}

export default function MissionFinalSignoff({ readiness, onFinalSignoff }: Props) {
  const [declaration, setDeclaration] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const ready = readiness.readyForFinalSignoff && readiness.blockers.length === 0;
  const submit = async () => {
    if (!declaration.trim() || declaration.trim() !== declaration || declaration.length > 2000) return;
    setSaving(true); setError('');
    try { await onFinalSignoff({ expectedRevision: readiness.currentCompletionRevision, declaration }); }
    catch (candidate) { setError(candidate instanceof Error ? candidate.message : 'Mission final sign-off failed.'); }
    finally { setSaving(false); }
  };
  return <Stack spacing={2}>
    <Typography variant="subtitle1" fontWeight={700}>{readiness.operationalWorkCompleted ? 'Operational work completed' : 'Operational work in progress'}</Typography>
    <Typography variant="body2" color="text.secondary">{readiness.finalSignedOff ? 'Finally signed off' : 'Awaiting final sign-off'}</Typography>
    {readiness.blockers.map((blocker) => <Alert severity="warning" key={`${blocker.code}:${blocker.message}`}>{blocker.message}</Alert>)}
    {error && <Alert severity="error">{error}</Alert>}
    {ready && !readiness.finalSignedOff && <>
      <TextField label="Final sign-off declaration" value={declaration} multiline minRows={2}
        inputProps={{ maxLength: 2000 }} onChange={(event) => setDeclaration(event.target.value)} />
      <Button variant="contained" disabled={saving || !declaration} onClick={() => void submit()}>
        {saving ? 'Signing off…' : 'Final sign-off Mission'}
      </Button>
    </>}
  </Stack>;
}
