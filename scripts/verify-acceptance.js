const assert = require("assert");
const fs = require("fs");

const {
  getSupabaseConfig,
  signInWithPassword,
} = require("../src/lib/supabaseAuth");
const {
  PERMISSION_DENIED_ERROR,
  pickReceiptFromLibrary,
  takeReceiptPhoto,
} = require("../src/lib/receiptCapture");
const { buildReviewReceipt } = require("../src/lib/reviewReceipt");
const { buildReceiptSheet } = require("../src/lib/buildSpreadsheet");
const {
  RECEIPT_FIELD_ROWS,
  confirmReceiptExtraction,
} = require("../src/lib/confirmReceiptExtraction");
const {
  ENRICHMENT_TIMEOUT_MS,
  enrichReceipt,
} = require("../src/lib/enrichReceipt");
const {
  exportReviewedReceipts,
} = require("../src/lib/exportReviewedReceipts");
const { exportSheet } = require("../src/lib/exportShare");
const {
  extractReceipt,
  getDefaultClient,
} = require("../src/lib/extractReceipt");
const {
  ANTHROPIC_MESSAGES_URL,
  ANTHROPIC_VERSION,
  createClaudeVisionClient,
} = require("../src/lib/claudeVisionClient");
const { applyCorrection } = require("../src/lib/reviewQueue");
const {
  CONTEXT_REVIEW_DECISIONS,
  applyReceiptContextDecision,
  getReceiptContextDisplay,
  mergeReceiptContextSuggestion,
} = require("../src/lib/receiptContextReview");
const { processReceipts } = require("../src/lib/receiptPipeline");
const {
  attachCalendarContext,
  deriveBillable,
  findEventForReceipt,
  getReceiptCalendarContext,
} = require("../src/lib/calendarContext");
const {
  attachLocation,
  getReceiptLocation,
} = require("../src/lib/locationContext");
const {
  BACKGROUND_EXECUTION_NOTE,
  CAPABILITY_STATUS,
  getBackendCapability,
  getDefaultIntegrationHealth,
  getHealthRows,
  isIntegrationReady,
} = require("../src/lib/integrationCapabilities");
const {
  buildFunctionUrl,
  callIntegrationFunction,
  createIntegrationHeaders,
  getIntegrationBackendConfig,
} = require("../src/lib/integrationBackend");
const {
  HEARTBEAT_STATUS,
  classifyHeartbeat,
  createDeviceHeartbeat,
  createWorkerHeartbeat,
  shouldSendHeartbeat,
} = require("../src/lib/heartbeats");
const {
  TRIGGER_RUN_STATUS,
  TRIGGER_STATUS,
  approveTriggerRun,
  createRunApprovalPayload,
  createTriggerDefinition,
  createTriggerPayload,
  createTriggerRun,
  deleteTriggerPayload,
  getEventDedupeKey,
  getTriggerDisplayStatus,
  pauseTriggerPayload,
  resumeTriggerPayload,
  sanitizeTriggerPatch,
  shouldEnqueueEvent,
  updateTriggerPayload,
} = require("../src/lib/triggers");
const {
  TRIGGER_LIST_STATE,
  getDefaultTriggerDashboard,
  getTriggerListState,
  normalizeTriggerDefinition,
  normalizeTriggerRun,
} = require("../src/lib/integrationDashboard");
const {
  createMobileDeviceHeartbeatPayload,
  createMobileDeviceId,
  createMobileLocationSuggestionPayload,
  findLocationTrigger,
  getSessionUserId,
} = require("../src/lib/mobileIntegrationRuntime");
const {
  hasComposioSignature,
  normalizeComposioEvent,
  validateComposioWebhookEnvelope,
} = require("../src/lib/composioBroker");
const {
  MCP_TRANSPORT,
  assertMobileSafeMcpServer,
  buildMcpToolInvocation,
  getMobileSafeToolCatalog,
} = require("../src/lib/mcpBridge");
const {
  buildAuditEvent,
  buildHealthSummary,
  buildRunTimeline,
  redactSensitive,
  summarizeRunForUser,
} = require("../src/lib/integrationObservability");
const {
  CODE_EXECUTION_PROVIDER,
  createCodeExecutionRequest,
  sanitizeEnvironment,
  validateCodeExecutionRequest,
} = require("../src/lib/codeExecutionBridge");
const {
  LOCATION_EVENT_TYPE,
  createCoarseLocation,
  createLocationEvent,
  createLocationSuggestion,
  createLocationTriggerPayload,
} = require("../src/lib/locationEvents");
const {
  SCHEDULE_JOB_STATUS,
  createScheduleJob,
  createScheduleTriggerPayload,
  isScheduleJobDue,
  markScheduleJobRun,
} = require("../src/lib/scheduleJobs");
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

const googleOAuthPatterns = [
  /^@react-native-google-signin\//i,
  /^expo-auth-session$/i,
  /^firebase$/i,
  /^@react-native-firebase\/auth$/i,
  /^google-auth-library$/i,
  /^googleapis$/i,
  /google.*oauth/i,
  /oauth.*google/i,
];

async function verifySupabasePasswordGrant() {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ options, url });

    return {
      ok: true,
      async json() {
        return {
          access_token: "access-token",
          expires_at: 1780000000,
          expires_in: 3600,
          refresh_token: "refresh-token",
          token_type: "bearer",
          user: {
            email: "person@example.com",
            id: "user-1",
          },
        };
      },
    };
  };

  const { error, session } = await signInWithPassword({
    anonKey: "anon-key",
    email: "person@example.com",
    fetchImpl,
    password: "password",
    url: "https://project.supabase.co",
  });

  assert.equal(error, null);
  assert.equal(session.access_token, "access-token");
  assert.equal(session.refresh_token, "refresh-token");
  assert.equal(session.user.email, "person@example.com");
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    "https://project.supabase.co/auth/v1/token?grant_type=password",
  );
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers.apikey, "anon-key");
  assert.equal(calls[0].options.headers.Authorization, "Bearer anon-key");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    email: "person@example.com",
    password: "password",
  });
}

function verifyScaffoldFiles() {
  const appSource = fs.readFileSync("App.js", "utf8");
  assert.match(appSource, /function SignInScreen/);
  assert.match(appSource, /function CaptureScreen/);
  assert.match(appSource, /setSession\(nextSession\)/);
  assert.match(appSource, /takeReceiptPhoto/);
  assert.match(appSource, /pickReceiptFromLibrary/);
  assert.match(
    appSource,
    /handleReceiptSelection\(\(\) => takeReceiptPhoto\(\), "camera"\)/,
  );
  assert.match(appSource, /Take photo/);
  assert.match(appSource, /Pick from library/);
  assert.match(appSource, /Use this receipt/);
  assert.match(appSource, /Retake or change/);
  assert.match(appSource, /<Image/);
  assert.match(appSource, /buildReceiptSheet/);
  assert.match(appSource, /confirmReceiptExtraction/);
  assert.match(appSource, /confirmReceiptExtraction\(receipt,\s*\{\s*vision\s*\}\)/);
  assert.ok(
    appSource.includes('import { buildReviewReceipt } from "./src/lib/reviewReceipt";'),
  );
  assert.ok(
    appSource.includes('import { enrichReceipt } from "./src/lib/enrichReceipt";'),
  );
  assert.match(
    appSource,
    /const receiptForReview = buildReviewReceipt\(result\.receipt, receipt\);[\s\S]*setReviewedReceipts\(\[receiptForReview\]\);[\s\S]*setConfirmedReceipt\(true\);[\s\S]*void enrichReceipt\(receiptForReview\)/,
  );
  assert.doesNotMatch(appSource, /await enrichReceipt/);
  assert.match(appSource, /function mergeEnrichedReceiptContext/);
  assert.match(appSource, /mergeReceiptContextSuggestion\(currentReceipt, enrichedReceipt\.context\)/);
  assert.match(appSource, /RECEIPT_FIELD_ROWS\.map/);
  assert.match(appSource, /fieldRow\.label/);
  assert.match(appSource, /fieldRow\.displayValue/);
  assert.match(appSource, /Extracting receipt fields/);
  assert.match(appSource, /exportReviewedReceipts/);
  assert.ok(
    appSource.includes('import { applyCorrection } from "./src/lib/reviewQueue";'),
  );
  assert.ok(
    appSource.includes(
      'import {\n  CONTEXT_REVIEW_DECISIONS,\n  applyReceiptContextDecision,\n  getReceiptContextDisplay,\n  mergeReceiptContextSuggestion,\n} from "./src/lib/receiptContextReview";',
    ),
  );
  assert.match(appSource, /Rows:/);
  assert.match(appSource, /Needs review:/);
  assert.match(appSource, /Review receipt/);
  assert.match(appSource, /Correct \{reviewField\}/);
  assert.match(appSource, /function handleReceiptCorrection/);
  assert.match(
    appSource,
    /applyCorrection\(currentRows,\s*0,\s*\{\s*\[field\]: value\s*\}\s*\)/,
  );
  assert.match(appSource, /handleReceiptCorrection\(reviewField, value\)/);
  assert.match(appSource, /getReceiptContextDisplay\(extractedReceipt\)/);
  assert.match(appSource, /function handleReceiptContextDecision/);
  assert.match(
    appSource,
    /applyReceiptContextDecision\(currentRows,\s*0,\s*decision\)/,
  );
  assert.match(appSource, /Receipt context/);
  assert.match(appSource, /Place/);
  assert.match(appSource, /Billable client/);
  assert.match(appSource, /CONTEXT_REVIEW_DECISIONS\.CONFIRM/);
  assert.match(appSource, /CONTEXT_REVIEW_DECISIONS\.CLEAR/);
  assert.doesNotMatch(appSource, /!receiptContext\.decision ===/);
  assert.match(appSource, /Confirm/);
  assert.match(appSource, /Clear/);
  assert.match(appSource, /Export\/Share/);
  assert.match(appSource, /onPress={handleExportShare}/);
  assert.ok(fs.existsSync("app"));
  assert.ok(fs.existsSync("src/lib/receiptCapture.js"));

  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  assert.ok(pkg.dependencies.expo);
  assert.ok(pkg.dependencies["expo-image-picker"]);
  assert.ok(pkg.dependencies["expo-location"]);
  assert.ok(pkg.dependencies["expo-calendar"]);

  const appConfig = JSON.parse(fs.readFileSync("app.json", "utf8")).expo;
  const findPluginConfig = (name) => {
    const entry = appConfig.plugins.find(
      (plugin) => Array.isArray(plugin) && plugin[0] === name,
    );

    return entry?.[1] || {};
  };
  assert.match(
    findPluginConfig("expo-location").locationWhenInUsePermission,
    /while capturing a receipt/,
  );
  assert.match(
    findPluginConfig("expo-calendar").calendarPermission,
    /full calendar access/,
  );

  const dependencies = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
  };
  const offenders = Object.keys(dependencies).filter((name) =>
    googleOAuthPatterns.some((pattern) => pattern.test(name)),
  );
  assert.deepEqual(offenders, []);
}

function verifyMissingConfigDoesNotCrash() {
  const config = getSupabaseConfig({});
  assert.equal(config.url, null);
  assert.equal(config.anonKey, null);
  assert.equal(config.error, "Supabase credentials are not configured.");
}

async function verifyReceiptCaptureModule() {
  const calls = [];
  const cameraCapturedAt = "2026-07-08T10:30:00.000Z";
  const libraryCreationTime = "2026-07-07T14:20:00.000Z";
  const imagePicker = {
    MediaTypeOptions: { Images: "Images" },
    async launchCameraAsync(options) {
      calls.push(["launchCamera", options]);

      return {
        assets: [
          {
            fileName: "receipt-camera.jpg",
            height: 4032,
            mimeType: "image/jpeg",
            uri: "file://receipt-camera.jpg",
            width: 3024,
          },
        ],
        canceled: false,
      };
    },
    async launchImageLibraryAsync(options) {
      calls.push(["launchLibrary", options]);

      return {
        assets: [
          {
            fileName: "receipt-library.png",
            height: 1600,
            mimeType: "image/png",
            creationTime: libraryCreationTime,
            uri: "file://receipt-library.png",
            width: 1200,
          },
        ],
        canceled: false,
      };
    },
    async requestCameraPermissionsAsync() {
      calls.push(["requestCamera"]);
      return { granted: true };
    },
    async requestMediaLibraryPermissionsAsync(writeOnly) {
      calls.push(["requestLibrary", writeOnly]);
      return { status: "granted" };
    },
  };
  const location = {
    async getCurrentPositionAsync(options) {
      calls.push(["getCapturePosition", options]);

      return {
        coords: {
          latitude: 51.5074,
          longitude: -0.1278,
        },
      };
    },
    async requestForegroundPermissionsAsync() {
      calls.push(["requestLocation"]);
      return { status: "granted" };
    },
  };

  const cameraResult = await takeReceiptPhoto({
    imagePicker,
    location,
    now: () => cameraCapturedAt,
  });
  assert.equal(cameraResult.error, null);
  assert.equal(cameraResult.status, "selected");
  assert.equal(cameraResult.receipt.capturedAt, cameraCapturedAt);
  assert.deepEqual(cameraResult.receipt.context.location, {
    latitude: 51.5074,
    longitude: -0.1278,
    placeName: null,
    city: null,
    region: null,
    country: null,
  });
  assert.equal(cameraResult.receipt.source, "camera");
  assert.equal(cameraResult.receipt.uri, "file://receipt-camera.jpg");
  assert.equal(calls[0][0], "requestCamera");
  assert.equal(calls[1][0], "launchCamera");
  assert.equal(calls[1][1].mediaTypes, "Images");
  assert.equal(calls[1][1].quality, 0.9);
  assert.deepEqual(calls[2], ["requestLocation"]);
  assert.deepEqual(calls[3], ["getCapturePosition", {}]);

  const libraryResult = await pickReceiptFromLibrary({ imagePicker });
  assert.equal(libraryResult.error, null);
  assert.equal(libraryResult.status, "selected");
  assert.equal(libraryResult.receipt.capturedAt, libraryCreationTime);
  assert.equal(libraryResult.receipt.source, "library");
  assert.equal(libraryResult.receipt.uri, "file://receipt-library.png");
  assert.deepEqual(calls[4], ["requestLibrary", false]);
  assert.equal(calls[5][0], "launchLibrary");
  assert.equal(calls[5][1].mediaTypes, "Images");
  assert.equal(calls[5][1].quality, 0.9);

  const libraryWithoutCreationTimeResult = await pickReceiptFromLibrary({
    imagePicker: {
      MediaTypeOptions: { Images: "Images" },
      async launchImageLibraryAsync() {
        return {
          assets: [
            {
              fileName: "receipt-library-no-created-at.png",
              height: 900,
              mimeType: "image/png",
              uri: "file://receipt-library-no-created-at.png",
              width: 700,
            },
          ],
          canceled: false,
        };
      },
      async requestMediaLibraryPermissionsAsync() {
        return { granted: true };
      },
    },
  });
  assert.equal(libraryWithoutCreationTimeResult.error, null);
  assert.equal(libraryWithoutCreationTimeResult.status, "selected");
  assert.equal(libraryWithoutCreationTimeResult.receipt.capturedAt, null);
  assert.equal(
    libraryWithoutCreationTimeResult.receipt.uri,
    "file://receipt-library-no-created-at.png",
  );

  const cancelledResult = await pickReceiptFromLibrary({
    imagePicker: {
      MediaTypeOptions: { Images: "Images" },
      async launchImageLibraryAsync() {
        return { assets: null, canceled: true };
      },
      async requestMediaLibraryPermissionsAsync() {
        return { granted: true };
      },
    },
  });
  assert.equal(cancelledResult.error, null);
  assert.equal(cancelledResult.receipt, null);
  assert.equal(cancelledResult.status, "cancelled");

  let launchedAfterDenied = false;
  const deniedResult = await takeReceiptPhoto({
    imagePicker: {
      MediaTypeOptions: { Images: "Images" },
      async launchCameraAsync() {
        launchedAfterDenied = true;
        return { assets: [], canceled: false };
      },
      async requestCameraPermissionsAsync() {
        return { granted: false, status: "denied" };
      },
    },
  });
  assert.equal(deniedResult.receipt, null);
  assert.equal(deniedResult.status, "permission-denied");
  assert.equal(deniedResult.error.message, PERMISSION_DENIED_ERROR);
  assert.equal(launchedAfterDenied, false);
}

