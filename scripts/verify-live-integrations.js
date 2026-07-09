const assert = require("assert");
const crypto = require("crypto");

const REQUIRED_ENV = [
  "STRUCTLY_FUNCTIONS_URL",
  "STRUCTLY_TEST_USER_ID",
  "STRUCTLY_TEST_USER_TOKEN",
];

const SCHEDULE_ENV = [
  "STRUCTLY_TEST_SCHEDULE_TRIGGER_ID",
  "STRUCTLY_TEST_SCHEDULE_TOKEN",
];

const LOCATION_ENV = ["STRUCTLY_TEST_LOCATION_TRIGGER_ID"];
const CODE_ENV = ["STRUCTLY_TEST_CODE_TRIGGER_ID"];
const DAYTONA_ENV = [
  "STRUCTLY_TEST_CODE_RUNNER_TOKEN",
  "STRUCTLY_TEST_DAYTONA_SANDBOX_ID",
];
const COMPOSIO_ENV = [
  "STRUCTLY_TEST_COMPOSIO_TRIGGER_ID",
  "STRUCTLY_TEST_COMPOSIO_USER_ID",
  "STRUCTLY_TEST_COMPOSIO_WEBHOOK_SECRET",
];
const MCP_ENV = ["STRUCTLY_TEST_MCP_SERVER_ID"];
const TRIGGER_ACTIONS_ENV = ["STRUCTLY_TEST_TRIGGER_ACTIONS"];
const TRIGGER_DISPATCH_ENV = ["STRUCTLY_TEST_TRIGGER_DISPATCH_TRIGGER_ID"];
const WORKER_HEARTBEAT_ENV = ["STRUCTLY_TEST_WORKER_HEARTBEAT_TOKEN"];

function getEnv(name) {
  const value = process.env[name];

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function missingEnv(names) {
  return names.filter((name) => !getEnv(name));
}

function getConfig() {
  const functionsUrl = getEnv("STRUCTLY_FUNCTIONS_URL")?.replace(/\/+$/, "");

  return {
    codeTriggerId: getEnv("STRUCTLY_TEST_CODE_TRIGGER_ID"),
    codeRunnerToken: getEnv("STRUCTLY_TEST_CODE_RUNNER_TOKEN"),
    composioTriggerId: getEnv("STRUCTLY_TEST_COMPOSIO_TRIGGER_ID"),
    composioUserId: getEnv("STRUCTLY_TEST_COMPOSIO_USER_ID"),
    composioWebhookSecret: getEnv("STRUCTLY_TEST_COMPOSIO_WEBHOOK_SECRET"),
    functionsUrl,
    daytonaSandboxId: getEnv("STRUCTLY_TEST_DAYTONA_SANDBOX_ID"),
    locationTriggerId: getEnv("STRUCTLY_TEST_LOCATION_TRIGGER_ID"),
    mcpServerId: getEnv("STRUCTLY_TEST_MCP_SERVER_ID"),
    mcpToolArgumentsJson: getEnv("STRUCTLY_TEST_MCP_TOOL_ARGUMENTS_JSON"),
    mcpToolName: getEnv("STRUCTLY_TEST_MCP_TOOL_NAME"),
    requireLive: process.argv.includes("--require-live"),
    scheduleToken: getEnv("STRUCTLY_TEST_SCHEDULE_TOKEN"),
    scheduleTriggerId: getEnv("STRUCTLY_TEST_SCHEDULE_TRIGGER_ID"),
    triggerDispatchTriggerId: getEnv("STRUCTLY_TEST_TRIGGER_DISPATCH_TRIGGER_ID"),
    userId: getEnv("STRUCTLY_TEST_USER_ID"),
    userToken: getEnv("STRUCTLY_TEST_USER_TOKEN"),
    workerHeartbeatToken: getEnv("STRUCTLY_TEST_WORKER_HEARTBEAT_TOKEN"),
  };
}

async function callFunction({
  body,
  config,
  headers = {},
  functionName,
  method = "POST",
  rawBody = null,
  token = config.userToken,
}) {
  const response = await fetch(`${config.functionsUrl}/${functionName}`, {
    body: rawBody || (body ? JSON.stringify(body) : undefined),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...headers,
    },
    method,
  });
  const data = await response.json().catch(() => null);

  return {
    data,
    ok: response.ok,
    status: response.status,
  };
}

