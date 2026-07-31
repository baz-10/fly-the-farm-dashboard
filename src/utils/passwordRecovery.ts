export interface RecoveryFragment {
  accessToken: string | null;
  isRecovery: boolean;
  error: string | null;
}

const INVALID_LINK_MESSAGE = 'This password recovery link is invalid or has expired.';

export function parseRecoveryFragment(hash: string): RecoveryFragment {
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const errorDescription = params.get('error_description');
  if (errorDescription) {
    return { accessToken: null, isRecovery: false, error: errorDescription };
  }

  const accessToken = params.get('access_token');
  const isRecovery = params.get('type') === 'recovery' && Boolean(accessToken);
  if (!isRecovery) {
    return { accessToken: null, isRecovery: false, error: INVALID_LINK_MESSAGE };
  }

  return { accessToken, isRecovery: true, error: null };
}

export function clearRecoveryUrl(): void {
  window.history.replaceState(
    {},
    document.title,
    `${window.location.pathname}${window.location.search}`,
  );
}
