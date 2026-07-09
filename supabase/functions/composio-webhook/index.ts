import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const jsonHeaders = { "Content-Type": "application/json" };
const signatureHeaders = [
  "composio-signature",
  "x-composio-signature",
  "svix-signature",
];

function hasSignature(request: Request) {
  return signatureHeaders.some((name) => request.headers.has(name));
}

function hasReplayTimestamp(request: Request) {
  return (
    request.headers.has("composio-timestamp") ||
    request.headers.has("svix-timestamp")
  );
}

function timestampIsFresh(request: Request) {
  const raw =
    request.headers.get("composio-timestamp") ||
    request.headers.get("svix-timestamp");
  const timestamp = Number(raw);

  if (!Number.isFinite(timestamp)) {
    return false;
  }

  const eventMs = timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1000;
  return Math.abs(Date.now() - eventMs) <= 300_000;
}

serve(async (request) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      headers: jsonHeaders,
      status: 405,
    });
  }

  if (!hasSignature(request) || !hasReplayTimestamp(request) || !timestampIsFresh(request)) {
    return new Response(JSON.stringify({ error: "invalid_signature" }), {
      headers: jsonHeaders,
      status: 401,
    });
  }

  const payload = await request.json().catch(() => null);
  const eventKey = payload?.id || payload?.event_id || payload?.eventId;

  if (!eventKey) {
    return new Response(JSON.stringify({ error: "missing_event_key" }), {
      headers: jsonHeaders,
      status: 400,
    });
  }

  const endpoint = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  let persisted = false;

  if (endpoint && serviceKey) {
    const source = payload?.toolkit ? `composio:${payload.toolkit}` : "composio";
    const response = await fetch(`${endpoint}/rest/v1/integration_events`, {
      body: JSON.stringify({
        event_key: eventKey,
        event_type: payload?.event_type || "composio_event",
        payload,
        source,
        user_id: payload?.user_id || payload?.userId,
      }),
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "resolution=ignore-duplicates",
        apikey: serviceKey,
      },
      method: "POST",
    });

    if (!response.ok && response.status !== 409) {
      return new Response(JSON.stringify({ error: "event_insert_failed" }), {
        headers: jsonHeaders,
        status: 502,
      });
    }

    persisted = true;
  }

  return new Response(
    JSON.stringify({
      accepted: true,
      eventKey,
      persisted,
      provider: "composio",
    }),
    { headers: jsonHeaders },
  );
});
