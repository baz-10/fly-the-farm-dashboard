export type GettingStartedStepState = 'COMPLETE' | 'NEEDS_ATTENTION' | 'NOT_STARTED' | 'OPTIONAL';

export interface GettingStartedAction {
  code: string;
  label: string;
  route: string;
  stepCode?: string;
}

export interface GettingStartedStepModel {
  code: string;
  label: string;
  state: GettingStartedStepState;
  summary: string;
  count: number;
  optional: boolean;
  action: GettingStartedAction;
}

export interface GettingStartedProjection {
  organisation: { id: string; name: string; displayName: string };
  base: {
    id: string; name: string; address: string; timezone: string;
    latitude: number | null; longitude: number | null;
    addressSource: 'ADDRESS_SEARCH' | 'MANUALLY_ADJUSTED' | null;
    locationConfirmedAt: string | null; rowVersion: number;
    createdAt: string | null; updatedAt: string | null;
  } | null;
  steps: GettingStartedStepModel[];
  operationalReadiness: {
    completedSteps: number;
    requiredSteps: number;
  };
  nextAction: GettingStartedAction | null;
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function createGettingStartedApi(fetcher: Fetcher = fetch) {
  return {
    async read(): Promise<GettingStartedProjection> {
      const response = await fetcher('/api/v1/getting-started', { method: 'GET', credentials: 'same-origin' });
      const envelope = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(envelope?.error?.message || 'Getting Started progress could not be loaded.');
      if (!envelope?.data || !Array.isArray(envelope.data.steps)) {
        throw new Error('Getting Started progress returned an invalid response.');
      }
      return envelope.data as GettingStartedProjection;
    },
  };
}

export const gettingStartedApi = createGettingStartedApi();
