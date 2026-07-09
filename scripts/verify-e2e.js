const assert = require("assert");
const fs = require("fs");

const {
  createCodeExecutionRequest,
  validateCodeExecutionRequest,
} = require("../src/lib/codeExecutionBridge");
const {
  LOCATION_EVENT_TYPE,
  createCoarseLocation,
} = require("../src/lib/locationEvents");
const {
  MCP_TRANSPORT,
  assertMobileSafeMcpServer,
  buildMcpToolInvocation,
} = require("../src/lib/mcpBridge");
const {
  createScheduleJob,
  createScheduleTriggerPayload,
} = require("../src/lib/scheduleJobs");
const {
  TRIGGER_RUN_STATUS,
  createTriggerDefinition,
} = require("../src/lib/triggers");
const {
  createMemoryStore,
  handleCodeExecutionRequest,
  handleComposioWebhook,
  handleHeartbeatIngest,
  handleLocationSuggestion,
  handleMobileSync,
  handleScheduleJobTick,
  handleStatusRead,
  handleTriggerDispatch,
} = require("../src/lib/integrationHandlers");

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function createSeedStore() {
  const userId = "user-e2e";

  return createMemoryStore({
    integrationSources: [
      {
        enabled: true,
        id: "source-composio",
        sourceKey: "composio",
        userId,
      },
    ],
    triggers: [
      createTriggerDefinition({
        id: "receipt-trigger",
        name: "Receipt reviewed",
        source: "database",
        type: "receipt_reviewed",
        userId,
      }),
      createTriggerDefinition({
        id: "schedule-trigger",
        name: "Daily receipt sweep",
        source: "schedule",
        type: "schedule_tick",
        userId,
      }),
      createTriggerDefinition({
        id: "location-trigger",
        name: "Nearby receipt context",
        source: "location:coarse",
        type: LOCATION_EVENT_TYPE.VISIT,
        userId,
      }),
      createTriggerDefinition({
        id: "code-trigger",
        name: "Sandbox export transform",
        source: "code:daytona",
        type: "code_execution_requested",
        userId,
      }),
    ],
  });
}

function verifyStaticE2EContracts() {
  const pkg = JSON.parse(read("package.json"));
  const appSource = read("App.js");
  const capabilitySource = read("src/lib/integrationCapabilities.js");
  const envExample = read(".env.example");
  const migration = fs
    .readdirSync("supabase/migrations")
    .filter((name) => name.endsWith(".sql"))
    .map((name) => read(`supabase/migrations/${name}`))
    .join("\n");

  assert.equal(
    pkg.scripts["test:e2e"],
    "node scripts/verify-e2e.js && node scripts/verify-edge-functions.js",
  );
  assert.equal(pkg.scripts["test:ci"], "npm run test:all");
  assert.equal(pkg.scripts["test:live"], "node scripts/verify-live-integrations.js");
  assert.equal(pkg.scripts["test:pixel"], "node scripts/verify-pixel-device.js");
  assert.equal(
    pkg.scripts["test:all"],
    "npm test && npm run audit:oauth && npm run test:e2e",
  );
  assert.match(capabilitySource, /Schedule Jobs/);
  assert.match(capabilitySource, /Code Runs/);
  assert.doesNotMatch(appSource, /DAYTONA|COMPOSIO|SERVICE_ROLE|MCP_API_KEY/);
  assert.doesNotMatch(envExample, /DAYTONA|COMPOSIO|SERVICE_ROLE|MCP_API_KEY/);
  assert.match(migration, /create table if not exists public\.schedule_jobs/);
  assert.match(
    migration,
    /create table if not exists public\.location_event_suggestions/,
  );
  assert.match(
    migration,
    /create table if not exists public\.code_execution_requests/,
  );
}

