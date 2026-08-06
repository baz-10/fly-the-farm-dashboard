import React from 'react';
import { createMissionAuthorisationApi } from '../services/missionAuthorisationApi';
import { createMissionOperationalCloseoutApi } from '../services/missionOperationalCloseoutApi';

type LifecycleApis = {
  readAuthorisation: (missionId: string) => Promise<any>;
  readCloseout: (missionId: string) => Promise<any>;
};

const authorisationApi = createMissionAuthorisationApi();
const closeoutApi = createMissionOperationalCloseoutApi();
const defaultApis: LifecycleApis = {
  readAuthorisation: authorisationApi.read,
  readCloseout: closeoutApi.read,
};

export function useMissionWorkspaceLifecycle(missionId: string | undefined, apis: LifecycleApis = defaultApis) {
  const [state, setState] = React.useState({ authorised: false, completed: false, loading: Boolean(missionId), error: null as string | null });
  const [refreshToken, setRefreshToken] = React.useState(0);
  const refresh = React.useCallback(() => setRefreshToken((current) => current + 1), []);

  React.useEffect(() => {
    let active = true;
    if (!missionId) {
      setState({ authorised: false, completed: false, loading: false, error: null });
      return () => { active = false; };
    }
    setState((current) => ({ ...current, loading: true, error: null }));
    Promise.all([apis.readAuthorisation(missionId), apis.readCloseout(missionId)])
      .then(([authorisation, closeout]) => {
        if (!active) return;
        setState({ authorised: Boolean(authorisation), completed: Boolean(closeout?.completion), loading: false, error: null });
      })
      .catch((error) => {
        if (!active) return;
        setState({ authorised: false, completed: false, loading: false, error: error instanceof Error ? error.message : 'Mission lifecycle could not be loaded.' });
      });
    return () => { active = false; };
  }, [apis, missionId, refreshToken]);

  return { ...state, refresh };
}
