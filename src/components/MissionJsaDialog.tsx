import React from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, FormControlLabel, Grid, InputLabel, MenuItem, Radio, RadioGroup, Select, Stack, TextField, Typography } from '@mui/material';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import { JSARecord, MissionSafetyAssessment } from '../types/mission';
import { buildEmptyMissionSafetyAssessment, calculateRiskScore, evaluateMissionSafety, isUnsafeAnswer, MISSION_CHECKS, syncRiskControls } from '../utils/missionSafety';

const LIKELIHOODS = ['rare', 'unlikely', 'possible', 'likely', 'almost-certain'] as const;
const CONSEQUENCES = ['insignificant', 'minor', 'moderate', 'major', 'catastrophic'] as const;
type LegacyRisk = 'low' | 'medium' | 'high' | 'critical';

export function calculateRiskLevel(likelihood: typeof LIKELIHOODS[number], consequence: typeof CONSEQUENCES[number]): LegacyRisk {
  const score = (LIKELIHOODS.indexOf(likelihood) + 1) * (CONSEQUENCES.indexOf(consequence) + 1);
  if (score <= 4) return 'low';
  if (score <= 9) return 'medium';
  if (score <= 16) return 'high';
  return 'critical';
}

interface Props { open: boolean; missionName: string; value: JSARecord; onClose: () => void; onSave: (jsa: JSARecord) => void; }