function createReceiptClient(response) {
  const calls = [];

  return {
    calls,
    async extractReceipt(image) {
      calls.push(image);
      return response;
    },
  };
}

function hasIssue(result, type, field) {
  return result.validation.issues.some(
    (issue) => issue.type === type && issue.field === field,
  );
}

async function withNetworkBlocked(run) {
  const originalFetch = global.fetch;
  let fetchCalls = 0;

  global.fetch = async () => {
    fetchCalls += 1;
    throw new Error("Receipt extraction tests must use injected fake clients.");
  };

  try {
    await run();
    assert.equal(fetchCalls, 0);
  } finally {
    global.fetch = originalFetch;
  }
}

function createAnthropicMessage(text) {
  return {
    content: [{ text, type: "text" }],
  };
}

function createAnthropicSuccessResponse(text) {
  return {
    ok: true,
    async json() {
      return createAnthropicMessage(text);
    },
  };
}

function createReceiptJson(vendor = "Vision Market") {
  return JSON.stringify({
    confidences: {
      category: 0.91,
      date: 0.97,
      gross: 0.98,
      net: 0.96,
      vat: 0.95,
      vendor: 0.99,
    },
    fields: {
      category: "Office",
      date: "2026-07-09",
      gross: "24.00",
      net: "20.00",
      vat: "4.00",
      vendor,
    },
  });
}

async function verifyClaudeVisionClient() {
  await withNetworkBlocked(async () => {
    const image = {
      mimeType: "image/png",
      uri: "file://vision-receipt.png",
    };
    const readUris = [];
    const fetchCalls = [];
    const client = createClaudeVisionClient({
      apiKey: "anthropic-key",
      async fetchImpl(url, options) {
        fetchCalls.push({ options, url });
        return createAnthropicSuccessResponse(
          `Here is the extraction:\n\`\`\`json\n${createReceiptJson()}\n\`\`\``,
        );
      },
      model: "receipt-model",
      async readImageBase64(uri) {
        readUris.push(uri);
        return "base64-receipt-image";
      },
    });

    const result = await client.extractReceipt(image);

    assert.deepEqual(readUris, [image.uri]);
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].url, ANTHROPIC_MESSAGES_URL);
    assert.equal(fetchCalls[0].options.method, "POST");
    assert.equal(fetchCalls[0].options.headers["x-api-key"], "anthropic-key");
    assert.equal(
      fetchCalls[0].options.headers["anthropic-version"],
      ANTHROPIC_VERSION,
    );
    assert.equal(fetchCalls[0].options.headers["Content-Type"], "application/json");

    const body = JSON.parse(fetchCalls[0].options.body);
    const content = body.messages[0].content;
    const imageBlock = content[0];
    const promptBlock = content[1];

    assert.equal(body.model, "receipt-model");
    assert.equal(body.messages[0].role, "user");
    assert.equal(imageBlock.type, "image");
    assert.deepEqual(imageBlock.source, {
      data: "base64-receipt-image",
      media_type: "image/png",
      type: "base64",
    });
    assert.equal(promptBlock.type, "text");
    assert.match(promptBlock.text, /STRICT JSON/);
    assert.match(promptBlock.text, /confidence/i);

    for (const field of ["vendor", "date", "net", "vat", "gross", "category"]) {
      assert.match(promptBlock.text, new RegExp(field));
    }

    assert.deepEqual(result, {
      confidences: {
        category: 0.91,
        date: 0.97,
        gross: 0.98,
        net: 0.96,
        vat: 0.95,
        vendor: 0.99,
      },
      fields: {
        category: "Office",
        date: "2026-07-09",
        gross: "24.00",
        net: "20.00",
        vat: "4.00",
        vendor: "Vision Market",
      },
    });

    const nonOkClient = createClaudeVisionClient({
      apiKey: "anthropic-key",
      async fetchImpl() {
        return { ok: false, status: 429 };
      },
      model: "receipt-model",
      async readImageBase64() {
        return "base64-receipt-image";
      },
    });

    await assert.rejects(
      () => nonOkClient.extractReceipt(image),
      /Receipt extraction API request failed \(429\)\./,
    );

    const unparseableClient = createClaudeVisionClient({
      apiKey: "anthropic-key",
      async fetchImpl() {
        return createAnthropicSuccessResponse("```json\n{not valid json}\n```");
      },
      model: "receipt-model",
      async readImageBase64() {
        return "base64-receipt-image";
      },
    });

    await assert.rejects(
      () => unparseableClient.extractReceipt(image),
      /Receipt extraction response contained unparseable JSON\./,
    );
  });
}

async function verifyDefaultReceiptClientSelection() {
  await withNetworkBlocked(async () => {
    const image = {
      mimeType: "image/jpeg",
      uri: "file://default-client.jpg",
    };
    const claudeCalls = [];
    const claudeClient = getDefaultClient({
      env: {
        ANTHROPIC_API_KEY: "anthropic-key",
        ANTHROPIC_MODEL: "receipt-model",
      },
      async fetchImpl(url, options) {
        claudeCalls.push({ options, url });
        return createAnthropicSuccessResponse(createReceiptJson("Default Market"));
      },
      async readImageBase64(uri) {
        assert.equal(uri, image.uri);
        return "base64-default-image";
      },
    });

    const claudeResult = await claudeClient.extractReceipt(image);

    assert.equal(claudeResult.fields.vendor, "Default Market");
    assert.equal(claudeCalls.length, 1);
    assert.equal(claudeCalls[0].url, ANTHROPIC_MESSAGES_URL);
    assert.equal(
      JSON.parse(claudeCalls[0].options.body).messages[0].content[0].source.data,
      "base64-default-image",
    );

    const endpointCalls = [];
    const endpointClient = getDefaultClient({
      env: {
        STRUCTLY_RECEIPT_EXTRACT_API_KEY: "endpoint-key",
        STRUCTLY_RECEIPT_EXTRACT_ENDPOINT: "https://extract.example.test/receipt",
      },
      async fetchImpl(url, options) {
        endpointCalls.push({ options, url });

        return {
          ok: true,
          async json() {
            return {
              fields: {
                category: "Travel",
                date: "2026-07-10",
                gross: "12.00",
                net: "10.00",
                vat: "2.00",
                vendor: "Endpoint Market",
              },
            };
          },
        };
      },
    });

    const endpointResult = await endpointClient.extractReceipt(image);

    assert.equal(endpointResult.fields.vendor, "Endpoint Market");
    assert.equal(endpointCalls.length, 1);
    assert.equal(
      endpointCalls[0].url,
      "https://extract.example.test/receipt",
    );
    assert.equal(
      endpointCalls[0].options.headers.Authorization,
      "Bearer endpoint-key",
    );
    assert.deepEqual(JSON.parse(endpointCalls[0].options.body), { image });
  });
}

async function verifyReceiptExtractionModule() {
  await withNetworkBlocked(async () => {
    const image = {
      mimeType: "image/jpeg",
      uri: "file://receipt.jpg",
    };

    const cleanClient = createReceiptClient({
      fields: {
        category: { confidence: 0.93, value: "Travel" },
        date: { confidence: 0.97, value: "1 July 2026" },
        gross: { confidence: 0.98, value: "£12.00" },
        net: { confidence: 0.98, value: "10.00" },
        vat: { confidence: 0.98, value: "2.00" },
        vendor: { confidence: 0.99, value: "Acme Supplies" },
      },
    });
    const cleanResult = await extractReceipt(image, { client: cleanClient });

    assert.deepEqual(cleanClient.calls, [image]);
    assert.deepEqual(cleanResult.fields, {
      category: "Travel",
      date: "2026-07-01",
      gross: 12,
      net: 10,
      vat: 2,
      vendor: "Acme Supplies",
    });
    assert.equal(cleanResult.validation.needsReview, false);
    assert.deepEqual(cleanResult.validation.issues, []);

    const mismatchClient = createReceiptClient({
      confidences: {
        category: 0.95,
        date: 0.95,
        gross: 0.95,
        net: 0.95,
        vat: 0.95,
        vendor: 0.95,
      },
      fields: {
        category: "Meals",
        date: "2026-07-02",
        gross: "13.50",
        net: "10.00",
        vat: "2.00",
        vendor: "Mismatch Cafe",
      },
    });
    const mismatchResult = await extractReceipt(image, {
      client: mismatchClient,
    });

    assert.equal(mismatchClient.calls.length, 1);
    assert.equal(mismatchResult.fields.date, "2026-07-02");
    assert.equal(mismatchResult.fields.net, 10);
    assert.equal(mismatchResult.fields.vat, 2);
    assert.equal(mismatchResult.fields.gross, 13.5);
    assert.equal(mismatchResult.validation.needsReview, true);
    assert.equal(hasIssue(mismatchResult, "vat-mismatch", "gross"), true);

    const missingClient = createReceiptClient({
      fields: {
        category: { confidence: 0.4, value: "Office" },
        date: "not a date",
        gross: "24.00",
        net: "20.00",
        vat: "4.00",
        vendor: "",
      },
    });
    const missingResult = await extractReceipt(image, { client: missingClient });

    assert.equal(missingClient.calls.length, 1);
    assert.equal(missingResult.fields.vendor, null);
    assert.equal(missingResult.fields.date, null);
    assert.equal(missingResult.fields.net, 20);
    assert.equal(missingResult.fields.vat, 4);
    assert.equal(missingResult.fields.gross, 24);
    assert.equal(missingResult.validation.needsReview, true);
    assert.equal(hasIssue(missingResult, "missing-field", "vendor"), true);
    assert.equal(hasIssue(missingResult, "missing-field", "date"), true);
    assert.equal(hasIssue(missingResult, "low-confidence", "category"), true);
  });
}

async function verifyConfirmReceiptExtractionHelper() {
  await withNetworkBlocked(async () => {
    const cleanImage = {
      mimeType: "image/jpeg",
      uri: "file://confirm-clean.jpg",
    };
    const cleanCalls = [];
    const cleanResult = await confirmReceiptExtraction(cleanImage, {
      vision: {
        async extractReceipt(image) {
          cleanCalls.push(image);

          return {
            fields: {
              category: { confidence: 0.95, value: "Office" },
              date: { confidence: 0.96, value: "2026-07-07" },
              gross: { confidence: 0.98, value: "24.00" },
              net: { confidence: 0.98, value: "20.00" },
              vat: { confidence: 0.98, value: "4.00" },
              vendor: { confidence: 0.99, value: "Clean Market" },
            },
          };
        },
      },
    });

    assert.deepEqual(cleanCalls, [cleanImage]);
    assert.deepEqual(
      RECEIPT_FIELD_ROWS.map((row) => row.label),
      ["Vendor", "Date", "Net", "VAT", "Gross", "Category"],
    );
    assert.deepEqual(cleanResult.receipt.fields, {
      category: "Office",
      date: "2026-07-07",
      gross: 24,
      net: 20,
      vat: 4,
      vendor: "Clean Market",
    });
    assert.deepEqual(
      cleanResult.fieldRows.map(({ displayValue, field, label }) => ({
        displayValue,
        field,
        label,
      })),
      [
        { displayValue: "Clean Market", field: "vendor", label: "Vendor" },
        { displayValue: "2026-07-07", field: "date", label: "Date" },
        { displayValue: "20", field: "net", label: "Net" },
        { displayValue: "4", field: "vat", label: "VAT" },
        { displayValue: "24", field: "gross", label: "Gross" },
        { displayValue: "Office", field: "category", label: "Category" },
      ],
    );
    assert.equal(cleanResult.needsReview, false);
    assert.equal(cleanResult.sheet.validation.needsReviewCount, 0);

    const flaggedImage = {
      mimeType: "image/jpeg",
      uri: "file://confirm-flagged.jpg",
    };
    const flaggedCalls = [];
    const flaggedResult = await confirmReceiptExtraction(flaggedImage, {
      vision: {
        async extractReceipt(image) {
          flaggedCalls.push(image);

          return {
            fields: {
              category: { confidence: 0.5, value: "Meals" },
              date: { confidence: 0.95, value: "2026-07-08" },
              gross: { confidence: 0.95, value: "13.50" },
              net: { confidence: 0.95, value: "10.00" },
              vat: { confidence: 0.95, value: "2.00" },
              vendor: { confidence: 0.95, value: "Review Cafe" },
            },
          };
        },
      },
    });

    assert.deepEqual(flaggedCalls, [flaggedImage]);
    assert.deepEqual(flaggedResult.receipt.fields, {
      category: "Meals",
      date: "2026-07-08",
      gross: 13.5,
      net: 10,
      vat: 2,
      vendor: "Review Cafe",
    });
    assert.equal(flaggedResult.needsReview, true);
    assert.equal(flaggedResult.sheet.validation.needsReviewCount, 1);
    assert.equal(hasIssue(flaggedResult.receipt, "vat-mismatch", "gross"), true);
    assert.equal(
      hasIssue(flaggedResult.receipt, "low-confidence", "category"),
      true,
    );
    assert.equal(
      flaggedResult.fieldRows.find((row) => row.field === "vendor").displayValue,
      "Review Cafe",
    );
  });
}

