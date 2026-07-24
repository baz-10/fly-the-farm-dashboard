import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import { Link } from 'react-router-dom';

import type { SafetyPlan, SafetyPlanSourceSnapshot } from '../../types/safetyPlan';
import SafetyPlanStatusChip from './SafetyPlanStatusChip';

export interface JobSafetyPlanCardProps {
  jobId: string;
  jobName: string;
  plan?: SafetyPlan;
  isAdmin?: boolean;
  missionStatusLabel?: string;
  latestSourceSnapshot?: SafetyPlanSourceSnapshot;
  onCreate(): void | Promise<void>;
  onMarkNotRequired(jobId: string, reason: string): void | Promise<void>;
  onExport?(plan: SafetyPlan): void | Promise<void>;
  onPrint?(plan: SafetyPlan): void | Promise<void>;
  onExportClientCopy?(plan: SafetyPlan): void | Promise<void>;
  onAcknowledge?(plan: SafetyPlan): void | Promise<void>;
  onRevise?(plan: SafetyPlan): void | Promise<void>;
  /** Deliberately unsupported by this card; retained as an integration assertion seam. */
  onMissionStatusChange?: (status: string) => void;
}

function currentVersion(plan: SafetyPlan) {
  return plan.versions.find((version) => version.id === plan.currentVersionId);
}

export default function JobSafetyPlanCard({
  jobId,
  jobName,
  plan: candidatePlan,
  isAdmin = false,
  missionStatusLabel,
  latestSourceSnapshot,
  onCreate,
  onMarkNotRequired,
  onExport,
  onPrint,
  onExportClientCopy,
  onAcknowledge,
  onRevise,
}: JobSafetyPlanCardProps) {
  const plan = candidatePlan?.jobId === jobId ? candidatePlan : undefined;
  const version = plan ? currentVersion(plan) : undefined;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string>();
  const [working, setWorking] = useState(false);

  const runCreate = async () => {
    setWorking(true);
    setError(undefined);
    try {
      await onCreate();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Safety Plan could not be created.');
    } finally {
      setWorking(false);
    }
  };

  const confirmNotRequired = async () => {
    setWorking(true);
    setError(undefined);
    try {
      await onMarkNotRequired(jobId, reason.trim());
      setDialogOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Safety Plan could not be updated.');
    } finally {
      setWorking(false);
    }
  };

  const editorLabel = plan?.status === 'approved'
    ? 'View Safety Plan'
    : plan?.status === 'submitted'
      ? 'View Safety Plan'
      : 'Continue Safety Plan';

  return (
    <Card
      elevation={0}
      sx={{ border: '1.5px solid', borderColor: 'divider', borderRadius: '16px' }}
      data-testid="job-safety-plan-card"
    >
      <CardContent sx={{ p: 3 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2}>
          <Box>
            <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
              <DescriptionOutlinedIcon color="primary" />
              <Typography variant="subtitle1" fontWeight={800}>Job Safety Plan</Typography>
              {plan ? <SafetyPlanStatusChip status={plan.status} /> : (
                <Chip size="small" label="Optional" variant="outlined" />
              )}
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              <span>Safety Plan optional</span>
              {missionStatusLabel ? <><span aria-hidden="true"> · </span><span>{missionStatusLabel}</span></> : null}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              This record supports the job but never blocks mission authorisation.
            </Typography>
          </Box>

          <Stack direction="row" gap={1} flexWrap="wrap" alignContent="flex-start">
            {!plan && (
              <>
                <Button variant="contained" disabled={working} onClick={() => void runCreate()}>
                  Create Safety Plan
                </Button>
                <Button variant="outlined" onClick={() => setDialogOpen(true)}>
                  Not required
                </Button>
              </>
            )}
            {plan?.status === 'not_required' && (
              <Button variant="contained" disabled={working} onClick={() => void runCreate()}>
                Create Safety Plan
              </Button>
            )}
            {plan && plan.status !== 'not_required' && (
              <Button
                component={Link}
                to={`/compliance/safety-plans/${encodeURIComponent(plan.id)}`}
                state={latestSourceSnapshot ? { latestSourceSnapshot } : undefined}
                variant="contained"
              >
                {editorLabel}
              </Button>
            )}
            {plan?.status === 'approved' && version && (
              <>
                <Button startIcon={<DownloadOutlinedIcon />} onClick={() => void onExport?.(plan)}>
                  Export PDF
                </Button>
                <Button startIcon={<PrintOutlinedIcon />} onClick={() => void onPrint?.(plan)}>
                  Print
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => void onExportClientCopy?.(plan)}
                  sx={{ display: isAdmin ? undefined : 'none' }}
                >
                  Export client copy
                </Button>
              </>
            )}
            {(plan?.status === 'submitted' || plan?.status === 'approved') && onAcknowledge && (
              <Button variant="outlined" onClick={() => void onAcknowledge(plan)}>
                Acknowledge
              </Button>
            )}
            {plan?.status === 'approved' && onRevise && (
              <Button variant="outlined" onClick={() => void onRevise(plan)}>
                Create revision
              </Button>
            )}
          </Stack>
        </Stack>

        {plan?.status === 'not_required' && (
          <Alert severity="info" sx={{ mt: 2 }}>
            Not required{plan.notRequiredReason ? `: ${plan.notRequiredReason}` : ''}
          </Alert>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onClose={() => !working && setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Record Safety Plan as not required</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            This is recorded against {jobName}. It will not change any linked mission.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            multiline
            minRows={3}
            label="Reason (optional)"
            value={reason}
            error={Boolean(error)}
            helperText={error}
            onChange={(event) => setReason(event.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button disabled={working} onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button disabled={working} variant="contained" onClick={() => void confirmNotRequired()}>
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}
