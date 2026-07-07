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
const { extractReceipt } = require("../src/lib/extractReceipt");

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

async function main() {
  verifyScaffoldFiles();
  verifyMissingConfigDoesNotCrash();
  await verifySupabasePasswordGrant();
  await verifyReceiptCaptureModule();
  await verifyReceiptExtractionModule();
  verifyBuildSpreadsheetModule();
  console.log("Acceptance checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
