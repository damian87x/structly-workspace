import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const jsonHeaders = { "Content-Type": "application/json" };
const signatureHeaders = [
  "webhook-signature",
  "composio-signature",
  "x-composio-signature",
  "svix-signature",
];

function getHeader(request, names) {
  for (const name of names) {
    const value = request.headers.get(name);

    if (value) {
      return value;
    }
  }

  return null;
}

function getSignature(request) {
  return getHeader(request, signatureHeaders);
}

function getReplayTimestamp(request) {
  return getHeader(request, [
    "webhook-timestamp",
    "composio-timestamp",
    "svix-timestamp",
  ]);
}

function getWebhookId(request) {
  return getHeader(request, ["webhook-id", "svix-id"]);
}

function timestampIsFresh(raw) {
  const timestamp = Number(raw);

  if (!Number.isFinite(timestamp)) {
    return false;
  }

  const eventMs = timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1000;
  return Math.abs(Date.now() - eventMs) <= 300_000;
}

function normalizeSignature(signature) {
  if (!signature) {
    return null;
  }

  if (signature.includes(",")) {
    return signature.split(",").pop().trim();
  }

  if (signature.includes("=")) {
    return signature.split("=").pop().trim();
  }

  return signature.trim();
}

function constantTimeEqual(left, right) {
  if (!left || !right || left.length !== right.length) {
    return false;
  }

  let diff = 0;

  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return diff === 0;
}

async function hmacSha256Base64(secret, value) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));

  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

async function verifyWebhookSignature(request, rawBody) {
  const signature = getSignature(request);
  const timestamp = getReplayTimestamp(request);
  const secret = Deno.env.get("COMPOSIO_WEBHOOK_SECRET");

  if (!signature || !timestamp || !timestampIsFresh(timestamp)) {
    return false;
  }

  if (!secret) {
    return true;
  }

  const webhookId = getWebhookId(request);

  if (!webhookId) {
    return false;
  }

  const expected = await hmacSha256Base64(
    secret,
    `${webhookId}.${timestamp}.${rawBody}`,
  );
  const received = normalizeSignature(signature);

  return constantTimeEqual(expected, received);
}

function getEventKey(payload) {
  return payload?.id || payload?.event_id || payload?.eventId;
}

function getUserId(payload) {
  return (
    payload?.metadata?.user_id ||
    payload?.metadata?.userId ||
    payload?.user_id ||
    payload?.userId
  );
}

function getStructlyTriggerId(payload) {
  return (
    payload?.structly_trigger_id ||
    payload?.structlyTriggerId ||
    payload?.triggerDefinitionId ||
    null
  );
}

function getSource(payload) {
  const toolkit =
    payload?.toolkit ||
    payload?.toolkit_slug ||
    payload?.metadata?.toolkit ||
    payload?.metadata?.trigger_slug;

  return toolkit ? `composio:${toolkit}` : "composio";
}

serve(async (request) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      headers: jsonHeaders,
      status: 405,
    });
  }

  const rawBody = await request.text();

  if (!(await verifyWebhookSignature(request, rawBody))) {
    return new Response(JSON.stringify({ error: "invalid_signature" }), {
      headers: jsonHeaders,
      status: 401,
    });
  }

  const payload = JSON.parse(rawBody || "null");
  const eventKey = getEventKey(payload);

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
    const source = getSource(payload);
    const userId = getUserId(payload);
    const triggerId = getStructlyTriggerId(payload);
    const response = await fetch(`${endpoint}/rest/v1/integration_events`, {
      body: JSON.stringify({
        event_key: eventKey,
        event_type: payload?.event_type || payload?.type || "composio_event",
        payload,
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

    if (!response.ok && response.status !== 409) {
      return new Response(JSON.stringify({ error: "event_insert_failed" }), {
        headers: jsonHeaders,
        status: 502,
      });
    }

    if (triggerId) {
      const runResponse = await fetch(
        `${endpoint}/rest/v1/trigger_runs?on_conflict=trigger_id,idempotency_key`,
        {
          body: JSON.stringify({
            idempotency_key: `${source}:${eventKey}`,
            status: "queued",
            trigger_id: triggerId,
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
