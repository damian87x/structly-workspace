import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const jsonHeaders = { "Content-Type": "application/json" };
const allowedActions = new Set(["approve", "deny"]);

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

function mapRun(row = {}) {
  return {
    id: row.id,
    status: row.status,
    triggerId: row.trigger_id,
    updatedAt: row.updated_at,
    userId: row.user_id,
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

  const body = await request.json().catch(() => null);
  const action = typeof body?.action === "string" ? body.action : "";

  if (!allowedActions.has(action)) {
    return new Response(JSON.stringify({ error: "invalid_run_action" }), {
      headers: jsonHeaders,
      status: 400,
    });
  }

  if (!body?.runId) {
    return new Response(JSON.stringify({ error: "missing_run_id" }), {
      headers: jsonHeaders,
      status: 400,
    });
  }

  if (body?.userId && body.userId !== auth.userId) {
    return new Response(JSON.stringify({ error: "user_mismatch" }), {
      headers: jsonHeaders,
      status: 403,
    });
  }

  const endpoint = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!endpoint || !serviceKey) {
    return new Response(JSON.stringify({ error: "backend_not_configured" }), {
      headers: jsonHeaders,
      status: 503,
    });
  }

  const nextStatus = action === "approve" ? "queued" : "denied";
  const runFilter = encodeURIComponent(body.runId);
  const userFilter = encodeURIComponent(auth.userId);
  const response = await fetch(
    `${endpoint}/rest/v1/trigger_runs?id=eq.${runFilter}&user_id=eq.${userFilter}&status=eq.approval_required`,
    {
      body: JSON.stringify({
        result: {
          externalActionReady: action === "approve",
        },
        status: nextStatus,
        updated_at: new Date().toISOString(),
      }),
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
        apikey: serviceKey,
      },
      method: "PATCH",
    },
  );
  const rows = await response.json().catch(() => []);

  if (!response.ok) {
    return new Response(JSON.stringify({ error: "run_update_failed" }), {
      headers: jsonHeaders,
      status: 502,
    });
  }

  if (rows.length === 0) {
    return new Response(JSON.stringify({ error: "run_not_approvable" }), {
      headers: jsonHeaders,
      status: 404,
    });
  }

  return new Response(
    JSON.stringify({
      action,
      run: mapRun(rows[0]),
    }),
    { headers: jsonHeaders },
  );
});
