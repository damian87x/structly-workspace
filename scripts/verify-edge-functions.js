const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const vm = require("vm");

const EDGE_IMPORT =
  'import { serve } from "https://deno.land/std@0.224.0/http/server.ts";';
const DEFAULT_ENV = {
  DAYTONA_API_KEY: "daytona-key",
  SCHEDULE_JOBS_TOKEN: "schedule-token",
  SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-key",
  SUPABASE_URL: "https://project.supabase.co",
  WORKER_HEARTBEAT_TOKEN: "worker-heartbeat-token",
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

function loadEdgeHandler(path, { env = DEFAULT_ENV, fetchImpl } = {}) {
  const source = fs.readFileSync(path, "utf8").replace(EDGE_IMPORT, "");
  let handler = null;
  const sandbox = {
    console,
    crypto: {
      randomUUID: crypto.randomUUID,
      subtle: crypto.webcrypto.subtle,
    },
    Deno: {
      env: {
        get(name) {
          return env[name] || null;
        },
      },
    },
    fetch: fetchImpl,
    Request,
    Response,
    TextEncoder,
    URL,
    btoa,
    serve(nextHandler) {
      handler = nextHandler;
    },
  };

  vm.runInNewContext(source, sandbox, { filename: path });
  assert.equal(typeof handler, "function");

  return handler;
}

function signComposioPayload({ body, secret, timestamp, webhookId }) {
  return `v1,${crypto
    .createHmac("sha256", secret)
    .update(`${webhookId}.${timestamp}.${body}`)
    .digest("base64")}`;
}

function createJsonRequest({ body, headers = {}, method = "POST" } = {}) {
  return new Request("https://edge.example.test", {
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    method,
  });
}

async function readJson(response) {
  return {
    data: await response.json(),
    status: response.status,
  };
}

function parseBody(options) {
  return JSON.parse(options.body || "{}");
}

function createAuthedFetch({ calls = [], userId = "user-1", restResponses = {} } = {}) {
  return async (url, options = {}) => {
    const requestUrl = String(url);

    if (requestUrl.endsWith("/auth/v1/user")) {
      return options.headers?.Authorization === "Bearer user-token"
        ? jsonResponse({ id: userId })
        : jsonResponse({ error: "invalid" }, 401);
    }

    calls.push({
      body: parseBody(options),
      method: options.method || "GET",
      url: requestUrl,
    });

    const response = Object.entries(restResponses).find(([pattern]) =>
      requestUrl.includes(pattern),
    );

    return jsonResponse(response ? response[1] : []);
  };
}

async function verifyScheduleJobsFunction() {
  const calls = [];
  const handler = loadEdgeHandler("supabase/functions/schedule-jobs/index.ts", {
    fetchImpl: async (url, options = {}) => {
      calls.push({
        body: parseBody(options),
        url: String(url),
      });
      return jsonResponse([]);
    },
  });

  const rejected = await readJson(
    await handler(
      createJsonRequest({
        body: {
          eventKey: "tick-1",
          source: "schedule:daily",
          triggerId: "trigger-1",
          userId: "user-1",
        },
        headers: { Authorization: "Bearer user-token" },
      }),
    ),
  );

  assert.equal(rejected.status, 401);
  assert.equal(calls.length, 0);

  const accepted = await readJson(
    await handler(
      createJsonRequest({
        body: {
          eventKey: "tick-1",
          source: "schedule:daily",
          triggerId: "trigger-1",
          userId: "user-1",
        },
        headers: { Authorization: "Bearer schedule-token" },
      }),
    ),
  );

  assert.equal(accepted.status, 200);
  assert.equal(accepted.data.idempotencyKey, "schedule:daily:tick-1");
  assert.ok(calls.some((call) => call.url.includes("/integration_events")));
  assert.ok(calls.some((call) => call.url.includes("/trigger_runs")));
  assert.ok(calls.every((call) => call.body.user_id === "user-1"));
}

async function verifyMobileSyncFunction() {
  const calls = [];
  const handler = loadEdgeHandler("supabase/functions/mobile-sync/index.ts", {
    fetchImpl: createAuthedFetch({
      calls,
      restResponses: {
        "code_execution_requests": [
          { id: "code-1", language: "typescript", status: "approval_required" },
        ],
        "integration_sources": [{ id: "source-1", source_key: "composio" }],
        "location_event_suggestions": [
          { id: "location-1", place_label: "Soho Market" },
        ],
        "schedule_jobs": [{ id: "schedule-1", status: "active" }],
        "trigger_definitions": [
          { id: "trigger-1", name: "Receipt follow-up", user_id: "user-1" },
        ],
        "trigger_runs": [
          { id: "run-1", status: "approval_required", user_id: "user-1" },
        ],
      },
    }),
  });

  const rejected = await readJson(
    await handler(
      createJsonRequest({
        headers: { Authorization: "Bearer invalid-token" },
      }),
    ),
  );

  assert.equal(rejected.status, 401);
  assert.equal(calls.length, 0);

  const accepted = await readJson(
    await handler(
      createJsonRequest({
        headers: { Authorization: "Bearer user-token" },
      }),
    ),
  );
  const restCalls = calls.filter((call) => call.url.includes("/rest/v1/"));

  assert.equal(accepted.status, 200);
  assert.equal(accepted.data.codeExecutionRequests.length, 1);
  assert.equal(accepted.data.connectors.length, 1);
  assert.equal(accepted.data.locationSuggestions.length, 1);
  assert.equal(accepted.data.triggerDefinitions.length, 1);
  assert.equal(accepted.data.runHistory.length, 1);
  assert.equal(accepted.data.scheduleJobs.length, 1);
  assert.ok(restCalls.some((call) => call.url.includes("/code_execution_requests")));
  assert.ok(restCalls.some((call) => call.url.includes("/integration_sources")));
  assert.ok(restCalls.some((call) => call.url.includes("/location_event_suggestions")));
  assert.ok(restCalls.some((call) => call.url.includes("/schedule_jobs")));
  assert.ok(restCalls.some((call) => call.url.includes("/trigger_definitions")));
  assert.ok(restCalls.some((call) => call.url.includes("/trigger_runs")));
  assert.ok(restCalls.every((call) => call.url.includes("user_id=eq.user-1")));
}

async function verifyHeartbeatIngestFunction() {
  const calls = [];
  const handler = loadEdgeHandler("supabase/functions/heartbeat-ingest/index.ts", {
    fetchImpl: createAuthedFetch({ calls }),
  });

  const rejected = await readJson(
    await handler(
      createJsonRequest({
        body: {
          deviceId: "pixel-1",
          platform: "android",
          userId: "user-1",
        },
        headers: { Authorization: "Bearer invalid-token" },
      }),
    ),
  );

  assert.equal(rejected.status, 401);
  assert.equal(calls.length, 0);

  const mismatch = await readJson(
    await handler(
      createJsonRequest({
        body: {
          deviceId: "pixel-1",
          platform: "android",
          userId: "user-2",
        },
        headers: { Authorization: "Bearer user-token" },
      }),
    ),
  );

  assert.equal(mismatch.status, 403);
  assert.equal(mismatch.data.error, "user_mismatch");
  assert.equal(calls.length, 0);

  const accepted = await readJson(
    await handler(
      createJsonRequest({
        body: {
          appState: "active",
          capabilities: { device: "Pixel" },
          deviceId: "pixel-1",
          platform: "android",
          userId: "user-1",
        },
        headers: { Authorization: "Bearer user-token" },
      }),
    ),
  );
  const heartbeatCall = calls.find((call) =>
    call.url.includes("/device_heartbeats"),
  );

  assert.equal(accepted.status, 200);
  assert.equal(accepted.data.type, "device");
  assert.equal(accepted.data.persisted, true);
  assert.ok(heartbeatCall);
  assert.equal(heartbeatCall.body.user_id, "user-1");
  assert.equal(heartbeatCall.body.device_id, "pixel-1");
  assert.equal(heartbeatCall.body.capabilities.device, "Pixel");

  const rejectedWorker = await readJson(
    await handler(
      createJsonRequest({
        body: {
          metadata: { queue: "triggers" },
          workerId: "worker-1",
          workerType: "supabase-edge",
        },
        headers: { Authorization: "Bearer user-token" },
      }),
    ),
  );

  assert.equal(rejectedWorker.status, 401);
  assert.equal(rejectedWorker.data.error, "missing_worker_auth");

  const acceptedWorker = await readJson(
    await handler(
      createJsonRequest({
        body: {
          metadata: { queue: "triggers" },
          workerId: "worker-1",
          workerType: "supabase-edge",
        },
        headers: { Authorization: "Bearer worker-heartbeat-token" },
      }),
    ),
  );
  const workerCall = calls.find((call) =>
    call.url.includes("/worker_heartbeats"),
  );

  assert.equal(acceptedWorker.status, 200);
  assert.equal(acceptedWorker.data.type, "worker");
  assert.equal(acceptedWorker.data.persisted, true);
  assert.ok(workerCall);
  assert.equal(workerCall.body.worker_id, "worker-1");
  assert.equal(workerCall.body.worker_type, "supabase-edge");
  assert.equal(workerCall.body.metadata.queue, "triggers");
  assert.equal(workerCall.body.user_id, undefined);
}

async function verifyTriggerActionsFunction() {
  const calls = [];
  const handler = loadEdgeHandler("supabase/functions/trigger-actions/index.ts", {
    fetchImpl: async (url, options = {}) => {
      const requestUrl = String(url);

      if (requestUrl.endsWith("/auth/v1/user")) {
        return options.headers?.Authorization === "Bearer user-token"
          ? jsonResponse({ id: "user-1" })
          : jsonResponse({ error: "invalid" }, 401);
      }

      const body = parseBody(options);

      calls.push({
        body,
        headers: options.headers || {},
        method: options.method || "GET",
        url: requestUrl,
      });

      if (requestUrl.includes("/trigger_definitions")) {
        return jsonResponse([
          {
            id: body.id || "trigger-1",
            name: body.name || "Receipt follow-up",
            source: body.source || "backend_catalog",
            status: body.status || "active",
            trigger_type: body.trigger_type || "receipt_reviewed",
            user_id: body.user_id || "user-1",
          },
        ]);
      }

      return jsonResponse([]);
    },
  });

  const rejected = await readJson(
    await handler(
      createJsonRequest({
        body: { action: "create" },
        headers: { Authorization: "Bearer invalid-token" },
      }),
    ),
  );

  assert.equal(rejected.status, 401);
  assert.equal(calls.length, 0);

  const mismatch = await readJson(
    await handler(
      createJsonRequest({
        body: {
          action: "create",
          userId: "user-2",
        },
        headers: { Authorization: "Bearer user-token" },
      }),
    ),
  );

  assert.equal(mismatch.status, 403);
  assert.equal(mismatch.data.error, "user_mismatch");
  assert.equal(calls.length, 0);

  const created = await readJson(
    await handler(
      createJsonRequest({
        body: {
          action: "create",
          patch: {
            name: "Receipt follow-up",
            source: "backend_catalog",
            token: "must-not-persist",
            type: "receipt_reviewed",
          },
          userId: "user-1",
        },
        headers: { Authorization: "Bearer user-token" },
      }),
    ),
  );
  const createCall = calls.find((call) => call.method === "POST");

  assert.equal(created.status, 200);
  assert.equal(created.data.trigger.id, "trigger-1");
  assert.ok(createCall.url.includes("/trigger_definitions"));
  assert.equal(createCall.headers.Authorization, "Bearer service-key");
  assert.equal(createCall.body.user_id, "user-1");
  assert.equal(createCall.body.name, "Receipt follow-up");
  assert.equal(createCall.body.status, "active");
  assert.equal(createCall.body.token, undefined);

  const paused = await readJson(
    await handler(
      createJsonRequest({
        body: {
          action: "pause",
          triggerId: "trigger-1",
          userId: "user-1",
        },
        headers: { Authorization: "Bearer user-token" },
      }),
    ),
  );
  const patchCall = calls.find((call) => call.method === "PATCH");

  assert.equal(paused.status, 200);
  assert.ok(patchCall.url.includes("id=eq.trigger-1"));
  assert.ok(patchCall.url.includes("user_id=eq.user-1"));
  assert.equal(patchCall.body.status, "paused");
}

async function verifyRunActionsFunction() {
  const calls = [];
  const handler = loadEdgeHandler("supabase/functions/run-actions/index.ts", {
    fetchImpl: async (url, options = {}) => {
      const requestUrl = String(url);

      if (requestUrl.endsWith("/auth/v1/user")) {
        return options.headers?.Authorization === "Bearer user-token"
          ? jsonResponse({ id: "user-1" })
          : jsonResponse({ error: "invalid" }, 401);
      }

      const body = parseBody(options);

      calls.push({
        body,
        headers: options.headers || {},
        method: options.method || "GET",
        url: requestUrl,
      });

      if (requestUrl.includes("/trigger_runs")) {
        return jsonResponse([
          {
            id: "run-1",
            status: body.status,
            trigger_id: "trigger-1",
            updated_at: "2026-07-09T12:00:00.000Z",
            user_id: "user-1",
          },
        ]);
      }

      return jsonResponse([]);
    },
  });

  const rejected = await readJson(
    await handler(
      createJsonRequest({
        body: { action: "approve", runId: "run-1" },
        headers: { Authorization: "Bearer invalid-token" },
      }),
    ),
  );

  assert.equal(rejected.status, 401);
  assert.equal(calls.length, 0);

  const mismatch = await readJson(
    await handler(
      createJsonRequest({
        body: {
          action: "approve",
          runId: "run-1",
          userId: "user-2",
        },
        headers: { Authorization: "Bearer user-token" },
      }),
    ),
  );

  assert.equal(mismatch.status, 403);
  assert.equal(mismatch.data.error, "user_mismatch");
  assert.equal(calls.length, 0);

  const approved = await readJson(
    await handler(
      createJsonRequest({
        body: {
          action: "approve",
          runId: "run-1",
          userId: "user-1",
        },
        headers: { Authorization: "Bearer user-token" },
      }),
    ),
  );
  const approveCall = calls.find((call) => call.method === "PATCH");

  assert.equal(approved.status, 200);
  assert.equal(approved.data.run.status, "queued");
  assert.ok(approveCall.url.includes("id=eq.run-1"));
  assert.ok(approveCall.url.includes("user_id=eq.user-1"));
  assert.ok(approveCall.url.includes("status=eq.approval_required"));
  assert.equal(approveCall.headers.Authorization, "Bearer service-key");
  assert.equal(approveCall.body.status, "queued");
  assert.equal(approveCall.body.result.externalActionReady, true);

  const denied = await readJson(
    await handler(
      createJsonRequest({
        body: {
          action: "deny",
          runId: "run-1",
          userId: "user-1",
        },
        headers: { Authorization: "Bearer user-token" },
      }),
    ),
  );
  const denyCall = calls.find((call) => call.body.status === "denied");

  assert.equal(denied.status, 200);
  assert.equal(denyCall.body.result.externalActionReady, false);
}

async function verifyLocationSuggestionsFunction() {
  const calls = [];
  const handler = loadEdgeHandler(
    "supabase/functions/location-suggestions/index.ts",
    {
      fetchImpl: createAuthedFetch({ calls }),
    },
  );

  const mismatch = await readJson(
    await handler(
      createJsonRequest({
        body: {
          coords: { latitude: 51.507351, longitude: -0.127758 },
          deviceId: "pixel-1",
          triggerId: "location-trigger",
          userId: "user-2",
        },
        headers: { Authorization: "Bearer user-token" },
      }),
    ),
  );

  assert.equal(mismatch.status, 403);
  assert.equal(mismatch.data.error, "user_mismatch");
  assert.equal(calls.length, 0);

  const accepted = await readJson(
    await handler(
      createJsonRequest({
        body: {
          coords: { latitude: 51.507351, longitude: -0.127758 },
          deviceId: "pixel-1",
          observedAt: "2026-07-09T12:00:00.000Z",
          placeId: "soho-market",
          placeLabel: "Soho Market",
          receiptCount: 2,
          triggerId: "location-trigger",
          userId: "user-1",
        },
        headers: { Authorization: "Bearer user-token" },
      }),
    ),
  );

  assert.equal(accepted.status, 200);
  assert.ok(calls.some((call) => call.url.includes("/location_event_suggestions")));
  assert.ok(calls.some((call) => call.url.includes("/integration_events")));
  assert.ok(calls.some((call) => call.url.includes("/trigger_runs")));
  assert.ok(calls.every((call) => call.body.user_id === "user-1"));

  const eventCall = calls.find((call) => call.url.includes("/integration_events"));
  assert.deepEqual(eventCall.body.payload.coarseLocation, {
    accuracy: "coarse",
    latitude: 51.51,
    longitude: -0.13,
  });
  assert.equal("preciseLocation" in eventCall.body.payload, false);
}

async function verifyMcpBridgeFunction() {
  const catalogCalls = [];
  const remoteCalls = [];
  const handler = loadEdgeHandler("supabase/functions/mcp-bridge/index.ts", {
    fetchImpl: async (url, options = {}) => {
      const requestUrl = String(url);

      if (requestUrl.endsWith("/auth/v1/user")) {
        return options.headers?.Authorization === "Bearer user-token"
          ? jsonResponse({ id: "user-1" })
          : jsonResponse({ error: "invalid" }, 401);
      }

      if (requestUrl.includes("/rest/v1/integration_sources")) {
        catalogCalls.push({
          headers: options.headers || {},
          method: options.method || "GET",
          url: requestUrl,
        });

        return jsonResponse([
          {
            capabilities: {
              allowedTools: ["append_receipt"],
              serverUrl: "https://mcp.example.test/mcp",
            },
            id: "mcp-source-1",
            source_key: "mcp-receipts",
          },
          {
            capabilities: {
              allowedTools: ["unsafe"],
              serverUrl: "http://127.0.0.1:8787/mcp",
            },
            id: "mcp-source-local",
            source_key: "mcp-local",
          },
        ]);
      }

      remoteCalls.push({
        body: parseBody(options),
        headers: options.headers || {},
        method: options.method || "GET",
        url: requestUrl,
      });

      return jsonResponse({
        id: remoteCalls[remoteCalls.length - 1].body.id,
        jsonrpc: "2.0",
        result: { content: [{ text: "ok", type: "text" }] },
      });
    },
  });

  const rejected = await readJson(
    await handler(
      createJsonRequest({
        body: {
          action: "list_tools",
          serverId: "mcp-receipts",
          transport: "streamable_http",
        },
        headers: { Authorization: "Bearer invalid-token" },
      }),
    ),
  );

  assert.equal(rejected.status, 401);
  assert.equal(catalogCalls.length, 0);
  assert.equal(remoteCalls.length, 0);

  const mismatch = await readJson(
    await handler(
      createJsonRequest({
        body: {
          action: "list_tools",
          serverId: "mcp-receipts",
          transport: "streamable_http",
          userId: "user-2",
        },
        headers: { Authorization: "Bearer user-token" },
      }),
    ),
  );

  assert.equal(mismatch.status, 403);
  assert.equal(mismatch.data.error, "user_mismatch");
  assert.equal(catalogCalls.length, 0);
  assert.equal(remoteCalls.length, 0);

  const invalidTransport = await readJson(
    await handler(
      createJsonRequest({
        body: {
          action: "list_tools",
          serverId: "mcp-receipts",
          transport: "stdio",
          userId: "user-1",
        },
        headers: { Authorization: "Bearer user-token" },
      }),
    ),
  );

  assert.equal(invalidTransport.status, 400);
  assert.equal(invalidTransport.data.error, "remote_http_required");
  assert.equal(catalogCalls.length, 0);
  assert.equal(remoteCalls.length, 0);

  const localTarget = await readJson(
    await handler(
      createJsonRequest({
        body: {
          action: "list_tools",
          serverId: "mcp-local",
          transport: "streamable_http",
          userId: "user-1",
        },
        headers: { Authorization: "Bearer user-token" },
      }),
    ),
  );

  assert.equal(localTarget.status, 400);
  assert.equal(localTarget.data.error, "remote_http_required");
  assert.equal(remoteCalls.length, 0);

  const serverMismatch = await readJson(
    await handler(
      createJsonRequest({
        body: {
          action: "list_tools",
          serverId: "mcp-receipts",
          serverUrl: "https://evil.example.test/mcp",
          transport: "streamable_http",
          userId: "user-1",
        },
        headers: { Authorization: "Bearer user-token" },
      }),
    ),
  );

  assert.equal(serverMismatch.status, 403);
  assert.equal(serverMismatch.data.error, "mcp_server_mismatch");
  assert.equal(remoteCalls.length, 0);

  const disallowedTool = await readJson(
    await handler(
      createJsonRequest({
        body: {
          requestId: "mcp-denied-1",
          serverId: "mcp-receipts",
          toolName: "delete_everything",
          transport: "streamable_http",
          userId: "user-1",
        },
        headers: { Authorization: "Bearer user-token" },
      }),
    ),
  );

  assert.equal(disallowedTool.status, 403);
  assert.equal(disallowedTool.data.error, "mcp_tool_not_allowed");
  assert.equal(remoteCalls.length, 0);

  const listed = await readJson(
    await handler(
      createJsonRequest({
        body: {
          action: "list_tools",
          requestId: "mcp-list-1",
          serverId: "mcp-receipts",
          transport: "streamable_http",
          userId: "user-1",
        },
        headers: { Authorization: "Bearer user-token" },
      }),
    ),
  );
  const listCall = remoteCalls.find((call) => call.body.method === "tools/list");

  assert.equal(listed.status, 200);
  assert.equal(listed.data.action, "list_tools");
  assert.equal(listed.data.sourceKey, "mcp-receipts");
  assert.ok(listCall);
  assert.equal(listCall.method, "POST");
  assert.equal(listCall.url, "https://mcp.example.test/mcp");
  assert.equal(listCall.headers.Accept, "application/json, text/event-stream");
  assert.equal(listCall.body.id, "mcp-list-1");
  assert.equal(listCall.body.jsonrpc, "2.0");
  assert.deepEqual(listCall.body.params, {});

  const called = await readJson(
    await handler(
      createJsonRequest({
        body: {
          arguments: { receiptId: "receipt-1" },
          requestId: "mcp-call-1",
          serverId: "mcp-receipts",
          toolName: "append_receipt",
          transport: "streamable_http",
          userId: "user-1",
        },
        headers: { Authorization: "Bearer user-token" },
      }),
    ),
  );
  const toolCall = remoteCalls.find((call) => call.body.method === "tools/call");

  assert.equal(called.status, 200);
  assert.equal(called.data.action, "call_tool");
  assert.ok(toolCall);
  assert.ok(catalogCalls.length >= 4);
  assert.ok(catalogCalls.every((call) => call.url.includes("source_type=eq.mcp")));
  assert.ok(catalogCalls.every((call) => call.url.includes("enabled=eq.true")));
  assert.ok(catalogCalls.every((call) => call.url.includes("user_id=eq.user-1")));
  assert.equal(toolCall.body.id, "mcp-call-1");
  assert.equal(toolCall.body.params.name, "append_receipt");
  assert.deepEqual(toolCall.body.params.arguments, { receiptId: "receipt-1" });
}

async function verifyCodeExecutionFunction() {
  const calls = [];
  const handler = loadEdgeHandler(
    "supabase/functions/code-execution-bridge/index.ts",
    {
      fetchImpl: createAuthedFetch({ calls }),
    },
  );

  const mismatch = await readJson(
    await handler(
      createJsonRequest({
        body: {
          code: "console.log('no')",
          language: "typescript",
          triggerId: "code-trigger",
          userId: "user-2",
        },
        headers: { Authorization: "Bearer user-token" },
      }),
    ),
  );

  assert.equal(mismatch.status, 403);
  assert.equal(mismatch.data.error, "user_mismatch");
  assert.equal(calls.length, 0);

  const accepted = await readJson(
    await handler(
      createJsonRequest({
        body: {
          code: "console.log('ok')",
          environment: {
            API_TOKEN: "must-not-leak",
            NODE_ENV: "test",
          },
          id: "code-1",
          language: "typescript",
          timeoutSeconds: 5,
          triggerId: "code-trigger",
          userId: "user-1",
        },
        headers: { Authorization: "Bearer user-token" },
      }),
    ),
  );

  assert.equal(accepted.status, 202);
  assert.ok(calls.some((call) => call.url.includes("/code_execution_requests")));
  assert.ok(calls.some((call) => call.url.includes("/integration_events")));
  assert.ok(calls.some((call) => call.url.includes("/trigger_runs")));
  assert.ok(calls.every((call) => call.body.user_id === "user-1"));

  const requestCall = calls.find((call) =>
    call.url.includes("/code_execution_requests"),
  );
  assert.deepEqual(requestCall.body.environment, { NODE_ENV: "test" });

  const runCall = calls.find((call) => call.url.includes("/trigger_runs"));
  assert.equal(runCall.body.idempotency_key, "code:daytona:code-1");
  assert.equal(runCall.body.status, "approval_required");
}

async function verifyCodeExecutionRunnerFunction() {
  const calls = [];
  const handler = loadEdgeHandler(
    "supabase/functions/code-execution-runner/index.ts",
    {
      env: {
        ...DEFAULT_ENV,
        CODE_EXECUTION_RUNNER_TOKEN: "runner-token",
        DAYTONA_SANDBOX_ID: "sandbox-1",
      },
      fetchImpl: async (url, options = {}) => {
        const requestUrl = String(url);

        calls.push({
          body: parseBody(options),
          headers: options.headers || {},
          method: options.method || "GET",
          url: requestUrl,
        });

        if (requestUrl.includes("proxy.app.daytona.io")) {
          return jsonResponse({ result: "ok" });
        }

        return jsonResponse({});
      },
    },
  );
  const rejected = await readJson(
    await handler(
      createJsonRequest({
        body: {
          code: "console.log('blocked')",
          language: "typescript",
        },
        headers: { Authorization: "Bearer user-token" },
      }),
    ),
  );

  assert.equal(rejected.status, 401);
  assert.equal(calls.length, 0);

  const accepted = await readJson(
    await handler(
      createJsonRequest({
        body: {
          code: "console.log('ok')",
          environment: {
            API_TOKEN: "must-not-leak",
            NODE_ENV: "test",
          },
          language: "typescript",
          requestId: "code-request-1",
          timeoutSeconds: 5,
        },
        headers: { Authorization: "Bearer runner-token" },
      }),
    ),
  );

  assert.equal(accepted.status, 200);
  assert.equal(accepted.data.status, "succeeded");

  const daytonaCall = calls.find((call) =>
    call.url.includes("/process/code-run"),
  );
  const patchCalls = calls.filter((call) =>
    call.url.includes("/code_execution_requests"),
  );

  assert.ok(daytonaCall);
  assert.equal(daytonaCall.headers.Authorization, "Bearer daytona-key");
  assert.equal(daytonaCall.body.code, "console.log('ok')");
  assert.equal(daytonaCall.body.language, "typescript");
  assert.equal(daytonaCall.body.envs.API_TOKEN, undefined);
  assert.equal(daytonaCall.body.envs.NODE_ENV, "test");
  assert.equal(daytonaCall.body.timeout, 5);
  assert.equal(patchCalls.length, 2);
  assert.equal(patchCalls[0].body.status, "running");
  assert.equal(patchCalls[1].body.status, "succeeded");
}

async function verifyStatusReadFunction() {
  const calls = [];
  const handler = loadEdgeHandler("supabase/functions/status-read/index.ts", {
    fetchImpl: createAuthedFetch({
      calls,
      restResponses: {
        "code_execution_requests": [{ id: "code-1" }],
        "integration_sources": [],
        "location_event_suggestions": [{ id: "location-1" }],
        "schedule_jobs": [{ id: "schedule-1" }],
        "trigger_definitions": [
          { id: "schedule-trigger", source: "schedule" },
          { id: "code-trigger", source: "code:daytona" },
        ],
        "trigger_runs": [{ id: "run-1" }],
        "worker_heartbeats": [{ status: "fresh" }],
      },
    }),
  });

  const result = await readJson(
    await handler(
      createJsonRequest({
        headers: { Authorization: "Bearer user-token" },
        method: "GET",
      }),
    ),
  );

  assert.equal(result.status, 200);
  assert.equal(result.data.backend, "available");
  assert.equal(result.data.bridge, "unavailable");
  assert.equal(result.data.codeExecution, "available");
  assert.equal(result.data.cron, "available");
  assert.equal(result.data.locationSuggestionCount, 1);
  assert.equal(result.data.runCount, 1);

  const userScopedCalls = calls.filter(
    (call) =>
      call.url.includes("/rest/v1/") &&
      !call.url.includes("/worker_heartbeats"),
  );

  assert.ok(userScopedCalls.length > 0);
  assert.ok(
    userScopedCalls.every((call) => call.url.includes("user_id=eq.user-1")),
  );
}

async function verifyComposioWebhookFunction() {
  const calls = [];
  const secret = "composio-secret";
  const handler = loadEdgeHandler("supabase/functions/composio-webhook/index.ts", {
    env: {
      ...DEFAULT_ENV,
      COMPOSIO_WEBHOOK_SECRET: secret,
    },
    fetchImpl: async (url, options = {}) => {
      calls.push({
        body: parseBody(options),
        method: options.method || "GET",
        url: String(url),
      });
      return jsonResponse([]);
    },
  });
  const payload = {
    data: {
      message: "hello",
    },
    id: "msg-live-smoke",
    metadata: {
      trigger_slug: "GMAIL_NEW_EMAIL",
      user_id: "user-1",
    },
    structly_trigger_id: "receipt-trigger",
    type: "composio.trigger.message",
  };
  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const webhookId = "webhook-message-1";
  const invalid = await readJson(
    await handler(
      new Request("https://edge.example.test", {
        body,
        headers: {
          "Content-Type": "application/json",
          "webhook-id": webhookId,
          "webhook-signature": "v1,invalid",
          "webhook-timestamp": timestamp,
        },
        method: "POST",
      }),
    ),
  );

  assert.equal(invalid.status, 401);
  assert.equal(calls.length, 0);

  const accepted = await readJson(
    await handler(
      new Request("https://edge.example.test", {
        body,
        headers: {
          "Content-Type": "application/json",
          "webhook-id": webhookId,
          "webhook-signature": signComposioPayload({
            body,
            secret,
            timestamp,
            webhookId,
          }),
          "webhook-timestamp": timestamp,
        },
        method: "POST",
      }),
    ),
  );

  assert.equal(accepted.status, 200);
  assert.equal(accepted.data.provider, "composio");
  assert.ok(calls.some((call) => call.url.includes("/integration_events")));
  assert.ok(calls.some((call) => call.url.includes("/trigger_runs")));
  assert.ok(calls.every((call) => call.body.user_id === "user-1"));

  const runCall = calls.find((call) => call.url.includes("/trigger_runs"));
  assert.equal(runCall.body.idempotency_key, "composio:GMAIL_NEW_EMAIL:msg-live-smoke");
  assert.equal(runCall.body.trigger_id, "receipt-trigger");
}

async function main() {
  await verifyMobileSyncFunction();
  await verifyHeartbeatIngestFunction();
  await verifyTriggerActionsFunction();
  await verifyRunActionsFunction();
  await verifyScheduleJobsFunction();
  await verifyLocationSuggestionsFunction();
  await verifyMcpBridgeFunction();
  await verifyCodeExecutionFunction();
  await verifyCodeExecutionRunnerFunction();
  await verifyStatusReadFunction();
  await verifyComposioWebhookFunction();
  console.log("Edge function E2E checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
