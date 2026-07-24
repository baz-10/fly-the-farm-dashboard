import { Alert, Button, CircularProgress, Stack, Typography } from '@mui/material';
import CloudDoneIcon from '@mui/icons-material/CloudDone';

import type { SaveState } from '../../contexts/SafetyPlanContext';

export default function SaveIndicator(props: {
  state: SaveState;
  lastSavedAt?: string;
  error?: string;
  onRetry(): void;
}) {
  if (props.state === 'pending_retry') {
    return (
      <Alert
        severity="warning"
        action={<Button onClick={props.onRetry} color="inherit">Retry save</Button>}
      >
        <strong>Save pending.</strong> Your changes remain on this screen.
        {props.error ? ` ${props.error}` : ''}
      </Alert>
    );
  }
  if (props.state === 'conflict') {
    return <Alert severity="error">This plan changed elsewhere. Resolve the conflict before continuing.</Alert>;
  }
  return (
    <Stack direction="row" gap={1} alignItems="center" minHeight={32} aria-live="polite">
      {props.state === 'saving'
        ? <CircularProgress size={18} />
        : <CloudDoneIcon color={props.state === 'saved' ? 'success' : 'disabled'} fontSize="small" />}
      <Typography variant="body2" color="text.secondary">
        {props.state === 'saving'
          ? 'Saving'
          : props.state === 'saved'
            ? `Saved${props.lastSavedAt ? ` at ${new Date(props.lastSavedAt).toLocaleTimeString('en-AU')}` : ''}`
            : 'Changes save automatically'}
      </Typography>
    </Stack>
  );
}