function verifyBuildSpreadsheetModule() {
  const cleanSheet = buildReceiptSheet([
    {
      fields: {
        category: "Office",
        date: "2026-07-01",
        gross: 12,
        net: 10,
        vat: 2,
        vendor: "Acme Supplies",
      },
      validation: {
        issues: [],
        needsReview: false,
      },
    },
    {
      context: {
        billable: {
          billable: true,
          client: "Acme Ltd",
          project: "VAT review",
        },
        location: {
          city: "London",
          country: "United Kingdom",
          placeName: "Soho Market",
          region: "England",
        },
      },
      fields: {
        category: "Travel",
        date: "2026-07-03",
        gross: 18,
        net: 15,
        vat: 3,
        vendor: "Enriched Taxi",
      },
      validation: {
        issues: [],
        needsReview: false,
      },
    },
    {
      fields: {
        category: "Meals, team",
        date: "2026-07-02",
        gross: 6.6,
        net: 5.5,
        vat: 1.1,
        vendor: 'Comma, "Quote" Ltd',
      },
      validation: {
        issues: [],
        needsReview: false,
      },
    },
  ]);

  assert.deepEqual(cleanSheet.csv.split("\n"), [
    "vendor,date,net,vat,gross,category,location,billable_client",
    "Acme Supplies,2026-07-01,10,2,12,Office,,",
    "Enriched Taxi,2026-07-03,15,3,18,Travel,Soho Market,Acme Ltd",
    '"Comma, ""Quote"" Ltd",2026-07-02,5.5,1.1,6.6,"Meals, team",,',
  ]);
  assert.deepEqual(cleanSheet.validation.needsReviewRows, []);
  assert.deepEqual(cleanSheet.validation.duplicates, []);
  assert.equal(cleanSheet.validation.needsReviewCount, 0);
  assert.equal(cleanSheet.validation.duplicateCount, 0);

  const vatIssue = {
    difference: 1.5,
    expectedGross: 12,
    field: "gross",
    message: "net plus VAT does not equal gross.",
    type: "vat-mismatch",
  };
  const reviewSheet = buildReceiptSheet([
    {
      fields: {
        category: "Meals",
        date: "2026-07-03",
        gross: 13.5,
        net: 10,
        vat: 2,
        vendor: "Mismatch Cafe",
      },
      validation: {
        issues: [vatIssue],
        needsReview: true,
      },
    },
  ]);

  assert.equal(reviewSheet.validation.needsReviewCount, 1);
  assert.deepEqual(reviewSheet.validation.needsReviewRows, [
    {
      index: 0,
      issues: [vatIssue],
      reasons: ["net plus VAT does not equal gross."],
      rowNumber: 1,
    },
  ]);
  assert.deepEqual(reviewSheet.validation.duplicates, []);

  const duplicateSheet = buildReceiptSheet([
    {
      fields: {
        category: "Meals",
        date: "2026-07-04",
        gross: 12,
        net: 10,
        vat: 2,
        vendor: "Duplicate Cafe",
      },
      validation: {
        issues: [],
        needsReview: false,
      },
    },
    {
      fields: {
        category: "Meals",
        date: "2026-07-04",
        gross: 12,
        net: 10,
        vat: 2,
        vendor: "Duplicate Cafe",
      },
      validation: {
        issues: [],
        needsReview: false,
      },
    },
    {
      fields: {
        category: "Travel",
        date: "2026-07-04",
        gross: 12,
        net: 10,
        vat: 2,
        vendor: "Different Vendor",
      },
      validation: {
        issues: [],
        needsReview: false,
      },
    },
  ]);

  assert.equal(duplicateSheet.validation.duplicateCount, 1);
  assert.deepEqual(duplicateSheet.validation.duplicates, [
    {
      date: "2026-07-04",
      gross: "12",
      key: "duplicate cafe|2026-07-04|12",
      rows: [
        { index: 0, rowNumber: 1 },
        { index: 1, rowNumber: 2 },
      ],
      vendor: "Duplicate Cafe",
    },
  ]);
}

async function verifyExportShareModule() {
  const csv = "vendor,date\nAcme Supplies,2026-07-01";
  const events = [];
  const writes = [];
  const shares = [];
  const result = await exportSheet(
    {
      csv,
      filename: "../exports/monthly-receipts",
    },
    {
      async share(uri) {
        events.push(["share", uri]);
        shares.push(uri);
      },
      async writeFile(uri, contents) {
        events.push(["writeFile", uri]);
        writes.push({ contents, uri });
      },
    },
  );
  const expectedUri = "file:///tmp/structly-exports/monthly-receipts.csv";

  assert.deepEqual(writes, [{ contents: csv, uri: expectedUri }]);
  assert.deepEqual(shares, [expectedUri]);
  assert.deepEqual(events, [
    ["writeFile", expectedUri],
    ["share", expectedUri],
  ]);
  assert.deepEqual(result, { shared: true, uri: expectedUri });

  const rejectedWrites = [];
  const rejectedShares = [];
  await assert.rejects(
    () =>
      exportSheet(
        { csv: " \n\t", filename: "empty" },
        {
          async share(uri) {
            rejectedShares.push(uri);
          },
          async writeFile(uri, contents) {
            rejectedWrites.push({ contents, uri });
          },
        },
      ),
    /CSV content is required to export a sheet\./,
  );
  assert.deepEqual(rejectedWrites, []);
  assert.deepEqual(rejectedShares, []);

  const traversalWrites = [];
  const traversalResult = await exportSheet(
    {
      csv: "vendor,date\nTraversal Cafe,2026-07-02",
      filename: "../../private/../receipts.CSV",
    },
    {
      async share() {},
      async writeFile(uri, contents) {
        traversalWrites.push({ contents, uri });
      },
    },
  );
  const traversalFileName = traversalWrites[0].uri.split("/").pop();

  assert.equal(
    traversalWrites[0].uri,
    "file:///tmp/structly-exports/receipts.csv",
  );
  assert.equal(traversalResult.uri, traversalWrites[0].uri);
  assert.equal(traversalFileName, "receipts.csv");
  assert.equal(traversalFileName.includes(".."), false);
  assert.equal(/[\\/]/.test(traversalFileName), false);
}

async function verifyExportReviewedReceiptsHelper() {
  const vatIssue = {
    difference: 1.5,
    expectedGross: 12,
    field: "gross",
    message: "net plus VAT does not equal gross.",
    type: "vat-mismatch",
  };
  const receipts = [
    {
      fields: {
        category: "Office",
        date: "2026-07-07",
        gross: 24,
        net: 20,
        vat: 4,
        vendor: "Reviewed Market",
      },
      validation: {
        issues: [],
        needsReview: false,
      },
    },
    {
      fields: {
        category: "Meals",
        date: "2026-07-08",
        gross: 13.5,
        net: 10,
        vat: 2,
        vendor: "Review Cafe",
      },
      validation: {
        issues: [vatIssue],
        needsReview: true,
      },
    },
  ];
  const expectedCsv = [
    "vendor,date,net,vat,gross,category,location,billable_client",
    "Reviewed Market,2026-07-07,20,4,24,Office,,",
    "Review Cafe,2026-07-08,10,2,13.5,Meals,,",
  ].join("\n");
  const expectedUri = "file:///tmp/structly-exports/reviewed-pack.csv";
  const writes = [];
  const shares = [];
  const result = await exportReviewedReceipts(receipts, {
    filename: "reviewed-pack",
    async share(uri) {
      shares.push(uri);
    },
    async writeFile(uri, contents) {
      writes.push({ contents, uri });
    },
  });

  assert.deepEqual(writes, [{ contents: expectedCsv, uri: expectedUri }]);
  assert.deepEqual(shares, [expectedUri]);
  assert.equal(result.sheet.csv, expectedCsv);
  assert.equal(result.sheet.validation.needsReviewCount, 1);
  assert.deepEqual(result.summary, {
    needsReviewCount: 1,
    rowCount: 2,
  });
  assert.deepEqual(result.exportResult, { shared: true, uri: expectedUri });

  const exportCalls = [];
  const injectedResult = await exportReviewedReceipts(receipts, {
    directory: "file:///tmp/custom/",
    async exportSheet(payload, dependencies) {
      exportCalls.push({ dependencies, payload });
      return { shared: true, uri: "file:///tmp/custom/fake.csv" };
    },
    filename: "custom-reviewed",
    async share() {},
    async writeFile() {},
  });

  assert.equal(exportCalls.length, 1);
  assert.deepEqual(exportCalls[0].payload, {
    csv: expectedCsv,
    filename: "custom-reviewed",
  });
  assert.equal(exportCalls[0].dependencies.directory, "file:///tmp/custom/");
  assert.equal(typeof exportCalls[0].dependencies.share, "function");
  assert.equal(typeof exportCalls[0].dependencies.writeFile, "function");
  assert.equal(injectedResult.summary.rowCount, 2);
  assert.equal(injectedResult.exportResult.uri, "file:///tmp/custom/fake.csv");
}

function createReviewRow(overrides = {}) {
  const fields = {
    category: "Meals",
    date: "2026-07-05",
    gross: 12.01,
    net: 10,
    vat: 1,
    vendor: "Correction Cafe",
    ...overrides,
  };

  return {
    fields,
    validation: {
      issues: [
        {
          difference: 1.01,
          expectedGross: 11,
          field: "gross",
          message: "net plus VAT does not equal gross.",
          type: "vat-mismatch",
        },
      ],
      needsReview: true,
    },
  };
}

function verifyReviewQueueCorrections() {
  const originalRows = [
    createReviewRow(),
    {
      fields: {
        category: "Office",
        date: "2026-07-06",
        gross: 24,
        net: 20,
        vat: 4,
        vendor: "Stable Supplies",
      },
      validation: {
        issues: [],
        needsReview: false,
      },
    },
  ];
  const originalSnapshot = JSON.parse(JSON.stringify(originalRows));
  const correctedRows = applyCorrection(originalRows, 0, { vat: "2.00" });

  assert.notEqual(correctedRows, originalRows);
  assert.notEqual(correctedRows[0], originalRows[0]);
  assert.equal(correctedRows[1], originalRows[1]);
  assert.notEqual(correctedRows[0].fields, originalRows[0].fields);
  assert.deepEqual(originalRows, originalSnapshot);
  assert.equal(correctedRows[0].fields.vat, 2);
  assert.equal(correctedRows[0].validation.needsReview, false);
  assert.deepEqual(correctedRows[0].validation.issues, []);

  const stillInvalidRows = applyCorrection([createReviewRow()], 0, { vat: 1.5 });
  const mismatchIssue = stillInvalidRows[0].validation.issues.find(
    (issue) => issue.type === "vat-mismatch" && issue.field === "gross",
  );

  assert.equal(stillInvalidRows[0].validation.needsReview, true);
  assert.ok(mismatchIssue);
  assert.equal(
    mismatchIssue.message,
    "net plus VAT does not equal gross.",
  );

  assert.throws(
    () => applyCorrection(originalRows, 2, { vat: 2 }),
    /Review queue index 2 is out of range\./,
  );
  assert.throws(
    () => applyCorrection(originalRows, -1, { vat: 2 }),
    /Review queue index -1 is out of range\./,
  );
}

function verifyReceiptContextReviewHelper() {
  const originalRows = [
    {
      context: {
        billable: {
          billable: true,
          client: "Acme Ltd",
          project: "VAT review",
        },
        calendar: {
          eventId: "event-acme",
          title: "Acme Ltd - VAT review",
        },
        capturedAt: "2026-07-08T10:30:00.000Z",
        location: {
          city: "London",
          country: "United Kingdom",
          placeName: "Acme Cafe",
          region: "England",
        },
        source: "camera",
      },
      fields: {
        category: "Meals",
        date: "2026-07-08",
        gross: 24,
        net: 20,
        vat: 4,
        vendor: "Acme Cafe",
      },
      validation: {
        issues: [],
        needsReview: false,
      },
    },
    createReviewRow({ vendor: "Stable Cafe" }),
  ];
  const originalSnapshot = JSON.parse(JSON.stringify(originalRows));
  const display = getReceiptContextDisplay(originalRows[0]);

  assert.deepEqual(display, {
    billableClient: "Acme Ltd",
    decision: CONTEXT_REVIEW_DECISIONS.CONFIRM,
    hasContext: true,
    location: "Acme Cafe",
  });
  assert.deepEqual(getReceiptContextDisplay({}), {
    billableClient: "",
    decision: CONTEXT_REVIEW_DECISIONS.CONFIRM,
    hasContext: false,
    location: "",
  });
  assert.deepEqual(
    getReceiptContextDisplay({
      context: {
        billable: { billable: false, client: "Internal Team" },
        location: { placeName: "Desk" },
      },
    }),
    {
      billableClient: "",
      decision: CONTEXT_REVIEW_DECISIONS.CONFIRM,
      hasContext: true,
      location: "Desk",
    },
  );

  const confirmedRows = applyReceiptContextDecision(
    originalRows,
    0,
    CONTEXT_REVIEW_DECISIONS.CONFIRM,
  );
  assert.notEqual(confirmedRows, originalRows);
  assert.notEqual(confirmedRows[0], originalRows[0]);
  assert.equal(confirmedRows[1], originalRows[1]);
  assert.deepEqual(originalRows, originalSnapshot);
  assert.equal(confirmedRows[0].context.contextReview.decision, CONTEXT_REVIEW_DECISIONS.CONFIRM);

  const clearedRows = applyReceiptContextDecision(
    originalRows,
    0,
    CONTEXT_REVIEW_DECISIONS.CLEAR,
  );

  assert.notEqual(clearedRows, originalRows);
  assert.notEqual(clearedRows[0], originalRows[0]);
  assert.equal(clearedRows[1], originalRows[1]);
  assert.deepEqual(originalRows, originalSnapshot);
  assert.equal(clearedRows[0].context.source, "camera");
  assert.equal(clearedRows[0].context.capturedAt, "2026-07-08T10:30:00.000Z");
  assert.deepEqual(clearedRows[0].context.calendar, {
    eventId: "event-acme",
    title: "Acme Ltd - VAT review",
  });
  assert.equal(clearedRows[0].context.location, null);
  assert.deepEqual(clearedRows[0].context.billable, {
    billable: false,
    client: null,
    project: null,
  });
  assert.deepEqual(getReceiptContextDisplay(clearedRows[0]), {
    billableClient: "Acme Ltd",
    decision: CONTEXT_REVIEW_DECISIONS.CLEAR,
    hasContext: true,
    location: "Acme Cafe",
  });
  assert.deepEqual(buildReceiptSheet(clearedRows).csv.split("\n")[1], [
    "Acme Cafe",
    "2026-07-08",
    "20",
    "4",
    "24",
    "Meals",
    "",
    "",
  ].join(","));


  const restoredRows = applyReceiptContextDecision(
    clearedRows,
    0,
    CONTEXT_REVIEW_DECISIONS.CONFIRM,
  );
  assert.deepEqual(getReceiptContextDisplay(restoredRows[0]), {
    billableClient: "Acme Ltd",
    decision: CONTEXT_REVIEW_DECISIONS.CONFIRM,
    hasContext: true,
    location: "Acme Cafe",
  });
  assert.deepEqual(restoredRows[0].context.location, originalRows[0].context.location);
  assert.deepEqual(restoredRows[0].context.billable, originalRows[0].context.billable);

  const clearedBeforeEnrichment = applyReceiptContextDecision(
    [{ context: { capturedAt: "2026-07-08T10:30:00.000Z", source: "camera" }, fields: originalRows[0].fields }],
    0,
    CONTEXT_REVIEW_DECISIONS.CLEAR,
  )[0];
  const lateMergedReceipt = mergeReceiptContextSuggestion(
    clearedBeforeEnrichment,
    originalRows[0].context,
  );
  assert.deepEqual(getReceiptContextDisplay(lateMergedReceipt), {
    billableClient: "Acme Ltd",
    decision: CONTEXT_REVIEW_DECISIONS.CLEAR,
    hasContext: true,
    location: "Acme Cafe",
  });
  assert.equal(lateMergedReceipt.context.location, null);
  assert.deepEqual(lateMergedReceipt.context.billable, {
    billable: false,
    client: null,
    project: null,
  });
  assert.deepEqual(buildReceiptSheet([lateMergedReceipt]).csv.split("\n")[1], [
    "Acme Cafe",
    "2026-07-08",
    "20",
    "4",
    "24",
    "Meals",
    "",
    "",
  ].join(","));

  assert.throws(
    () => applyReceiptContextDecision(originalRows, 0, "maybe"),
    /Unsupported receipt context decision: maybe\./,
  );
  assert.throws(
    () =>
      applyReceiptContextDecision(
        originalRows,
        2,
        CONTEXT_REVIEW_DECISIONS.CLEAR,
      ),
    /Receipt context review index 2 is out of range\./,
  );
}

