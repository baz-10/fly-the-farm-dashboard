export interface SupportRequestInput { reason: string; accessMode: 'READ_ONLY'|'READ_WRITE'; scopeType: 'ORGANISATION'|'MISSION'|'JOB'|'MODULE'; missionId?: string; jobId?: string; moduleCode?: string; durationMinutes: number; }

async function request(action: string, method = 'GET', body?: unknown) {
  const response = await fetch(`/api/v1/assisted-support?action=${encodeURIComponent(action)}`, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error?.message || 'Assisted Support request failed.');
  return result.data;
}
export const listOrganisationSupport = () => request('list');
export const listPlatformSupport = () => request('platform-list');
export const createSupportRequest = (input: SupportRequestInput) => request('request', 'POST', input);
export const decideSupportRequest = (input: { requestId: string; expectedVersion: number; decision: 'APPROVE'|'REJECT'; notes?: string }) => request('approve', 'POST', input);
export const startSupportSession = (requestId: string) => request('start', 'POST', { requestId });
export const revokeSupportSession = (input: { sessionId: string; expectedVersion: number; reason: string }) => request('revoke', 'POST', input);
