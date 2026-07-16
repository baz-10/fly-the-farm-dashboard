export function runMissionOperation<T>(
  operation: () => T,
  errorMessage: string,
  reportError: (message: string, error: unknown) => void,
  throwOnError = false,
): T | null {
  try {
    return operation();
  } catch (error) {
    const message = `${errorMessage}: ${error instanceof Error ? error.message : String(error)}`;
    reportError(message, error);
    if (throwOnError) throw new Error(message);
    return null;
  }
}
