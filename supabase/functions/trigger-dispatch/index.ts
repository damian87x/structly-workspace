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

function getIdempotencyKey(body) {
  const source = typeof body.source === "string" ? body.source.trim() : "";
  const eventKey =
    typeof body.eventKey === "string" ? body.eventKey.trim() : "";

  return source && eventKey ? `${source}:${eventKey}` : null;
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
  const idempotencyKey = body ? getIdempotencyKey(body) : null;

  if (!idempotencyKey) {
    return new Response(JSON.stringify({ error: "missing_event_key" }), {
      headers: jsonHeaders,
      status: 400,
    });
  }

  if (!body.userId || !body.triggerId) {
    return new Response(JSON.stringify({ error: "missing_trigger_scope" }), {
      headers: jsonHeaders,
      status: 400,
    });
  }

  if (body.userId !== auth.userId) {
    return new Response(JSON.stringify({ error: "user_mismatch" }), {
      headers: jsonHeaders,
      status: 403,
    });
  }

  const endpoint = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  let persisted = false;

  if (endpoint && serviceKey) {
    const eventResponse = await fetch(`${endpoint}/rest/v1/integration_events`, {
      body: JSON.stringify({
        event_key: body.eventKey,
        event_type: body.eventType || "manual",
        payload: body.payload || {},
        source: body.source,
        user_id: body.userId,
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
          status: body.action ? "approval_required" : "queued",
          trigger_id: body.triggerId,
          user_id: body.userId,
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

    persisted = true;
  }

  return new Response(
    JSON.stringify({
      idempotencyKey,
      persisted,
      queued: true,
      status: "queued",
    }),
    { headers: jsonHeaders },
  );
});
