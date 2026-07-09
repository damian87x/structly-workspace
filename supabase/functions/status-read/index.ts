import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const jsonHeaders = { "Content-Type": "application/json" };

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

function isProviderTrigger(trigger) {
  const source = typeof trigger.source === "string" ? trigger.source : "";

  return !(
    source === "schedule" ||
    source.startsWith("schedule:") ||
    source.startsWith("location:") ||
    source.startsWith("code:")
  );
}

serve(async (request) => {
  if (request.method !== "POST" && request.method !== "GET") {
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

  const endpoint = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const userFilter = encodeURIComponent(auth.userId);
  let runCount = 0;
  let workerHeartbeat = "unknown";
  let bridge = "unavailable";
  let codeExecution = "unknown";
  let cron = "unknown";
  let locationSuggestionCount = 0;

  if (endpoint && serviceKey) {
    const headers = {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
    };
    const [
      runResponse,
      workerResponse,
      sourceResponse,
      triggerResponse,
      scheduleResponse,
      locationSuggestionResponse,
      codeExecutionResponse,
    ] =
      await Promise.all([
        fetch(
          `${endpoint}/rest/v1/trigger_runs?select=id&user_id=eq.${userFilter}`,
          { headers },
        ),
        fetch(
          `${endpoint}/rest/v1/worker_heartbeats?select=status&order=last_seen_at.desc&limit=1`,
          { headers },
        ),
        fetch(
          `${endpoint}/rest/v1/integration_sources?select=id&enabled=eq.true&user_id=eq.${userFilter}&limit=1`,
          { headers },
        ),
        fetch(
          `${endpoint}/rest/v1/trigger_definitions?select=id,source&status=eq.active&user_id=eq.${userFilter}&limit=25`,
          { headers },
        ),
        fetch(
          `${endpoint}/rest/v1/schedule_jobs?select=id&status=eq.active&user_id=eq.${userFilter}&limit=1`,
          { headers },
        ),
        fetch(
          `${endpoint}/rest/v1/location_event_suggestions?select=id&user_id=eq.${userFilter}`,
          { headers },
        ),
        fetch(
          `${endpoint}/rest/v1/code_execution_requests?select=id&user_id=eq.${userFilter}&limit=1`,
          { headers },
        ),
      ]);

    if (runResponse.ok) {
      runCount = (await runResponse.json()).length;
    }

    if (workerResponse.ok) {
      workerHeartbeat = (await workerResponse.json())?.[0]?.status || "unknown";
    }

    const sources = sourceResponse.ok ? await sourceResponse.json() : [];
    const triggers = triggerResponse.ok ? await triggerResponse.json() : [];
    const schedules = scheduleResponse.ok ? await scheduleResponse.json() : [];
    const codeRequests = codeExecutionResponse.ok
      ? await codeExecutionResponse.json()
      : [];

    if (
      sources.length > 0 ||
      triggers.some((trigger) => isProviderTrigger(trigger))
    ) {
      bridge = "available";
    }

    cron = schedules.length > 0 ? "available" : "unknown";

    if (locationSuggestionResponse.ok) {
      locationSuggestionCount = (await locationSuggestionResponse.json()).length;
    }

    codeExecution = codeRequests.length > 0 ? "available" : "unknown";
  }

  return new Response(
    JSON.stringify({
      backend: "available",
      bridge,
      codeExecution,
      cron,
      locationSuggestionCount,
      runCount,
      realtime: "unknown",
      workerHeartbeat,
    }),
    { headers: jsonHeaders },
  );
});
