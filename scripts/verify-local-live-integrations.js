const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const { signInWithPassword } = require("../src/lib/supabaseAuth");

const LOCAL_SUPABASE_URL =
  process.env.STRUCTLY_LOCAL_SUPABASE_URL || "http://127.0.0.1:54321";
const DEMO_EMAIL = process.env.STRUCTLY_LOCAL_TEST_EMAIL || "demo@structly.app";
const DEMO_PASSWORD =
  process.env.STRUCTLY_LOCAL_TEST_PASSWORD || "structly-demo-1";
const SCHEDULE_TOKEN =
  process.env.STRUCTLY_TEST_SCHEDULE_TOKEN || "local-schedule-token";
const WORKER_HEARTBEAT_TOKEN =
  process.env.STRUCTLY_TEST_WORKER_HEARTBEAT_TOKEN ||
  "local-worker-heartbeat-token";
const COMPOSIO_WEBHOOK_SECRET =
  process.env.STRUCTLY_TEST_COMPOSIO_WEBHOOK_SECRET ||
  "local-composio-webhook-secret";
const CODE_RUNNER_TOKEN =
  process.env.STRUCTLY_TEST_CODE_RUNNER_TOKEN || "local-code-runner-token";
const DAYTONA_SANDBOX_ID =
  process.env.STRUCTLY_TEST_DAYTONA_SANDBOX_ID || "local-daytona-sandbox";

