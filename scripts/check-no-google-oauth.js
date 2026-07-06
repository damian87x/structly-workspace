const fs = require("fs");

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const dependencies = {
  ...pkg.dependencies,
  ...pkg.devDependencies,
};

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

const offenders = Object.keys(dependencies).filter((name) =>
  googleOAuthPatterns.some((pattern) => pattern.test(name)),
);

if (offenders.length > 0) {
  console.error(`Google OAuth dependencies found: ${offenders.join(", ")}`);
  process.exit(1);
}

console.log("No Google OAuth dependencies found.");
