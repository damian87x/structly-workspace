import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const jsonHeaders = { "Content-Type": "application/json" };

function hasUserAuth(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  return authorization.toLowerCase().startsWith("bearer ");
}

function isRemoteHttpTransport(body: Record<string, unknown>) {
  return (
    body.transport === "streamable_http" &&
    typeof body.serverUrl === "string" &&
    /^https?:\/\//.test(body.serverUrl)
  );
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

  if (!body || !isRemoteHttpTransport(body)) {
    return new Response(JSON.stringify({ error: "remote_http_required" }), {
      headers: jsonHeaders,
      status: 400,
    });
  }

  return new Response(
    JSON.stringify({
      accepted: true,
      transport: "streamable_http",
    }),
    { headers: jsonHeaders },
  );
});
