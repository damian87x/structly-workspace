const { execFileSync } = require("child_process");
const assert = require("assert");

const DEFAULT_PACKAGE = "com.structly.app";

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

function hasPermission(packageInfo, permission) {
  return packageInfo.includes(permission);
}

function buildReport(serial, packageName) {
  const packageInfo = getPackageInfo(serial, packageName);

  return {
    androidRelease: getProp(serial, "ro.build.version.release"),
    brand: getProp(serial, "ro.product.brand"),
    installed: packageInfo.includes(`Package [${packageName}]`),
    manufacturer: getProp(serial, "ro.product.manufacturer"),
    model: getProp(serial, "ro.product.model"),
    packageName,
    permissions: {
      coarseLocationDeclared: hasPermission(
        packageInfo,
        "android.permission.ACCESS_COARSE_LOCATION",
      ),
      fineLocationDeclared: hasPermission(
        packageInfo,
        "android.permission.ACCESS_FINE_LOCATION",
      ),
    },
    serial,
  };
}

function main() {
  const requireDevice = process.argv.includes("--require-device");
  const requireInstall = process.argv.includes("--require-install");
  const packageName = process.env.STRUCTLY_ANDROID_PACKAGE || DEFAULT_PACKAGE;

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

  if (requireInstall) {
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
  }

  console.log(JSON.stringify(report, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
