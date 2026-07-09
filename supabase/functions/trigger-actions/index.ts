import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const jsonHeaders = { "Content-Type": "application/json" };
const allowedActions = new Set(["create", "delete", "pause", "resume", "update"]);
const allowedPatchKeys = new Set([
  "displayName",
  "name",
  "source",
  "status",
  "triggerType",
  "trigger_type",
  "type",
]);

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

function sanitizePatch(patch = {}) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(patch).filter(([key]) => allowedPatchKeys.has(key)),
  );
}

function buildCreatePayload({ body, userId }) {
  const patch = sanitizePatch(body.patch);

  return {
    approval_required: true,
    name: patch.name || patch.displayName || "Receipt follow-up",
    source: patch.source || "backend_catalog",
    status: "active",
    trigger_type: patch.trigger_type || patch.triggerType || patch.type || "receipt_reviewed",
    user_id: userId,
  };
}

function buildUpdatePayload({ action, body }) {
  if (action === "pause") {
    return { status: "paused" };
  }

  if (action === "resume") {
    return { status: "active" };
  }

  if (action === "delete") {
    return { status: "deleted" };
  }

  const patch = sanitizePatch(body.patch);
  const payload = {
    name: patch.name || patch.displayName,
    source: patch.source,
    status: patch.status,
    trigger_type: patch.trigger_type || patch.triggerType || patch.type,
  };

  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  );
}

function mapTrigger(row = {}) {
  return {
    id: row.id,
    name: row.name,
    source: row.source,
    status: row.status,
    type: row.trigger_type,
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
    return new Response(JSON.stringify({ error: "invalid_trigger_action" }), {
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

  const headers = {
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
    apikey: serviceKey,
  };

  if (action === "create") {
    const response = await fetch(`${endpoint}/rest/v1/trigger_definitions`, {
      body: JSON.stringify(buildCreatePayload({ body, userId: auth.userId })),
      headers,
      method: "POST",
    });
    const rows = await response.json().catch(() => []);

    if (!response.ok) {
      return new Response(JSON.stringify({ error: "trigger_create_failed" }), {
        headers: jsonHeaders,
        status: 502,
      });
    }

    return new Response(
      JSON.stringify({
        action,
        trigger: mapTrigger(rows[0]),
      }),
      { headers: jsonHeaders },
    );
  }

  if (!body?.triggerId) {
    return new Response(JSON.stringify({ error: "missing_trigger_id" }), {
      headers: jsonHeaders,
      status: 400,
    });
  }

  const payload = buildUpdatePayload({ action, body });

  if (Object.keys(payload).length === 0) {
    return new Response(JSON.stringify({ error: "empty_trigger_patch" }), {
      headers: jsonHeaders,
      status: 400,
    });
  }

  const triggerFilter = encodeURIComponent(body.triggerId);
  const userFilter = encodeURIComponent(auth.userId);
  const response = await fetch(
    `${endpoint}/rest/v1/trigger_definitions?id=eq.${triggerFilter}&user_id=eq.${userFilter}`,
    {
      body: JSON.stringify({
        ...payload,
        updated_at: new Date().toISOString(),
      }),
      headers,
      method: "PATCH",
    },
  );
  const rows = await response.json().catch(() => []);

  if (!response.ok) {
    return new Response(JSON.stringify({ error: "trigger_update_failed" }), {
      headers: jsonHeaders,
      status: 502,
    });
  }

  if (rows.length === 0) {
    return new Response(JSON.stringify({ error: "trigger_not_found" }), {
      headers: jsonHeaders,
      status: 404,
    });
  }

  return new Response(
    JSON.stringify({
      action,
      trigger: mapTrigger(rows[0]),
    }),
    { headers: jsonHeaders },
  );
});
