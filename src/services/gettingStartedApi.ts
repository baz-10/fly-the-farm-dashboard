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
  steps: GettingStartedStepModel[];
  operationalReadiness: {
    state: 'GETTING_STARTED' | 'READY_TO_PLAN' | 'NEEDS_OPERATIONAL_ATTENTION';
    completedSteps: number;
    requiredSteps: number;
    missionAuthorisationClaim: false;
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