async function verifyReviewReceiptBuilder() {
  await withNetworkBlocked(async () => {
    const capturedLocation = {
      latitude: 51.5074,
      longitude: -0.1278,
      placeName: null,
      city: null,
      region: null,
      country: null,
    };
    const reviewedCameraReceipt = buildReviewReceipt(
      {
        fields: { gross: 24, vendor: "Acme Cafe" },
        validation: { issues: [], needsReview: false },
      },
      {
        capturedAt: "2026-07-08T10:30:00.000Z",
        context: { location: capturedLocation },
        source: "camera",
        uri: "file://receipt-camera.jpg",
      },
    );

    assert.deepEqual(reviewedCameraReceipt.context.location, capturedLocation);
    assert.equal(reviewedCameraReceipt.context.context, undefined);
    assert.equal(reviewedCameraReceipt.capturedAt, "2026-07-08T10:30:00.000Z");
    assert.equal(reviewedCameraReceipt.context.capturedAt, "2026-07-08T10:30:00.000Z");

    const locationCalls = [];
    const enrichedCameraReceipt = await enrichReceipt(reviewedCameraReceipt, {
      events: [],
      location: {
        async getCurrentPositionAsync() {
          locationCalls.push(["getCurrentPosition"]);
          return { coords: { latitude: 0, longitude: 0 } };
        },
        async requestForegroundPermissionsAsync() {
          locationCalls.push(["requestForegroundPermissions"]);
          return { granted: false };
        },
        async reverseGeocodeAsync(coords) {
          locationCalls.push(["reverseGeocode", coords]);

          return [
            {
              city: "London",
              country: "United Kingdom",
              name: "Acme Cafe",
              region: "England",
            },
          ];
        },
      },
    });

    assert.deepEqual(locationCalls, [
      ["reverseGeocode", { latitude: 51.5074, longitude: -0.1278 }],
    ]);
    assert.deepEqual(enrichedCameraReceipt.context.location, {
      latitude: 51.5074,
      longitude: -0.1278,
      placeName: "Acme Cafe",
      city: "London",
      region: "England",
      country: "United Kingdom",
    });

    const reviewedLibraryReceipt = buildReviewReceipt(
      {
        fields: { gross: 12, vendor: "Library Cafe" },
        validation: { issues: [], needsReview: false },
      },
      {
        capturedAt: null,
        source: "library",
        uri: "file://receipt-library-no-created-at.png",
      },
    );

    assert.equal(reviewedLibraryReceipt.capturedAt, null);
    assert.equal(reviewedLibraryReceipt.context.capturedAt, null);
    assert.equal(reviewedLibraryReceipt.source, "library");
  });
}

async function verifyReceiptPipelineModule() {
  await withNetworkBlocked(async () => {
    const images = [
      { mimeType: "image/jpeg", uri: "file://clean.jpg" },
      { mimeType: "image/jpeg", uri: "file://flagged.jpg" },
      { mimeType: "image/jpeg", uri: "file://failing.jpg" },
    ];
    const calls = [];
    const vision = {
      async extractReceipt(image) {
        calls.push(image);

        if (image.uri === "file://failing.jpg") {
          throw new Error("Vision extraction failed.");
        }

        if (image.uri === "file://flagged.jpg") {
          return {
            confidences: {
              category: 0.95,
              date: 0.95,
              gross: 0.95,
              net: 0.95,
              vat: 0.95,
              vendor: 0.95,
            },
            fields: {
              category: "Meals",
              date: "2026-07-06",
              gross: "13.50",
              net: "10.00",
              vat: "2.00",
              vendor: "Review Cafe",
            },
          };
        }

        return {
          fields: {
            category: { confidence: 0.93, value: "Office" },
            date: { confidence: 0.97, value: "2026-07-05" },
            gross: { confidence: 0.98, value: "24.00" },
            net: { confidence: 0.98, value: "20.00" },
            vat: { confidence: 0.98, value: "4.00" },
            vendor: { confidence: 0.99, value: "Clean Market" },
          },
        };
      },
    };

    const result = await processReceipts(images, { vision });

    assert.deepEqual(calls, images);
    assert.equal(result.receipts.length, 2);
    assert.equal(result.failures.length, 1);
    assert.equal(result.failures[0].index, 2);
    assert.deepEqual(result.failures[0].image, images[2]);
    assert.equal(result.failures[0].error.message, "Vision extraction failed.");
    assert.deepEqual(result.sheet.csv.split("\n"), [
      "vendor,date,net,vat,gross,category,location,billable_client",
      "Clean Market,2026-07-05,20,4,24,Office,,",
      "Review Cafe,2026-07-06,10,2,13.5,Meals,,",
    ]);
    assert.equal(result.sheet.validation.needsReviewCount, 1);
    assert.deepEqual(result.sheet.validation.needsReviewRows, [
      {
        index: 1,
        issues: result.receipts[1].validation.issues,
        reasons: ["net plus VAT does not equal gross."],
        rowNumber: 2,
      },
    ]);
    assert.equal(
      result.sheet.validation.needsReviewRows[0].issues[0].type,
      "vat-mismatch",
    );
  });
}

async function verifyLocationContextModule() {
  await withNetworkBlocked(async () => {
    const grantedCalls = [];
    const grantedContext = await getReceiptLocation({
      location: {
        async getCurrentPositionAsync(options) {
          grantedCalls.push(["getCurrentPosition", options]);

          return {
            coords: {
              latitude: 51.5074,
              longitude: -0.1278,
            },
          };
        },
        async requestForegroundPermissionsAsync() {
          grantedCalls.push(["requestForegroundPermissions"]);
          return { status: "granted" };
        },
        async reverseGeocodeAsync(coords) {
          grantedCalls.push(["reverseGeocode", coords]);

          return [
            {
              city: "London",
              country: "United Kingdom",
              name: "Soho Market",
              region: "England",
            },
          ];
        },
      },
    });

    assert.deepEqual(grantedCalls, [
      ["requestForegroundPermissions"],
      ["getCurrentPosition", {}],
      ["reverseGeocode", { latitude: 51.5074, longitude: -0.1278 }],
    ]);
    assert.deepEqual(grantedContext, {
      latitude: 51.5074,
      longitude: -0.1278,
      placeName: "Soho Market",
      city: "London",
      region: "England",
      country: "United Kingdom",
    });

    let requestedPositionAfterDenied = false;
    let reverseGeocodedAfterDenied = false;
    const deniedContext = await getReceiptLocation({
      location: {
        async getCurrentPositionAsync() {
          requestedPositionAfterDenied = true;
          return { coords: { latitude: 51.5074, longitude: -0.1278 } };
        },
        async requestForegroundPermissionsAsync() {
          return { granted: false, status: "denied" };
        },
        async reverseGeocodeAsync() {
          reverseGeocodedAfterDenied = true;
          return [];
        },
      },
    });

    assert.equal(deniedContext, null);
    assert.equal(requestedPositionAfterDenied, false);
    assert.equal(reverseGeocodedAfterDenied, false);

    const unavailableContext = await getReceiptLocation({
      location: {
        async requestForegroundPermissionsAsync() {
          return { granted: true };
        },
      },
    });
    assert.equal(unavailableContext, null);

    const errorContext = await getReceiptLocation({
      location: {
        async getCurrentPositionAsync() {
          throw new Error("Location unavailable.");
        },
        async requestForegroundPermissionsAsync() {
          return { status: "granted" };
        },
        async reverseGeocodeAsync() {
          return [];
        },
      },
    });
    assert.equal(errorContext, null);

    const partialContext = await getReceiptLocation({
      location: {
        async getCurrentPositionAsync() {
          return {
            coords: {
              latitude: 40.7128,
              longitude: -74.006,
            },
          };
        },
        async requestForegroundPermissionsAsync() {
          return { granted: true };
        },
        async reverseGeocodeAsync() {
          return [];
        },
      },
    });
    assert.deepEqual(partialContext, {
      latitude: 40.7128,
      longitude: -74.006,
      placeName: null,
      city: null,
      region: null,
      country: null,
    });
    const thrownGeocodeContext = await getReceiptLocation({
      location: {
        async getCurrentPositionAsync() {
          return {
            coords: {
              latitude: 48.8566,
              longitude: 2.3522,
            },
          };
        },
        async requestForegroundPermissionsAsync() {
          return { granted: true };
        },
        async reverseGeocodeAsync() {
          throw new Error("Geocoder unavailable.");
        },
      },
    });
    assert.deepEqual(thrownGeocodeContext, {
      latitude: 48.8566,
      longitude: 2.3522,
      placeName: null,
      city: null,
      region: null,
      country: null,
    });
    const capturedCoordinateCalls = [];
    const capturedCoordinateContext = await getReceiptLocation({
      coords: {
        latitude: 34.0522,
        longitude: -118.2437,
      },
      location: {
        async getCurrentPositionAsync() {
          capturedCoordinateCalls.push(["getCurrentPosition"]);
          return { coords: { latitude: 0, longitude: 0 } };
        },
        async requestForegroundPermissionsAsync() {
          capturedCoordinateCalls.push(["requestForegroundPermissions"]);
          return { granted: false };
        },
        async reverseGeocodeAsync(coords) {
          capturedCoordinateCalls.push(["reverseGeocode", coords]);

          return [
            {
              city: "Los Angeles",
              country: "United States",
              name: "Client Studio",
              region: "California",
            },
          ];
        },
      },
    });
    assert.deepEqual(capturedCoordinateCalls, [
      ["reverseGeocode", { latitude: 34.0522, longitude: -118.2437 }],
    ]);
    assert.deepEqual(capturedCoordinateContext, {
      latitude: 34.0522,
      longitude: -118.2437,
      placeName: "Client Studio",
      city: "Los Angeles",
      region: "California",
      country: "United States",
    });

    const receipt = {
      context: { source: "camera" },
      fields: { gross: 24, vendor: "Soho Market" },
    };
    const originalSnapshot = JSON.parse(JSON.stringify(receipt));
    const attachedReceipt = attachLocation(receipt, grantedContext);

    assert.notEqual(attachedReceipt, receipt);
    assert.notEqual(attachedReceipt.context, receipt.context);
    assert.deepEqual(receipt, originalSnapshot);
    assert.deepEqual(attachedReceipt, {
      context: {
        location: grantedContext,
        source: "camera",
      },
      fields: { gross: 24, vendor: "Soho Market" },
    });
  });
}

async function verifyCalendarContextModule() {
  const capturedAt = "2026-07-08T10:30:00+01:00";
  const overlappingEvent = {
    calendarId: "work",
    endDate: "2026-07-08T11:00:00+01:00",
    id: "event-overlap",
    startDate: "2026-07-08T10:00:00+01:00",
    title: "Acme Ltd - VAT review",
  };
  const nearerNonOverlap = {
    calendarId: "work",
    endDate: "2026-07-08T10:20:00+01:00",
    id: "event-near-past",
    startDate: "2026-07-08T10:15:00+01:00",
    title: "Internal sync",
  };
  const nearestEvent = {
    calendarId: "work",
    endDate: "2026-07-08T12:00:00+01:00",
    id: "event-nearest",
    startDate: "2026-07-08T11:15:00+01:00",
    title: "Beta Co - Planning",
  };
  const outsideWindowEvent = {
    calendarId: "work",
    endDate: "2026-07-08T13:30:00+01:00",
    id: "event-outside",
    startDate: "2026-07-08T12:45:00+01:00",
    title: "Gamma Co - Follow-up",
  };

  assert.equal(
    findEventForReceipt(capturedAt, [nearerNonOverlap, overlappingEvent]),
    overlappingEvent,
  );
  assert.equal(
    findEventForReceipt(capturedAt, [outsideWindowEvent, nearestEvent]),
    nearestEvent,
  );
  assert.equal(
    findEventForReceipt(capturedAt, [outsideWindowEvent], {
      windowMinutes: 60,
    }),
    null,
  );
  assert.equal(findEventForReceipt(capturedAt, []), null);

  assert.deepEqual(deriveBillable(overlappingEvent), {
    billable: true,
    client: "Acme Ltd",
    project: "VAT review",
  });
  assert.deepEqual(
    deriveBillable({
      endDate: "2026-07-08T13:00:00+01:00",
      startDate: "2026-07-08T12:00:00+01:00",
      title: "Lunch with Sam",
    }),
    {
      billable: false,
      client: null,
      project: null,
    },
  );

  const calls = [];
  const fakeCalendar = {
    EntityTypes: { EVENT: "event" },
    async getCalendarsAsync(entityType) {
      calls.push(["getCalendars", entityType]);
      return [{ id: "work" }];
    },
    async getEventsAsync(calendarIds, startDate, endDate) {
      calls.push([
        "getEvents",
        calendarIds,
        startDate.toISOString(),
        endDate.toISOString(),
      ]);
      return [nearestEvent, overlappingEvent];
    },
    async requestCalendarPermissionsAsync() {
      calls.push(["requestCalendarPermissions"]);
      return { status: "granted" };
    },
  };

  const calContext = await getReceiptCalendarContext(capturedAt, {
    calendar: fakeCalendar,
  });

  assert.deepEqual(calls, [
    ["requestCalendarPermissions"],
    ["getCalendars", "event"],
    [
      "getEvents",
      ["work"],
      "2026-07-08T08:00:00.000Z",
      "2026-07-08T11:00:00.000Z",
    ],
  ]);
  assert.deepEqual(calContext, {
    billable: {
      billable: true,
      client: "Acme Ltd",
      project: "VAT review",
    },
    calendar: {
      calendarId: "work",
      endDate: "2026-07-08T10:00:00.000Z",
      eventId: "event-overlap",
      location: null,
      startDate: "2026-07-08T09:00:00.000Z",
      title: "Acme Ltd - VAT review",
    },
  });

  const deniedContext = await getReceiptCalendarContext(capturedAt, {
    calendar: {
      async requestCalendarPermissionsAsync() {
        return { status: "denied" };
      },
    },
  });
  assert.equal(deniedContext, null);

  const emptyContext = await getReceiptCalendarContext(capturedAt, {
    calendar: {
      EntityTypes: { EVENT: "event" },
      async getCalendarsAsync() {
        return [{ id: "work" }];
      },
      async getEventsAsync() {
        return [];
      },
      async requestCalendarPermissionsAsync() {
        return { granted: true };
      },
    },
  });
  assert.equal(emptyContext, null);

  const minimalCalls = [];
  const minimalFakeContext = await getReceiptCalendarContext(capturedAt, {
    calendar: {
      async getEventsAsync(startDate, endDate) {
        minimalCalls.push([startDate.toISOString(), endDate.toISOString()]);
        return [nearestEvent];
      },
      async requestCalendarPermissionsAsync() {
        return { status: "granted" };
      },
    },
  });
  assert.deepEqual(minimalCalls, [
    ["2026-07-08T08:00:00.000Z", "2026-07-08T11:00:00.000Z"],
  ]);
  assert.equal(minimalFakeContext.calendar.eventId, "event-nearest");

  const receipt = {
    context: { source: "camera" },
    fields: { gross: 24, vendor: "Acme Cafe" },
  };
  const attachedReceipt = attachCalendarContext(receipt, calContext);

  assert.notEqual(attachedReceipt, receipt);
  assert.deepEqual(receipt.context, { source: "camera" });
  assert.deepEqual(attachedReceipt, {
    context: {
      billable: calContext.billable,
      calendar: calContext.calendar,
      source: "camera",
    },
    fields: { gross: 24, vendor: "Acme Cafe" },
  });
}

