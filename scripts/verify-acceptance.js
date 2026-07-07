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
const { buildReceiptSheet } = require("../src/lib/buildSpreadsheet");
const {
  RECEIPT_FIELD_ROWS,
  confirmReceiptExtraction,
} = require("../src/lib/confirmReceiptExtraction");
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
const { processReceipts } = require("../src/lib/receiptPipeline");

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
  assert.match(appSource, /Take photo/);
  assert.match(appSource, /Pick from library/);
  assert.match(appSource, /Use this receipt/);
  assert.match(appSource, /Retake or change/);
  assert.match(appSource, /<Image/);
  assert.match(appSource, /buildReceiptSheet/);
  assert.match(appSource, /confirmReceiptExtraction/);
  assert.match(appSource, /confirmReceiptExtraction\(receipt,\s*\{\s*vision\s*\}\)/);
  assert.match(appSource, /RECEIPT_FIELD_ROWS\.map/);
  assert.match(appSource, /fieldRow\.label/);
  assert.match(appSource, /fieldRow\.displayValue/);
  assert.match(appSource, /Extracting receipt fields/);
  assert.match(appSource, /exportReviewedReceipts/);
  assert.ok(
    appSource.includes('import { applyCorrection } from "./src/lib/reviewQueue";'),
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
  assert.match(appSource, /Export\/Share/);
  assert.match(appSource, /onPress={handleExportShare}/);
  assert.ok(fs.existsSync("app"));
  assert.ok(fs.existsSync("src/lib/receiptCapture.js"));

  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  assert.ok(pkg.dependencies.expo);
  assert.ok(pkg.dependencies["expo-image-picker"]);

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

  const cameraResult = await takeReceiptPhoto({ imagePicker });
  assert.equal(cameraResult.error, null);
  assert.equal(cameraResult.status, "selected");
  assert.equal(cameraResult.receipt.source, "camera");
  assert.equal(cameraResult.receipt.uri, "file://receipt-camera.jpg");
  assert.equal(calls[0][0], "requestCamera");
  assert.equal(calls[1][0], "launchCamera");
  assert.equal(calls[1][1].mediaTypes, "Images");
  assert.equal(calls[1][1].quality, 0.9);

  const libraryResult = await pickReceiptFromLibrary({ imagePicker });
  assert.equal(libraryResult.error, null);
  assert.equal(libraryResult.status, "selected");
  assert.equal(libraryResult.receipt.source, "library");
  assert.equal(libraryResult.receipt.uri, "file://receipt-library.png");
  assert.deepEqual(calls[2], ["requestLibrary", false]);
  assert.equal(calls[3][0], "launchLibrary");
  assert.equal(calls[3][1].mediaTypes, "Images");
  assert.equal(calls[3][1].quality, 0.9);

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
    "vendor,date,net,vat,gross,category",
    "Acme Supplies,2026-07-01,10,2,12,Office",
    '"Comma, ""Quote"" Ltd",2026-07-02,5.5,1.1,6.6,"Meals, team"',
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
    "vendor,date,net,vat,gross,category",
    "Reviewed Market,2026-07-07,20,4,24,Office",
    "Review Cafe,2026-07-08,10,2,13.5,Meals",
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
      "vendor,date,net,vat,gross,category",
      "Clean Market,2026-07-05,20,4,24,Office",
      "Review Cafe,2026-07-06,10,2,13.5,Meals",
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
  await verifyReceiptPipelineModule();
  console.log("Acceptance checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