function verifyE2EFlow() {
  const now = Date.UTC(2026, 6, 9, 12, 0, 0);
  const userId = "user-e2e";
  const store = createSeedStore();

  const deviceHeartbeat = handleHeartbeatIngest({
    body: {
      appState: "active",
      capabilities: {
        background: "constrained",
        device: "Pixel",
        location: "available",
        platform: "android",
      },
      deviceId: "pixel-1",
      platform: "android",
      userId,
    },
    now,
    store,
    token: "user-token",
  });
  const workerHeartbeat = handleHeartbeatIngest({
    body: {
      userId,
      workerId: "backend-worker-1",
      workerType: "supabase-edge",
    },
    now,
    store,
    token: "user-token",
  });

  assert.equal(deviceHeartbeat.status, 200);
  assert.equal(workerHeartbeat.status, 200);
  assert.equal(store.deviceHeartbeats[0].platform, "android");
  assert.equal(store.deviceHeartbeats[0].capabilities.device, "Pixel");

  const receiptDispatch = handleTriggerDispatch({
    body: {
      action: "update_external_sheet",
      eventKey: "receipt:1",
      eventType: "receipt_reviewed",
      payload: { receiptId: "receipt-1" },
      source: "database",
      triggerId: "receipt-trigger",
      userId,
    },
    now,
    store,
    token: "user-token",
  });
  const duplicateReceiptDispatch = handleTriggerDispatch({
    body: {
      action: "update_external_sheet",
      eventKey: "receipt:1",
      eventType: "receipt_reviewed",
      source: "database",
      triggerId: "receipt-trigger",
      userId,
    },
    now,
    store,
    token: "user-token",
  });

  assert.equal(receiptDispatch.data.run.status, TRIGGER_RUN_STATUS.APPROVAL_REQUIRED);
  assert.equal(duplicateReceiptDispatch.data.deduped, true);

  const scheduleJob = createScheduleJob({
    intervalMinutes: 1440,
    nextRunAt: now - 1000,
    scheduleKey: "daily-receipt-sweep",
    triggerId: "schedule-trigger",
    userId,
  });
  const schedulePayload = createScheduleTriggerPayload({
    job: scheduleJob,
    now,
  });
  const scheduleTick = handleScheduleJobTick({
    body: {
      intervalMinutes: 1440,
      nextRunAt: now - 1000,
      scheduleKey: "daily-receipt-sweep",
      service: true,
      triggerId: "schedule-trigger",
      userId,
    },
    now,
    store,
    token: "service-role",
  });

  assert.equal(schedulePayload.source, "schedule:daily-receipt-sweep");
  assert.equal(scheduleTick.data.queued, true);
  assert.equal(store.scheduleJobs.length, 1);

  const coarseLocation = createCoarseLocation({
    latitude: 51.507351,
    longitude: -0.127758,
  });
  const locationSuggestion = handleLocationSuggestion({
    body: {
      coords: {
        latitude: 51.507351,
        longitude: -0.127758,
      },
      deviceId: "pixel-1",
      eventType: LOCATION_EVENT_TYPE.VISIT,
      observedAt: now,
      placeId: "soho-market",
      placeLabel: "Soho Market",
      receiptCount: 2,
      triggerId: "location-trigger",
      userId,
    },
    now,
    store,
    token: "user-token",
  });

  assert.deepEqual(coarseLocation, {
    accuracy: "coarse",
    latitude: 51.51,
    longitude: -0.13,
  });
  assert.equal(locationSuggestion.data.suggestion.confidence, "medium");
  assert.equal(store.locationEvents.length, 1);
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      store.locationEvents[0].payload,
      "preciseLocation",
    ),
    false,
  );

  const composioWebhook = handleComposioWebhook({
    body: {
      action: "record_event",
      id: "evt-composio-1",
      toolkit: "gmail",
      trigger_id: "receipt-trigger",
      user_id: userId,
    },
    headers: {
      "composio-timestamp": String(Math.floor(now / 1000)),
      "x-composio-signature": "signature",
    },
    now,
    store,
  });
  const repeatedWebhook = handleComposioWebhook({
    body: {
      action: "record_event",
      id: "evt-composio-1",
      toolkit: "gmail",
      trigger_id: "receipt-trigger",
      user_id: userId,
    },
    headers: {
      "composio-timestamp": String(Math.floor(now / 1000)),
      "x-composio-signature": "signature",
    },
    now,
    store,
  });

  assert.equal(composioWebhook.status, 200);
  assert.equal(repeatedWebhook.data.deduped, true);

  assert.deepEqual(
    assertMobileSafeMcpServer({
      transport: MCP_TRANSPORT.STREAMABLE_HTTP,
      url: "https://mcp.example.test",
    }),
    { ok: true, reason: null },
  );
  assert.deepEqual(
    buildMcpToolInvocation({
      arguments: { receiptId: "receipt-1" },
      serverId: "mcp-receipts",
      toolName: "append_receipt",
    }),
    {
      arguments: { receiptId: "receipt-1" },
      serverId: "mcp-receipts",
      toolName: "append_receipt",
      transport: MCP_TRANSPORT.STREAMABLE_HTTP,
    },
  );

  const codeRequest = createCodeExecutionRequest({
    code: "console.log('transform receipts')",
    environment: {
      API_TOKEN: "must-not-leak",
      NODE_ENV: "production",
    },
    language: "typescript",
    now,
    userId,
  });
  const codeExecution = handleCodeExecutionRequest({
    body: {
      code: "console.log('transform receipts')",
      environment: {
        API_TOKEN: "must-not-leak",
        NODE_ENV: "production",
      },
      id: "code-request-1",
      language: "typescript",
      timeoutSeconds: 5,
      triggerId: "code-trigger",
      userId,
    },
    now,
    store,
    token: "user-token",
  });

  assert.deepEqual(validateCodeExecutionRequest(codeRequest), {
    ok: true,
    reason: null,
  });
  assert.equal(codeRequest.mobileExecution, false);
  assert.deepEqual(codeRequest.environment, { NODE_ENV: "production" });
  assert.equal(codeExecution.status, 200);
  assert.equal(codeExecution.data.request.provider, "daytona");
  assert.equal(codeExecution.data.run.status, TRIGGER_RUN_STATUS.APPROVAL_REQUIRED);

  const status = handleStatusRead({
    now,
    store,
    token: "user-token",
    userId,
  });
  const sync = handleMobileSync({
    store,
    token: "user-token",
    userId,
  });

  assert.equal(status.data.backend, "available");
  assert.equal(status.data.bridge, "available");
  assert.equal(status.data.cron, "available");
  assert.equal(status.data.codeExecution, "available");
  assert.equal(status.data.locationSuggestionCount, 1);
  assert.equal(sync.data.scheduleJobs.length, 1);
  assert.equal(sync.data.locationSuggestions.length, 1);
  assert.equal(sync.data.codeExecutionRequests.length, 1);
  assert.ok(sync.data.runHistory.length >= 5);
}

