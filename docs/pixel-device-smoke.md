# Pixel Device Smoke

The local and live backend harnesses do not prove Android device behavior. Use this smoke test with a connected Google Pixel over ADB:

```sh
npm run test:pixel
```

Strict mode when a Pixel must be connected:

```sh
npm run test:pixel -- --require-device
```

Strict mode when the Structly app must already be installed:

```sh
npm run test:pixel -- --require-device --require-install
```

Strict mode when foreground location must currently be granted:

```sh
npm run test:pixel -- --require-device --require-install --require-location-granted
```

Strict mode after denying or revoking foreground location in Android Settings:

```sh
npm run test:pixel -- --require-device --require-install --require-location-denied
```

Strict mode when the installed app must launch successfully:

```sh
npm run test:pixel -- --require-device --require-install --require-launch
```

Local parser self-test, no device required:

```sh
node scripts/verify-pixel-device.js --self-test
```

Optional configuration:

```sh
STRUCTLY_PIXEL_SERIAL="adb-device-serial"
STRUCTLY_ANDROID_PACKAGE="com.structly.app"
```

## What It Verifies

- ADB is available.
- An online Android device is connected.
- The connected device identifies as a Google Pixel.
- When `--require-install` is set, the Structly package is installed and declares foreground coarse/fine location permissions.
- The installed package does not declare or hold background location permission.
- `--require-location-granted` verifies at least one foreground location permission is currently granted.
- `--require-location-denied` verifies foreground location is currently denied or revoked.
- `--require-launch` starts the package through Android's launcher intent and checks it has a running process.

This script is intentionally a smoke check. It does not prove killed-app or battery-saver background behavior; those cases still require the manual Pixel matrix in `docs/android-pixel-test-plan.md`.
