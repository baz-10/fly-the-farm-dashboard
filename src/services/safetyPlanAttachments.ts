import type { SafetyPlanAttachment } from '../types/safetyPlan';

export const MAX_SAFETY_ATTACHMENT_BYTES = 3 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

interface AttachmentIdentity {
  planId: string;
  versionId: string;
  attachmentId: string;
}

export interface UploadSafetyPlanAttachmentInput extends AttachmentIdentity {
  file: File;
  description?: string;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

async function readError(response: Response): Promise<never> {
  let message = 'Safety Plan attachment request failed.';
  try {
    const body = await response.json();
    if (typeof body?.error === 'string') message = body.error;
  } catch {
    // Keep the stable public fallback.
  }
  throw new Error(message);
}

function query(identity: AttachmentIdentity): string {
  const params = new URLSearchParams({
    planId: identity.planId,
    versionId: identity.versionId,
    attachmentId: identity.attachmentId,
  });
  return `/api/safety-attachments?${params}`;
}

export async function uploadSafetyPlanAttachment(
  input: UploadSafetyPlanAttachmentInput,
): Promise<SafetyPlanAttachment> {
  if (input.file.size < 1 || input.file.size > MAX_SAFETY_ATTACHMENT_BYTES) {
    throw new Error('Attachments must be between 1 byte and 3 MiB.');
  }
  if (!ALLOWED_TYPES.has(input.file.type)) {
    throw new Error('Choose a PDF, JPEG or PNG attachment.');
  }
  input.onProgress?.(0);
  const response = await fetch('/api/safety-attachments', {
    method: 'POST',
    credentials: 'same-origin',
    body: input.file,
    signal: input.signal,
    headers: {
      'Content-Type': input.file.type,
      'X-Safety-Plan-Id': input.planId,
      'X-Safety-Plan-Version-Id': input.versionId,
      'X-Attachment-Id': input.attachmentId,
      'X-File-Name': input.file.name,
      ...(input.description?.trim()
        ? { 'X-Attachment-Description': input.description.trim() }
        : {}),
    },
  });
  if (!response.ok) return readError(response);
  const body = await response.json();
  if (!body?.attachment) throw new Error('Attachment storage confirmation was invalid.');
  input.onProgress?.(100);
  return body.attachment as SafetyPlanAttachment;
}

export async function downloadSafetyPlanAttachment(
  planId: string,
  versionId: string,
  attachmentId: string,
): Promise<Blob> {
  const response = await fetch(query({ planId, versionId, attachmentId }), {
    credentials: 'same-origin',
  });
  if (!response.ok) return readError(response);
  return response.blob();
}

export async function deleteDraftSafetyPlanAttachment(
  planId: string,
  versionId: string,
  attachmentId: string,
): Promise<void> {
  const response = await fetch(query({ planId, versionId, attachmentId }), {
    method: 'DELETE',
    credentials: 'same-origin',
  });
  if (!response.ok) return readError(response);
}