async function verifyEnrichReceiptModule() {
  await withNetworkBlocked(async () => {
    const capturedAt = "2026-07-08T10:30:00+01:00";
    const matchingEvent = {
      calendarId: "work",
      endDate: "2026-07-08T11:00:00+01:00",
      id: "event-acme",
      location: "Client office",
      startDate: "2026-07-08T10:00:00+01:00",
      title: "Acme Ltd - VAT review",
    };
    const receipt = {
      capturedAt,
      context: {
        location: {
          latitude: 51.5074,
          longitude: -0.1278,
          placeName: null,
          city: null,
          region: null,
          country: null,
        },
      },
      fields: { gross: 24, vendor: "Acme Cafe" },
      source: "camera",
      validation: { issues: [], needsReview: false },
    };
    const originalSnapshot = JSON.parse(JSON.stringify(receipt));
    const locationCalls = [];
    const enrichedReceipt = await enrichReceipt(receipt, {
      events: [matchingEvent],
      location: {
        async getCurrentPositionAsync(options) {
          locationCalls.push(["getCurrentPosition", options]);

          return {
            coords: {
              latitude: 51.5074,
              longitude: -0.1278,
            },
          };
        },
        async requestForegroundPermissionsAsync() {
          locationCalls.push(["requestForegroundPermissions"]);
          return { status: "granted" };
        },
        async reverseGeocodeAsync(coords) {
          locationCalls.push(["reverseGeocode", coords]);

          return [
            {
              city: "London",
              country: "United Kingdom",
              name: "Acme Cafe",
              region: "England",
            },
          ];
        },
      },
    });

    assert.notEqual(enrichedReceipt, receipt);
    assert.deepEqual(receipt, originalSnapshot);
    assert.deepEqual(locationCalls, [
      ["reverseGeocode", { latitude: 51.5074, longitude: -0.1278 }],
    ]);
    assert.deepEqual(enrichedReceipt.context.location, {
      latitude: 51.5074,
      longitude: -0.1278,
      placeName: "Acme Cafe",
      city: "London",
      region: "England",
      country: "United Kingdom",
    });
    assert.deepEqual(enrichedReceipt.context.calendar, {
      calendarId: "work",
      endDate: "2026-07-08T10:00:00.000Z",
      eventId: "event-acme",
      location: "Client office",
      startDate: "2026-07-08T09:00:00.000Z",
      title: "Acme Ltd - VAT review",
    });
    assert.deepEqual(enrichedReceipt.context.billable, {
      billable: true,
      client: "Acme Ltd",
      project: "VAT review",
    });
    assert.equal(enrichedReceipt.context.source, "camera");

    let libraryProviderCalled = false;
    const libraryReceipt = {
      capturedAt,
      fields: { gross: 12, vendor: "Library Cafe" },
      source: "library",
    };
    const untouchedLibraryReceipt = await enrichReceipt(libraryReceipt, {
      events: [matchingEvent],
      location: {
        async getCurrentPositionAsync() {
          libraryProviderCalled = true;
          return { coords: { latitude: 51.5074, longitude: -0.1278 } };
        },
        async requestForegroundPermissionsAsync() {
          libraryProviderCalled = true;
          return { status: "granted" };
        },
        async reverseGeocodeAsync() {
          libraryProviderCalled = true;
          return [];
        },
      },
    });

    assert.equal(untouchedLibraryReceipt, libraryReceipt);
    assert.equal(libraryProviderCalled, false);

    let requestedPositionAfterDenied = false;
    let requestedEventsAfterDenied = false;
    const deniedReceipt = {
      capturedAt,
      fields: { gross: 15, vendor: "Denied Cafe" },
      source: "camera",
    };
    const deniedResult = await enrichReceipt(deniedReceipt, {
      calendar: {
        async getEventsAsync() {
          requestedEventsAfterDenied = true;
          return [matchingEvent];
        },
        async requestCalendarPermissionsAsync() {
          return { status: "denied" };
        },
      },
      location: {
        async getCurrentPositionAsync() {
          requestedPositionAfterDenied = true;
          return { coords: { latitude: 51.5074, longitude: -0.1278 } };
        },
        async requestForegroundPermissionsAsync() {
          return { status: "denied" };
        },
        async reverseGeocodeAsync() {
          return [];
        },
      },
    });

    assert.equal(deniedResult, deniedReceipt);
    assert.equal(requestedPositionAfterDenied, false);
    assert.equal(requestedEventsAfterDenied, false);

    const throwingReceipt = {
      capturedAt,
      fields: { gross: 18, vendor: "Throwing Cafe" },
      source: "camera",
    };
    const throwingResult = await enrichReceipt(throwingReceipt, {
      calendar: {
        async getEventsAsync() {
          throw new Error("Calendar unavailable.");
        },
        async requestCalendarPermissionsAsync() {
          return { status: "granted" };
        },
      },
      location: {
        async getCurrentPositionAsync() {
          throw new Error("Location unavailable.");
        },
        async requestForegroundPermissionsAsync() {
          return { status: "granted" };
        },
        async reverseGeocodeAsync() {
          return [];
        },
      },
    });

    assert.equal(throwingResult, throwingReceipt);

    const slowReceipt = {
      capturedAt,
      fields: { gross: 21, vendor: "Slow Cafe" },
      source: "camera",
    };
    const slowStartedAt = Date.now();
    const slowResult = await enrichReceipt(slowReceipt, {
      calendar: {
        async getEventsAsync() {
          return [matchingEvent];
        },
        async requestCalendarPermissionsAsync() {
          return new Promise(() => {});
        },
      },
      location: {
        async getCurrentPositionAsync() {
          return { coords: { latitude: 51.5074, longitude: -0.1278 } };
        },
        async requestForegroundPermissionsAsync() {
          return new Promise(() => {});
        },
        async reverseGeocodeAsync() {
          return [];
        },
      },
    });
    const slowElapsedMs = Date.now() - slowStartedAt;

    assert.equal(slowResult, slowReceipt);
    assert.ok(
      slowElapsedMs < ENRICHMENT_TIMEOUT_MS + 1000,
      `slow enrichment resolved after ${slowElapsedMs}ms`,
    );

    const pipelineResult = await processReceipts(
      [{ mimeType: "image/jpeg", uri: "file://pipeline-enrichment.jpg" }],
      {
        vision: {
          async extractReceipt() {
            return {
              fields: {
                category: { confidence: 0.95, value: "Meals" },
                date: { confidence: 0.96, value: "2026-07-08" },
                gross: { confidence: 0.98, value: "24.00" },
                net: { confidence: 0.98, value: "20.00" },
                vat: { confidence: 0.98, value: "4.00" },
                vendor: { confidence: 0.99, value: "Pipeline Cafe" },
              },
            };
          },
        },
      },
    );
    const pipelineReceipt = {
      ...pipelineResult.receipts[0],
      capturedAt,
      source: "camera",
    };
    const pendingEnrichment = enrichReceipt(pipelineReceipt, {
      events: [],
      location: {
        async getCurrentPositionAsync() {
          return { coords: { latitude: 51.5074, longitude: -0.1278 } };
        },
        async requestForegroundPermissionsAsync() {
          return new Promise(() => {});
        },
        async reverseGeocodeAsync() {
          return [];
        },
      },
    });

    assert.equal(pipelineResult.receipts.length, 1);
    assert.equal(pipelineResult.failures.length, 0);
    assert.deepEqual(pipelineResult.sheet.csv.split("\n"), [
      "vendor,date,net,vat,gross,category,location,billable_client",
      "Pipeline Cafe,2026-07-08,20,4,24,Meals,,",
    ]);
    assert.equal(pipelineResult.sheet.validation.needsReviewCount, 0);
    assert.equal(await pendingEnrichment, pipelineReceipt);
  });
}

function verifyIntegrationRoadmap() {
  const roadmap = fs.readFileSync("docs/integration-roadmap.md", "utf8");
  const pixelPlan = fs.readFileSync("docs/android-pixel-test-plan.md", "utf8");

  assert.match(roadmap, /current MVP remains/);
  assert.match(
    roadmap,
    /Provider-specific account records are intentionally excluded/,
  );
  assert.match(roadmap, /Default runtime is Supabase-only/);
  assert.match(roadmap, /Composio and MCP are backend adapters/);
  assert.match(roadmap, /enabled backend `integration_sources`/);
  assert.match(roadmap, /arbitrary server URLs/);
  assert.match(roadmap, /Schedules, Location Suggestions, And Code Runs/);
  assert.match(roadmap, /Daytona-style code execution/);
  assert.match(roadmap, /coarse-only location suggestion from mobile/);
  assert.match(roadmap, /foreground\/resume device heartbeats/);
  assert.match(roadmap, /dedicated worker token/);
  assert.match(roadmap, /cannot impersonate worker health/);
  assert.match(roadmap, /user-scoped mobile sync/);
  assert.match(roadmap, /schedule jobs, location suggestions, and code execution request summaries/);
  assert.match(roadmap, /trigger create\/edit\/pause\/resume\/delete/);
  assert.match(roadmap, /approve or deny approval-required trigger runs/);
  assert.match(roadmap, /npm run test:e2e/);
  assert.match(roadmap, /Mobile bundle\/env audit/);
  assert.match(pixelPlan, /Pixel device/);
  assert.match(pixelPlan, /Killed-app behavior is recorded instead of assumed/);
  assert.match(pixelPlan, /coarse coordinates/);
}

async function verifyIntegrationBackendClientModule() {
  const explicit = getIntegrationBackendConfig({
    EXPO_PUBLIC_STRUCTLY_FUNCTIONS_URL: "https://api.structly.app/functions",
  });
  const derived = getIntegrationBackendConfig({
    EXPO_PUBLIC_SUPABASE_URL: "https://project.supabase.co/",
  });
  const missing = getIntegrationBackendConfig({});

  assert.equal(explicit.functionsUrl, "https://api.structly.app/functions");
  assert.equal(
    derived.functionsUrl,
    "https://project.supabase.co/functions/v1",
  );
  assert.equal(missing.functionsUrl, null);
  assert.equal(missing.error, "Structly backend is not configured.");
  assert.equal(
    buildFunctionUrl(derived, "heartbeat-ingest"),
    "https://project.supabase.co/functions/v1/heartbeat-ingest",
  );
  assert.deepEqual(
    createIntegrationHeaders({
      anonKey: "anon",
      session: { access_token: "user-token" },
    }),
    {
      Authorization: "Bearer user-token",
      "Content-Type": "application/json",
      apikey: "anon",
    },
  );

  const calls = [];
  const result = await callIntegrationFunction({
    anonKey: "anon",
    body: { ok: true },
    config: derived,
    fetchImpl: async (url, options) => {
      calls.push({ options, url });
      return {
        ok: true,
        async json() {
          return { accepted: true };
        },
      };
    },
    functionName: "mobile-sync",
    session: { access_token: "user-token" },
  });

  assert.equal(result.error, null);
  assert.deepEqual(result.data, { accepted: true });
  assert.equal(
    calls[0].url,
    "https://project.supabase.co/functions/v1/mobile-sync",
  );
  assert.equal(calls[0].options.headers.Authorization, "Bearer user-token");
}

function verifyIntegrationCapabilityHealthModule() {
  const granted = getDefaultIntegrationHealth({
    background: { configured: true, supported: true },
    backend: { reachable: true },
    calendarPermission: { granted: true },
    codeExecutionConfigured: true,
    locationPermission: { status: "granted" },
    providerConfigured: true,
    schedulerConfigured: true,
  });
  const denied = getDefaultIntegrationHealth({
    backend: { reachable: false },
    calendarPermission: { status: "denied" },
    locationPermission: { granted: false },
    providerConfigured: false,
  });

  assert.equal(granted.location, CAPABILITY_STATUS.AVAILABLE);
  assert.equal(granted.calendar, CAPABILITY_STATUS.AVAILABLE);
  assert.equal(granted.background, CAPABILITY_STATUS.CONSTRAINED);
  assert.equal(granted.backend, CAPABILITY_STATUS.AVAILABLE);
  assert.equal(granted.triggers, CAPABILITY_STATUS.AVAILABLE);
  assert.equal(granted.scheduler, CAPABILITY_STATUS.AVAILABLE);
  assert.equal(granted.codeExecution, CAPABILITY_STATUS.CONSTRAINED);
  assert.equal(isIntegrationReady(granted), true);
  assert.equal(denied.location, CAPABILITY_STATUS.DENIED);
  assert.equal(denied.calendar, CAPABILITY_STATUS.DENIED);
  assert.equal(denied.backend, CAPABILITY_STATUS.OFFLINE);
  assert.equal(denied.triggers, CAPABILITY_STATUS.OFFLINE);
  assert.equal(denied.scheduler, CAPABILITY_STATUS.OFFLINE);
  assert.equal(denied.codeExecution, CAPABILITY_STATUS.OFFLINE);
  assert.equal(isIntegrationReady(denied), false);
  assert.equal(
    getBackendCapability({ stale: true }),
    CAPABILITY_STATUS.STALE,
  );
  assert.equal(
    getBackendCapability({ unauthorized: true }),
    CAPABILITY_STATUS.DENIED,
  );
  assert.match(BACKGROUND_EXECUTION_NOTE, /best effort/i);
  assert.doesNotMatch(BACKGROUND_EXECUTION_NOTE, /guaranteed/i);
  assert.deepEqual(
    getHealthRows(granted).map((row) => row.label),
    [
      "Location",
      "Calendar",
      "Backend",
      "Triggers",
      "Schedule Jobs",
      "Code Runs",
      "Background",
    ],
  );
}

