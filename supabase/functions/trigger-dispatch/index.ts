import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const jsonHeaders = { "Content-Type": "application/json" };

function hasUserAuth(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  return authorization.toLowerCase().startsWith("bearer ");
}

function getIdempotencyKey(body: Record<string, unknown>) {
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

  if (!hasUserAuth(request)) {
    return new Response(JSON.stringify({ error: "missing_auth" }), {
      headers: jsonHeaders,
      status: 401,
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
