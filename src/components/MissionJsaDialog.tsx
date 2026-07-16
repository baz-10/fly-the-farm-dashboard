import React from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import { JSARecord } from '../types/mission';

type Hazard = JSARecord['hazardIdentification'][number];
type Likelihood = Hazard['likelihood'];
type Consequence = Hazard['consequence'];
type RiskLevel = Hazard['riskLevel'];

const LIKELIHOODS: Likelihood[] = ['rare', 'unlikely', 'possible', 'likely', 'almost-certain'];
const CONSEQUENCES: Consequence[] = ['insignificant', 'minor', 'moderate', 'major', 'catastrophic'];
const RISK_LEVELS: RiskLevel[] = ['low', 'medium', 'high', 'critical'];
const CATEGORIES: Hazard['category'][] = ['operational', 'environmental', 'personnel', 'equipment', 'external'];

export function calculateRiskLevel(likelihood: Likelihood, consequence: Consequence): RiskLevel {
  const score = (LIKELIHOODS.indexOf(likelihood) + 1) * (CONSEQUENCES.indexOf(consequence) + 1);
  if (score <= 4) return 'low';
  if (score <= 9) return 'medium';
  if (score <= 16) return 'high';
  return 'critical';
}

function newHazard(): Hazard {
  return {
    id: `hazard_${Date.now()}`,
    category: 'operational',
    description: '',
    riskLevel: 'medium',
    likelihood: 'possible',
    consequence: 'moderate',
    controlMeasures: [],
    residualRisk: 'low',
  };
}

interface MissionJsaDialogProps {
  open: boolean;
  missionName: string;
  value: JSARecord;
  onClose: () => void;
  onSave: (jsa: JSARecord) => void;
}

