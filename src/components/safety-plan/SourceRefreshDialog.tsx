import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
  Typography,
} from '@mui/material';

import type { SourceRefreshAction, SourceRefreshDecision, SafetyPlanSourceDiff } from '../../utils/safetyPlanSourceSync';

interface DecisionItem {
  id: string;
  label: string;
  current: unknown;
  latest: unknown;
}

function display(value: unknown): string {
  if (value == null) return 'None';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map((item) => (
      typeof item === 'object' && item && 'name' in item
        ? String((item as { name: unknown }).name)
        : display(item)
    )).join(', ');
  }
  if (typeof value === 'object' && 'name' in value) {
    return String((value as { name: unknown }).name);
  }
  return JSON.stringify(value);
}

function decisionItems(diff: SafetyPlanSourceDiff): DecisionItem[] {
  return [
    ...diff.changed.map(({ current, latest }) => ({
      id: current.id,
      label: current.label,
      current: current.companyValue,
      latest: latest.companyValue,
    })),
    ...diff.removed.map((current) => ({
      id: current.id,
      label: current.label,
      current: current.companyValue,
      latest: 'Removed from source',
    })),
    ...diff.contextChanged.map((change) => ({
      id: change.itemId,
      label: change.category,
      current: change.current,
      latest: change.latest,
    })),
    ...diff.contextRemoved.map((change) => ({
      id: change.itemId,
      label: change.category,
      current: change.current,
      latest: 'Removed from source',
    })),
    ...diff.fieldAdded.map((change) => ({
      id: change.itemId,
      label: change.fieldId,
      current: change.current,
      latest: change.latest,
    })),
    ...diff.fieldChanged.map((change) => ({
      id: change.itemId,
      label: change.fieldId,
      current: change.current,
      latest: change.latest,
    })),
    ...diff.fieldRemoved.map((change) => ({
      id: change.itemId,
      label: change.fieldId,
      current: change.current,
      latest: 'Removed from source',
    })),
  ];
}

export function requiredSourceDecisionIds(diff: SafetyPlanSourceDiff): string[] {
  return decisionItems(diff).map(({ id }) => id);
}

export default function SourceRefreshDialog(props: {
  open: boolean;
  diff: SafetyPlanSourceDiff;
  decisions: SourceRefreshDecision[];
  onDecision(itemId: string, action: SourceRefreshAction): void;
  onClose(): void;
  onApply(): void;
}) {
  const items = decisionItems(props.diff);
  const decisions = new Map(props.decisions.map((decision) => [decision.itemId, decision.action]));
  const complete = items.every((item) => decisions.has(item.id));

  return (
    <Dialog open={props.open} onClose={props.onClose} fullWidth maxWidth="md">
      <DialogTitle>Review source changes</DialogTitle>
      <DialogContent>
        <Alert severity="info" sx={{ mb: 2 }}>
          Job and mission records changed. Choose what this controlled plan should retain.
        </Alert>
        <Stack spacing={2}>
          {items.map((item) => (
            <FormControl
              key={item.id}
              component="fieldset"
              sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2 }}
            >
              <Typography component="legend" fontWeight={850} textTransform="capitalize">
                {item.label.replaceAll('_', ' ')}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Current: {display(item.current)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Latest: {display(item.latest)}
              </Typography>
              <RadioGroup
                row
                value={decisions.get(item.id) ?? ''}
                onChange={(event) => props.onDecision(item.id, event.target.value as SourceRefreshAction)}
              >
                <FormControlLabel
                  value="keep_company_value"
                  control={<Radio />}
                  label={`Keep current ${item.label.replaceAll('_', ' ')}`}
                />
                <FormControlLabel
                  value="accept_source_value"
                  control={<Radio />}
                  label={`Use latest ${item.label.replaceAll('_', ' ')}`}
                />
              </RadioGroup>
            </FormControl>
          ))}
          {items.length === 0 && <Typography>No decisions are needed.</Typography>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={props.onClose}>Cancel</Button>
        <Button variant="contained" disabled={!complete} onClick={props.onApply}>
          Apply refresh
        </Button>
      </DialogActions>
    </Dialog>
  );
}
