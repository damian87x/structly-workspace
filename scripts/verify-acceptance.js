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

async function main() {
  verifyScaffoldFiles();
  verifyMissingConfigDoesNotCrash();
  await verifySupabasePasswordGrant();
  await verifyReceiptCaptureModule();
  console.log("Acceptance checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