async function verifyStatusRead(config) {
  const result = await callFunction({
    config,
    functionName: "status-read",
    method: "GET",
  });

  assert.equal(result.status, 200, `status-read failed: ${JSON.stringify(result)}`);
  assert.equal(result.data.backend, "available");
  assert.ok(["available", "unavailable"].includes(result.data.bridge));
  assert.ok(["available", "unknown"].includes(result.data.cron));
  assert.ok(["available", "unknown"].includes(result.data.codeExecution));

  return result.data;
}

async function verifyWorkerHeartbeat(config) {
  const result = await callFunction({
    body: {
      metadata: {
        source: "live-smoke",
      },
      workerId: `live-smoke-worker-${Date.now()}`,
      workerType: "supabase-edge",
    },
    config,
    functionName: "heartbeat-ingest",
    token: config.workerHeartbeatToken,
  });

  assert.equal(
    result.status,
    200,
    `heartbeat-ingest worker failed: ${JSON.stringify(result)}`,
  );
  assert.equal(result.data.accepted, true);
  assert.equal(result.data.type, "worker");

  return result.data;
}

async function verifyDeviceHeartbeat(config) {
  const result = await callFunction({
    body: {
      appState: "active",
      capabilities: {
        device: "Pixel",
        location: "foreground_permission_required",
        source: "live-smoke",
      },
      deviceId: `pixel-live-smoke-${config.userId}`,
      platform: "android",
      userId: config.userId,
    },
    config,
    functionName: "heartbeat-ingest",
  });

  assert.equal(
    result.status,
    200,
    `heartbeat-ingest device failed: ${JSON.stringify(result)}`,
  );
  assert.equal(result.data.accepted, true);
  assert.equal(result.data.type, "device");

  return result.data;
}

async function verifyLocationSuggestion(config) {
  const result = await callFunction({
    body: {
      coords: {
        latitude: 51.507351,
        longitude: -0.127758,
      },
      deviceId: "pixel-live-smoke",
      observedAt: new Date().toISOString(),
      placeId: "live-smoke-place",
      placeLabel: "Live Smoke Place",
      receiptCount: 1,
      triggerId: config.locationTriggerId,
      userId: config.userId,
    },
    config,
    functionName: "location-suggestions",
  });

  assert.equal(
    result.status,
    200,
    `location-suggestions failed: ${JSON.stringify(result)}`,
  );
  assert.equal(result.data.suggestion.suggestedAction, "review_receipt_context");

  return result.data;
}

async function verifyTriggerDispatch(config) {
  const eventKey = `live-smoke-${Date.now()}`;
  const result = await callFunction({
    body: {
      action: "live_smoke_dispatch",
      eventKey,
      eventType: "live_smoke",
      payload: {
        source: "live-smoke",
      },
      source: "live-smoke",
      triggerId: config.triggerDispatchTriggerId,
      userId: config.userId,
    },
    config,
    functionName: "trigger-dispatch",
  });

  assert.equal(
    result.status,
    200,
    `trigger-dispatch failed: ${JSON.stringify(result)}`,
  );
  assert.equal(result.data.idempotencyKey, `live-smoke:${eventKey}`);
  assert.equal(result.data.queued, true);

  return result.data;
}

