# Mobile Build Runbook (EAS, LAN-pinned dogfood)

Decisions (2026-07-11): EAS cloud builds for Android + iOS; backend stays the local
Supabase stack, reached from phones via the desktop's LAN IP; extraction uses the
`extract-receipt` edge function so no provider key ships in any bundle.

## One-time setup (operator)

1. `npm install -g --prefix ~/.npm-global eas-cli` and `eas login` (free Expo account).
2. Find the desktop's LAN IP: `ip -4 addr show | grep 192.168`.
3. Local backend env (server-side only, never `EXPO_PUBLIC_*`):
   `supabase secrets` are not used locally — put `OPENROUTER_API_KEY` (and optional
   `OPENROUTER_MODEL`) in `supabase/functions/.env` for `supabase functions serve`,
   or export them before starting the local stack.

## Build-time app env

Set in `eas.json` build profile (or `.env` consumed by `app.config`):

```
EXPO_PUBLIC_SUPABASE_URL=http://<LAN_IP>:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=<local anon key from `supabase status`>
EXPO_PUBLIC_RECEIPT_EXTRACT_ENDPOINT=http://<LAN_IP>:54321/functions/v1/extract-receipt
```

No provider secrets in these values (Phase 0 policy; enforced by the mobile bundle audit).

## Builds

- Android dogfood APK: `eas build --platform android --profile preview`
- iOS: requires an Apple Developer account ($99/yr) added to EAS credentials;
  then `eas build --platform ios --profile preview` (install via TestFlight/ad-hoc).

## Constraints to remember

- LAN-pinned builds only work on the same wifi as the desktop stack; going hosted
  later just changes the three env values above and rebuilds.
- Foreground-only location; the Pixel strict gates (`npm run test:pixel`) still need
  adb + a device before Epic 8 can claim anything.
