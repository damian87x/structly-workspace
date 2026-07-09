const { execFileSync } = require("child_process");
const assert = require("assert");

const DEFAULT_PACKAGE = "com.structly.app";
const BACKGROUND_LOCATION_PERMISSION =
  "android.permission.ACCESS_BACKGROUND_LOCATION";
const COARSE_LOCATION_PERMISSION = "android.permission.ACCESS_COARSE_LOCATION";
const FINE_LOCATION_PERMISSION = "android.permission.ACCESS_FINE_LOCATION";

function runAdb(args) {
  return execFileSync("adb", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function hasAdb() {
  try {
    runAdb(["version"]);
    return true;
  } catch (error) {
    return false;
  }
}

function parseDevices(output) {
  return output
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [serial, state, ...details] = line.split(/\s+/);

      return {
        details: details.join(" "),
        serial,
        state,
      };
    });
}

function getDeviceSerial() {
  const requestedSerial = process.env.STRUCTLY_PIXEL_SERIAL;
  const devices = parseDevices(runAdb(["devices", "-l"]));
  const onlineDevices = devices.filter((device) => device.state === "device");

  if (requestedSerial) {
    return onlineDevices.find((device) => device.serial === requestedSerial) || null;
  }

  return onlineDevices[0] || null;
}

function shell(serial, command) {
  return runAdb(["-s", serial, "shell", ...command]);
}

function getProp(serial, prop) {
  return shell(serial, ["getprop", prop]);
}

function isPixelDevice(serial) {
  const brand = getProp(serial, "ro.product.brand").toLowerCase();
  const manufacturer = getProp(serial, "ro.product.manufacturer").toLowerCase();
  const model = getProp(serial, "ro.product.model").toLowerCase();

  return (
    brand.includes("google") ||
    manufacturer.includes("google") ||
    model.includes("pixel")
  );
}