function unquote(value) {
  return String(value || "").replace(/^['"]|['"]$/g, "");
}

function parseEnvOutput(output) {
  return Object.fromEntries(
    output
      .split(/\n/)
      .filter((line) => line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), unquote(line.slice(index + 1))];
      }),
  );
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });

  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed:\n${result.stdout || ""}${
        result.stderr || ""
      }`,
    );
  }

  return result.stdout || "";
}

function getSupabaseStatus() {
  return parseEnvOutput(run("supabase", ["status", "-o", "env"]));
}

function writeFunctionEnvFile() {
  const filePath = path.join(
    os.tmpdir(),
    `structly-local-functions-${process.pid}.env`,
  );
  const contents = [
    `SCHEDULE_JOBS_TOKEN=${SCHEDULE_TOKEN}`,
    `WORKER_HEARTBEAT_TOKEN=${WORKER_HEARTBEAT_TOKEN}`,
    `CODE_EXECUTION_RUNNER_TOKEN=${CODE_RUNNER_TOKEN}`,
    "DAYTONA_API_KEY=local-daytona-api-key",
    `DAYTONA_SANDBOX_ID=${DAYTONA_SANDBOX_ID}`,
    "DAYTONA_MOCK_RESULT=local-daytona-ok",
    `COMPOSIO_WEBHOOK_SECRET=${COMPOSIO_WEBHOOK_SECRET}`,
    "",
  ].join("\n");

  fs.writeFileSync(filePath, contents, { mode: 0o600 });

  return filePath;
}

function waitForFunctionsServe(child) {
  return new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for functions runtime:\n${output}`));
    }, 30000);

    function handleChunk(chunk) {
      output += chunk.toString();

      if (output.includes("Serving functions on")) {
        clearTimeout(timeout);
        resolve(output);
      }
    }

    child.stdout.on("data", handleChunk);
    child.stderr.on("data", handleChunk);
    child.on("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Functions runtime exited with ${code}:\n${output}`));
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

async function startFunctionsServe(envFile) {
  const child = spawn(
    "supabase",
    ["functions", "serve", "--no-verify-jwt", "--env-file", envFile],
    {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  await waitForFunctionsServe(child);

  return child;
}

function stopFunctionsServe(child) {
  if (!child || child.killed) {
    return;
  }

  child.kill("SIGINT");
}

async function createTrigger({ endpoint, serviceKey, source, type, userId }) {
  const id = crypto.randomUUID();
  const response = await fetch(`${endpoint}/rest/v1/trigger_definitions`, {
    body: JSON.stringify({
      approval_required: true,
      id,
      name: `Local live smoke ${type}`,
      source,
      status: "active",
      trigger_type: type,
      user_id: userId,
    }),
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      apikey: serviceKey,
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(
      `Trigger insert failed for ${type}: ${response.status} ${await response.text()}`,
    );
  }

  return id;
}

async function createTriggerFixtures({ endpoint, serviceKey, userId }) {
  const [
    dispatchTriggerId,
    locationTriggerId,
    codeTriggerId,
    composioTriggerId,
    scheduleTriggerId,
  ] = await Promise.all([
    createTrigger({
      endpoint,
      serviceKey,
      source: "live-smoke",
      type: "live_smoke",
      userId,
    }),
    createTrigger({
      endpoint,
      serviceKey,
      source: "location:coarse",
      type: "location_visit",
      userId,
    }),
    createTrigger({
      endpoint,
      serviceKey,
      source: "code:daytona",
      type: "code_execution_requested",
      userId,
    }),
    createTrigger({
      endpoint,
      serviceKey,
      source: "composio:gmail",
      type: "composio_event",
      userId,
    }),
    createTrigger({
      endpoint,
      serviceKey,
      source: "schedule:live-smoke",
      type: "schedule_tick",
      userId,
    }),
  ]);

  return {
    codeTriggerId,
    composioTriggerId,
    dispatchTriggerId,
    locationTriggerId,
    scheduleTriggerId,
  };
}

function runLiveSmoke(env) {
  const result = spawnSync(process.execPath, ["scripts/verify-live-integrations.js"], {
    encoding: "utf8",
    env,
  });
  const token = env.STRUCTLY_TEST_USER_TOKEN;

  process.stdout.write((result.stdout || "").replaceAll(token, "[redacted-token]"));
  process.stderr.write((result.stderr || "").replaceAll(token, "[redacted-token]"));

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

async function main() {
  run("supabase", ["migration", "up"]);
  const supabaseStatus = getSupabaseStatus();
  const anonKey = supabaseStatus.ANON_KEY;
  const serviceKey = supabaseStatus.SERVICE_ROLE_KEY;
  const functionsUrl = `${LOCAL_SUPABASE_URL.replace(/\/+$/, "")}/functions/v1`;
  const envFile = writeFunctionEnvFile();
  let functionsServer = null;

  if (!anonKey || !serviceKey) {
    throw new Error("Local Supabase status did not include auth keys.");
  }

  try {
    functionsServer = await startFunctionsServe(envFile);

    const { error, session } = await signInWithPassword({
      anonKey,
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      url: LOCAL_SUPABASE_URL,
    });

    if (error || !session?.access_token || !session?.user?.id) {
      throw new Error("Local demo sign-in failed.");
    }

    const fixtures = await createTriggerFixtures({
      endpoint: LOCAL_SUPABASE_URL,
      serviceKey,
      userId: session.user.id,
    });

    console.log(
      "Running local live smoke for backend heartbeats, location, triggers, code request, Composio webhook, and schedule.",
    );
    runLiveSmoke({
      ...process.env,
      STRUCTLY_FUNCTIONS_URL: functionsUrl,
      STRUCTLY_TEST_CODE_RUNNER_TOKEN: CODE_RUNNER_TOKEN,
      STRUCTLY_TEST_CODE_TRIGGER_ID: fixtures.codeTriggerId,
      STRUCTLY_TEST_COMPOSIO_TRIGGER_ID: fixtures.composioTriggerId,
      STRUCTLY_TEST_COMPOSIO_USER_ID: session.user.id,
      STRUCTLY_TEST_COMPOSIO_WEBHOOK_SECRET: COMPOSIO_WEBHOOK_SECRET,
      STRUCTLY_TEST_DAYTONA_SANDBOX_ID: DAYTONA_SANDBOX_ID,
      STRUCTLY_TEST_LOCATION_TRIGGER_ID: fixtures.locationTriggerId,
      STRUCTLY_TEST_SCHEDULE_TOKEN: SCHEDULE_TOKEN,
      STRUCTLY_TEST_SCHEDULE_TRIGGER_ID: fixtures.scheduleTriggerId,
      STRUCTLY_TEST_TRIGGER_ACTIONS: "1",
      STRUCTLY_TEST_TRIGGER_DISPATCH_TRIGGER_ID: fixtures.dispatchTriggerId,
      STRUCTLY_TEST_USER_ID: session.user.id,
      STRUCTLY_TEST_USER_TOKEN: session.access_token,
      STRUCTLY_TEST_WORKER_HEARTBEAT_TOKEN: WORKER_HEARTBEAT_TOKEN,
    });
  } finally {
    stopFunctionsServe(functionsServer);
    fs.rmSync(envFile, { force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
