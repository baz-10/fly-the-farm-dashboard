import { useRef, useState } from 'react';
import { Alert, Box, Button, LinearProgress, Stack, TextField, Typography } from '@mui/material';
import type { SafetyPlan, SafetyPlanAttachment } from '../../types/safetyPlan';
import {
  deleteDraftSafetyPlanAttachment,
  uploadSafetyPlanAttachment,
  type UploadSafetyPlanAttachmentInput,
} from '../../services/safetyPlanAttachments';

interface PendingUpload {
  id: string;
  file: File;
  description: string;
  progress: number;
  error?: string;
}

interface Props {
  planId: string;
  versionId: string;
  versionLabel: string;
  attachments: SafetyPlanAttachment[];
  editable: boolean;
  onAttachmentsChange: (attachments: SafetyPlanAttachment[]) => void;
  upload?: (input: UploadSafetyPlanAttachmentInput) => Promise<SafetyPlanAttachment>;
  remove?: (
    planId: string,
    versionId: string,
    attachmentId: string
  ) => Promise<SafetyPlan | undefined>;
  onServerPlanChange?: (plan: SafetyPlan) => void;
}

function makeId(): string {
  return typeof crypto?.randomUUID === 'function'
    ? crypto.randomUUID()
    : `attachment_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function SafetyPlanAttachments({
  planId,
  versionId,
  versionLabel,
  attachments,
  editable,
  onAttachmentsChange,
  upload = uploadSafetyPlanAttachment,
  remove = deleteDraftSafetyPlanAttachment,
  onServerPlanChange,
}: Props) {
  const [description, setDescription] = useState('');
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [confirmedLocally, setConfirmedLocally] = useState<SafetyPlanAttachment[]>([]);
  const [actionError, setActionError] = useState('');
  const attachmentsRef = useRef(attachments);
  const onAttachmentsChangeRef = useRef(onAttachmentsChange);
  const confirmedLocallyRef = useRef(confirmedLocally);
  attachmentsRef.current = attachments;
  onAttachmentsChangeRef.current = onAttachmentsChange;
  confirmedLocallyRef.current = confirmedLocally;

  const performUpload = async (entry: PendingUpload) => {
    setPending((items) => items.map((item) =>
      item.id === entry.id ? { ...item, error: undefined, progress: 0 } : item
    ));
    try {
      const confirmed = await upload({
        planId,
        versionId,
        attachmentId: entry.id,
        file: entry.file,
        description: entry.description,
        onProgress: (progress) => setPending((items) => items.map((item) =>
          item.id === entry.id ? { ...item, progress } : item
        )),
      });
      const nextConfirmed = [...confirmedLocallyRef.current, confirmed];
      confirmedLocallyRef.current = nextConfirmed;
      setConfirmedLocally(nextConfirmed);
      onAttachmentsChangeRef.current([
        ...attachmentsRef.current,
        ...nextConfirmed.filter(
          (local) => !attachmentsRef.current.some((item) => item.id === local.id),
        ),
      ]);
      setPending((items) => items.filter((item) => item.id !== entry.id));
    } catch (error) {
      setPending((items) => items.map((item) =>
        item.id === entry.id
          ? { ...item, error: error instanceof Error ? error.message : 'Upload failed.' }
          : item
      ));
    }
  };

  const selectFile = (file?: File) => {
    if (!file) return;
    const entry = { id: makeId(), file, description: description.trim(), progress: 0 };
    setPending((items) => [...items, entry]);
    setDescription('');
    void performUpload(entry);
  };

  const removeAttachment = async (attachment: SafetyPlanAttachment) => {
    setActionError('');
    try {
      const serverPlan = await remove(planId, versionId, attachment.id);
      const nextConfirmed = confirmedLocallyRef.current
        .filter((item) => item.id !== attachment.id);
      confirmedLocallyRef.current = nextConfirmed;
      setConfirmedLocally(nextConfirmed);
      if (serverPlan && onServerPlanChange) {
        onServerPlanChange(serverPlan);
      } else {
        onAttachmentsChangeRef.current(
          [
            ...attachmentsRef.current.filter((item) => item.id !== attachment.id),
            ...nextConfirmed.filter(
              (local) => !attachmentsRef.current.some((item) => item.id === local.id),
            ),
          ],
        );
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Attachment could not be deleted.');
    }
  };

  return (
    <Stack spacing={2}>
      <Typography variant="h6">Supporting evidence</Typography>
      {editable && (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <TextField
            label="Attachment description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            fullWidth
          />
          <Button component="label" variant="outlined">
            Upload PDF or image
            <input
              hidden
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              onChange={(event) => selectFile(event.target.files?.[0])}
            />
          </Button>
        </Stack>
      )}
      {pending.map((entry) => (
        <Box key={entry.id}>
          <Typography>Uploading {entry.file.name}</Typography>
          <LinearProgress variant="determinate" value={entry.progress} />
          {entry.error && (
            <Alert
              severity="error"
              action={<Button onClick={() => void performUpload(entry)}>Retry</Button>}
            >
              {entry.error}
            </Alert>
          )}
        </Box>
      ))}
      {actionError && <Alert severity="error">{actionError}</Alert>}
      {[...attachments, ...confirmedLocally.filter(
        (local) => !attachments.some((attachment) => attachment.id === local.id),
      )].map((attachment) => (
        <Box key={attachment.id}>
          <Typography fontWeight={700}>{attachment.fileName}</Typography>
          <Typography variant="body2">
            {attachment.description || 'No description'} · {attachment.uploadedBy.name}
            {' · '}{attachment.sizeBytes} bytes · Version {versionLabel}
          </Typography>
          <Typography variant="caption">Digest: {attachment.contentDigest}</Typography>
          {editable && (
            <Button
              color="error"
              size="small"
              aria-label={`Delete ${attachment.fileName}`}
              onClick={() => void removeAttachment(attachment)}
            >
              Delete
            </Button>
          )}
        </Box>
      ))}
    </Stack>
  );
}