function verifyHeartbeatClassificationModule() {
  const now = Date.UTC(2026, 6, 9, 12, 0, 0);

  assert.equal(
    classifyHeartbeat({ lastSeenAt: now - 10_000, now }),
    HEARTBEAT_STATUS.FRESH,
  );
  assert.equal(
    classifyHeartbeat({ lastSeenAt: now - 100_000, now }),
    HEARTBEAT_STATUS.STALE,
  );
  assert.equal(
    classifyHeartbeat({ lastSeenAt: now - 400_000, now }),
    HEARTBEAT_STATUS.FAILED,
  );
  assert.equal(classifyHeartbeat({ now }), HEARTBEAT_STATUS.UNKNOWN);
  assert.equal(
    classifyHeartbeat({ lastSeenAt: now + 1_000, now }),
    HEARTBEAT_STATUS.UNKNOWN,
  );
  assert.equal(shouldSendHeartbeat({ lastSentAt: now - 10_000, now }), false);
  assert.equal(shouldSendHeartbeat({ lastSentAt: now - 40_000, now }), true);
  assert.equal(
    createDeviceHeartbeat({
      appState: "active",
      deviceId: "device-1",
      now,
      platform: "ios",
      userId: "user-1",
    }).heartbeatType,
    "device",
  );
  assert.equal(
    createWorkerHeartbeat({ now, workerId: "worker-1" }).heartbeatType,
    "worker",
  );
  assert.equal(
    getSessionUserId({ user: { email: "fallback@example.com", id: "user-1" } }),
    "user-1",
  );
  assert.equal(
    createMobileDeviceId({ platform: "android", userId: "user-1" }),
    "structly:android:user-1",
  );
  assert.deepEqual(
    createMobileDeviceHeartbeatPayload({
      appState: "active",
      capabilities: {
        device: "Pixel",
      },
      platform: "android",
      session: { user: { id: "user-1" } },
    }),
    {
      appState: "active",
      capabilities: {
        background: "foreground_resume",
        device: "Pixel",
        location: "foreground_permission_required",
        platform: "android",
      },
      deviceId: "structly:android:user-1",
      platform: "android",
      userId: "user-1",
    },
  );
  const locationTrigger = findLocationTrigger([
    { id: "trigger-schedule", source: "schedule", status: "active" },
    { id: "trigger-location", source: "location:coarse", status: "active" },
  ]);
  const locationSuggestionPayload = createMobileLocationSuggestionPayload({
    locationTrigger,
    platform: "android",
    receipt: {
      capturedAt: "2026-07-09T12:00:00.000Z",
      context: {
        location: {
          latitude: 51.507351,
          longitude: -0.127758,
          placeName: "Soho Market",
        },
      },
    },
    session: { user: { id: "user-1" } },
  });

  assert.equal(locationTrigger.id, "trigger-location");
  assert.deepEqual(locationSuggestionPayload, {
    coords: {
      latitude: 51.51,
      longitude: -0.13,
    },
    deviceId: "structly:android:user-1",
    eventType: LOCATION_EVENT_TYPE.VISIT,
    observedAt: "2026-07-09T12:00:00.000Z",
    placeId: "Soho Market",
    placeLabel: "Soho Market",
    receiptCount: 1,
    triggerId: "trigger-location",
    userId: "user-1",
  });
  assert.equal(
    createMobileLocationSuggestionPayload({
      locationTrigger,
      receipt: {
        context: {
          location: {
            latitude: null,
            longitude: -0.127758,
          },
        },
      },
      session: { user: { id: "user-1" } },
    }),
    null,
  );
}

function verifyTriggerLifecycleModule() {
  const trigger = createTriggerDefinition({
    id: "trigger-1",
    name: "Receipt follow-up",
    source: "backend_catalog",
    type: "receipt_reviewed",
    userId: "user-1",
  });
  const event = {
    eventKey: "event-1",
    source: "database",
  };
  const existingKeys = new Set([getEventDedupeKey(event)]);
  const run = createTriggerRun({
    action: "send_email",
    event,
    id: "run-1",
    trigger,
  });
  const codeRun = createTriggerRun({
    action: "execute_code",
    event,
    id: "run-code",
    trigger,
  });

  assert.equal(trigger.status, TRIGGER_STATUS.ACTIVE);
  assert.equal(getEventDedupeKey(event), "database:event-1");
  assert.deepEqual(shouldEnqueueEvent(event, new Set()), {
    enqueue: true,
    key: "database:event-1",
    reason: null,
  });
  assert.deepEqual(shouldEnqueueEvent(event, existingKeys), {
    enqueue: false,
    key: "database:event-1",
    reason: "duplicate",
  });
  assert.equal(run.status, TRIGGER_RUN_STATUS.APPROVAL_REQUIRED);
  assert.equal(codeRun.status, TRIGGER_RUN_STATUS.APPROVAL_REQUIRED);
  assert.equal(approveTriggerRun(run, false).status, TRIGGER_RUN_STATUS.DENIED);
  assert.equal(approveTriggerRun(run, false).details.externalActionReady, false);
  assert.equal(approveTriggerRun(run, true).details.externalActionReady, true);
  assert.deepEqual(createRunApprovalPayload(run, true), {
    action: "approve",
    runId: "run-1",
    triggerId: "trigger-1",
    userId: "user-1",
  });
  assert.equal(createRunApprovalPayload(run, false).action, "deny");
  assert.equal(getTriggerDisplayStatus(trigger, [run]), "Needs approval");
  assert.equal(createTriggerPayload(trigger).action, "create");
  assert.equal(updateTriggerPayload(trigger, { name: "Updated" }).action, "update");
  assert.equal(pauseTriggerPayload(trigger).action, "pause");
  assert.equal(resumeTriggerPayload(trigger).action, "resume");
  assert.equal(deleteTriggerPayload(trigger).action, "delete");
  assert.deepEqual(
    sanitizeTriggerPatch({
      apiKey: "secret",
      name: "Safe",
      service_role: "service-secret",
      token: "token",
    }),
    { name: "Safe" },
  );
}

function verifyScheduleLocationAndCodeModules() {
  const now = Date.UTC(2026, 6, 9, 12, 0, 0);
  const job = createScheduleJob({
    intervalMinutes: 60,
    nextRunAt: now - 1000,
    scheduleKey: "hourly-review",
    triggerId: "trigger-schedule",
    userId: "user-1",
  });
  const ranJob = markScheduleJobRun(job, now);
  const schedulePayload = createScheduleTriggerPayload({
    job,
    now,
  });

  assert.equal(job.status, SCHEDULE_JOB_STATUS.ACTIVE);
  assert.equal(job.scheduleKey, "hourly-review");
  assert.equal(isScheduleJobDue({ job, now }), true);
  assert.equal(ranJob.lastRunAt, new Date(now).toISOString());
  assert.equal(schedulePayload.source, "schedule:hourly-review");
  assert.equal(schedulePayload.eventType, "schedule_tick");

  const coarseLocation = createCoarseLocation({
    latitude: 51.507351,
    longitude: -0.127758,
  });
  const event = createLocationEvent({
    coords: {
      latitude: 51.507351,
      longitude: -0.127758,
    },
    deviceId: "pixel-1",
    eventType: LOCATION_EVENT_TYPE.VISIT,
    observedAt: now,
    placeId: "soho-market",
    placeLabel: "Soho Market",
    userId: "user-1",
  });
  const suggestion = createLocationSuggestion({
    event,
    receiptCount: 2,
  });
  const locationPayload = createLocationTriggerPayload({
    event,
    suggestion,
    triggerId: "trigger-location",
  });

  assert.deepEqual(coarseLocation, {
    accuracy: "coarse",
    latitude: 51.51,
    longitude: -0.13,
  });
  assert.equal(event.source, "location:coarse");
  assert.equal(suggestion.confidence, "medium");
  assert.equal(locationPayload.payload.suggestion.suggestedAction, "review_receipt_context");
  assert.equal(
    Object.prototype.hasOwnProperty.call(locationPayload.payload, "preciseLocation"),
    false,
  );

  const codeRequest = createCodeExecutionRequest({
    code: "console.log('ok')",
    environment: {
      API_TOKEN: "secret",
      NODE_ENV: "test",
    },
    language: "typescript",
    now,
    provider: CODE_EXECUTION_PROVIDER.DAYTONA,
    userId: "user-1",
  });

  assert.deepEqual(sanitizeEnvironment({
    password: "secret",
    safe: "ok",
    service_role: "secret",
  }), { safe: "ok" });
  assert.equal(codeRequest.provider, CODE_EXECUTION_PROVIDER.DAYTONA);
  assert.equal(codeRequest.mobileExecution, false);
  assert.equal(codeRequest.approvalRequired, true);
  assert.deepEqual(codeRequest.environment, { NODE_ENV: "test" });
  assert.deepEqual(validateCodeExecutionRequest(codeRequest), {
    ok: true,
    reason: null,
  });
  assert.equal(
    validateCodeExecutionRequest({
      ...codeRequest,
      language: null,
    }).reason,
    "unsupported_language",
  );
}

function verifyIntegrationDashboardModule() {
  const unavailable = getDefaultTriggerDashboard({
    backend: { reachable: true },
    providerConfigured: false,
    userId: "user-1",
  });
  const ready = getDefaultTriggerDashboard({
    backend: { reachable: true },
    providerConfigured: true,
    userId: "user-1",
  });

  assert.equal(unavailable.provider.copy, "Connectors unavailable");
  assert.equal(unavailable.triggerControls.canCreate, false);
  assert.equal(unavailable.triggerListState, TRIGGER_LIST_STATE.LOADED);
  assert.equal(ready.triggerControls.canCreate, true);
  assert.equal(
    getTriggerListState({ loading: true }),
    TRIGGER_LIST_STATE.LOADING,
  );
  assert.equal(getTriggerListState({ error: true }), TRIGGER_LIST_STATE.ERROR);
  assert.equal(getTriggerListState({ triggers: [] }), TRIGGER_LIST_STATE.EMPTY);
  assert.ok(
    unavailable.runHistory.some(
      (run) => run.status === TRIGGER_RUN_STATUS.DEAD_LETTERED,
    ),
  );

  const synced = getDefaultTriggerDashboard({
    backend: { reachable: true },
    providerConfigured: true,
    runHistory: [
      {
        id: "run-live",
        status: TRIGGER_RUN_STATUS.APPROVAL_REQUIRED,
        trigger_id: "trigger-live",
        user_id: "user-1",
      },
    ],
    syncHydrated: true,
    triggers: [
      {
        id: "trigger-live",
        name: "Live receipt follow-up",
        source: "composio:gmail",
        status: TRIGGER_STATUS.ACTIVE,
        trigger_type: "receipt_reviewed",
        user_id: "user-1",
      },
    ],
    userId: "user-1",
  });
  const emptySynced = getDefaultTriggerDashboard({
    backend: { reachable: true },
    providerConfigured: true,
    runHistory: [],
    syncHydrated: true,
    triggers: [],
    userId: "user-1",
  });

  assert.equal(synced.triggers[0].name, "Live receipt follow-up");
  assert.equal(synced.triggers[0].displayStatus, "Needs approval");
  assert.equal(synced.runHistory[0].triggerId, "trigger-live");
  assert.equal(synced.triggerListState, TRIGGER_LIST_STATE.LOADED);
  assert.equal(emptySynced.triggerListState, TRIGGER_LIST_STATE.EMPTY);
  assert.equal(
    normalizeTriggerDefinition({
      id: "trigger-snake",
      trigger_type: "schedule_tick",
      user_id: "user-1",
    }).type,
    "schedule_tick",
  );
  assert.equal(
    normalizeTriggerRun({ id: "run-snake", trigger_id: "trigger-snake" })
      .triggerId,
    "trigger-snake",
  );
}

function verifyComposioWebhookBackendOnlySource() {
  const functionSource = fs.readFileSync(
    "supabase/functions/composio-webhook/index.ts",
    "utf8",
  );
  const appSource = fs.readFileSync("App.js", "utf8");
  const envExample = fs.readFileSync(".env.example", "utf8");

  assert.equal(
    hasComposioSignature({ "x-composio-signature": "signature" }),
    true,
  );
  const now = Date.UTC(2026, 6, 9, 12, 0, 0);
  const freshTimestamp = Math.floor(now / 1000);

  assert.deepEqual(
    validateComposioWebhookEnvelope({
      headers: {
        "composio-timestamp": String(freshTimestamp),
        "x-composio-signature": "signature",
      },
      now,
      payload: { id: "evt-1", toolkit: "gmail", trigger_id: "trg-1" },
    }).event,
    {
      eventKey: "evt-1",
      payload: { id: "evt-1", toolkit: "gmail", trigger_id: "trg-1" },
      provider: "composio",
      source: "composio:gmail",
      triggerId: "trg-1",
    },
  );
  assert.equal(
    validateComposioWebhookEnvelope({
      headers: {
        "composio-timestamp": String(freshTimestamp - 600),
        "x-composio-signature": "signature",
      },
      now,
      payload: { id: "evt-1" },
    }).error,
    "stale_timestamp",
  );
  assert.equal(normalizeComposioEvent({}).source, "composio");
  assert.match(functionSource, /signatureHeaders/);
  assert.match(functionSource, /COMPOSIO_WEBHOOK_SECRET/);
  assert.match(functionSource, /webhook-signature/);
  assert.match(functionSource, /webhook-id/);
  assert.match(functionSource, /webhook-timestamp/);
  assert.match(functionSource, /verifyWebhookSignature/);
  assert.match(functionSource, /timestampIsFresh/);
  assert.match(functionSource, /integration_events/);
  assert.match(functionSource, /trigger_runs/);
  assert.match(functionSource, /invalid_signature/);
  assert.match(functionSource, /eventKey/);
  assert.doesNotMatch(functionSource, /if \(!secret\)[\s\S]*return true/);
  assert.doesNotMatch(appSource, /COMPOSIO|service_role|composio-webhook/i);
  assert.doesNotMatch(envExample, /EXPO_PUBLIC_COMPOSIO|SERVICE_ROLE/i);
}

