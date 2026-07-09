import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const jsonHeaders = { "Content-Type": "application/json" };
const mcpAcceptHeader = "application/json, text/event-stream";
const blockedHostPattern =
  /^(localhost|.*\.localhost|0\.|10\.|127\.|169\.254\.|192\.168\.|metadata\.google\.internal$|\[?::1\]?$)/i;

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

function isPrivateIpv4(hostname) {
  const match = hostname.match(/^172\.(\d+)\./);

  return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
}

function isSafeRemoteHttpUrl(url) {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();

    return (
      (parsedUrl.protocol === "https:" || parsedUrl.protocol === "http:") &&
      !blockedHostPattern.test(hostname) &&
      !isPrivateIpv4(hostname)
    );
  } catch (_error) {
    return false;
  }
}

function isStreamableHttpTransport(body) {
  return body?.transport === "streamable_http";
}

function getCapabilityString(capabilities, keys) {
  for (const key of keys) {
    if (typeof capabilities?.[key] === "string" && capabilities[key].trim()) {
      return capabilities[key].trim();
    }
  }

  return null;
}

function getAllowedTools(capabilities) {
  const tools = Array.isArray(capabilities?.allowedTools)
    ? capabilities.allowedTools
    : capabilities?.approvedTools;

  return Array.isArray(tools)
    ? tools.filter((tool) => typeof tool === "string" && tool.trim())
    : [];
}

async function resolveConfiguredMcpServer(body, userId) {
  const endpoint = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const serverId = String(body.serverId || body.sourceKey || "").trim();

  if (!serverId) {
    return { error: "missing_mcp_server_id", status: 400 };
  }

  if (!endpoint || !serviceKey) {
    return { error: "mcp_catalog_not_configured", status: 503 };
  }

  const userFilter = encodeURIComponent(userId);
  const response = await fetch(
    `${endpoint}/rest/v1/integration_sources?select=id,source_key,capabilities&source_type=eq.mcp&enabled=eq.true&user_id=eq.${userFilter}&limit=50`,
    {
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
    },
  );

  if (!response.ok) {
    return { error: "mcp_catalog_lookup_failed", status: 502 };
  }

  const sources = await response.json().catch(() => []);
  const source = sources.find(
    (item) => item?.id === serverId || item?.source_key === serverId,
  );
  const capabilities = source?.capabilities || {};
  const serverUrl = getCapabilityString(capabilities, ["serverUrl", "url"]);
  const allowedTools = getAllowedTools(capabilities);

  if (!source || !serverUrl) {
    return { error: "mcp_server_not_configured", status: 404 };
  }

  if (body.serverUrl && body.serverUrl !== serverUrl) {
    return { error: "mcp_server_mismatch", status: 403 };
  }

  if (!isSafeRemoteHttpUrl(serverUrl)) {
    return { error: "remote_http_required", status: 400 };
  }

  return {
    allowedTools,
    error: null,
    serverUrl,
    sourceId: source.id,
    sourceKey: source.source_key,
    status: 200,
  };
}

function buildMcpRequest(body, allowedTools = []) {
  const id = body.requestId || crypto.randomUUID();

  if (body.action === "list_tools") {
    return {
      id,
      jsonrpc: "2.0",
      method: "tools/list",
      params: {},
    };
  }

  if (typeof body.toolName !== "string" || body.toolName.trim() === "") {
    return null;
  }

  if (!allowedTools.includes(body.toolName)) {
    return { error: "mcp_tool_not_allowed" };
  }

  return {
    id,
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      arguments: body.arguments || {},
      name: body.toolName,
    },
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

  if (body?.userId && body.userId !== auth.userId) {
    return new Response(JSON.stringify({ error: "user_mismatch" }), {
      headers: jsonHeaders,
      status: 403,
    });
  }

  if (!body || !isStreamableHttpTransport(body)) {
    return new Response(JSON.stringify({ error: "remote_http_required" }), {
      headers: jsonHeaders,
      status: 400,
    });
  }

  const configuredServer = await resolveConfiguredMcpServer(body, auth.userId);

  if (configuredServer.error) {
    return new Response(JSON.stringify({ error: configuredServer.error }), {
      headers: jsonHeaders,
      status: configuredServer.status,
    });
  }

  const mcpRequest = buildMcpRequest(body, configuredServer.allowedTools);

  if (!mcpRequest) {
    return new Response(JSON.stringify({ error: "missing_tool_name" }), {
      headers: jsonHeaders,
      status: 400,
    });
  }

  if (mcpRequest.error) {
    return new Response(JSON.stringify({ error: mcpRequest.error }), {
      headers: jsonHeaders,
      status: 403,
    });
  }

  const mcpResponse = await fetch(configuredServer.serverUrl, {
    body: JSON.stringify(mcpRequest),
    headers: {
      Accept: mcpAcceptHeader,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const contentType = mcpResponse.headers.get("content-type") || "";
  const responseBody = contentType.includes("application/json")
    ? await mcpResponse.json().catch(() => null)
    : await mcpResponse.text().catch(() => "");

  if (!mcpResponse.ok) {
    return new Response(
      JSON.stringify({
        error: "mcp_request_failed",
        result: responseBody,
      }),
      { headers: jsonHeaders, status: 502 },
    );
  }

  return new Response(
    JSON.stringify({
      accepted: true,
      action: body.action === "list_tools" ? "list_tools" : "call_tool",
      result: responseBody,
      serverId: configuredServer.sourceId,
      sourceKey: configuredServer.sourceKey,
      transport: "streamable_http",
    }),
    { headers: jsonHeaders },
  );
});
