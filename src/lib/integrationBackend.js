const DEFAULT_FUNCTIONS_PATH = "/functions/v1";

function trimTrailingSlash(value) {
  return typeof value === "string" ? value.replace(/\/+$/, "") : "";
}

function getIntegrationBackendConfig(env = process.env) {
  const explicitUrl = env.EXPO_PUBLIC_STRUCTLY_FUNCTIONS_URL || null;
  const supabaseUrl = env.EXPO_PUBLIC_SUPABASE_URL || null;

  if (explicitUrl) {
    return {
      error: null,
      functionsUrl: trimTrailingSlash(explicitUrl),
    };
  }

  if (!supabaseUrl) {
    return {
      error: "Structly backend is not configured.",
      functionsUrl: null,
    };
  }

  return {
    error: null,
    functionsUrl: `${trimTrailingSlash(supabaseUrl)}${DEFAULT_FUNCTIONS_PATH}`,
  };
}

function buildFunctionUrl(config, functionName) {
  if (!config?.functionsUrl || !functionName) {
    return null;
  }

  return `${trimTrailingSlash(config.functionsUrl)}/${functionName}`;
}

function getSessionAccessToken(session) {
  return session?.access_token || session?.accessToken || null;
}

function createIntegrationHeaders({ anonKey, session } = {}) {
  const token = getSessionAccessToken(session);
  const headers = {
    "Content-Type": "application/json",
  };

  if (anonKey) {
    headers.apikey = anonKey;
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

async function callIntegrationFunction({
  anonKey,
  body,
  config,
  fetchImpl = fetch,
  functionName,
  session,
}) {
  const url = buildFunctionUrl(config, functionName);

  if (!url) {
    return { data: null, error: new Error("Structly backend is not configured.") };
  }

  const response = await fetchImpl(url, {
    body: JSON.stringify(body || {}),
    headers: createIntegrationHeaders({ anonKey, session }),
    method: "POST",
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    return {
      data,
      error: new Error(data?.error || "Structly backend request failed."),
    };
  }

  return { data, error: null };
}

module.exports = {
  buildFunctionUrl,
  callIntegrationFunction,
  createIntegrationHeaders,
  getIntegrationBackendConfig,
};