function verifyIntegrationHandlersBehavior() {
  const now = Date.UTC(2026, 6, 9, 12, 0, 0);
  const store = createMemoryStore({
    triggers: [
      createTriggerDefinition({
        id: "trigger-1",
        name: "Receipt follow-up",
        source: "database",
        type: "receipt_reviewed",
        userId: "user-1",
      }),
      createTriggerDefinition({
        id: "trigger-2",
        name: "Receipt archive",
        source: "database",
        type: "receipt_reviewed",
        userId: "user-1",
      }),
      createTriggerDefinition({
        id: "trigger-schedule",
        name: "Scheduled review",
        source: "schedule",
        type: "schedule_tick",
        userId: "user-1",
      }),
      createTriggerDefinition({
        id: "trigger-location",
        name: "Location suggestion",
        source: "location:coarse",
        type: "location_visit",
        userId: "user-1",
      }),
      createTriggerDefinition({
        id: "trigger-code",
        name: "Code execution",
        source: "code:daytona",
        type: "code_execution_requested",
        userId: "user-1",
      }),
    ],
  });

  assert.equal(
    handleHeartbeatIngest({
      body: {
        capabilities: { backend: "available" },
        deviceId: "device-1",
        platform: "ios",
        userId: "user-1",
      },
      now,
      store,
      token: "user-token",
    }).data.upserted,
    "created",
  );
  assert.equal(
    handleHeartbeatIngest({
      body: {
        deviceId: "device-1",
        userId: "user-1",
      },
      now: now + 1000,
      store,
      token: "user-token",
    }).data.upserted,
    "updated",
  );
  assert.equal(store.deviceHeartbeats.length, 1);
  assert.equal(
    handleHeartbeatIngest({
      body: { workerId: "worker-1", userId: "user-1" },
      now,
      store,
      token: "user-token",
    }).data.error,
    "missing_worker_auth",
  );
  assert.equal(
    handleHeartbeatIngest({
      body: { workerId: "worker-1", userId: "user-1" },
      now,
      store,
      token: "worker-token",
    }).data.status,
    HEARTBEAT_STATUS.FRESH,
  );

  const dispatch = handleTriggerDispatch({
    body: {
      action: "send_email",
      eventKey: "event-1",
      eventType: "receipt_reviewed",
      source: "database",
      triggerId: "trigger-1",
      userId: "user-1",
    },
    now,
    store,
    token: "user-token",
  });
  const duplicateDispatch = handleTriggerDispatch({
    body: {
      action: "send_email",
      eventKey: "event-1",
      eventType: "receipt_reviewed",
      source: "database",
      triggerId: "trigger-1",
      userId: "user-1",
    },
    now,
    store,
    token: "user-token",
  });
  const fanoutDispatch = handleTriggerDispatch({
    body: {
      action: "record_event",
      eventKey: "event-1",
      eventType: "receipt_reviewed",
      source: "database",
      triggerId: "trigger-2",
      userId: "user-1",
    },
    now,
    store,
    token: "user-token",
  });

  assert.equal(dispatch.status, 200);
  assert.equal(dispatch.data.run.status, TRIGGER_RUN_STATUS.APPROVAL_REQUIRED);
  assert.equal(duplicateDispatch.data.deduped, true);
  assert.equal(fanoutDispatch.status, 200);
  assert.equal(fanoutDispatch.data.deduped, false);
  assert.equal(fanoutDispatch.data.run.triggerId, "trigger-2");
  assert.equal(store.integrationEvents.length, 1);
  assert.equal(store.triggerRuns.length, 2);

  const scheduleTick = handleScheduleJobTick({
    body: {
      intervalMinutes: 1440,
      nextRunAt: now - 1000,
      scheduleKey: "daily-review",
      service: true,
      triggerId: "trigger-schedule",
      userId: "user-1",
    },
    now,
    store,
    token: "service-role",
  });
  const locationSuggestion = handleLocationSuggestion({
    body: {
      coords: {
        latitude: 51.507351,
        longitude: -0.127758,
      },
      deviceId: "pixel-1",
      observedAt: now,
      placeId: "soho-market",
      receiptCount: 1,
      triggerId: "trigger-location",
      userId: "user-1",
    },
    now,
    store,
    token: "user-token",
  });
  const codeRequest = handleCodeExecutionRequest({
    body: {
      code: "console.log('ok')",
      environment: {
        API_TOKEN: "secret",
        NODE_ENV: "test",
      },
      id: "code-request-1",
      language: "typescript",
      triggerId: "trigger-code",
      userId: "user-1",
    },
    now,
    store,
    token: "user-token",
  });

  assert.equal(scheduleTick.data.queued, true);
  assert.equal(store.scheduleJobs.length, 1);
  assert.equal(locationSuggestion.data.suggestion.confidence, "medium");
  assert.equal(store.locationEvents.length, 1);
  assert.equal(codeRequest.data.request.mobileExecution, false);
  assert.equal(codeRequest.data.request.environment.API_TOKEN, undefined);
  assert.equal(codeRequest.data.run.status, TRIGGER_RUN_STATUS.APPROVAL_REQUIRED);

  const staleWebhook = handleComposioWebhook({
    body: { id: "evt-stale", toolkit: "gmail" },
    headers: {
      "composio-timestamp": String(Math.floor(now / 1000) - 600),
      "x-composio-signature": "signature",
    },
    now,
    store,
  });
  const validWebhook = handleComposioWebhook({
    body: {
      action: "record_event",
      id: "evt-2",
      toolkit: "gmail",
      trigger_id: "trigger-1",
      user_id: "user-1",
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
      id: "evt-2",
      toolkit: "gmail",
      trigger_id: "trigger-1",
      user_id: "user-1",
    },
    headers: {
      "composio-timestamp": String(Math.floor(now / 1000)),
      "x-composio-signature": "signature",
    },
    now,
    store,
  });

  assert.equal(staleWebhook.status, 401);
  assert.equal(staleWebhook.data.error, "stale_timestamp");
  assert.equal(validWebhook.status, 200);
  assert.equal(repeatedWebhook.data.deduped, true);
  assert.equal(
    handleTriggerDispatch({
      body: { eventKey: "missing-source", triggerId: "trigger-1", userId: "user-1" },
      now,
      store,
      token: "user-token",
    }).status,
    400,
  );
  assert.equal(
    handleTriggerDispatch({
      body: { eventKey: "event-auth", source: "database" },
      now,
      store,
      token: null,
    }).status,
    401,
  );

  const status = handleStatusRead({
    now,
    store,
    token: "user-token",
    userId: "user-1",
  });
  const sync = handleMobileSync({
    store,
    token: "user-token",
    userId: "user-1",
  });

  assert.equal(status.data.backend, "available");
  assert.equal(status.data.bridge, "available");
  assert.equal(status.data.cron, "available");
  assert.equal(status.data.codeExecution, "available");
  assert.equal(status.data.locationSuggestionCount, 1);
  assert.equal(status.data.runCount, 6);
  assert.equal(status.data.workerHeartbeat, HEARTBEAT_STATUS.FRESH);
  assert.equal(sync.data.triggerDefinitions.length, 5);
  assert.equal(sync.data.scheduleJobs.length, 1);
  assert.equal(sync.data.locationSuggestions.length, 1);
  assert.equal(sync.data.codeExecutionRequests.length, 1);
  assert.equal(sync.data.runHistory.length, 6);

  const automationOnlyStatus = handleStatusRead({
    now,
    store: createMemoryStore({
      codeExecutionRequests: [
        createCodeExecutionRequest({
          code: "console.log('queued')",
          id: "code-only",
          language: "typescript",
          now,
          userId: "user-1",
        }),
      ],
      scheduleJobs: [
        createScheduleJob({
          intervalMinutes: 1440,
          nextRunAt: now,
          scheduleKey: "automation-only",
          triggerId: "trigger-schedule",
          userId: "user-1",
        }),
      ],
      triggers: [
        createTriggerDefinition({
          id: "trigger-schedule",
          name: "Schedule only",
          source: "schedule",
          type: "schedule_tick",
          userId: "user-1",
        }),
        createTriggerDefinition({
          id: "trigger-code",
          name: "Code only",
          source: "code:daytona",
          type: "code_execution_requested",
          userId: "user-1",
        }),
      ],
    }),
    token: "user-token",
    userId: "user-1",
  });

  assert.equal(automationOnlyStatus.data.bridge, "unavailable");
  assert.equal(automationOnlyStatus.data.cron, "available");
  assert.equal(automationOnlyStatus.data.codeExecution, "available");
}

