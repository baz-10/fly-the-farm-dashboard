import { Chip } from '@mui/material';
import type { SafetyPlanStatus } from '../../types/safetyPlan';

const STATUS: Record<SafetyPlanStatus, { label: string; color: 'default' | 'warning' | 'info' | 'success' }> = {
  not_required: { label: 'Not required', color: 'default' },
  draft: { label: 'Draft', color: 'warning' },
  submitted: { label: 'Submitted', color: 'info' },
  approved: { label: 'Approved', color: 'success' },
  superseded: { label: 'Superseded', color: 'default' },
};

export default function SafetyPlanStatusChip({ status }: { status: SafetyPlanStatus }) {
  const config = STATUS[status];
  return <Chip size="small" color={config.color} label={config.label} sx={{ fontWeight: 700 }} />;
}