function getPackageInfo(serial, packageName) {
  try {
    return shell(serial, ["dumpsys", "package", packageName]);
  } catch (error) {
    return "";
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasPermissionDeclared(packageInfo, permission) {
  return packageInfo.includes(permission);
}

function getRuntimePermissionGrant(packageInfo, permission) {
  const pattern = new RegExp(`${escapeRegExp(permission)}: granted=(true|false)`);
  const match = packageInfo.match(pattern);

  return match ? match[1] === "true" : null;
}

function hasForegroundLocationGrant(permissions) {
  return (
    permissions.coarseLocationGranted === true ||
    permissions.fineLocationGranted === true
  );
}

function launchPackage(serial, packageName) {
  return runAdb([
    "-s",
    serial,
    "shell",
    "monkey",
    "-p",
    packageName,
    "-c",
    "android.intent.category.LAUNCHER",
    "1",
  ]);
}

function isPackageRunning(serial, packageName) {
  try {
    return shell(serial, ["pidof", packageName]).length > 0;
  } catch (error) {
    return false;
  }
}

function buildReport(serial, packageName) {
  const packageInfo = getPackageInfo(serial, packageName);
  const permissions = {
    backgroundLocationDeclared: hasPermissionDeclared(
      packageInfo,
      BACKGROUND_LOCATION_PERMISSION,
    ),
    backgroundLocationGranted: getRuntimePermissionGrant(
      packageInfo,
      BACKGROUND_LOCATION_PERMISSION,
    ),
    coarseLocationDeclared: hasPermissionDeclared(
      packageInfo,
      COARSE_LOCATION_PERMISSION,
    ),
    coarseLocationGranted: getRuntimePermissionGrant(
      packageInfo,
      COARSE_LOCATION_PERMISSION,
    ),
    fineLocationDeclared: hasPermissionDeclared(
      packageInfo,
      FINE_LOCATION_PERMISSION,
    ),
    fineLocationGranted: getRuntimePermissionGrant(
      packageInfo,
      FINE_LOCATION_PERMISSION,
    ),
  };

  return {
    androidRelease: getProp(serial, "ro.build.version.release"),
    brand: getProp(serial, "ro.product.brand"),
    installed: packageInfo.includes(`Package [${packageName}]`),
    manufacturer: getProp(serial, "ro.product.manufacturer"),
    model: getProp(serial, "ro.product.model"),
    packageName,
    permissions: {
      ...permissions,
      foregroundLocationGranted: hasForegroundLocationGrant(permissions),
    },
    serial,
  };
}

function runSelfTest() {
  const grantedPackageInfo = `
    Package [com.structly.app]
    requested permissions:
      ${COARSE_LOCATION_PERMISSION}
      ${FINE_LOCATION_PERMISSION}
    runtime permissions:
      ${COARSE_LOCATION_PERMISSION}: granted=true, flags=[USER_SET]
      ${FINE_LOCATION_PERMISSION}: granted=false, flags=[USER_SET]
  `;
  const deniedPackageInfo = `
    Package [com.structly.app]
    requested permissions:
      ${COARSE_LOCATION_PERMISSION}
      ${FINE_LOCATION_PERMISSION}
    runtime permissions:
      ${COARSE_LOCATION_PERMISSION}: granted=false, flags=[USER_SET]
      ${FINE_LOCATION_PERMISSION}: granted=false, flags=[USER_SET]
  `;
  const grantedPermissions = {
    coarseLocationGranted: getRuntimePermissionGrant(
      grantedPackageInfo,
      COARSE_LOCATION_PERMISSION,
    ),
    fineLocationGranted: getRuntimePermissionGrant(
      grantedPackageInfo,
      FINE_LOCATION_PERMISSION,
    ),
  };
  const deniedPermissions = {
    coarseLocationGranted: getRuntimePermissionGrant(
      deniedPackageInfo,
      COARSE_LOCATION_PERMISSION,
    ),
    fineLocationGranted: getRuntimePermissionGrant(
      deniedPackageInfo,
      FINE_LOCATION_PERMISSION,
    ),
  };

  assert.equal(
    hasPermissionDeclared(grantedPackageInfo, COARSE_LOCATION_PERMISSION),
    true,
  );
  assert.equal(
    hasPermissionDeclared(grantedPackageInfo, BACKGROUND_LOCATION_PERMISSION),
    false,
  );
  assert.equal(
    getRuntimePermissionGrant(grantedPackageInfo, BACKGROUND_LOCATION_PERMISSION),
    null,
  );
  assert.equal(hasForegroundLocationGrant(grantedPermissions), true);
  assert.equal(hasForegroundLocationGrant(deniedPermissions), false);
  console.log("Pixel smoke parser self-test passed.");
}

function main() {
  const requireDevice = process.argv.includes("--require-device");
  const requireInstall = process.argv.includes("--require-install");
  const requireLaunch = process.argv.includes("--require-launch");
  const requireLocationDenied = process.argv.includes("--require-location-denied");
  const requireLocationGranted = process.argv.includes("--require-location-granted");
  const selfTest = process.argv.includes("--self-test");
  const packageName = process.env.STRUCTLY_ANDROID_PACKAGE || DEFAULT_PACKAGE;
  const mustHaveInstall =
    requireInstall ||
    requireLaunch ||
    requireLocationDenied ||
    requireLocationGranted;

  if (selfTest) {
    runSelfTest();
    return;
  }

  if (requireLocationDenied && requireLocationGranted) {
    throw new Error(
      "Choose either --require-location-granted or --require-location-denied.",
    );
  }

  if (!hasAdb()) {
    const message = "Pixel smoke skipped; adb is not installed or not on PATH.";

    if (requireDevice) {
      throw new Error(message);
    }

    console.log(message);
    return;
  }

  const device = getDeviceSerial();

  if (!device) {
    const message = "Pixel smoke skipped; no online Android device found.";

    if (requireDevice) {
      throw new Error(message);
    }

    console.log(message);
    return;
  }

  const report = buildReport(device.serial, packageName);

  assert.equal(
    isPixelDevice(device.serial),
    true,
    `Connected device is not a Google Pixel: ${JSON.stringify(report)}`,
  );

  if (mustHaveInstall) {
    assert.equal(
      report.installed,
      true,
      `${packageName} is not installed on ${report.model}`,
    );
    assert.equal(
      report.permissions.coarseLocationDeclared,
      true,
      "Structly package does not declare coarse location permission.",
    );
    assert.equal(
      report.permissions.fineLocationDeclared,
      true,
      "Structly package does not declare fine location permission.",
    );
    assert.equal(
      report.permissions.backgroundLocationDeclared,
      false,
      "Structly package should not declare background location permission.",
    );
    assert.notEqual(
      report.permissions.backgroundLocationGranted,
      true,
      "Structly package should not have background location granted.",
    );
  }

  if (requireLocationGranted) {
    assert.equal(
      report.permissions.foregroundLocationGranted,
      true,
      "Structly package does not currently have foreground location granted.",
    );
  }

  if (requireLocationDenied) {
    assert.equal(
      report.permissions.foregroundLocationGranted,
      false,
      "Structly package currently has foreground location granted.",
    );
  }

  if (requireLaunch) {
    launchPackage(device.serial, packageName);
    assert.equal(
      isPackageRunning(device.serial, packageName),
      true,
      `${packageName} did not appear to be running after launch.`,
    );
    report.launchChecked = true;
  }

  console.log(JSON.stringify(report, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
