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

function sanitizeConnector(source = {}) {
  const capabilities =
    source.capabilities && typeof source.capabilities === "object"
      ? source.capabilities
      : {};
  const allowedTools = Array.isArray(capabilities.allowedTools)
    ? capabilities.allowedTools
    : [];

  return {
    display_name: source.display_name,
    enabled: source.enabled,
    id: source.id,
    source_key: source.source_key,
    source_type: source.source_type,
    tool_count: allowedTools.length,
  };
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

  const endpoint = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const userFilter = encodeURIComponent(auth.userId);
  let codeExecutionRequests = [];
  let connectors = [];
  let locationSuggestions = [];
  let runHistory = [];
  let scheduleJobs = [];
  let triggerDefinitions = [];

  if (endpoint && serviceKey) {
    const headers = {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
    };
    const [
      runs,
      triggers,
      sources,
      schedules,
      locations,
      codeRequests,
    ] = await Promise.all([
      fetch(
        `${endpoint}/rest/v1/trigger_runs?select=id,user_id,trigger_id,status,attempt_count,last_error,updated_at&user_id=eq.${userFilter}&order=updated_at.desc`,
        { headers },
      ),
      fetch(
        `${endpoint}/rest/v1/trigger_definitions?select=id,user_id,name,source,trigger_type,status,created_at,updated_at&user_id=eq.${userFilter}`,
        { headers },
      ),
      fetch(
        `${endpoint}/rest/v1/integration_sources?select=id,source_key,source_type,display_name,capabilities,enabled&user_id=eq.${userFilter}`,
        { headers },
      ),
      fetch(
        `${endpoint}/rest/v1/schedule_jobs?select=id,trigger_id,schedule_key,cron_expression,interval_minutes,status,next_run_at,last_run_at,created_at,updated_at&user_id=eq.${userFilter}&order=next_run_at.asc`,
        { headers },
      ),
      fetch(
        `${endpoint}/rest/v1/location_event_suggestions?select=id,event_key,event_type,place_id,place_label,coarse_location,suggestion,created_at&user_id=eq.${userFilter}&order=created_at.desc`,
        { headers },
      ),
      fetch(
        `${endpoint}/rest/v1/code_execution_requests?select=id,trigger_run_id,provider,status,language,working_directory,timeout_seconds,created_at,updated_at&user_id=eq.${userFilter}&order=created_at.desc`,
        { headers },
      ),
    ]);

    if (runs.ok) {
      runHistory = await runs.json();
    }

    if (triggers.ok) {
      triggerDefinitions = await triggers.json();
    }

    if (sources.ok) {
      connectors = (await sources.json()).map(sanitizeConnector);
    }

    if (schedules.ok) {
      scheduleJobs = await schedules.json();
    }

    if (locations.ok) {
      locationSuggestions = await locations.json();
    }

    if (codeRequests.ok) {
      codeExecutionRequests = await codeRequests.json();
    }
  }

  return new Response(
    JSON.stringify({
      codeExecutionRequests,
      connectors,
      locationSuggestions,
      runHistory,
      scheduleJobs,
      triggerDefinitions,
    }),
    { headers: jsonHeaders },
  );
});