function verifyMcpBridgeBackendOnlySource() {
  const functionSource = fs.readFileSync(
    "supabase/functions/mcp-bridge/index.ts",
    "utf8",
  );
  const appSource = fs.readFileSync("App.js", "utf8");

  assert.deepEqual(
    assertMobileSafeMcpServer({
      transport: MCP_TRANSPORT.STREAMABLE_HTTP,
      url: "https://mcp.example.com",
    }),
    { ok: true, reason: null },
  );
  assert.equal(
    assertMobileSafeMcpServer({ transport: MCP_TRANSPORT.STDIO }).reason,
    "stdio_not_supported_on_mobile",
  );
  assert.deepEqual(
    getMobileSafeToolCatalog(
      [
        { description: "Allowed", inputSchema: { type: "object" }, name: "safe" },
        { name: "blocked" },
      ],
      ["safe"],
    ),
    [{ description: "Allowed", inputSchema: { type: "object" }, name: "safe" }],
  );
  assert.deepEqual(
    buildMcpToolInvocation({
      arguments: { id: "receipt-1" },
      serverId: "server-1",
      toolName: "safe",
    }),
    {
      arguments: { id: "receipt-1" },
      serverId: "server-1",
      toolName: "safe",
      transport: MCP_TRANSPORT.STREAMABLE_HTTP,
    },
  );
  assert.match(functionSource, /streamable_http/);
  assert.match(functionSource, /auth\/v1\/user/);
  assert.match(functionSource, /user_mismatch/);
  assert.match(functionSource, /tools\/list/);
  assert.match(functionSource, /tools\/call/);
  assert.match(functionSource, /application\/json, text\/event-stream/);
  assert.match(functionSource, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(functionSource, /integration_sources/);
  assert.match(functionSource, /allowedTools/);
  assert.match(functionSource, /mcp_tool_not_allowed/);
  assert.match(functionSource, /mcp_server_mismatch/);
  assert.match(functionSource, /blockedHostPattern/);
  assert.match(functionSource, /isSafeRemoteHttpUrl/);
  assert.match(functionSource, /remote_http_required/);
  assert.match(functionSource, /mcp_request_failed/);
  assert.match(functionSource, /missing_auth/);
  assert.doesNotMatch(functionSource, /stdio/);
  assert.doesNotMatch(appSource, /@modelcontextprotocol|stdio|MCP_API_KEY/);
}

function verifyObservabilityAndRedactionSource() {
  const redacted = redactSensitive({
    access_token: "token",
    nested: {
      preciseLocation: "51.5,-0.1",
      receiptText: "full receipt",
    },
    safe: "ok",
    service_role: "service",
  });
  const audit = buildAuditEvent({
    action: "trigger.run",
    eventId: "event-1",
    runId: "run-1",
    status: "succeeded",
  });

  assert.equal(redacted.access_token, "[redacted]");
  assert.equal(redacted.service_role, "[redacted]");
  assert.equal(redacted.nested.preciseLocation, "[redacted]");
  assert.equal(redacted.nested.receiptText, "[redacted]");
  assert.equal(redacted.safe, "ok");
  assert.equal(audit.terminal, true);
  assert.equal(audit.eventId, "event-1");
  assert.deepEqual(
    buildHealthSummary({
      bridge: "available",
      cron: "fresh",
      realtime: "available",
      webhook: "available",
      workerHeartbeat: "fresh",
    }),
    {
      bridge: "available",
      cron: "fresh",
      realtime: "available",
      webhook: "available",
      workerHeartbeat: "fresh",
    },
  );
  assert.equal(buildRunTimeline({ status: "succeeded" }).length, 2);
  assert.equal(
    summarizeRunForUser({ status: "approval_required" }),
    "Needs your approval.",
  );
}

function verifySupabaseIntegrationSources() {
  const migrationFiles = fs
    .readdirSync("supabase/migrations")
    .filter((name) => name.endsWith(".sql"));
  const migration = migrationFiles
    .map((name) => fs.readFileSync(`supabase/migrations/${name}`, "utf8"))
    .join("\n");
  const functions = [
    "mobile-sync",
    "heartbeat-ingest",
    "run-actions",
    "trigger-actions",
    "trigger-dispatch",
    "status-read",
    "composio-webhook",
    "mcp-bridge",
    "schedule-jobs",
    "location-suggestions",
    "code-execution-bridge",
    "code-execution-runner",
  ];

  assert.ok(migrationFiles.length > 0);
  for (const table of [
    "integration_events",
    "trigger_definitions",
    "trigger_runs",
    "device_heartbeats",
    "worker_heartbeats",
    "integration_audit_logs",
    "dead_letter_events",
    "schedule_jobs",
    "location_event_suggestions",
    "code_execution_requests",
  ]) {
    assert.match(
      migration,
      new RegExp(`create table if not exists public\\.${table}`),
    );
    assert.match(
      migration,
      new RegExp(`alter table public\\.${table} enable row level security`),
    );
  }
  assert.match(migration, /auth\.uid\(\) = user_id/);
  assert.match(migration, /auth\.role\(\) = 'authenticated'/);
  assert.match(migration, /unique \(source, event_key\)/);
  assert.match(migration, /unique \(trigger_id, idempotency_key\)/);
  assert.doesNotMatch(migration, /connector_accounts/);
  assert.match(
    fs.readFileSync("supabase/config.toml", "utf8"),
    /\[realtime\]\nenabled = true/,
  );
  for (const functionName of functions) {
    assert.ok(fs.existsSync(`supabase/functions/${functionName}/index.ts`));
  }
  assert.match(
    fs.readFileSync("supabase/functions/mobile-sync/index.ts", "utf8"),
    /auth\/v1\/user[\s\S]*user_id=eq\.\$\{userFilter\}[\s\S]*integration_sources[\s\S]*schedule_jobs[\s\S]*location_event_suggestions[\s\S]*code_execution_requests/,
  );
  assert.doesNotMatch(
    fs.readFileSync("supabase/functions/mobile-sync/index.ts", "utf8"),
    /environment|request_payload/,
  );
  assert.doesNotMatch(
    fs.readFileSync("supabase/functions/mobile-sync/index.ts", "utf8"),
    /select=\*/,
  );
  assert.match(
    fs.readFileSync("supabase/functions/trigger-dispatch/index.ts", "utf8"),
    /auth\/v1\/user[\s\S]*user_mismatch[\s\S]*integration_events[\s\S]*trigger_runs[\s\S]*on_conflict=trigger_id,idempotency_key/,
  );
  const runActionSource = fs.readFileSync(
    "supabase/functions/run-actions/index.ts",
    "utf8",
  );
  assert.match(runActionSource, /auth\/v1\/user/);
  assert.match(runActionSource, /allowedActions/);
  assert.match(runActionSource, /trigger_runs/);
  assert.match(runActionSource, /user_id=eq\.\$\{userFilter\}/);
  assert.match(runActionSource, /status=eq\.approval_required/);
  assert.match(runActionSource, /externalActionReady/);
  const triggerActionSource = fs.readFileSync(
    "supabase/functions/trigger-actions/index.ts",
    "utf8",
  );
  assert.match(triggerActionSource, /auth\/v1\/user/);
  assert.match(triggerActionSource, /allowedActions/);
  assert.match(triggerActionSource, /allowedPatchKeys/);
  assert.match(triggerActionSource, /trigger_definitions/);
  assert.match(triggerActionSource, /user_id=eq\.\$\{userFilter\}/);
  assert.match(triggerActionSource, /status: "deleted"/);
  const heartbeatSource = fs.readFileSync(
    "supabase/functions/heartbeat-ingest/index.ts",
    "utf8",
  );
  assert.match(heartbeatSource, /auth\/v1\/user/);
  assert.match(heartbeatSource, /WORKER_HEARTBEAT_TOKEN/);
  assert.match(heartbeatSource, /missing_worker_auth/);
  assert.match(heartbeatSource, /user_mismatch/);
  assert.match(heartbeatSource, /device_heartbeats/);
  assert.match(heartbeatSource, /worker_heartbeats/);
  assert.match(heartbeatSource, /resolution=merge-duplicates/);
  const statusReadSource = fs.readFileSync(
    "supabase/functions/status-read/index.ts",
    "utf8",
  );
  assert.match(statusReadSource, /trigger_runs[\s\S]*worker_heartbeats/);
  assert.match(statusReadSource, /integration_sources/);
  assert.match(statusReadSource, /trigger_definitions/);
  assert.match(statusReadSource, /bridge,/);
  assert.match(statusReadSource, /codeExecution/);
  assert.match(statusReadSource, /cron/);
  assert.match(statusReadSource, /locationSuggestionCount/);
  assert.match(statusReadSource, /auth\/v1\/user/);
  assert.match(statusReadSource, /user_id=eq\.\$\{userFilter\}/);
  assert.match(statusReadSource, /isProviderTrigger/);
  assert.match(
    fs.readFileSync("supabase/functions/schedule-jobs/index.ts", "utf8"),
    /SCHEDULE_JOBS_TOKEN[\s\S]*trigger_runs/,
  );
  assert.doesNotMatch(
    fs.readFileSync("supabase/functions/schedule-jobs/index.ts", "utf8"),
    /startsWith\("bearer "\)/,
  );
  assert.match(
    fs.readFileSync("supabase/functions/location-suggestions/index.ts", "utf8"),
    /auth\/v1\/user[\s\S]*user_mismatch[\s\S]*location_event_suggestions[\s\S]*integration_events[\s\S]*trigger_runs/,
  );
  assert.match(
    fs.readFileSync("supabase/functions/code-execution-bridge/index.ts", "utf8"),
    /auth\/v1\/user[\s\S]*user_mismatch[\s\S]*DAYTONA_API_KEY[\s\S]*code_execution_requests[\s\S]*integration_events[\s\S]*trigger_runs/,
  );
  const codeRunnerSource = fs.readFileSync(
    "supabase/functions/code-execution-runner/index.ts",
    "utf8",
  );
  assert.match(codeRunnerSource, /CODE_EXECUTION_RUNNER_TOKEN/);
  assert.match(codeRunnerSource, /DAYTONA_API_KEY/);
  assert.match(codeRunnerSource, /proxy\.app\.daytona\.io/);
  assert.match(codeRunnerSource, /\/process\/code-run/);
  assert.match(codeRunnerSource, /\/process\/execute/);
  assert.match(codeRunnerSource, /code_execution_requests/);
}

function verifyIntegrationUiSource() {
  const appSource = fs.readFileSync("App.js", "utf8");
  const capabilitySource = fs.readFileSync(
    "src/lib/integrationCapabilities.js",
    "utf8",
  );
  const dashboardSource = fs.readFileSync(
    "src/lib/integrationDashboard.js",
    "utf8",
  );

  assert.match(appSource, /Integration health/);
  assert.match(appSource, /AppState\.addEventListener/);
  assert.match(appSource, /callIntegrationFunction/);
  assert.match(appSource, /functionName: "status-read"/);
  assert.match(appSource, /functionName: "heartbeat-ingest"/);
  assert.match(appSource, /functionName: "location-suggestions"/);
  assert.match(appSource, /functionName: "mobile-sync"/);
  assert.match(appSource, /functionName: "run-actions"/);
  assert.match(appSource, /functionName: "trigger-actions"/);
  assert.match(appSource, /handleRunAction/);
  assert.match(appSource, /createRunApprovalPayload/);
  assert.match(appSource, /TRIGGER_RUN_STATUS\.APPROVAL_REQUIRED/);
  assert.match(appSource, /Approve/);
  assert.match(appSource, /Deny/);
  assert.match(appSource, /createMobileDeviceHeartbeatPayload/);
  assert.match(appSource, /createMobileLocationSuggestionPayload/);
  assert.match(appSource, /findLocationTrigger/);
  assert.match(appSource, /shouldSendHeartbeat/);
  assert.match(appSource, /Location suggestion queued/);
  assert.match(appSource, /handleTriggerAction/);
  assert.match(appSource, /createTriggerPayload/);
  assert.match(appSource, /pauseTriggerPayload/);
  assert.match(appSource, /resumeTriggerPayload/);
  assert.match(appSource, /deleteTriggerPayload/);
  assert.match(appSource, /integrationSync/);
  assert.match(appSource, /scheduleJobs/);
  assert.match(appSource, /locationSuggestions/);
  assert.match(appSource, /codeExecutionRequests/);
  assert.match(appSource, /Schedule jobs:/);
  assert.match(appSource, /Location suggestions:/);
  assert.match(appSource, /Code requests:/);
  assert.match(appSource, /triggerDefinitions/);
  assert.match(appSource, /runHistory/);
  assert.match(appSource, /providerConfigured: data\.bridge === "available"/);
  assert.match(appSource, /setBackendStatus/);
  assert.match(appSource, /getDefaultTriggerDashboard/);
  assert.match(appSource, /getHealthRows/);
  assert.match(appSource, /Connector status/);
  assert.match(capabilitySource, /Schedule Jobs/);
  assert.match(capabilitySource, /Code Runs/);
  assert.match(appSource, /Trigger list/);
  assert.match(appSource, /Catalog source: backend/);
  assert.match(appSource, /Create trigger/);
  assert.match(appSource, /Edit/);
  assert.match(appSource, /Pause/);
  assert.match(appSource, /Resume/);
  assert.match(appSource, /Delete/);
  assert.match(appSource, /Run history/);
  assert.match(appSource, /run\.status/);
  assert.match(dashboardSource, /APPROVAL_REQUIRED/);
  assert.match(dashboardSource, /SUCCEEDED/);
  assert.match(dashboardSource, /RETRYING/);
  assert.match(dashboardSource, /FAILED/);
  assert.match(dashboardSource, /DEAD_LETTERED/);
  assert.doesNotMatch(
    appSource,
    /OpenClaw|Hermes|gateway token|worker implementation|DAYTONA|COMPOSIO|SERVICE_ROLE/i,
  );
}

function verifyE2EHarnessSource() {
  const e2eSource = fs.readFileSync("scripts/verify-e2e.js", "utf8");
  const edgeHarnessSource = fs.readFileSync(
    "scripts/verify-edge-functions.js",
    "utf8",
  );
  const liveSmokeSource = fs.readFileSync(
    "scripts/verify-live-integrations.js",
    "utf8",
  );
  const pixelSmokeSource = fs.readFileSync(
    "scripts/verify-pixel-device.js",
    "utf8",
  );
  const ciDocs = fs.readFileSync("docs/mobile-integration-ci.md", "utf8");
  const liveSmokeDocs = fs.readFileSync("docs/live-integration-smoke.md", "utf8");
  const pixelSmokeDocs = fs.readFileSync("docs/pixel-device-smoke.md", "utf8");
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));

  assert.equal(pkg.scripts["test:ci"], "npm run test:all");
  assert.equal(
    pkg.scripts["test:e2e"],
    "node scripts/verify-e2e.js && node scripts/verify-edge-functions.js && node scripts/verify-pixel-device.js --self-test",
  );
  assert.equal(pkg.scripts["test:live"], "node scripts/verify-live-integrations.js");
  assert.equal(pkg.scripts["test:pixel"], "node scripts/verify-pixel-device.js");
  assert.equal(
    pkg.scripts["test:all"],
    "npm test && npm run audit:oauth && npm run test:e2e",
  );
  assert.match(e2eSource, /handleScheduleJobTick/);
  assert.match(e2eSource, /handleLocationSuggestion/);
  assert.match(e2eSource, /handleCodeExecutionRequest/);
  assert.match(e2eSource, /handleComposioWebhook/);
  assert.match(e2eSource, /assertMobileSafeMcpServer/);
  assert.match(e2eSource, /Pixel/);
  assert.match(edgeHarnessSource, /vm\.runInNewContext/);
  assert.match(edgeHarnessSource, /verifyMobileSyncFunction/);
  assert.match(edgeHarnessSource, /verifyHeartbeatIngestFunction/);
  assert.match(edgeHarnessSource, /verifyTriggerActionsFunction/);
  assert.match(edgeHarnessSource, /verifyRunActionsFunction/);
  assert.match(edgeHarnessSource, /verifyTriggerDispatchFunction/);
  assert.match(edgeHarnessSource, /verifyScheduleJobsFunction/);
  assert.match(edgeHarnessSource, /verifyLocationSuggestionsFunction/);
  assert.match(edgeHarnessSource, /verifyMcpBridgeFunction/);
  assert.match(edgeHarnessSource, /verifyCodeExecutionFunction/);
  assert.match(edgeHarnessSource, /verifyCodeExecutionRunnerFunction/);
  assert.match(edgeHarnessSource, /verifyStatusReadFunction/);
  assert.match(liveSmokeSource, /STRUCTLY_FUNCTIONS_URL/);
  assert.match(liveSmokeSource, /verifyStatusRead/);
  assert.match(liveSmokeSource, /verifyLocationSuggestion/);
  assert.match(liveSmokeSource, /verifyTriggerDispatch/);
  assert.match(liveSmokeSource, /verifyCodeExecution/);
  assert.match(liveSmokeSource, /verifyDaytonaExecution/);
  assert.match(liveSmokeSource, /verifyComposioWebhook/);
  assert.match(liveSmokeSource, /STRUCTLY_TEST_COMPOSIO_WEBHOOK_SECRET/);
  assert.match(liveSmokeSource, /STRUCTLY_TEST_TRIGGER_DISPATCH_TRIGGER_ID/);
  assert.match(liveSmokeSource, /verifyScheduleJob/);
  assert.match(liveSmokeSource, /verifyMcpBridge/);
  assert.match(liveSmokeSource, /STRUCTLY_TEST_CODE_RUNNER_TOKEN/);
  assert.match(liveSmokeSource, /STRUCTLY_TEST_DAYTONA_SANDBOX_ID/);
  assert.match(liveSmokeSource, /STRUCTLY_TEST_MCP_SERVER_ID/);
  assert.match(liveSmokeSource, /STRUCTLY_TEST_MCP_TOOL_ARGUMENTS_JSON/);
  assert.match(liveSmokeSource, /STRUCTLY_TEST_WORKER_HEARTBEAT_TOKEN/);
  assert.match(liveSmokeSource, /verifyDeviceHeartbeat/);
  assert.match(liveSmokeSource, /verifyWorkerHeartbeat/);
  assert.match(liveSmokeSource, /--require-live/);
  assert.match(pixelSmokeSource, /adb/);
  assert.match(pixelSmokeSource, /STRUCTLY_PIXEL_SERIAL/);
  assert.match(pixelSmokeSource, /--require-device/);
  assert.match(pixelSmokeSource, /--require-install/);
  assert.match(pixelSmokeSource, /--require-location-granted/);
  assert.match(pixelSmokeSource, /--require-location-denied/);
  assert.match(pixelSmokeSource, /--require-launch/);
  assert.match(pixelSmokeSource, /--self-test/);
  assert.match(pixelSmokeSource, /ACCESS_BACKGROUND_LOCATION/);
  assert.match(pixelSmokeSource, /foregroundLocationGranted/);
  assert.match(pixelSmokeSource, /monkey/);
  assert.match(pixelSmokeSource, /pidof/);
  assert.match(pixelSmokeSource, /ro\.product\.model/);
  assert.match(ciDocs, /npm run test:ci/);
  assert.match(ciDocs, /actions\/checkout@v5/);
  assert.match(ciDocs, /actions\/setup-node@v6/);
  assert.match(ciDocs, /workflow` scope/);
  assert.match(liveSmokeDocs, /npm run test:live/);
  assert.match(liveSmokeDocs, /STRUCTLY_TEST_USER_TOKEN/);
  assert.match(liveSmokeDocs, /STRUCTLY_TEST_TRIGGER_DISPATCH_TRIGGER_ID/);
  assert.match(liveSmokeDocs, /STRUCTLY_TEST_COMPOSIO_WEBHOOK_SECRET/);
  assert.match(liveSmokeDocs, /STRUCTLY_TEST_SCHEDULE_TOKEN/);
  assert.match(liveSmokeDocs, /STRUCTLY_TEST_CODE_RUNNER_TOKEN/);
  assert.match(liveSmokeDocs, /STRUCTLY_TEST_DAYTONA_SANDBOX_ID/);
  assert.match(liveSmokeDocs, /STRUCTLY_TEST_MCP_SERVER_ID/);
  assert.match(liveSmokeDocs, /STRUCTLY_TEST_WORKER_HEARTBEAT_TOKEN/);
  assert.match(liveSmokeDocs, /allowedTools/);
  assert.match(pixelSmokeDocs, /npm run test:pixel/);
  assert.match(pixelSmokeDocs, /Google Pixel/);
  assert.match(pixelSmokeDocs, /STRUCTLY_ANDROID_PACKAGE/);
  assert.match(pixelSmokeDocs, /--require-location-granted/);
  assert.match(pixelSmokeDocs, /--require-location-denied/);
  assert.match(pixelSmokeDocs, /--require-launch/);
}

async function main() {
  verifyScaffoldFiles();
  verifyMissingConfigDoesNotCrash();
  await verifySupabasePasswordGrant();
  await verifyReceiptCaptureModule();
  await verifyClaudeVisionClient();
  await verifyDefaultReceiptClientSelection();
  await verifyReceiptExtractionModule();
  await verifyConfirmReceiptExtractionHelper();
  verifyBuildSpreadsheetModule();
  await verifyExportShareModule();
  await verifyExportReviewedReceiptsHelper();
  verifyReviewQueueCorrections();
  verifyReceiptContextReviewHelper();
  await verifyReviewReceiptBuilder();
  await verifyReceiptPipelineModule();
  await verifyLocationContextModule();
  await verifyCalendarContextModule();
  await verifyEnrichReceiptModule();
  verifyIntegrationRoadmap();
  await verifyIntegrationBackendClientModule();
  verifyIntegrationCapabilityHealthModule();
  verifyHeartbeatClassificationModule();
  verifyTriggerLifecycleModule();
  verifyScheduleLocationAndCodeModules();
  verifyIntegrationDashboardModule();
  verifyIntegrationHandlersBehavior();
  verifyComposioWebhookBackendOnlySource();
  verifyMcpBridgeBackendOnlySource();
  verifyObservabilityAndRedactionSource();
  verifySupabaseIntegrationSources();
  verifyIntegrationUiSource();
  verifyE2EHarnessSource();
  console.log("Acceptance checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
