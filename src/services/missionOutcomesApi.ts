type Fetcher = typeof fetch;
export type MissionOutcomeObservationInput = Record<string, unknown>;
export type MissionOutcomeFollowUpInput = Record<string, unknown>;

async function request(fetcher: Fetcher, missionId: string, action?: string, body?: unknown) {
  const path = `/api/v1/mission-outcomes?missionId=${encodeURIComponent(missionId)}${action ? `&action=${action}` : ''}`;
  const response = await fetcher(path, { credentials: 'same-origin', ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
  const envelope = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(envelope?.error?.message || 'Mission Outcomes are unavailable.'), { code: envelope?.error?.code, meta: envelope?.error?.meta });
  return envelope.data;
}

export function createMissionOutcomesApi(fetcher: Fetcher = fetch) {
  return {
    read: (missionId: string) => request(fetcher, missionId),
    stagePhoto: (missionId: string, input: Record<string, unknown>) => request(fetcher, missionId, 'photo', input),
    createObservation: (missionId: string, input: MissionOutcomeObservationInput) => request(fetcher, missionId, 'observation', input),
    writeFollowUp: (missionId: string, actionId: string | null, expectedVersion: number, input: MissionOutcomeFollowUpInput) => request(fetcher, missionId, 'follow-up', { actionId, expectedVersion, ...input }),
  };
}

export const missionOutcomesApi = createMissionOutcomesApi();