export default function MissionJsaDialog({ open, missionName, value, onClose, onSave }: Props) {
  const [assessment, setAssessment] = React.useState<MissionSafetyAssessment>(value.missionChecks || buildEmptyMissionSafetyAssessment());
  const [pilotSignature, setPilotSignature] = React.useState(value.signOffs.pilot.signature || '');
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!open) return;
    setAssessment(value.missionChecks || buildEmptyMissionSafetyAssessment());
    setPilotSignature(value.signOffs.pilot.signature || '');
    setError('');
  }, [open, value]);

  const updateAssessment = (next: MissionSafetyAssessment) => setAssessment({ ...next, riskControls: syncRiskControls(next) });
  const safety = evaluateMissionSafety(assessment);

  const save = (approve: boolean) => {
    if (approve && safety.state !== 'ready') { setError(safety.blockers[0] || 'Complete the mission checks before approval.'); return; }
    if (approve && !pilotSignature.trim()) { setError('Enter the pilot name to approve the mission checks.'); return; }
    const now = new Date().toISOString();
    onSave({ ...value, missionChecks: assessment, status: approve ? 'approved' : 'in-progress', completedBy: pilotSignature.trim() || value.completedBy, completedDate: approve ? now : value.completedDate, signOffs: { ...value.signOffs, pilot: { userId: 'current_user', signature: approve ? pilotSignature.trim() : '', signedAt: approve ? now : '' } }, updatedAt: now });
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle><Stack direction="row" spacing={1} alignItems="center"><VerifiedUserIcon color="primary" /><Box><Typography variant="h6">Mission Checks</Typography><Typography variant="caption" color="text.secondary">{missionName || 'New mission'} · {value.jsaNumber}</Typography></Box></Stack></DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Alert severity={safety.state === 'ready' ? 'success' : safety.state === 'cannot-proceed' ? 'error' : 'warning'}>
            {safety.state === 'ready' ? 'Mission checks are ready for approval.' : safety.blockers[0] || 'Complete all mission checks.'}
          </Alert>
          {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
          {MISSION_CHECKS.map((check, index) => {
            const answer = assessment.answers.find((item) => item.questionId === check.id) || { questionId: check.id, answer: null, notes: '' };
            const unsafe = isUnsafeAnswer(check.id, answer.answer);
            return <Box key={check.id} sx={{ p: 2, border: '1px solid', borderColor: unsafe ? 'warning.main' : 'divider', borderRadius: 2 }}>
              <Typography sx={{ fontWeight: 800, mb: 0.5 }}>{index + 1}. {check.question}</Typography>
              <RadioGroup row value={answer.answer === null ? '' : String(answer.answer)} onChange={(event) => updateAssessment({ ...assessment, answers: assessment.answers.map((item) => item.questionId === check.id ? { ...item, answer: event.target.value === 'true' } : item) })}>
                <FormControlLabel value="true" control={<Radio />} label="Yes" /><FormControlLabel value="false" control={<Radio />} label="No" />
              </RadioGroup>
              <TextField fullWidth size="small" multiline minRows={2} label="Notes" value={answer.notes} onChange={(event) => updateAssessment({ ...assessment, answers: assessment.answers.map((item) => item.questionId === check.id ? { ...item, notes: event.target.value } : item) })} />
            </Box>;
          })}
          <TextField fullWidth multiline minRows={3} label="Additional comments" helperText="Add information for operational approvals or stakeholders." value={assessment.generalComments} onChange={(event) => updateAssessment({ ...assessment, generalComments: event.target.value })} />
          {assessment.riskControls.length > 0 && <Typography variant="h6">Risk Control Forms</Typography>}
          {assessment.riskControls.map((control) => {
            const check = MISSION_CHECKS.find((item) => item.id === control.questionId)!;
            const initialScore = calculateRiskScore(control.likelihood, control.consequence);
            const residualScore = calculateRiskScore(control.residualLikelihood, control.residualConsequence);
            const update = (changes: Partial<typeof control>) => setAssessment({ ...assessment, riskControls: assessment.riskControls.map((item) => item.questionId === control.questionId ? { ...item, ...changes } : item) });
            return <Box key={control.questionId} sx={{ p: 2, bgcolor: 'warning.50', border: '1px solid', borderColor: 'warning.light', borderRadius: 2 }}>
              <Typography sx={{ fontWeight: 800, mb: 1 }}>{check.question}</Typography>
              <Grid container spacing={1.25}>
                {(['likelihood', 'consequence'] as const).map((field) => <Grid key={field} size={{ xs: 6, md: 3 }}><FormControl fullWidth size="small"><InputLabel>{field}</InputLabel><Select label={field} value={control[field] || ''} onChange={(e) => update({ [field]: Number(e.target.value) })}>{[1,2,3,4,5].map((n) => <MenuItem key={n} value={n}>{n}</MenuItem>)}</Select></FormControl></Grid>)}
                <Grid size={{ xs: 12, md: 3 }}><TextField fullWidth size="small" label="Initial score" value={initialScore ?? 'Not assessed'} slotProps={{ input: { readOnly: true } }} /></Grid>
                {initialScore !== null && initialScore >= 6 && <><Grid size={{ xs: 12 }}><TextField fullWidth multiline minRows={2} label="Mitigation procedures" value={control.mitigation} onChange={(e) => update({ mitigation: e.target.value })} /></Grid>{(['residualLikelihood', 'residualConsequence'] as const).map((field) => <Grid key={field} size={{ xs: 6, md: 3 }}><FormControl fullWidth size="small"><InputLabel>{field === 'residualLikelihood' ? 'Residual likelihood' : 'Residual consequence'}</InputLabel><Select label={field} value={control[field] || ''} onChange={(e) => update({ [field]: Number(e.target.value) })}>{[1,2,3,4,5].map((n) => <MenuItem key={n} value={n}>{n}</MenuItem>)}</Select></FormControl></Grid>)}<Grid size={{ xs: 12, md: 3 }}><TextField fullWidth size="small" error={residualScore !== null && residualScore >= 6} label="Residual score" value={residualScore ?? 'Not assessed'} slotProps={{ input: { readOnly: true } }} /></Grid></>}
              </Grid>
            </Box>;
          })}
          <TextField label="Pilot name / signature" required fullWidth value={pilotSignature} onChange={(event) => setPilotSignature(event.target.value)} />
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cancel</Button><Button variant="outlined" onClick={() => save(false)}>Save Draft</Button><Button variant="contained" onClick={() => save(true)}>Approve Mission Checks</Button></DialogActions>
    </Dialog>
  );
}
