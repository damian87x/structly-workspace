# Discovery: 1783195667-scaffold-expo-app-skelet

## Ticket

Scaffold the first Expo app skeleton for Structly so an installed user can sign in with email/password and land on the capture screen.

## Acceptance Criteria Restated

1. `npx expo start` must start the mobile app successfully without startup/runtime errors.
2. The app navigation must expose both a Sign-In screen and a Capture home screen.
3. Signing in through Supabase email/password auth must create a Supabase session, and the app must navigate authenticated users to Capture.
4. `package.json` must not include any Google OAuth package or dependency.

## Current Repository State

- [README.md](README.md) says Structly is iOS-first using React Native / Expo and that there is "no code yet."
- [docs/spec.md](docs/spec.md) defines the MVP as "Expo skeleton, auth (Supabase, email/password - no Google OAuth), navigation" in Week 1, Days 1-2.
- No `package.json`, Expo config, app source directory, navigation code, Supabase client, or tests currently exist in the worktree.
- Existing tracked project content is documentation-only: [README.md](README.md), [docs/spec.md](docs/spec.md), and council review notes under [docs/council](docs/council).
- `.skills/MISTAKES.md` is not present, so there are no prior-run notes for the requested tags (`expo`, `auth`, `frontend`).

## Files and Modules This Ticket Will Touch

Because there is no app scaffold yet, the implementation stage will need to add the initial app files rather than modify existing app modules.

Likely root/config files:
- `package.json` - Expo scripts and dependencies; must avoid Google OAuth dependencies.
- `package-lock.json` or another lockfile if the package manager creates one.
- `app.json` or `app.config.*` - Expo app metadata.
- `tsconfig.json` - TypeScript config if using the common Expo TypeScript template.
- `babel.config.js` or equivalent only if the chosen Expo/navigation setup requires it.

Likely app source files:
- `App.tsx` or `app/_layout.tsx` depending on the selected navigation approach.
- `src/lib/supabase.ts` or equivalent Supabase client module.
- `src/navigation/*` or Expo Router files for authenticated vs unauthenticated routing.
- `src/screens/SignInScreen.tsx` for email/password sign-in.
- `src/screens/CaptureScreen.tsx` for the post-login capture home placeholder.

Likely verification/test files:
- No test framework exists yet.
- At minimum, implementation should verify `npx expo start`/Expo config startup and inspect `package.json` for absence of Google OAuth packages.
- If a test runner is introduced, auth routing should be covered by a focused component or integration test using a mocked Supabase response.

## Existing Patterns and Constraints to Match

- Product direction is iOS-first Expo / React Native, with Android fast-follow.
- MVP must use Supabase email/password auth, not Google OAuth or connector auth.
- The current spec repeatedly emphasizes "No Google OAuth at all in the MVP" and "No Composio" for this phase.
- The first app surface should be functional and restrained: sign in, establish session, route to Capture. Full camera/gallery capture is outside this ticket unless requested later.
- Keep the scaffold minimal and conventional so `npx expo start` is the primary boot path.

## Unknowns

- Supabase project URL and anon key are not present in the repo. This does not block scaffolding; the app can read `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` at runtime. Full live sign-in verification will require valid Supabase credentials later.
- No existing package manager preference is present because there is no `package.json` or lockfile. Implementation can choose the default npm flow unless the plan stage discovers a repo-level convention outside this worktree.
- No visual design system exists yet. For this skeleton, simple native controls and clear screen separation should be enough.

## Discovery Exit Status

- Every acceptance criterion has been restated.
- Relevant existing docs and missing app files have been identified with paths.
- No blocking unknowns remain for planning the scaffold.
