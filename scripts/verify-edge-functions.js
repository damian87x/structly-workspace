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
    serve(nextHandler) {
      handler = nextHandler;
    },
  };

  vm.runInNewContext(source, sandbox, { filename: path });
  assert.equal(typeof handler, "function");

  return handler;
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

async function main() {
  await verifyScheduleJobsFunction();
  await verifyLocationSuggestionsFunction();
  await verifyCodeExecutionFunction();
  await verifyStatusReadFunction();
  console.log("Edge function E2E checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
