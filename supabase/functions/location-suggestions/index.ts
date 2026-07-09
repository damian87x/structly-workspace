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

function roundCoordinate(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value * 100) / 100
    : null;
}

function createCoarseLocation(coords) {
  const latitude = roundCoordinate(coords?.latitude);
  const longitude = roundCoordinate(coords?.longitude);

  if (latitude === null || longitude === null) {
    return null;
  }

  return { accuracy: "coarse", latitude, longitude };
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
  const coarseLocation = createCoarseLocation(body?.coords);
  const userId = body?.userId || auth.userId;

  if (body?.userId && body.userId !== auth.userId) {
    return new Response(JSON.stringify({ error: "user_mismatch" }), {
      headers: jsonHeaders,
      status: 403,
    });
  }

  if (!userId || !body?.deviceId || !body?.triggerId || !coarseLocation) {
    return new Response(JSON.stringify({ error: "missing_location_scope" }), {
      headers: jsonHeaders,
      status: 400,
    });
  }

  const observedAt = body.observedAt || new Date().toISOString();
  const eventKey = `${body.deviceId}:${body.placeId || "unknown"}:${observedAt}`;
  const source = "location:coarse";
  const idempotencyKey = `${source}:${eventKey}`;
  const suggestion = {
    confidence: body.receiptCount > 0 ? "medium" : "low",
    suggestedAction: "review_receipt_context",
  };
  const endpoint = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  let persisted = false;

  if (endpoint && serviceKey) {
    const response = await fetch(
      `${endpoint}/rest/v1/location_event_suggestions?on_conflict=user_id,event_key`,
      {
        body: JSON.stringify({
          coarse_location: coarseLocation,
          event_key: eventKey,
          event_type: body.eventType || "location_visit",
          place_id: body.placeId || null,
          place_label: body.placeLabel || null,
          suggestion,
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

    if (!response.ok && response.status !== 409) {
      return new Response(JSON.stringify({ error: "suggestion_upsert_failed" }), {
        headers: jsonHeaders,
        status: 502,
      });
    }

    const eventResponse = await fetch(`${endpoint}/rest/v1/integration_events`, {
      body: JSON.stringify({
        event_key: eventKey,
        event_type: body.eventType || "location_visit",
        payload: {
          coarseLocation,
          deviceId: body.deviceId,
          placeId: body.placeId || null,
          placeLabel: body.placeLabel || null,
          suggestion,
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
          status: "queued",
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

    persisted = true;
  }

  return new Response(
    JSON.stringify({
      eventKey,
      persisted,
      suggestion,
    }),
    { headers: jsonHeaders },
  );
});
