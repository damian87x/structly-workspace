import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const jsonHeaders = { "Content-Type": "application/json" };

function hasUserAuth(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  return authorization.toLowerCase().startsWith("bearer ");
}

serve(async (request) => {
  if (request.method !== "POST" && request.method !== "GET") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      headers: jsonHeaders,
      status: 405,
    });
  }

  if (!hasUserAuth(request)) {
    return new Response(JSON.stringify({ error: "missing_auth" }), {
      headers: jsonHeaders,
      status: 401,
    });
  }

  const endpoint = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  let runCount = 0;
  let workerHeartbeat = "unknown";
  let bridge = "unavailable";

  if (endpoint && serviceKey) {
    const headers = {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
    };
    const [runResponse, workerResponse, sourceResponse, triggerResponse] =
      await Promise.all([
        fetch(`${endpoint}/rest/v1/trigger_runs?select=id`, { headers }),
        fetch(
          `${endpoint}/rest/v1/worker_heartbeats?select=status&order=last_seen_at.desc&limit=1`,
          { headers },
        ),
        fetch(`${endpoint}/rest/v1/integration_sources?select=id&enabled=eq.true&limit=1`, {
          headers,
        }),
        fetch(`${endpoint}/rest/v1/trigger_definitions?select=id&status=eq.active&limit=1`, {
          headers,
        }),
      ]);

    if (runResponse.ok) {
      runCount = (await runResponse.json()).length;
    }

    if (workerResponse.ok) {
      workerHeartbeat = (await workerResponse.json())?.[0]?.status || "unknown";
    }

    if (
      (sourceResponse.ok && (await sourceResponse.json()).length > 0) ||
      (triggerResponse.ok && (await triggerResponse.json()).length > 0)
    ) {
      bridge = "available";
    }
  }

  return new Response(
    JSON.stringify({
      backend: "available",
      bridge,
      cron: "unknown",
      runCount,
      realtime: "unknown",
      workerHeartbeat,
    }),
    { headers: jsonHeaders },
  );
});
