# Mobile Build Runbook (EAS, LAN-pinned dogfood)

Decisions (2026-07-11; stack current as of 2026-07-16): Expo SDK 54 (`expo ^54.0.36`, RN 0.81.5, React 19.1.0); EAS cloud builds for Android + iOS; backend stays the local Supabase stack, reached from phones via the desktop's LAN IP; extraction uses the `extract-receipt` edge function so no provider key ships in any bundle.

## One-time setup (operator)

1. `npm install -g --prefix ~/.npm-global eas-cli` and `eas login` (free Expo account).
2. Find the desktop's LAN IP: `ip -4 addr show | grep 192.168`.
3. Local backend env (server-side only, never `EXPO_PUBLIC_*`):
   `supabase secrets` are not used locally — put server-side vision credentials in
   `supabase/functions/.env` for `supabase functions serve`,
   or export them before starting the local stack.

## Build-time app env

Two distinct env surfaces (no `app.config.*` exists — config is `app.json` + `eas.json`):

1. **Local Expo Go** reads `.env` / `EXPO_PUBLIC_*` (copy from `.env.example`).
2. **EAS APK builds** read the `eas.json` build profile `env` block (`preview` is LAN-pinned today).

Required public values (same keys in either surface):

```
EXPO_PUBLIC_SUPABASE_URL=http://<LAN_IP>:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=<local anon key from `supabase status`>
EXPO_PUBLIC_RECEIPT_EXTRACT_ENDPOINT=http://<LAN_IP>:54321/functions/v1/extract-receipt
```

No provider secrets in these values (Phase 0 policy; enforced by the mobile bundle audit). Demo sign-in (seeded): `demo@structly.app` / `structly-demo-1` (`supabase/seed.sql`, `.env.example`).

## Builds

- Android dogfood APK: `eas build --platform android --profile preview`
- iOS: requires an Apple Developer account ($99/yr) + a real iPhone; credentials added to EAS;
  then `eas build --platform ios --profile preview` (install via TestFlight/ad-hoc).
  **Gate is Apple Developer credentials + a real iPhone**, not merely an operator Mac.

## Dogfood path (current, SDK 54)

Preferred on-device path: **Expo Go over LAN** on the SDK 54 app (or an EAS `preview` APK). Sign in with the seeded demo account, capture receipts, review, and export.

- **Export smoke:** in-app default is CSV (`exportFormat="csv"`); XLSX (Receipts + Manifest sheets) is selectable. Both round-trip in `npm run test:e2e`.
- **#20 device signals:** rationale-first location+calendar. **Continue** mints the unforgeable grant before any OS prompt; **Not now** / no grant → no location or calendar prompts (`deviceSignalGate.js`, `6b4bc1b`).

## Constraints to remember

- **LAN-pinned `preview` is the current PROVEN path.** Builds only work on the same wifi as the desktop stack.
- **Hosted / off-LAN backend: BLOCKED / UNPROVEN (T5 #16).** Going hosted is **not** "just change three env values." It requires: hosted Supabase project provisioning + migrations, all edge functions deployed, server secret configuration, per-function JWT settings, clear/swap `EXPO_PUBLIC_STRUCTLY_FUNCTIONS_URL` (and related public URLs), then live off-LAN cellular proof. Recorded in `docs/live-integration-smoke.md`.
- Foreground-only location; the Pixel strict gates (`npm run test:pixel`) still need adb + a device before Epic 8 can claim anything (T6 #17).
