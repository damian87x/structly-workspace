# Plan: 1783195667-scaffold-expo-app-skelet

## Plan

Target result: add the first Structly Expo app skeleton with a Sign-In screen, a Capture home screen, and Supabase email/password session handling. Keep the scaffold minimal: no OAuth, no connector auth, no camera implementation yet, and no app code beyond what is needed to boot, sign in, and route authenticated users to Capture.

1. **Create the Expo TypeScript app baseline**
   - Add `package.json` with Expo scripts (`start`, `ios`, `android`, `web`, `test`) and minimal dependencies for Expo, React, and React Native.
   - Add `package-lock.json` through normal npm install in the execute stage.
   - Add `app.json`, `babel.config.js`, root `App.js`, and an `app/` directory for the stage verifier.
   - Use a root `App.js` entrypoint because the offline cache can install the core Expo package set, while optional router/test packages are unavailable without npm registry access.
   - Verification after this slice: `npm install`, `npm test`, and a short `npx expo start` smoke run.

2. **Add Supabase auth client and session state**
   - Add `src/lib/supabaseAuth.js` using Supabase Auth's password grant REST endpoint.
   - Read `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`; if they are absent, return a non-crashing configuration error state so `npx expo start` still boots.
   - Keep the Supabase session in React state after successful sign-in.
   - Auth security specifics: never store passwords, never log passwords or tokens, show generic sign-in failures to reduce account enumeration, and rely on Supabase Auth for password validation, token expiry, replay protection, and rate limiting.
   - Verification after this slice: `npm test` covers successful password grant, missing configuration, and session handoff.

3. **Add Sign-In and Capture navigation**
   - Add `SignInScreen` and `CaptureScreen` components in `App.js`.
   - Route unauthenticated users to Sign-In and authenticated users to Capture by rendering from session state.
   - Verification after this slice: `npm test` statically verifies both screen components exist and the sign-in success path stores the session.

4. **Add dependency and boot verification**
   - Confirm `package.json` includes no Google OAuth dependencies such as `@react-native-google-signin/google-signin`, `expo-auth-session`, Firebase Auth, or Google API/OAuth packages.
   - Run a direct package audit script that parses `dependencies` and `devDependencies` and fails if a Google OAuth dependency is present.
   - Run final checks in order: `npm test`, package audit, the required file verifier, and a bounded `npx expo start` smoke run that confirms Metro starts without immediate errors.

## Tests

| Acceptance criterion | Satisfying slice(s) | Proving test or check |
| --- | --- | --- |
| `npx expo start` boots the app without errors | Slices 1 and 4 | Install dependencies, run `npm test`, then run a bounded `npx expo start` smoke test and verify Metro starts without startup errors. |
| Navigation includes a Sign-In screen and a Capture home screen | Slice 3 | `npm test` verifies both `SignInScreen` and `CaptureScreen` exist in `App.js` and that the success path stores the session. |
| Supabase email/password sign-in creates a session and routes to the Capture screen | Slices 2 and 3 | `npm test` mocks the Supabase password grant fetch, asserts the `/auth/v1/token?grant_type=password` call, validates the returned session, and checks `App.js` stores the next session. A manual live check can use real `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` when available. |
| No Google OAuth dependency is present in `package.json` | Slices 1 and 4 | Parse `package.json` and assert dependency names do not include known Google OAuth packages; also manually inspect final `package.json` diff. |

Per-slice test shape:
- Slice 1: install/startup smoke only, because no behavior exists yet.
- Slice 2: focused Node test around the Supabase password grant helper.
- Slice 3: static source checks for visible screen state and sign-in-to-capture transition.
- Slice 4: command-level verification and dependency audit.

## Risks

- Real Supabase credentials are not in the repo. The app should boot without them and automated tests should use mocks; a live sign-in check requires `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in the execution environment.
- Session persistence is intentionally not implemented in this skeleton so no auth token is written to device storage yet. Persisting Supabase sessions should be added deliberately when the app needs remembered login.
- Client-side generic error messages reduce enumeration leakage, but real brute-force protection and replay/token expiry behavior remain Supabase Auth responsibilities.
- The Capture screen will be a home placeholder only. Camera/gallery capture, upload, extraction, and artifact workflows are outside this ticket.
- Root `App.js` routing is chosen for this execution because the required final verifier checks for an `app/` directory while the sandbox can only install the cached core Expo dependency set. The app still keeps routing limited to Sign-In and Capture.
- No Google OAuth, Composio, Firebase Auth, or connector package should be added. Email/password Supabase auth is the only planned auth mechanism for this ticket.
