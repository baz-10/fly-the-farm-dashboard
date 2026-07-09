function createHttpError(statusCode, publicMessage, detail) {
  const error = new Error(detail || publicMessage);
  error.statusCode = statusCode;
  error.publicMessage = publicMessage;
  return error;
}

function getSupabaseConfig() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    throw createHttpError(
      503,
      'Persistent storage is not configured.',
      'Set SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY in Vercel.'
    );
  }

  return {
    supabaseUrl: supabaseUrl.replace(/\/$/, ''),
    serviceRoleKey,
    anonKey,
  };
}

async function readResponse(response) {
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function supabaseRequest(path, options = {}) {
  const { supabaseUrl, serviceRoleKey, anonKey } = getSupabaseConfig();
  const {
    accessToken,
    keyType = 'service',
    publicMessage = 'Supabase request failed.',
    headers = {},
    ...fetchOptions
  } = options;
  const apiKey = keyType === 'anon' ? anonKey : serviceRoleKey;
  const requestHeaders = {
    apikey: apiKey,
    'Content-Type': 'application/json',
    ...headers,
  };

  if (accessToken) {
    requestHeaders.Authorization = `Bearer ${accessToken}`;
  } else if (apiKey.split('.').length === 3) {
    // Legacy Supabase anon/service-role keys are JWTs. New publishable and
    // secret keys are not and must only be sent in the apikey header.
    requestHeaders.Authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(`${supabaseUrl}/${path}`, {
    ...fetchOptions,
    headers: requestHeaders,
  });

  if (!response.ok) {
    const body = await response.text();
    throw createHttpError(response.status, publicMessage, `${response.status} ${body}`);
  }

  return readResponse(response);
}

module.exports = {
  createHttpError,
  getSupabaseConfig,
  supabaseRequest,
};
