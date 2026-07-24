import { Alert, Button, Card, Chip, Divider, Stack, Typography } from '@mui/material';

import type { User } from '../../contexts/AuthContext';
import type { SafetyPlan } from '../../types/safetyPlan';
import { canApproveSafetyPlan } from '../../utils/safetyPlanPermissions';
import { canSubmitPlan, getPlanAttention } from '../../utils/safetyPlanRules';

export interface SafetyPlanApprovalPanelProps {
  plan: SafetyPlan;
  user: User;
  sourceChanged?: boolean;
  busy?: boolean;
  onSubmit?(): void;
  onApprove?(): void;
  onAcknowledge?(): void;
  onRevise?(): void;
}

export default function SafetyPlanApprovalPanel({
  plan,
  user,
  sourceChanged = false,
  busy = false,
  onSubmit,
  onApprove,
  onAcknowledge,
  onRevise,
}: SafetyPlanApprovalPanelProps) {
  const current = plan.versions.find((version) => version.id === plan.currentVersionId);
  const readiness = canSubmitPlan(plan);
  const attention = getPlanAttention(plan);
  const assigned = current?.sourceSnapshot.crew?.some((person) => person.id === user.id);
  const acknowledged = current?.acknowledgements.some(
    (item) => item.actor.userId === user.id && !item.withdrawnAt
  );

  return (
    <Stack spacing={2}>
      {sourceChanged && (
        <Alert severity="warning">
          Source data changed. Review the differences before submitting this controlled snapshot.
        </Alert>
      )}
      <Card variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
        <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
          <Typography variant="h6" fontWeight={850}>Approval control</Typography>
          <Chip
            size="small"
            color={readiness.ok ? 'success' : 'warning'}
            label={readiness.ok ? 'Ready for submission' : `${readiness.missing.length} required sections incomplete`}
          />
        </Stack>
        <Typography color="text.secondary" sx={{ mt: 1 }}>
          Safety Plan status: {plan.status.replace('_', ' ')}
        </Typography>
        {current?.approvedBy && (
          <Typography sx={{ mt: 1 }}>
            Approved by {current.approvedBy.name}
            {current.approvedAt ? ` · ${new Date(current.approvedAt).toLocaleString()}` : ''}
          </Typography>
        )}
        <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} sx={{ mt: 2 }}>
          {plan.status === 'draft' && (
            <Button
              variant="contained"
              disabled={!readiness.ok || busy}
              onClick={onSubmit}
            >
              Submit for approval
            </Button>
          )}
          {plan.status === 'submitted' && canApproveSafetyPlan(user) && (
            <Button variant="contained" disabled={busy} onClick={onApprove}>Approve</Button>
          )}
          {plan.status === 'submitted' && !canApproveSafetyPlan(user) && (
            <Alert severity="info">Approval requires a nominated operational authority.</Alert>
          )}
          {['submitted', 'approved'].includes(plan.status) && assigned && !acknowledged && (
            <Button variant="outlined" disabled={busy} onClick={onAcknowledge}>
              Read and acknowledge
            </Button>
          )}
          {plan.status === 'approved' && canApproveSafetyPlan(user) && (
            <Button variant="outlined" disabled={busy} onClick={onRevise}>Revise</Button>
          )}
        </Stack>
        {attention.map((item) => (
          <Alert severity="info" key={item.code} sx={{ mt: 2 }}>
            {item.message} This is attention only and does not block mission authorisation.
          </Alert>
        ))}
      </Card>
      <Card variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
        <Typography variant="h6" fontWeight={850}>Version history</Typography>
        <Divider sx={{ my: 1.5 }} />
        <Stack spacing={1.25}>
          {[...plan.versions].reverse().map((version) => {
            const activeAcknowledgements = version.acknowledgements.filter(
              (item) => !item.withdrawnAt && !item.replacementAcknowledgementId
            );
            const crew = version.sourceSnapshot.crew ?? [];
            const crewIds = new Set(crew.map((person) => person.id));
            const acknowledgementRows = [
              ...crew.map((person) => {
                const acknowledgement = activeAcknowledgements.find(
                  (item) => item.actor.userId === person.id
                );
                return {
                  id: person.id,
                  name: acknowledgement?.actor.name ?? person.name,
                  role: acknowledgement?.assignedRole ?? person.role,
                  acknowledgement,
                };
              }),
              ...activeAcknowledgements
                .filter((item) => !crewIds.has(item.actor.userId))
                .map((acknowledgement) => ({
                  id: acknowledgement.actor.userId,
                  name: acknowledgement.actor.name,
                  role: acknowledgement.assignedRole,
                  acknowledgement,
                })),
            ];
            return (
              <Stack key={version.id} gap={1}>
                <Stack direction="row" justifyContent="space-between" gap={2}>
                  <Typography>Version {version.version}</Typography>
                  <Stack direction="row" gap={1}>
                    <Chip size="small" label={version.status} />
                    <Chip
                      size="small"
                      variant="outlined"
                      label={`${activeAcknowledgements.length} acknowledged`}
                    />
                  </Stack>
                </Stack>
                {acknowledgementRows.length > 0 && (
                  <Stack component="ul" spacing={0.75} sx={{ m: 0, pl: 0, listStyle: 'none' }}>
                    {acknowledgementRows.map((row) => {
                      const status = row.acknowledgement ? 'Acknowledged' : 'Pending';
                      return (
                        <Stack
                          component="li"
                          key={row.id}
                          aria-label={`${row.name}, ${row.role}, ${status}, version ${version.version}`}
                          direction={{ xs: 'column', sm: 'row' }}
                          justifyContent="space-between"
                          gap={0.5}
                          sx={{ p: 1, borderRadius: 1.5, bgcolor: 'action.hover' }}
                        >
                          <Typography>
                            {row.name} · {row.role} · Version {version.version}
                          </Typography>
                          <Typography color="text.secondary">
                            {status}
                            {row.acknowledgement
                              ? ` · ${new Date(row.acknowledgement.acknowledgedAt).toLocaleString()}`
                              : ''}
                          </Typography>
                        </Stack>
                      );
                    })}
                  </Stack>
                )}
              </Stack>
            );
          })}
        </Stack>
      </Card>
    </Stack>
  );
}
