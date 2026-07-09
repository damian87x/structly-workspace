import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const jsonHeaders = { "Content-Type": "application/json" };
const supportedLanguages = new Set(["javascript", "python", "shell", "typescript"]);
const secretNames = ["api_key", "apikey", "authorization", "password", "secret", "service_role", "token"];

async function getAuthenticatedUserId(request) {
  const authorization = request.headers.get("authorization") || "";
  const endpoint = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return { error: "missing_auth", status: 401, userId: null };
  }

  if (!endpoint || !anonKey) {
    return { error: "auth_not_configured", status: 503, userId: null };
  }

  const response = await fetch(`${endpoint}/auth/v1/user`, {
    headers: {
      Authorization: authorization,
      apikey: anonKey,
    },
  });

  if (!response.ok) {
    return { error: "invalid_auth", status: 401, userId: null };
  }

  const user = await response.json().catch(() => null);

  if (!user?.id) {
    return { error: "invalid_auth", status: 401, userId: null };
  }

  return { error: null, status: 200, userId: String(user.id) };
}

function sanitizeEnvironment(environment) {
  return Object.fromEntries(
    Object.entries(environment || {}).filter(([key]) => {
      const normalized = key.toLowerCase();
      return !secretNames.some((secretName) => normalized.includes(secretName));
    }),
  );
}

serve(async (request) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      headers: jsonHeaders,
      status: 405,
    });
  }

  const auth = await getAuthenticatedUserId(request);

  if (auth.error || !auth.userId) {
    return new Response(JSON.stringify({ error: auth.error }), {
      headers: jsonHeaders,
      status: auth.status,
    });
  }

  const body = await request.json().catch(() => null);
  const language =
    typeof body?.language === "string" ? body.language.toLowerCase() : "";
  const userId = body?.userId || auth.userId;

  if (body?.userId && body.userId !== auth.userId) {
    return new Response(JSON.stringify({ error: "user_mismatch" }), {
      headers: jsonHeaders,
      status: 403,
    });
  }

  if (!userId || !supportedLanguages.has(language)) {
    return new Response(JSON.stringify({ error: "invalid_code_request" }), {
      headers: jsonHeaders,
      status: 400,
    });
  }

  if (!body.code && !body.command) {
    return new Response(JSON.stringify({ error: "missing_code_or_command" }), {
      headers: jsonHeaders,
      status: 400,
    });
  }

  const endpoint = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const daytonaApiKey = Deno.env.get("DAYTONA_API_KEY");
  const requestKey = body.requestKey || body.id || crypto.randomUUID();
  const payload = {
    code: body.code || null,
    mobileExecution: false,
    provider: "daytona",
    requestKey,
  };
  let persisted = false;

  if (endpoint && serviceKey) {
    const response = await fetch(`${endpoint}/rest/v1/code_execution_requests`, {
      body: JSON.stringify({
        command: body.command || null,
        environment: sanitizeEnvironment(body.environment),
        language,
        provider: "daytona",
        request_payload: payload,
        status: "approval_required",
        timeout_seconds: body.timeoutSeconds || 10,
        trigger_run_id: body.triggerRunId || null,
        user_id: userId,
        working_directory: body.workingDirectory || "workspace",
      }),
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        apikey: serviceKey,
      },
      method: "POST",
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ error: "code_request_insert_failed" }), {
        headers: jsonHeaders,
        status: 502,
      });
    }

    if (body.triggerId) {
      const source = "code:daytona";
      const idempotencyKey = `${source}:${requestKey}`;
      const eventResponse = await fetch(`${endpoint}/rest/v1/integration_events`, {
        body: JSON.stringify({
          event_key: requestKey,
          event_type: "code_execution_requested",
          payload: {
            language,
            mobileExecution: false,
            provider: "daytona",
            timeoutSeconds: body.timeoutSeconds || 10,
            workingDirectory: body.workingDirectory || "workspace",
          },
          source,
          user_id: userId,
        }),
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
          Prefer: "resolution=ignore-duplicates",
          apikey: serviceKey,
        },
        method: "POST",
      });

      if (!eventResponse.ok && eventResponse.status !== 409) {
        return new Response(JSON.stringify({ error: "event_insert_failed" }), {
          headers: jsonHeaders,
          status: 502,
        });
      }

      const runResponse = await fetch(
        `${endpoint}/rest/v1/trigger_runs?on_conflict=trigger_id,idempotency_key`,
        {
          body: JSON.stringify({
            idempotency_key: idempotencyKey,
            status: "approval_required",
            trigger_id: body.triggerId,
            user_id: userId,
          }),
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates",
            apikey: serviceKey,
          },
          method: "POST",
        },
      );

      if (!runResponse.ok && runResponse.status !== 409) {
        return new Response(JSON.stringify({ error: "run_upsert_failed" }), {
          headers: jsonHeaders,
          status: 502,
        });
      }
    }

    persisted = true;
  }

  return new Response(
    JSON.stringify({
      accepted: true,
      mobileExecution: false,
      persisted,
      provider: "daytona",
      providerConfigured: Boolean(daytonaApiKey),
      status: "approval_required",
    }),
    { headers: jsonHeaders, status: 202 },
  );
});