export default function MissionJsaDialog({ open, missionName, value, onClose, onSave }: MissionJsaDialogProps) {
  const [draft, setDraft] = React.useState(value);
  const [pilotSignature, setPilotSignature] = React.useState(value.signOffs.pilot.signature || '');
  const [crpSignature, setCrpSignature] = React.useState(value.signOffs.crp?.signature || '');
  const [crpComments, setCrpComments] = React.useState(value.signOffs.crp?.comments || '');
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!open) return;
    setDraft(value);
    setPilotSignature(value.signOffs.pilot.signature || '');
    setCrpSignature(value.signOffs.crp?.signature || '');
    setCrpComments(value.signOffs.crp?.comments || '');
    setError('');
  }, [open, value]);

  const highResidualRisk = draft.hazardIdentification.some((hazard) => ['high', 'critical'].includes(hazard.residualRisk));

  const updateHazard = (index: number, update: Partial<Hazard>) => {
    setDraft((current) => ({
      ...current,
      hazardIdentification: current.hazardIdentification.map((hazard, hazardIndex) => {
        if (hazardIndex !== index) return hazard;
        const next = { ...hazard, ...update };
        if (update.likelihood || update.consequence) {
          next.riskLevel = calculateRiskLevel(next.likelihood, next.consequence);
        }
        return next;
      }),
    }));
  };

  const buildRecord = (approve: boolean): JSARecord | null => {
    const invalidHazard = draft.hazardIdentification.find((hazard) => (
      !hazard.description.trim() || hazard.controlMeasures.length === 0
      || hazard.controlMeasures.some((control) => !control.trim())
    ));

    if (approve && draft.hazardIdentification.length === 0) {
      setError('Add at least one assessed hazard before approving the CASA JSA.');
      return null;
    }
    if (approve && invalidHazard) {
      setError('Every hazard needs a description and at least one control measure.');
      return null;
    }
    if (approve && !pilotSignature.trim()) {
      setError('Enter the pilot name to sign this CASA JSA.');
      return null;
    }
    if (approve && highResidualRisk && !crpSignature.trim()) {
      setError('CRP sign-off is required while residual risk is high or critical.');
      return null;
    }

    const now = new Date().toISOString();
    return {
      ...draft,
      status: approve ? 'approved' : 'in-progress',
      completedBy: pilotSignature.trim() || draft.completedBy,
      reviewedBy: approve && crpSignature.trim() ? crpSignature.trim() : undefined,
      completedDate: approve ? now : draft.completedDate,
      reviewedDate: approve && crpSignature.trim() ? now : undefined,
      signOffs: {
        pilot: {
          userId: 'current_user',
          signature: approve ? pilotSignature.trim() : '',
          signedAt: approve ? now : '',
        },
        crp: approve && crpSignature.trim() ? {
          userId: 'current_user',
          signature: crpSignature.trim(),
          signedAt: now,
          comments: crpComments.trim() || undefined,
        } : undefined,
      },
      updatedAt: now,
    };
  };

  const save = (approve: boolean) => {
    const record = buildRecord(approve);
    if (!record) return;
    onSave(record);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <VerifiedUserIcon color="primary" />
          <Box>
            <Typography variant="h6" sx={{ fontSize: '1.05rem' }}>CASA JSA & Risk Assessment</Typography>
            <Typography sx={{ fontSize: '0.76rem', color: 'text.secondary' }}>
              {missionName.trim() || 'New mission'} · {draft.jsaNumber}
            </Typography>
          </Box>
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}

          {draft.hazardIdentification.map((hazard, index) => (
            <Box key={hazard.id} sx={{ pb: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography sx={{ fontSize: '0.82rem', fontWeight: 800 }}>Hazard {index + 1}</Typography>
                <Tooltip title="Remove hazard">
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => setDraft((current) => ({
                      ...current,
                      hazardIdentification: current.hazardIdentification.filter((_, hazardIndex) => hazardIndex !== index),
                    }))}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
              <Grid container spacing={1.25}>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <FormControl size="small" fullWidth>
                    <InputLabel>Category</InputLabel>
                    <Select
                      label="Category"
                      value={hazard.category}
                      onChange={(event) => updateHazard(index, { category: event.target.value as Hazard['category'] })}
                    >
                      {CATEGORIES.map((category) => <MenuItem key={category} value={category}>{category}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 12, sm: 8 }}>
                  <TextField
                    label="Hazard description"
                    size="small"
                    fullWidth
                    value={hazard.description}
                    onChange={(event) => updateHazard(index, { description: event.target.value })}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <FormControl size="small" fullWidth>
                    <InputLabel>Likelihood</InputLabel>
                    <Select
                      label="Likelihood"
                      value={hazard.likelihood}
                      onChange={(event) => updateHazard(index, { likelihood: event.target.value as Likelihood })}
                    >
                      {LIKELIHOODS.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <FormControl size="small" fullWidth>
                    <InputLabel>Consequence</InputLabel>
                    <Select
                      label="Consequence"
                      value={hazard.consequence}
                      onChange={(event) => updateHazard(index, { consequence: event.target.value as Consequence })}
                    >
                      {CONSEQUENCES.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField label="Initial risk" size="small" fullWidth value={hazard.riskLevel} slotProps={{ input: { readOnly: true } }} />
                </Grid>
                <Grid size={{ xs: 12, sm: 8 }}>
                  <TextField
                    label="Control measures (one per line)"
                    size="small"
                    fullWidth
                    multiline
                    minRows={2}
                    value={hazard.controlMeasures.join('\n')}
                    onChange={(event) => updateHazard(index, { controlMeasures: event.target.value.split('\n') })}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <FormControl size="small" fullWidth>
                    <InputLabel>Residual risk</InputLabel>
                    <Select
                      label="Residual risk"
                      value={hazard.residualRisk}
                      onChange={(event) => updateHazard(index, { residualRisk: event.target.value as RiskLevel })}
                    >
                      {RISK_LEVELS.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>
            </Box>
          ))}

          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={() => setDraft((current) => ({
              ...current,
              hazardIdentification: [...current.hazardIdentification, newHazard()],
            }))}
            sx={{ alignSelf: 'flex-start' }}
          >
            Add Hazard
          </Button>

          <Divider />
          <Typography sx={{ fontSize: '0.82rem', fontWeight: 800 }}>Sign-off</Typography>
          <Grid container spacing={1.25}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Pilot name / signature"
                size="small"
                fullWidth
                required
                value={pilotSignature}
                onChange={(event) => setPilotSignature(event.target.value)}
                helperText="Required to approve the CASA JSA"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label={highResidualRisk ? 'CRP name / signature (required)' : 'CRP name / signature (optional)'}
                size="small"
                fullWidth
                value={crpSignature}
                onChange={(event) => setCrpSignature(event.target.value)}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                label="CRP review comments"
                size="small"
                fullWidth
                value={crpComments}
                onChange={(event) => setCrpComments(event.target.value)}
              />
            </Grid>
          </Grid>
          {highResidualRisk && (
            <Alert severity="warning">High or critical residual risk requires CRP sign-off before this CASA JSA can be approved.</Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="outlined" onClick={() => save(false)}>Save Draft</Button>
        <Button variant="contained" onClick={() => save(true)}>Approve CASA JSA</Button>
      </DialogActions>
    </Dialog>
  );
}