async function verifyTriggerActions(config) {
  const name = `Live smoke trigger ${Date.now()}`;
  const created = await callFunction({
    body: {
      action: "create",
      patch: {
        name,
        source: "live-smoke",
        type: "live_smoke",
      },
      userId: config.userId,
    },
    config,
    functionName: "trigger-actions",
  });

  assert.equal(
    created.status,
    200,
    `trigger-actions create failed: ${JSON.stringify(created)}`,
  );
  assert.equal(created.data.action, "create");
  assert.equal(created.data.trigger.name, name);
  assert.equal(created.data.trigger.source, "live-smoke");
  assert.equal(created.data.trigger.status, "active");

  const triggerId = created.data.trigger.id;
  const paused = await callFunction({
    body: {
      action: "pause",
      triggerId,
      userId: config.userId,
    },
    config,
    functionName: "trigger-actions",
  });

  assert.equal(
    paused.status,
    200,
    `trigger-actions pause failed: ${JSON.stringify(paused)}`,
  );
  assert.equal(paused.data.trigger.status, "paused");

  const resumed = await callFunction({
    body: {
      action: "resume",
      triggerId,
      userId: config.userId,
    },
    config,
    functionName: "trigger-actions",
  });

  assert.equal(
    resumed.status,
    200,
    `trigger-actions resume failed: ${JSON.stringify(resumed)}`,
  );
  assert.equal(resumed.data.trigger.status, "active");

  const deleted = await callFunction({
    body: {
      action: "delete",
      triggerId,
      userId: config.userId,
    },
    config,
    functionName: "trigger-actions",
  });

  assert.equal(
    deleted.status,
    200,
    `trigger-actions delete failed: ${JSON.stringify(deleted)}`,
  );
  assert.equal(deleted.data.trigger.status, "deleted");

  return {
    triggerId,
    transitions: ["active", "paused", "active", "deleted"],
  };
}

async function verifyCodeExecution(config) {
  const result = await callFunction({
    body: {
      code: "console.log('structly live smoke')",
      environment: {
        API_TOKEN: "must-not-persist",
        NODE_ENV: "live-smoke",
      },
      id: `live-smoke-${Date.now()}`,
      language: "typescript",
      timeoutSeconds: 5,
      triggerId: config.codeTriggerId,
      userId: config.userId,
    },
    config,
    functionName: "code-execution-bridge",
  });

  assert.equal(
    result.status,
    202,
    `code-execution-bridge failed: ${JSON.stringify(result)}`,
  );
  assert.equal(result.data.mobileExecution, false);
  assert.equal(result.data.status, "approval_required");

  return result.data;
}

async function verifyDaytonaExecution(config) {
  const result = await callFunction({
    body: {
      code: "console.log('structly daytona live smoke')",
      environment: {
        API_TOKEN: "must-not-persist",
        NODE_ENV: "live-smoke",
      },
      language: "typescript",
      sandboxId: config.daytonaSandboxId,
      timeoutSeconds: 5,
    },
    config,
    functionName: "code-execution-runner",
    token: config.codeRunnerToken,
  });

  assert.equal(
    result.status,
    200,
    `code-execution-runner failed: ${JSON.stringify(result)}`,
  );
  assert.equal(result.data.mobileExecution, false);
  assert.equal(result.data.provider, "daytona");
  assert.equal(result.data.status, "succeeded");

  return result.data;
}

function signComposioPayload({ body, secret, timestamp, webhookId }) {
  return `v1,${crypto
    .createHmac("sha256", secret)
    .update(`${webhookId}.${timestamp}.${body}`)
    .digest("base64")}`;
}

async function verifyComposioWebhook(config) {
  const webhookId = `live-smoke-${Date.now()}`;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const payload = {
    data: {
      source: "live-smoke",
    },
    id: webhookId,
    metadata: {
      trigger_slug: "STRUCTLY_LIVE_SMOKE",
      user_id: config.composioUserId,
    },
    structly_trigger_id: config.composioTriggerId,
    type: "composio.trigger.message",
  };
  const body = JSON.stringify(payload);
  const signature = signComposioPayload({
    body,
    secret: config.composioWebhookSecret,
    timestamp,
    webhookId,
  });
  const result = await callFunction({
    config,
    functionName: "composio-webhook",
    headers: {
      "webhook-id": webhookId,
      "webhook-signature": signature,
      "webhook-timestamp": timestamp,
    },
    rawBody: body,
  });

  assert.equal(
    result.status,
    200,
    `composio-webhook failed: ${JSON.stringify(result)}`,
  );
  assert.equal(result.data.provider, "composio");
  assert.equal(result.data.eventKey, webhookId);

  return result.data;
}