function verifyBackendFunctionSources() {
  const scheduleSource = read("supabase/functions/schedule-jobs/index.ts");
  const locationSource = read("supabase/functions/location-suggestions/index.ts");
  const codeSource = read("supabase/functions/code-execution-bridge/index.ts");
  const runnerSource = read("supabase/functions/code-execution-runner/index.ts");
  const edgeHarnessSource = read("scripts/verify-edge-functions.js");
  const statusSource = read("supabase/functions/status-read/index.ts");

  assert.match(scheduleSource, /SCHEDULE_JOBS_TOKEN/);
  assert.doesNotMatch(scheduleSource, /startsWith\("bearer "\)/);
  assert.match(scheduleSource, /trigger_runs/);
  assert.match(locationSource, /auth\/v1\/user/);
  assert.match(locationSource, /user_mismatch/);
  assert.match(locationSource, /coarseLocation/);
  assert.match(locationSource, /integration_events/);
  assert.match(locationSource, /trigger_runs/);
  assert.doesNotMatch(locationSource, /preciseLocation/);
  assert.match(codeSource, /auth\/v1\/user/);
  assert.match(codeSource, /user_mismatch/);
  assert.match(codeSource, /DAYTONA_API_KEY/);
  assert.match(codeSource, /integration_events/);
  assert.match(codeSource, /trigger_runs/);
  assert.match(codeSource, /mobileExecution: false/);
  assert.match(codeSource, /approval_required/);
  assert.match(runnerSource, /CODE_EXECUTION_RUNNER_TOKEN/);
  assert.match(runnerSource, /DAYTONA_API_KEY/);
  assert.match(runnerSource, /proxy\.app\.daytona\.io/);
  assert.match(runnerSource, /\/process\/code-run/);
  assert.match(runnerSource, /\/process\/execute/);
  assert.match(runnerSource, /code_execution_requests/);
  assert.match(read("supabase/functions/composio-webhook/index.ts"), /COMPOSIO_WEBHOOK_SECRET/);
  assert.match(read("supabase/functions/composio-webhook/index.ts"), /trigger_runs/);
  assert.match(edgeHarnessSource, /verifyComposioWebhookFunction/);
  assert.match(statusSource, /auth\/v1\/user/);
  assert.match(statusSource, /user_id=eq\.\$\{userFilter\}/);
  assert.match(statusSource, /isProviderTrigger/);
  assert.match(statusSource, /source\.startsWith\("schedule:"\)/);
  assert.match(edgeHarnessSource, /vm\.runInNewContext/);
  assert.match(edgeHarnessSource, /verifyScheduleJobsFunction/);
  assert.match(edgeHarnessSource, /verifyLocationSuggestionsFunction/);
  assert.match(edgeHarnessSource, /verifyCodeExecutionFunction/);
  assert.match(edgeHarnessSource, /verifyCodeExecutionRunnerFunction/);
  assert.match(edgeHarnessSource, /verifyStatusReadFunction/);
}

function main() {
  verifyStaticE2EContracts();
  verifyE2EFlow();
  verifyBackendFunctionSources();
  console.log("E2E integration checks passed.");
}

main();
