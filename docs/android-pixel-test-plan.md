# Android Pixel Integration Test Plan

This plan covers the real-device checks that cannot be proven by the local Node harness.

## Device Matrix

- Pixel device on the current production Android release.
- Pixel device with battery saver enabled.
- Pixel device after app is removed from recents.
- Pixel device after network loss and resume.

## Permission Checks

- Foreground location granted while capturing a receipt.
- Foreground location denied before capture.
- Location permission revoked from Android Settings after sign-in.
- Background location is not requested until a feature needs it and the app explains why first.

## Integration Checks

- Device heartbeat is sent on sign-in, resume, and app foreground.
- Backend worker heartbeat remains visible when the app is closed.
- Composio webhook events appear in run history through the backend.
- Schedule ticks create one run per idempotency key.
- Coarse location events use coarse coordinates and create suggestions without storing precise coordinates.
- Code execution requests require approval and stay backend-owned.

## Stop Conditions

- Killed-app behavior is recorded instead of assumed.
- Battery-saver behavior is recorded instead of assumed.
- No mobile logs or bundle output contain provider API keys, service-role keys, or precise location payloads.