async function verifyScheduleJob(config) {
  const eventKey = `live-smoke-${Date.now()}`;
  const result = await callFunction({
    body: {
      eventKey,
      payload: {
        source: "live-smoke",
      },
      source: "schedule:live-smoke",
      triggerId: config.scheduleTriggerId,
      userId: config.userId,
    },
    config,
    functionName: "schedule-jobs",
    token: config.scheduleToken,
  });

  assert.equal(result.status, 200, `schedule-jobs failed: ${JSON.stringify(result)}`);
  assert.equal(result.data.idempotencyKey, `schedule:live-smoke:${eventKey}`);
  assert.equal(result.data.queued, true);

  return result.data;
}

function parseMcpToolArguments(config) {
  if (!config.mcpToolArgumentsJson) {
    return {};
  }

  const parsed = JSON.parse(config.mcpToolArgumentsJson);

  assert.equal(
    parsed && typeof parsed === "object" && !Array.isArray(parsed),
    true,
    "STRUCTLY_TEST_MCP_TOOL_ARGUMENTS_JSON must be a JSON object.",
  );

  return parsed;
}

async function verifyMcpBridge(config) {
  const listed = await callFunction({
    body: {
      action: "list_tools",
      requestId: `live-mcp-list-${Date.now()}`,
      serverId: config.mcpServerId,
      transport: "streamable_http",
      userId: config.userId,
    },
    config,
    functionName: "mcp-bridge",
  });

  assert.equal(listed.status, 200, `mcp-bridge list failed: ${JSON.stringify(listed)}`);
  assert.equal(listed.data.accepted, true);
  assert.equal(listed.data.action, "list_tools");
  assert.equal(
    listed.data.sourceKey === config.mcpServerId ||
      listed.data.serverId === config.mcpServerId,
    true,
  );

  if (!config.mcpToolName) {
    return { listed: listed.data };
  }

  const called = await callFunction({
    body: {
      arguments: parseMcpToolArguments(config),
      requestId: `live-mcp-call-${Date.now()}`,
      serverId: config.mcpServerId,
      toolName: config.mcpToolName,
      transport: "streamable_http",
      userId: config.userId,
    },
    config,
    functionName: "mcp-bridge",
  });

  assert.equal(called.status, 200, `mcp-bridge call failed: ${JSON.stringify(called)}`);
  assert.equal(called.data.accepted, true);
  assert.equal(called.data.action, "call_tool");

  return { called: called.data, listed: listed.data };
}

async function main() {
  const config = getConfig();
  const missingRequired = missingEnv(REQUIRED_ENV);

  if (missingRequired.length > 0) {
    const message = `Live integration checks skipped; missing ${missingRequired.join(", ")}.`;

    if (config.requireLive) {
      throw new Error(message);
    }

    console.log(message);
    return;
  }

  const results = {
    deviceHeartbeat: await verifyDeviceHeartbeat(config),
    status: await verifyStatusRead(config),
  };

  if (missingEnv(LOCATION_ENV).length === 0) {
    results.location = await verifyLocationSuggestion(config);
  }

  if (missingEnv(TRIGGER_DISPATCH_ENV).length === 0) {
    results.triggerDispatch = await verifyTriggerDispatch(config);
  }

  if (missingEnv(TRIGGER_ACTIONS_ENV).length === 0) {
    results.triggerActions = await verifyTriggerActions(config);
  }

  if (missingEnv(CODE_ENV).length === 0) {
    results.codeExecution = await verifyCodeExecution(config);
  }

  if (missingEnv(DAYTONA_ENV).length === 0) {
    results.daytonaExecution = await verifyDaytonaExecution(config);
  }

  if (missingEnv(COMPOSIO_ENV).length === 0) {
    results.composio = await verifyComposioWebhook(config);
  }

  if (missingEnv(SCHEDULE_ENV).length === 0) {
    results.schedule = await verifyScheduleJob(config);
  }

  if (missingEnv(MCP_ENV).length === 0) {
    results.mcp = await verifyMcpBridge(config);
  }

  if (missingEnv(WORKER_HEARTBEAT_ENV).length === 0) {
    results.workerHeartbeat = await verifyWorkerHeartbeat(config);
  }

  console.log(
    JSON.stringify(
      {
        checked: Object.keys(results),
        ok: true,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
