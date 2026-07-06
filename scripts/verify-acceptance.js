const assert = require("assert");
const fs = require("fs");

const {
  getSupabaseConfig,
  signInWithPassword,
} = require("../src/lib/supabaseAuth");

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
  assert.ok(fs.existsSync("app"));

  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  assert.ok(pkg.dependencies.expo);
  assert.equal(pkg.dependencies["expo-auth-session"], undefined);
  assert.equal(pkg.dependencies["@react-native-google-signin/google-signin"], undefined);
  assert.equal(pkg.dependencies.googleapis, undefined);
}

function verifyMissingConfigDoesNotCrash() {
  const config = getSupabaseConfig({});
  assert.equal(config.url, null);
  assert.equal(config.anonKey, null);
  assert.equal(config.error, "Supabase credentials are not configured.");
}

async function main() {
  verifyScaffoldFiles();
  verifyMissingConfigDoesNotCrash();
  await verifySupabasePasswordGrant();
  console.log("Acceptance checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
