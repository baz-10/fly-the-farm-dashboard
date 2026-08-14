import { controlledOnboardingRestError } from './controlledOnboardingRestError.mjs';
import core from './productionPersonnelProvenanceDiagnosticCore.cjs';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function createReadOnlyClient() {
  const origin = new URL(required('SUPABASE_URL')).origin;
  const key = required('SUPABASE_SERVICE_ROLE_KEY');
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  return async (path) => {
    const response = await fetch(`${origin}/rest/v1/${path}`, { headers });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw controlledOnboardingRestError({ path, status: response.status, body, headers: response.headers });
    if (!Array.isArray(body)) throw new Error('Personnel diagnostic received a non-list response.');
    return body;
  };
}

await core.runDiagnostic({ rest: createReadOnlyClient(), emit: (row) => process.stdout.write(`${JSON.stringify(row)}\n`) });
