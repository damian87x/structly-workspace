const { spawnSync } = require("child_process");

const CHECKS = [
  {
    args: ["run", "test:ci"],
    name: "CI contracts and local E2E",
  },
  {
    args: ["run", "test:live:local"],
    name: "Local backend live smoke",
  },
  {
    args: ["run", "test:live", "--", "--require-all-integrations"],
    name: "Production full live smoke",
  },
  {
    args: [
      "run",
      "test:pixel",
      "--",
      "--require-device",
      "--require-install",
      "--require-location-granted",
      "--require-launch",
    ],
    name: "Pixel hardware smoke",
  },
];

function getSensitiveValues() {
  return Object.entries(process.env)
    .filter(([name, value]) => {
      return (
        /(TOKEN|SECRET|PASSWORD|PRIVATE|SERVICE_ROLE|API_KEY|ANON_KEY)/i.test(
          name,
        ) &&
        typeof value === "string" &&
        value.length >= 8
      );
    })
    .map(([, value]) => value);
}

function sanitizeOutput(text) {
  let sanitized = String(text || "");

  for (const value of getSensitiveValues()) {
    sanitized = sanitized.split(value).join("[redacted]");
  }

  return sanitized
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [redacted]")
    .replace(
      /(STRUCTLY_TEST_USER_TOKEN|STRUCTLY_TEST_[A-Z_]*(?:SECRET|TOKEN|KEY))=\S+/g,
      "$1=[redacted]",
    );
}

function runCheck(check) {
  console.log(`\n== ${check.name} ==`);
  console.log(`$ npm ${check.args.join(" ")}`);

  const result = spawnSync("npm", check.args, {
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  process.stdout.write(sanitizeOutput(result.stdout));
  process.stderr.write(sanitizeOutput(result.stderr));

  if (result.error) {
    console.error(result.error.message);
  }

  const ok = result.status === 0 && !result.error;
  console.log(`${check.name}: ${ok ? "passed" : "failed"}`);

  return {
    name: check.name,
    ok,
    status: result.status,
  };
}

const results = CHECKS.map(runCheck);
const failed = results.filter((result) => !result.ok);

console.log(
  JSON.stringify(
    {
      checked: results.map((result) => result.name),
      failed: failed.map((result) => result.name),
      ok: failed.length === 0,
    },
    null,
    2,
  ),
);

if (failed.length > 0) {
  process.exit(1);
}
