const assert = require("assert");

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
    functionsUrl,
    locationTriggerId: getEnv("STRUCTLY_TEST_LOCATION_TRIGGER_ID"),
    requireLive: process.argv.includes("--require-live"),
    scheduleToken: getEnv("STRUCTLY_TEST_SCHEDULE_TOKEN"),
    scheduleTriggerId: getEnv("STRUCTLY_TEST_SCHEDULE_TRIGGER_ID"),
    userId: getEnv("STRUCTLY_TEST_USER_ID"),
    userToken: getEnv("STRUCTLY_TEST_USER_TOKEN"),
  };
}

async function callFunction({
  body,
  config,
  functionName,
  method = "POST",
  token = config.userToken,
}) {
  const response = await fetch(`${config.functionsUrl}/${functionName}`, {
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
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
    status: await verifyStatusRead(config),
  };

  if (missingEnv(LOCATION_ENV).length === 0) {
    results.location = await verifyLocationSuggestion(config);
  }

  if (missingEnv(CODE_ENV).length === 0) {
    results.codeExecution = await verifyCodeExecution(config);
  }

  if (missingEnv(SCHEDULE_ENV).length === 0) {
    results.schedule = await verifyScheduleJob(config);
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
