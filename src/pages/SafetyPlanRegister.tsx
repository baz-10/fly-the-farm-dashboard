import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn';
import SettingsIcon from '@mui/icons-material/Settings';
import { Link } from 'react-router-dom';
import SafetyPlanStatusChip from '../components/safety-plan/SafetyPlanStatusChip';
import SafetyPlanAuthorityManager from '../components/safety-plan/SafetyPlanAuthorityManager';
import { useAuth } from '../contexts/AuthContext';
import { useSafetyPlans } from '../contexts/SafetyPlanContext';
import type { SafetyPlan, SafetyPlanStatus } from '../types/safetyPlan';
import { getPlanAttention } from '../utils/safetyPlanRules';
import { canApproveSafetyPlan, canEditSafetyPlan } from '../utils/safetyPlanPermissions';

type StatusFilter = 'all' | SafetyPlanStatus;

function currentVersion(plan: SafetyPlan) {
  return plan.versions.find((version) => version.id === plan.currentVersionId)
    ?? plan.versions.at(-1);
}

function jobLabel(plan: SafetyPlan): string {
  return currentVersion(plan)?.sourceSnapshot.job.name || plan.jobId;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-AU');
}

export default function SafetyPlanRegister() {
  const { user } = useAuth();
  const { plans, pendingRetryPlanIds } = useSafetyPlans();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [owner, setOwner] = useState('all');
  const [approver, setApprover] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [attentionOnly, setAttentionOnly] = useState(false);

  const owners = useMemo(() => Array.from(new Set(plans.map((plan) =>
    currentVersion(plan)?.createdBy?.name || plan.notRequiredActor?.name
  ).filter(Boolean) as string[])).sort(), [plans]);
  const approvers = useMemo(() => Array.from(new Set(plans.map((plan) =>
    currentVersion(plan)?.approvedBy?.name
  ).filter(Boolean) as string[])).sort(), [plans]);

  const visiblePlans = useMemo(() => {
    const term = search.trim().toLowerCase();
    return plans
      .filter((plan) => !plan.deletedAt)
      .filter((plan) => status === 'all' || plan.status === status)
      .filter((plan) => owner === 'all'
        || (currentVersion(plan)?.createdBy?.name || plan.notRequiredActor?.name) === owner)
      .filter((plan) => approver === 'all' || currentVersion(plan)?.approvedBy?.name === approver)
      .filter((plan) => !dateFrom || plan.updatedAt.slice(0, 10) >= dateFrom)
      .filter((plan) => !dateTo || plan.updatedAt.slice(0, 10) <= dateTo)
      .filter((plan) => !term || [
        jobLabel(plan),
        plan.jobId,
        currentVersion(plan)?.approvedBy?.name,
        currentVersion(plan)?.createdBy?.name,
      ].some((value) => value?.toLowerCase().includes(term)))
      .filter((plan) => !attentionOnly
        || pendingRetryPlanIds.includes(plan.id)
        || (plan.status !== 'not_required' && getPlanAttention(plan).length > 0));
  }, [approver, attentionOnly, dateFrom, dateTo, owner, pendingRetryPlanIds, plans, search, status]);

  if (!user || user.role === 'client') return null;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1500, mx: 'auto' }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2} sx={{ mb: 3 }}>
        <Box>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <AssignmentTurnedInIcon color="primary" sx={{ fontSize: 36 }} />
            <Typography variant="h3" sx={{ fontWeight: 850, color: 'primary.dark', fontSize: { xs: '2rem', md: '2.5rem' } }}>
              Safety Plans
            </Typography>
          </Stack>
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            One controlled register for job Safety Plans, approvals and crew acknowledgement.
          </Typography>
        </Box>
        {user.role === 'admin' && (
          <Button
            component={Link}
            to="/compliance/safety-plans/template"
            variant="contained"
            startIcon={<SettingsIcon />}
            sx={{ alignSelf: { xs: 'stretch', md: 'center' } }}
          >
            Manage company template
          </Button>
        )}
      </Stack>

      <Alert severity="info" sx={{ mb: 3 }}>
        Safety Plans are optional and never block mission authorisation. “Not required” is a valid job decision.
      </Alert>

      <Card variant="outlined" sx={{ p: 2, mb: 3, borderRadius: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField
              fullWidth
              size="small"
              label="Search job, owner or approver"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <FormControl fullWidth size="small">
              <InputLabel id="safety-plan-status-filter">Status</InputLabel>
              <Select
                labelId="safety-plan-status-filter"
                label="Status"
                value={status}
                onChange={(event) => setStatus(event.target.value as StatusFilter)}
              >
                <MenuItem value="all">All statuses</MenuItem>
                <MenuItem value="draft">Draft</MenuItem>
                <MenuItem value="submitted">Submitted</MenuItem>
                <MenuItem value="approved">Approved</MenuItem>
                <MenuItem value="superseded">Superseded</MenuItem>
                <MenuItem value="not_required">Not required</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Button
              fullWidth
              variant={attentionOnly ? 'contained' : 'outlined'}
              onClick={() => setAttentionOnly((value) => !value)}
            >
              Needs attention
            </Button>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <FormControl fullWidth size="small">
              <InputLabel id="safety-plan-owner-filter">Owner</InputLabel>
              <Select
                labelId="safety-plan-owner-filter"
                label="Owner"
                value={owner}
                onChange={(event) => setOwner(event.target.value)}
              >
                <MenuItem value="all">All owners</MenuItem>
                {owners.map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <FormControl fullWidth size="small">
              <InputLabel id="safety-plan-approver-filter">Approver</InputLabel>
              <Select
                labelId="safety-plan-approver-filter"
                label="Approver"
                value={approver}
                onChange={(event) => setApprover(event.target.value)}
              >
                <MenuItem value="all">All approvers</MenuItem>
                {approvers.map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <TextField
              fullWidth
              size="small"
              label="Updated from"
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <TextField
              fullWidth
              size="small"
              label="Updated to"
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Grid>
        </Grid>
      </Card>

      <Stack spacing={1.5}>
        {visiblePlans.map((plan) => {
          const version = currentVersion(plan);
          const acknowledgements = version?.acknowledgements.filter((item) => !item.withdrawnAt).length ?? 0;
          const attention = plan.status === 'not_required' ? [] : getPlanAttention(plan);
          return (
            <Card
              key={plan.id}
              variant="outlined"
              sx={{
                p: 2,
                borderRadius: 3,
                borderLeft: 6,
                borderLeftColor: plan.status === 'approved' ? 'success.main' : plan.status === 'submitted' ? 'info.main' : 'warning.main',
              }}
            >
              <Grid container spacing={2} alignItems="center">
                <Grid size={{ xs: 12, md: 4 }}>
                  <Typography fontWeight={800}>{jobLabel(plan)}</Typography>
                  <Typography variant="body2" color="text.secondary">Job {plan.jobId}</Typography>
                </Grid>
                <Grid size={{ xs: 6, sm: 3, md: 1.5 }}>
                  <SafetyPlanStatusChip status={plan.status} />
                </Grid>
                <Grid size={{ xs: 6, sm: 3, md: 1.5 }}>
                  <Typography variant="caption" color="text.secondary">Version</Typography>
                  <Typography fontWeight={700}>{version?.version ?? '—'}</Typography>
                </Grid>
                <Grid size={{ xs: 6, sm: 3, md: 1.5 }}>
                  <Typography variant="caption" color="text.secondary">Updated</Typography>
                  <Typography fontWeight={700}>{formatDate(plan.updatedAt)}</Typography>
                </Grid>
                <Grid size={{ xs: 6, sm: 3, md: 1.5 }}>
                  <Typography variant="caption" color="text.secondary">Acknowledged</Typography>
                  <Typography fontWeight={700}>{acknowledgements}</Typography>
                </Grid>
                <Grid size={{ xs: 12, md: 2 }}>
                  <Stack direction="row" spacing={1} justifyContent={{ md: 'flex-end' }} alignItems="center">
                    {attention.length > 0 && <Chip size="small" color="warning" label={`${attention.length} attention`} />}
                    {pendingRetryPlanIds.includes(plan.id) && <Chip size="small" color="error" label="Save retry" />}
                    {plan.status !== 'not_required' && (
                      <Button
                        component={Link}
                        size="small"
                        to={`/compliance/safety-plans/${encodeURIComponent(plan.id)}`}
                      >
                        {plan.status === 'submitted' && canApproveSafetyPlan(user)
                          ? 'Review'
                          : canEditSafetyPlan(user, plan) ? 'Edit' : 'View'}
                      </Button>
                    )}
                  </Stack>
                </Grid>
              </Grid>
            </Card>
          );
        })}
        {visiblePlans.length === 0 && (
          <Card variant="outlined" sx={{ p: 4, textAlign: 'center', borderRadius: 3 }}>
            <Typography fontWeight={800}>No Safety Plans match these filters</Typography>
            <Typography color="text.secondary">Clear the filters or create a plan from a job when one is needed.</Typography>
          </Card>
        )}
      </Stack>

      <Card variant="outlined" sx={{ p: 3, mt: 4, borderRadius: 3 }}>
        <SafetyPlanAuthorityManager user={user} />
      </Card>
    </Box>
  );
}
