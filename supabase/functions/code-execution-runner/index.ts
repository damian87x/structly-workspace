import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const jsonHeaders = { "Content-Type": "application/json" };
const supportedLanguages = new Set(["javascript", "python", "typescript"]);
const secretNames = ["api_key", "apikey", "authorization", "password", "secret", "service_role", "token"];

function hasRunnerAuth(request) {
  const authorization = request.headers.get("authorization") || "";
  const runnerToken = Deno.env.get("CODE_EXECUTION_RUNNER_TOKEN");

  return Boolean(runnerToken && authorization === `Bearer ${runnerToken}`);
}

function sanitizeEnvironment(environment) {
  return Object.fromEntries(
    Object.entries(environment || {}).filter(([key]) => {
      const normalized = key.toLowerCase();
      return !secretNames.some((secretName) => normalized.includes(secretName));
    }),
  );
}

function normalizeTimeoutSeconds(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 10;
  }

  return Math.max(1, Math.min(60, Math.round(value)));
}

function getDaytonaProxyBaseUrl() {
  return (Deno.env.get("DAYTONA_PROXY_BASE_URL") || "https://proxy.app.daytona.io").replace(
    /\/+$/,
    "",
  );
}

function getDaytonaMockResponse() {
  const result = Deno.env.get("DAYTONA_MOCK_RESULT");

  if (!result) {
    return null;
  }

  return new Response(JSON.stringify({ result }), {
    headers: jsonHeaders,
  });
}

async function updateCodeRequestStatus({ endpoint, requestId, result, serviceKey, status }) {
  if (!endpoint || !serviceKey || !requestId) {
    return;
  }

  await fetch(`${endpoint}/rest/v1/code_execution_requests?id=eq.${encodeURIComponent(requestId)}`, {
    body: JSON.stringify({
      result: result || {},
      status,
      updated_at: new Date().toISOString(),
    }),
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
      apikey: serviceKey,
    },
    method: "PATCH",
  });
}

async function callDaytona({ apiKey, body, sandboxId }) {
  const timeoutSeconds = normalizeTimeoutSeconds(body.timeoutSeconds);
  const baseUrl = getDaytonaProxyBaseUrl();
  const mockResponse = getDaytonaMockResponse();

  if (mockResponse) {
    return mockResponse;
  }

  if (body.command) {
    return fetch(
      `${baseUrl}/toolbox/${encodeURIComponent(sandboxId)}/process/execute`,
      {
        body: JSON.stringify({
          command: body.command,
          cwd: body.workingDirectory || "workspace",
          env: sanitizeEnvironment(body.environment),
          timeout: timeoutSeconds,
        }),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    );
  }

  return fetch(
    `${baseUrl}/toolbox/${encodeURIComponent(sandboxId)}/process/code-run`,
    {
      body: JSON.stringify({
        code: body.code,
        envs: sanitizeEnvironment(body.environment),
        language: body.language,
        timeout: timeoutSeconds,
      }),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    },
  );
}

serve(async (request) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      headers: jsonHeaders,
      status: 405,
    });
  }

  if (!hasRunnerAuth(request)) {
    return new Response(JSON.stringify({ error: "missing_runner_auth" }), {
      headers: jsonHeaders,
      status: 401,
    });
  }

  const body = await request.json().catch(() => null);
  const apiKey = Deno.env.get("DAYTONA_API_KEY");
  const endpoint = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const sandboxId = body?.sandboxId || Deno.env.get("DAYTONA_SANDBOX_ID");
  const language =
    typeof body?.language === "string" ? body.language.toLowerCase() : "";

  if (!apiKey || !sandboxId) {
    return new Response(JSON.stringify({ error: "daytona_not_configured" }), {
      headers: jsonHeaders,
      status: 503,
    });
  }

  if (!body?.command && (!body?.code || !supportedLanguages.has(language))) {
    return new Response(JSON.stringify({ error: "invalid_execution_request" }), {
      headers: jsonHeaders,
      status: 400,
    });
  }

  await updateCodeRequestStatus({
    endpoint,
    requestId: body.requestId,
    serviceKey,
    status: "running",
  });

  const daytonaResponse = await callDaytona({ apiKey, body, sandboxId });
  const result = await daytonaResponse.json().catch(() => ({}));
  const status = daytonaResponse.ok ? "succeeded" : "failed";

  await updateCodeRequestStatus({
    endpoint,
    requestId: body.requestId,
    result,
    serviceKey,
    status,
  });

  if (!daytonaResponse.ok) {
    return new Response(JSON.stringify({ error: "daytona_execution_failed", result }), {
      headers: jsonHeaders,
      status: 502,
    });
  }

  return new Response(
    JSON.stringify({
      mobileExecution: false,
      provider: "daytona",
      result,
      status,
    }),
    { headers: jsonHeaders },
  );
});
