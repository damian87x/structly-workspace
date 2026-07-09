import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const jsonHeaders = { "Content-Type": "application/json" };

function hasWorkerAuth(request) {
  const authorization = request.headers.get("authorization") || "";
  const workerToken = Deno.env.get("WORKER_HEARTBEAT_TOKEN");

  return Boolean(workerToken && authorization === `Bearer ${workerToken}`);
}

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

serve(async (request) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      headers: jsonHeaders,
      status: 405,
    });
  }

  const body = await request.json().catch(() => null);

  if (!body?.deviceId && !body?.workerId) {
    return new Response(JSON.stringify({ error: "missing_heartbeat_id" }), {
      headers: jsonHeaders,
      status: 400,
    });
  }

  if (body.workerId && !hasWorkerAuth(request)) {
    return new Response(JSON.stringify({ error: "missing_worker_auth" }), {
      headers: jsonHeaders,
      status: 401,
    });
  }

  const auth = body.workerId
    ? { error: null, status: 200, userId: null }
    : await getAuthenticatedUserId(request);

  if (auth.error || (!body.workerId && !auth.userId)) {
    return new Response(JSON.stringify({ error: auth.error }), {
      headers: jsonHeaders,
      status: auth.status,
    });
  }

  if (!body.workerId && body?.userId && body.userId !== auth.userId) {
    return new Response(JSON.stringify({ error: "user_mismatch" }), {
      headers: jsonHeaders,
      status: 403,
    });
  }

  if (!body.workerId && !auth.userId) {
    return new Response(JSON.stringify({ error: "missing_user_id" }), {
      headers: jsonHeaders,
      status: 400,
    });
  }

  const endpoint = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const receivedAt = new Date().toISOString();
  let persisted = false;

  if (endpoint && serviceKey) {
    const table = body.workerId ? "worker_heartbeats" : "device_heartbeats";
    const payload = body.workerId
      ? {
          last_seen_at: receivedAt,
          metadata: body.metadata || {},
          status: "fresh",
          worker_id: body.workerId,
          worker_type: body.workerType || "backend",
        }
      : {
          app_state: body.appState || "active",
          capabilities: body.capabilities || {},
          device_id: body.deviceId,
          last_seen_at: receivedAt,
          platform: body.platform || null,
          user_id: auth.userId,
        };
    const conflict = body.workerId ? "worker_id" : "user_id,device_id";
    const response = await fetch(`${endpoint}/rest/v1/${table}?on_conflict=${conflict}`, {
      body: JSON.stringify(payload),
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
        apikey: serviceKey,
      },
      method: "POST",
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ error: "heartbeat_upsert_failed" }), {
        headers: jsonHeaders,
        status: 502,
      });
    }

    persisted = true;
  }

  return new Response(
    JSON.stringify({
      accepted: true,
      persisted,
      receivedAt,
      type: body.workerId ? "worker" : "device",
    }),
    { headers: jsonHeaders },
  );
});
