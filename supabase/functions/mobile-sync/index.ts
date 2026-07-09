import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const jsonHeaders = { "Content-Type": "application/json" };

function hasUserAuth(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  return authorization.toLowerCase().startsWith("bearer ");
}

serve(async (request) => {
  if (request.method !== "POST") {
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
  let runHistory: unknown[] = [];
  let triggerDefinitions: unknown[] = [];

  if (endpoint && serviceKey) {
    const headers = {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
    };
    const [runs, triggers] = await Promise.all([
      fetch(`${endpoint}/rest/v1/trigger_runs?select=*&order=updated_at.desc`, {
        headers,
      }),
      fetch(`${endpoint}/rest/v1/trigger_definitions?select=*`, { headers }),
    ]);

    if (runs.ok) {
      runHistory = await runs.json();
    }

    if (triggers.ok) {
      triggerDefinitions = await triggers.json();
    }
  }

  return new Response(
    JSON.stringify({
      connectors: [],
      runHistory,
      triggerDefinitions,
    }),
    { headers: jsonHeaders },
  );
});
